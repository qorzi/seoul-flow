package com.seoulflow.spark

import org.apache.spark.sql.SparkSession
import org.apache.spark.sql.functions._
import org.apache.spark.sql.types._
import org.apache.spark.sql.DataFrame

object GrazingDetector {
  def main(args: Array[String]): Unit = {
    val kafkaBootstrapServers = if (args.length > 0) args(0) else "localhost:9092"

    val spark = SparkSession.builder
      .appName("GrazingDetector")
      .getOrCreate()

    import spark.implicits._

    // 입력 스키마 정의
    val locationSchema = StructType(Seq(
      StructField("id", StringType),
      StructField("route_id", StringType),
      StructField("timestamp", StringType),
      StructField("position", StructType(Seq(
        StructField("lat", DoubleType),
        StructField("lng", DoubleType)
      ))),
      StructField("speed_mps", DoubleType)
    ))

    // 거리 계산 UDF
    val distanceUdf = udf((lat1: Double, lon1: Double, lat2: Double, lon2: Double) => {
      val R = 6371e3 // 지구 반지름 (미터)
      val phi1 = math.toRadians(lat1)
      val phi2 = math.toRadians(lat2)
      val deltaPhi = math.toRadians(lat2 - lat1)
      val deltaLambda = math.toRadians(lon2 - lon1)
      val a = math.sin(deltaPhi / 2) * math.sin(deltaPhi / 2) +
        math.cos(phi1) * math.cos(phi2) *
        math.sin(deltaLambda / 2) * math.sin(deltaLambda / 2)
      val c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
      R * c
    })
    
    // 그리드 크기를 약 100m 수준으로 조절
    val GRID_PRECISION = 1000.0 

    // 주변 8개 그리드를 포함한 총 9개의 그리드 ID 목록을 반환하는 UDF
    val getSurroundingGridIds = udf((lat: Double, lng: Double) => {
      val centerLat = (lat * GRID_PRECISION).toInt
      val centerLng = (lng * GRID_PRECISION).toInt
      
      // 자신을 포함한 주변 3x3 격자의 ID를 모두 생성
      for {
        latOffset <- -1 to 1
        lngOffset <- -1 to 1
      } yield s"${centerLat + latOffset}_${centerLng + lngOffset}"
    })


    // Kafka 스트림 읽기
    val kafkaStreamDf = spark.readStream
      .format("kafka")
      .option("kafka.bootstrap.servers", kafkaBootstrapServers)
      .option("subscribe", "user-location-updates")
      .load()

    // 전처리 단계에서 주변 그리드 ID를 모두 생성하고 explode
    val locationsDf = kafkaStreamDf
      .selectExpr("CAST(value AS STRING) as json")
      .select(from_json($"json", locationSchema).as("data"))
      .select("data.*")
      .withColumn("event_time", to_timestamp($"timestamp"))
      // 1. 현재 위치를 기준으로, 자신과 주변 8개를 포함한 총 9개의 그리드 ID 배열을 생성
      .withColumn("grid_ids", getSurroundingGridIds($"position.lat", $"position.lng"))
      // 2. 9개의 그리드 ID를 가진 배열을 펼쳐서 데이터 행을 9개로 복제
      .withColumn("grid_id", explode($"grid_ids"))
      .drop("grid_ids")
      .withWatermark("event_time", "15 seconds") // 마지막 event_time보다 15초 이전 데이터는 제거

    
    val left = locationsDf.alias("left")
    val right = locationsDf.alias("right")

    val grazeEventsDf = left.join(
      right,
      expr(
        """
          left.grid_id = right.grid_id AND
          left.id <> right.id AND
          right.event_time >= left.event_time - interval 5 seconds AND
          right.event_time <= left.event_time + interval 5 seconds
        """
      )
    )
    .filter(distanceUdf($"left.position.lat", $"left.position.lng", $"right.position.lat", $"right.position.lng") < 20)
    .select(
        when(col("left.id") < col("right.id"), col("left.id")).otherwise(col("right.id")).as("user1_id"),
        when(col("left.id") < col("right.id"), col("right.id")).otherwise(col("left.id")).as("user2_id"),
        to_timestamp((unix_timestamp($"left.event_time") + unix_timestamp($"right.event_time")) / 2L).as("graze_time"),
        struct(
            ( ($"left.position.lat" + $"right.position.lat") / 2.0 ).as("lat"),
            ( ($"left.position.lng" + $"right.position.lng") / 2.0 ).as("lng")
        ).as("position")
    ) // 유저 id를 일관 순서로 저장
    // 복제된 데이터로 인해 중복된 스침 이벤트가 발생할 수 있으므로, 중복 제거
    .dropDuplicates("user1_id", "user2_id")


    // 결과 쓰기
    val query = grazeEventsDf
      .select(to_json(struct("*")).as("value"))
      .writeStream
      .format("kafka")
      .option("kafka.bootstrap.servers", kafkaBootstrapServers)
      .option("topic", "graze-events")
      .option("checkpointLocation", "/tmp/spark-checkpoints/grazing_v1")
      .outputMode("append")
      .start()

    query.awaitTermination()
  }
}
