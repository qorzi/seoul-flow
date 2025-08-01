import sys
import os
import glob
from functools import reduce

from pyspark.sql import SparkSession, DataFrame, Window
from pyspark.sql.functions import col, pandas_udf, lit, lag, lead, udf, expr, avg, stddev, max as spark_max, min as spark_min, count, when, percentile_approx, window, abs, sum
from pyspark.sql.types import StructType, StructField, StringType, DoubleType, TimestampType, LongType, Row
import pandas as pd
import numpy as np

# --- 머신러닝 관련 라이브러리 임포트 ---
from pyspark.ml import Pipeline
from pyspark.ml.feature import StringIndexer, VectorAssembler
from pyspark.ml.classification import RandomForestClassifier
from pyspark.ml.evaluation import MulticlassClassificationEvaluator
from pyspark.ml.tuning import CrossValidator, ParamGridBuilder

# --- 데이터 다운로드 스크립트 임포트 ---
# download_geolife.py 스크립트를 찾을 수 있도록 경로 추가
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from download_geolife import download_and_extract_geolife

# --- 상수 정의 ---
WINDOW_DURATION = "60 seconds"  # 윈도우 크기: 60초
SLIDE_DURATION = "30 seconds"   # 윈도우 이동 간격: 30초
MODEL_OUTPUT_PATH = "/app/output/model"  # 모델 저장 경로
RESULTS_OUTPUT_PATH = "/app/output/results" # 평가 결과 저장 경로

# --- 데이터 로딩 함수 ---
def load_labels(spark, data_path):
    """모든 사용자 디렉토리 내의 labels.txt를 찾아 단일 데이터프레임으로 로드합니다."""
    all_labels_files = glob.glob(os.path.join(data_path, "*", "labels.txt"))
    if not all_labels_files:
        raise FileNotFoundError(f"{data_path} 내 사용자 폴더에서 labels.txt 파일을 찾을 수 없습니다.")
        
    all_labels_pd_list = []
    for f in all_labels_files:
        user_id = os.path.basename(os.path.dirname(f))
        try:
            # pandas로 먼저 읽고 user_id 추가
            labels_pd = pd.read_csv(f, sep="\t", header=0, names=["start_time", "end_time", "label"], encoding='utf-8')
            labels_pd['user_id'] = user_id
            all_labels_pd_list.append(labels_pd)
        except pd.errors.EmptyDataError:
            continue

    if not all_labels_pd_list:
        return None

    # 모든 pandas DataFrame을 하나로 합친 후 Spark DataFrame으로 변환
    combined_labels_pd = pd.concat(all_labels_pd_list, ignore_index=True)
    labels_df = spark.createDataFrame(combined_labels_pd)

    # 문자열 형식의 시간을 타임스탬프로 변환
    return labels_df.withColumn("start_time", expr("to_timestamp(start_time, 'yyyy/MM/dd HH:mm:ss')")) \
                    .withColumn("end_time", expr("to_timestamp(end_time, 'yyyy/MM/dd HH:mm:ss')"))

