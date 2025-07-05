import sys
from pyspark.sql import SparkSession
from pyspark.sql.functions import udf, from_json, col, to_timestamp, struct, to_json, date_trunc, countDistinct
from pyspark.sql.types import StructType, StructField, StringType, DoubleType

def main():
    """
    1시간 주기로 그리드별 사용자 밀도를 계산하여 Kafka로 전송하는 PySpark 애플리케이션
    """
    # 프로그램 실행 시 전달된 인자가 없으면 기본값으로 localhost:9092 사용
    kafka_bootstrap_servers = sys.argv[1] if len(sys.argv) > 1 else "localhost:9092"
    print(f"Kafka Bootstrap Servers: {kafka_bootstrap_servers}")

    # 1. SparkSession 생성
    spark = SparkSession.builder \
        .appName("GridDensityHourlyPy") \
        .getOrCreate()

    # 2. 입력 데이터(JSON)의 스키마 정의 (기존과 동일)
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

    # 3. 그리드 ID 생성 UDF (간소화)
    # 그리드 크기를 약 100m 수준으로 조절
    GRID_PRECISION = 1000.0

    @udf(returnType=StringType())
    def get_grid_id(lat, lng):
        """주어진 위도/경도에 해당하는 단일 그리드 ID를 생성"""
        if lat is None or lng is None:
            return None
        # 정수형으로 변환하여 그리드 ID 생성
        return f"{int(lat * GRID_PRECISION)}_{int(lng * GRID_PRECISION)}"

    # 4. Kafka 스트림 읽기
    kafka_stream_df = spark.readStream \
        .format("kafka") \
        .option("kafka.bootstrap.servers", kafka_bootstrap_servers) \
        .option("subscribe", "user-location-updates") \
        .option("startingOffsets", "earliest") \
        .load()

    # 5. 데이터 전처리 및 시간 정규화
    locations_df = kafka_stream_df \
        .selectExpr("CAST(value AS STRING) as json") \
        .withColumn("data", from_json(col("json"), location_schema)) \
        .select("data.*") \
        .withColumn("event_time", to_timestamp(col("timestamp"))) \
        .withWatermark("event_time", "10 minutes") # 지연 데이터 처리를 위한 워터마크

    # 6. 시간 및 그리드 단위로 사용자 수 집계
    grid_density_df = locations_df \
        .withColumn("hourly_timestamp", date_trunc('HOUR', col("event_time"))) \
        .withColumn("grid_id", get_grid_id(col("position.lat"), col("position.lng"))) \
        .groupBy("hourly_timestamp", "grid_id") \
        .agg(countDistinct("id").alias("user_count")) # 고유한 사용자 ID의 개수를 계산

    # [로그] 집계된 결과가 Kafka로 전송되기 전에 콘솔에서 확인
    grid_density_df.writeStream \
        .format("console") \
        .outputMode("update") \
        .option("truncate", "false") \
        .queryName("hourly_density_console") \
        .trigger(processingTime='1 hour') \
        .start()

    # 7. 집계 결과를 새로운 Kafka 토픽으로 쓰기
    query = grid_density_df \
        .select(to_json(struct("*")).alias("value")) \
        .writeStream \
        .format("kafka") \
        .option("kafka.bootstrap.servers", kafka_bootstrap_servers) \
        .option("topic", "grid-density-hourly") \
        .option("checkpointLocation", "/opt/spark/checkpoints/grid_density_checkpoint") \
        .outputMode("update") \
        .trigger(processingTime='1 hour') \
        .start()

    query.awaitTermination()

if __name__ == "__main__":
    main()