import sys
from math import radians, sin, cos, sqrt, atan2

from pyspark.sql import SparkSession
from pyspark.sql.functions import udf, from_json, col, expr, to_timestamp, struct, lit, when, explode, to_json
from pyspark.sql.types import StructType, StructField, StringType, DoubleType, ArrayType

def main():
    """
    PySpark 스트리밍 애플리케이션의 메인 함수
    """
    # 프로그램 실행 시 전달된 인자가 없으면 기본값으로 localhost:9092 사용
    kafka_bootstrap_servers = sys.argv[1] if len(sys.argv) > 1 else "localhost:9092"
    
    # 1. SparkSession 생성
    spark = SparkSession.builder \
        .appName("GrazingDetectorPy") \
        .getOrCreate()

    # 2. 입력 데이터(JSON)의 스키마 정의
    location_schema = StructType([
        StructField("id", StringType(), True),
        StructField("route_id", StringType(), True),
        StructField("timestamp", StringType(), True),
        StructField("position", StructType([
            StructField("lat", DoubleType(), True),
            StructField("lng", DoubleType(), True)
        ]), True),
        StructField("speed_mps", DoubleType(), True)
    ])

    # 3. 거리 계산 UDF (사용자 정의 함수)
    @udf(returnType=DoubleType())
    def calculate_distance(lat1, lon1, lat2, lon2):
        # 지구 반지름 (미터)
        R = 6371e3
        
        phi1 = radians(lat1)
        phi2 = radians(lat2)
        delta_phi = radians(lat2 - lat1)
        delta_lambda = radians(lon2 - lon1)

        a = sin(delta_phi / 2) * sin(delta_phi / 2) + \
            cos(phi1) * cos(phi2) * \
            sin(delta_lambda / 2) * sin(delta_lambda / 2)
        c = 2 * atan2(sqrt(a), sqrt(1 - a))

        return R * c

    # 4. 그리드 ID 및 주변 그리드 ID 생성 UDF
    # 그리드 크기를 약 100m 수준으로 조절
    GRID_PRECISION = 1000.0

    @udf(returnType=ArrayType(StringType()))
    def get_surrounding_grid_ids(lat, lng):
        center_lat = int(lat * GRID_PRECISION)
        center_lng = int(lng * GRID_PRECISION)
        
        # 자신을 포함한 주변 3x3 격자의 ID를 모두 생성
        surrounding_grids = []
        for lat_offset in range(-1, 2):
            for lng_offset in range(-1, 2):
                surrounding_grids.append(f"{center_lat + lat_offset}_{center_lng + lng_offset}")
        return surrounding_grids

    # 5. Kafka 스트림 읽기
    kafka_stream_df = spark.readStream \
        .format("kafka") \
        .option("kafka.bootstrap.servers", kafka_bootstrap_servers) \
        .option("subscribe", "user-location-updates") \
        .option("startingOffsets", "earliest") \
        .load()

    # 6. 전처리 단계에서 주변 그리드 ID를 모두 생성하고 explode
    locations_df = kafka_stream_df \
        .selectExpr("CAST(value AS STRING) as json") \
        .withColumn("data", from_json(col("json"), location_schema)) \
        .select("data.*") \
        .withColumn("event_time", to_timestamp(col("timestamp"))) \
        .withColumn("grid_ids", get_surrounding_grid_ids(col("position.lat"), col("position.lng"))) \
        .withColumn("grid_id", explode(col("grid_ids"))) \
        .drop("grid_ids") \
        .withWatermark("event_time", "15 seconds") # 마지막 event_time보다 15초 이전 데이터는 제거

    # 7. 스침 감지 로직 (스트림-스트림 셀프 조인)
    left = locations_df.alias("left")
    right = locations_df.alias("right")

    graze_events_df = left.join(
        right,
        expr(
            """
            left.grid_id = right.grid_id AND
            left.id <> right.id AND
            right.event_time >= left.event_time - interval 5 seconds AND
            right.event_time <= left.event_time + interval 5 seconds
            """
        )
    ) \
    .filter(calculate_distance(col("left.position.lat"), col("left.position.lng"), col("right.position.lat"), col("right.position.lng")) < 20) \
    .select(
        # 유저 id를 일관 순서로 저장
        when(col("left.id") < col("right.id"), col("left.id")).otherwise(col("right.id")).alias("user1_id"),
        when(col("left.id") < col("right.id"), col("right.id")).otherwise(col("left.id")).alias("user2_id"),
        to_timestamp((col("left.event_time").cast("long") + col("right.event_time").cast("long")) / 2).alias("graze_time"),
        struct(
            ((col("left.position.lat") + col("right.position.lat")) / 2.0).alias("lat"),
            ((col("left.position.lng") + col("right.position.lng")) / 2.0).alias("lng")
        ).alias("position")
    ) \
    .dropDuplicates(["user1_id", "user2_id"]) # 복제된 데이터로 인해 중복된 스침 이벤트가 발생할 수 있으므로, 중복 제거

    # 8. 결과 쓰기
    query = graze_events_df \
        .select(to_json(struct("*")).alias("value")) \
        .writeStream \
        .format("kafka") \
        .option("kafka.bootstrap.servers", kafka_bootstrap_servers) \
        .option("topic", "graze-events") \
        .option("checkpointLocation", "/opt/spark/checkpoints/grazing_v2") \
        .outputMode("append") \
        .start()

    query.awaitTermination()

if __name__ == "__main__":
    main()