def load_trajectory_data(spark, data_path):
    """
    모든 .plt 파일을 Spark의 네이티브 분산 처리 방식(RDD)을 사용해 로드합니다.
    이 방식은 대용량 파일 처리에 최적화되어 있으며 메모리 문제를 근본적으로 해결합니다.
    """
    all_plt_files = glob.glob(os.path.join(data_path, "*", "Trajectory", "*.plt"))
    
    if not all_plt_files:
        raise FileNotFoundError(f"{data_path} 경로에서 .plt 파일을 찾을 수 없습니다.")

    schema = StructType([
        StructField("lat", DoubleType()), StructField("lon", DoubleType()),
        StructField("altitude", DoubleType()), StructField("timestamp_val", DoubleType()),
        StructField("date_str", StringType()), StructField("time_str", StringType()),
        StructField("user_id", StringType())
    ])

    def read_and_parse_plt(path):
        """
        단일 파일 경로를 입력받아, 각 행을 Spark의 Row 객체 리스트로 변환합니다.
        이 함수는 각 스레드에서 병렬로 실행됩니다.
        """
        user_id = os.path.basename(os.path.dirname(os.path.dirname(path)))
        try:
            pdf = pd.read_csv(path, header=5, names=["lat", "lon", "altitude", "timestamp_val", "date_str", "time_str"])
            pdf["user_id"] = user_id

            for col_name in ["lat", "lon", "altitude", "timestamp_val"]:
                pdf[col_name] = pdf[col_name].astype(float)
            
            # DataFrame의 각 행을 딕셔너리로 변환 후 Row 객체 리스트로 만듭니다.
            return [Row(**row) for row in pdf.to_dict('records')]
        except pd.errors.EmptyDataError:
            return []

    # 1. 파일 경로 리스트를 RDD(Resilient Distributed Dataset)로 변환하여 작업을 분산시킵니다.
    paths_rdd = spark.sparkContext.parallelize(all_plt_files, numSlices=len(all_plt_files) // 100)

    # 2. 각 스레드에서 read_and_parse_plt 함수를 병렬 실행하여 모든 파일의 모든 행(Row)을 포함하는 단일 RDD를 생성합니다.
    rows_rdd = paths_rdd.flatMap(read_and_parse_plt)

    # 3. 최종적으로 RDD를 Spark DataFrame으로 변환합니다. 이 과정은 매우 효율적입니다.
    raw_df = spark.createDataFrame(rows_rdd, schema)
    
    return raw_df.withColumn("timestamp", expr("to_timestamp(concat(date_str, ' ', time_str), 'yyyy-MM-dd HH:mm:ss')")) \
                 .drop("timestamp_val", "date_str", "time_str")

def calculate_kinematics(df):
    """속도, 가속도, 방위각 등 운동학적 특징을 계산합니다."""
    window_spec = Window.partitionBy("user_id").orderBy("timestamp")

    df = df.withColumn("prev_lat", lag("lat").over(window_spec)) \
           .withColumn("prev_lon", lag("lon").over(window_spec)) \
           .withColumn("prev_timestamp", lag("timestamp").over(window_spec))

    @udf(returnType=DoubleType())
    def haversine_distance(lat1, lon1, lat2, lon2):
        if any(v is None for v in [lat1, lon1, lat2, lon2]):
            return 0.0
        R = 6371e3
        phi1, phi2, delta_phi, delta_lambda = map(np.radians, [lat1, lat2, lat2 - lat1, lon2 - lon1])
        a = np.sin(delta_phi / 2.0) ** 2 + np.cos(phi1) * np.cos(phi2) * np.sin(delta_lambda / 2.0) ** 2
        c = 2 * np.arctan2(np.sqrt(a), np.sqrt(1 - a))
        return float(R * c)

    df = df.withColumn("distance", haversine_distance(col("lat"), col("lon"), col("prev_lat"), col("prev_lon")))
    df = df.withColumn("time_delta", col("timestamp").cast("long") - col("prev_timestamp").cast("long"))
    df = df.withColumn("speed", when(col("time_delta") > 0, col("distance") / col("time_delta")).otherwise(0))
    df = df.withColumn("prev_speed", lag("speed").over(window_spec))
    df = df.withColumn("accel", when(col("time_delta") > 0, (col("speed") - col("prev_speed")) / col("time_delta")).otherwise(0))
    df = df.withColumn("prev_accel", lag("accel").over(window_spec))
    df = df.withColumn("jerk", when(col("time_delta") > 0, (col("accel") - col("prev_accel")) / col("time_delta")).otherwise(0))

    @udf(returnType=DoubleType())
    def calculate_bearing(lat1, lon1, lat2, lon2):
        if any(v is None for v in [lat1, lon1, lat2, lon2]):
            return 0.0
        lat1, lon1, lat2, lon2 = map(np.radians, [lat1, lon1, lat2, lon2])
        dLon = lon2 - lon1
        y = np.sin(dLon) * np.cos(lat2)
        x = np.cos(lat1) * np.sin(lat2) - np.sin(lat1) * np.cos(lat2) * np.cos(dLon)
        return float(np.degrees(np.arctan2(y, x)))

    df = df.withColumn("bearing", calculate_bearing(col("prev_lat"), col("prev_lon"), col("lat"), col("lon")))
    df = df.withColumn("bearing_rate", (col("bearing") - lag("bearing").over(window_spec)) / col("time_delta"))

    return df.select("user_id", "timestamp", "lat", "lon", "speed", "accel", "jerk", "bearing", "bearing_rate", "distance")

def create_features_from_windows(df):
    """슬라이딩 윈도우를 기준으로 그룹화하고 집계 특징을 생성합니다."""
    df = df.na.drop(subset=["speed", "accel", "jerk", "bearing_rate", "distance"])

    # 윈도우별 특징 집계
    features_df = df.groupBy(
        col("user_id"),
        window(col("timestamp"), windowDuration=WINDOW_DURATION, slideDuration=SLIDE_DURATION)
    ).agg(
        avg("speed").alias("avg_speed"),
        spark_max("speed").alias("max_speed"),
        stddev("speed").alias("stddev_speed"),
        percentile_approx("speed", 0.75).alias("p75_speed"),
        percentile_approx("speed", 0.95).alias("p95_speed"),
        avg("accel").alias("avg_accel"),
        spark_max("accel").alias("max_accel"),
        stddev("accel").alias("stddev_accel"),
        avg("jerk").alias("avg_jerk"),
        spark_max("jerk").alias("max_jerk"),
        stddev("jerk").alias("stddev_jerk"),
        (count(when(col("speed") < 0.5, 1)) / count("*")).alias("stop_rate"),
        avg("bearing_rate").alias("avg_bearing_rate"),
        stddev("bearing_rate").alias("stddev_bearing_rate"),
        (count(when(abs(col("bearing_rate")) > 15, 1)) / count("*")).alias("hcr_rate"),
        sum("distance").alias("total_distance")
    ).na.fill(0)

    # 윈도우별 시작점과 끝점 좌표 찾기
    endpoints_df = df.groupBy("user_id", window(col("timestamp"), windowDuration=WINDOW_DURATION, slideDuration=SLIDE_DURATION).alias("window")).agg(
        spark_min(expr("struct(timestamp, lat, lon)")).alias("start_point"),
        spark_max(expr("struct(timestamp, lat, lon)")).alias("end_point")
    )

    @udf(returnType=DoubleType())
    def haversine_distance(lat1, lon1, lat2, lon2):
        if any(v is None for v in [lat1, lon1, lat2, lon2]):
            return 0.0
        R = 6371e3
        phi1, phi2, delta_phi, delta_lambda = map(np.radians, [lat1, lat2, lat2 - lat1, lon2 - lon1])
        a = np.sin(delta_phi / 2.0) ** 2 + np.cos(phi1) * np.cos(phi2) * np.sin(delta_lambda / 2.0) ** 2
        c = 2 * np.arctan2(np.sqrt(a), np.sqrt(1 - a))
        return float(R * c)

    # 집계된 특징과 시작/끝점 좌표를 조인
    features_df = features_df.join(endpoints_df, ["user_id", "window"])

    # 직선 거리 및 직선성 지수 계산
    features_df = features_df.withColumn("straight_line_dist", haversine_distance(
        col("start_point.lat"), col("start_point.lon"), col("end_point.lat"), col("end_point.lon")
    ))
    features_df = features_df.withColumn("straightness_index",
        when(col("total_distance") > 0, col("straight_line_dist") / col("total_distance")).otherwise(1.0)
    )

    return features_df.select(
        "user_id", "window", "avg_speed", "max_speed", "stddev_speed", "p75_speed", "p95_speed",
        "avg_accel", "max_accel", "stddev_accel", "avg_jerk", "max_jerk", "stddev_jerk", "stop_rate",
        "avg_bearing_rate", "stddev_bearing_rate", "hcr_rate", "total_distance", "straightness_index"
    )

def process_data(spark, data_path):
    """
    전체 데이터 처리 파이프라인입니다.
    라벨 필터링 및 재그룹화 로직이 추가되었습니다.
    """
    print("1단계 1/4: 이동 궤적 데이터 로딩 중...")
    trajectory_df = load_trajectory_data(spark, data_path)
    
    print("1단계 2/4: 라벨 데이터 로딩 중...")
    labels_df = load_labels(spark, data_path)
    if labels_df is None:
        raise FileNotFoundError("labels.txt 파일을 찾을 수 없습니다. 훈련을 진행할 수 없습니다.")

    print("\n[처리] 라벨 필터링 및 재그룹화 중...")
    
    # 1. 'boat', 'airplane'과 같이 이질적인 데이터는 학습에서 제외합니다.
    filtered_labels_df = labels_df.filter(~col("label").isin(['boat', 'airplane']))

    # 2. 라벨을 'walk', 'bike', 'transport' 세 가지 카테고리로 재그룹화합니다.
    regrouped_labels_df = filtered_labels_df.withColumn("new_label",
        when(col("label").isin(['walk', 'run']), lit("walk"))
        .when(col("label").isin(['bike', 'motorcycle']), lit("bike"))
        .otherwise(lit("transport"))
    ).select(
        col("start_time"),
        col("end_time"),
        col("new_label").alias("label"), # 'new_label' 컬럼의 이름을 'label'로 변경
        col("user_id")
    )

    print("\n[로그] 재그룹화된 라벨 종류 및 개수:")
    regrouped_labels_df.groupBy("label").count().show(truncate=False)

    print("\n[최적화] 데이터 파티션 재분배 중...")
    num_partitions = 200 
    trajectory_df = trajectory_df.repartition(num_partitions, "user_id")

    print("1단계 3/4: 운동학적 특징 계산 중...")
    kinematics_df = calculate_kinematics(trajectory_df).dropna()

    print("1단계 4/4: 윈도우 기반 특징 생성 중...")
    features_df = create_features_from_windows(kinematics_df)
    
    features_df = features_df.withColumn("window_center", (col("window.start").cast("long") + col("window.end").cast("long")) / 2)
    features_df = features_df.withColumn("window_center", col("window_center").cast("timestamp"))

    labeled_features = features_df.join(regrouped_labels_df,
        (features_df.user_id == regrouped_labels_df.user_id) & \
        (features_df.window_center >= regrouped_labels_df.start_time) & (features_df.window_center <= regrouped_labels_df.end_time),
        "inner"
    ).drop(regrouped_labels_df.user_id).drop("start_time", "end_time", "window_center")
    
    print(f"총 {labeled_features.count()}개의 라벨링된 특징 벡터를 생성했습니다.")
    return labeled_features

def train_model(spark, feature_df):
    """ 랜덤 포레스트 모델의 하이퍼파라미터를 튜닝하고 최적 모델을 훈련/저장합니다."""
    print("2단계 1/4: 데이터 분할 중 (훈련:테스트 = 8:2)...")
    (training_data, test_data) = feature_df.randomSplit([0.8, 0.2], seed=42)
    print(f"훈련 데이터셋 크기: {training_data.count()}, 테스트 데이터셋 크기: {test_data.count()}")
    
    # --- [데이터 불균형 해소] 클래스 가중치 계산 ---
    print("\n[처리] 클래스 가중치 계산 중...")
    label_counts = training_data.groupBy("label").count().collect()
    total_samples = training_data.count()
    num_classes = len(label_counts)

    # 가중치 계산: (전체 샘플 수) / (클래스 수 * 해당 클래스의 샘플 수)
    weights = {row['label']: total_samples / (num_classes * row['count']) for row in label_counts}

    # 훈련 데이터에 가중치 컬럼 추가
    add_weight_udf = udf(lambda label: weights.get(label, 1.0), DoubleType())
    training_data_with_weights = training_data.withColumn("weight", add_weight_udf(col("label")))

    print("\n[로그] 실제 훈련에 사용될 데이터의 라벨 종류 및 개수:")
    training_data.groupBy("label").count().show(truncate=False)
    
    print("2단계 2/4: 머신러닝 파이프라인 및 하이퍼파라미터 그리드 구성 중...")
    # 파이프라인 구성
    label_indexer = StringIndexer(inputCol="label", outputCol="indexedLabel").setHandleInvalid("keep")
    assembler = VectorAssembler(inputCols=[c for c in feature_df.columns if c not in ["user_id", "window", "label"]], outputCol="features")
    # 튜닝할 모델 객체 생성 (값은 여기서 지정하지 않음)
    rf = RandomForestClassifier(labelCol="indexedLabel", featuresCol="features", seed=42, weightCol="weight")
    
    pipeline = Pipeline(stages=[label_indexer, assembler, rf])

    # --- [하이퍼파라미터 튜닝] 파라미터 그리드 생성 ---
    paramGrid = ParamGridBuilder() \
        .addGrid(rf.numTrees, [100, 150]) \
        .addGrid(rf.maxDepth, [10, 15]) \
        .build()

    # --- [하이퍼파라미터 튜닝] 교차 검증 설정 ---
    # 평가지표로 F1 Score를 사용하여 모델을 선택
    evaluator = MulticlassClassificationEvaluator(labelCol="indexedLabel", predictionCol="prediction", metricName="f1")

    crossval = CrossValidator(estimator=pipeline,
                              estimatorParamMaps=paramGrid,
                              evaluator=evaluator,
                              numFolds=3) # 데이터를 3조각으로 나누어 교차 검증

    print("2단계 3/4: 교차 검증을 통한 모델 튜닝 및 훈련 중... (시간이 오래 걸릴 수 있습니다)")
    # 훈련 데이터로 교차 검증 수행
    cvModel = crossval.fit(training_data_with_weights)

    # 최적 모델 추출
    model = cvModel.bestModel

    print("\n[결과] 최적 하이퍼파라미터:")
    best_rf_model = model.stages[-1]
    print(f" - numTrees: {best_rf_model.getNumTrees}")
    print(f" - maxDepth: {best_rf_model.getMaxDepth()}")

    print(f"\n2단계 4/4: 훈련된 최적 모델 저장 중... 경로: {MODEL_OUTPUT_PATH}")
    model.write().overwrite().save(MODEL_OUTPUT_PATH)
    
    return model, test_data

def evaluate_model(spark, model, test_df):
    """모델을 평가하고 결과를 출력/저장합니다."""
    print("3단계 1/3: 테스트 데이터로 예측 수행 중...")
    predictions = model.transform(test_df)

    print("3단계 2/3: 평가지표 계산 중 (정확도, F1 점수)...")
    evaluator_accuracy = MulticlassClassificationEvaluator(labelCol="indexedLabel", predictionCol="prediction", metricName="accuracy")
    evaluator_f1 = MulticlassClassificationEvaluator(labelCol="indexedLabel", predictionCol="prediction", metricName="f1")
    
    accuracy = evaluator_accuracy.evaluate(predictions)
    f1_score = evaluator_f1.evaluate(predictions)

    print(f"--> 정확도 (Accuracy): {accuracy:.4f}")
    print(f"--> F1 점수 (F1 Score): {f1_score:.4f}")

    print("3단계 3/3: 혼동 행렬(Confusion Matrix) 생성 중...")
    label_converter = model.stages[0]
    labels = label_converter.labels # 예: ['airplane', 'car', 'run', ...]

    # 1. 기존 방식대로 숫자 인덱스로 피봇 테이블 생성
    confusion_matrix_indexed = predictions.groupBy("indexedLabel") \
                                          .pivot("prediction", range(len(labels))) \
                                          .count().na.fill(0)
    
    # 2. UDF를 사용하여 실제 라벨 이름 컬럼('실제_라벨') 추가
    def map_index_to_label(index):
        return labels[int(index)]
    map_udf = udf(map_index_to_label, StringType())
    
    cm_with_label_col = confusion_matrix_indexed.withColumn("실제_라벨", map_udf(col("indexedLabel"))).drop("indexedLabel")

    # 3. 숫자 형태의 컬럼 이름('0', '1', ...)을 실제 라벨 이름으로 변경
    renamed_cm = cm_with_label_col
    for i, label_name in enumerate(labels):
        renamed_cm = renamed_cm.withColumnRenamed(str(i), label_name)
        
    # 4. '실제_라벨' 컬럼을 가장 앞으로 오도록 순서 변경
    final_confusion_matrix = renamed_cm.select("실제_라벨", *labels)
    
    print("===== 혼동 행렬 (Confusion Matrix) =====")
    final_confusion_matrix.show(truncate=False)

    if not os.path.exists(RESULTS_OUTPUT_PATH):
        os.makedirs(RESULTS_OUTPUT_PATH)
    
    results_pd = pd.DataFrame({
        "지표": ["accuracy", "f1_score"],
        "값": [accuracy, f1_score]
    })
    results_pd.to_csv(os.path.join(RESULTS_OUTPUT_PATH, "evaluation_metrics.csv"), index=False, encoding='utf-8-sig')
    
    final_confusion_matrix.toPandas().to_csv(os.path.join(RESULTS_OUTPUT_PATH, "confusion_matrix.csv"), index=False, encoding='utf-8-sig')
    print(f"평가 결과가 {RESULTS_OUTPUT_PATH} 경로에 저장되었습니다.")

def main():
    # --- 설정 ---
    data_dir = "/app/data"
    print("--- 이동수단 예측 파이프라인 시작 ---")
    download_and_extract_geolife(target_dir=data_dir)

    spark = SparkSession.builder \
        .appName("MoveStatePredictor") \
        .config("spark.sql.execution.arrow.pyspark.enabled", "true") \
        .config("spark.sql.shuffle.partitions", "400") \
        .getOrCreate()
    
    # --- 데이터 처리 및 머신러닝 파이프라인 ---
    try:
        feature_df = process_data(spark, os.path.join(data_dir, "Data"))
        model, test_df = train_model(spark, feature_df)
        evaluate_model(spark, model, test_df)
    except Exception as e:
        print(f"파이프라인 실행 중 오류가 발생했습니다: {e}")
        import traceback
        traceback.print_exc()
    finally:
        # --- 정리 ---
        spark.stop()
        print("--- 파이프라인 종료 ---")

if __name__ == "__main__":
    main()
