# ClickHouse 데이터베이스 스키마

본 문서는 프로젝트의 최종 분석 데이터를 저장하는 ClickHouse 데이터베이스의 테이블 구조와 데이터 흐름에 대해 설명한다.

ClickHouse는 Kafka 토픽을 직접 구독하는 **Materialized View**를 통해, Spark에서 처리된 분석 결과를 실시간으로 최종 테이블에 적재한다.

## 1. 스침 이벤트 (Graze Events)

실시간 Spark 스트리밍 작업(`grazing_detector`)을 통해 분석된 '스침' 이벤트 데이터를 저장한다.

### 최종 저장 테이블: `graze_events`

-   **역할**: 모든 스침 이벤트의 발생 시간, 관련 사용자 ID, 발생 위치 좌표를 영구적으로 저장한다.
-   **엔진**: `MergeTree`
-   **스키마**:
    ```sql
    CREATE TABLE IF NOT EXISTS default.graze_events
    (
        `graze_time` DateTime64(3, 'UTC'),
        `user1_id` String,
        `user2_id` String,
        `position_lat` Float64,
        `position_lng` Float64
    )
    ENGINE = MergeTree
    ORDER BY graze_time;
    ```

### 데이터 흐름 (Kafka -> ClickHouse)

1.  **`graze_events_kafka` (Kafka 엔진 테이블)**: `graze-events` 토픽의 메시지를 실시간으로 읽어온다.
2.  **`graze_events_mv` (Materialized View)**: `graze_events_kafka` 테이블에 새로운 메시지가 들어오면, JSON을 파싱하여 `graze_events` 테이블에 자동으로 삽입한다.

```sql
-- Kafka 엔진 테이블
CREATE TABLE IF NOT EXISTS default.graze_events_kafka ( raw_message String )
ENGINE = Kafka
SETTINGS kafka_broker_list = 'kafka:29092', kafka_topic_list = 'graze-events',
         kafka_group_name = 'graze_events_clickhouse_group', kafka_format = 'JSONAsString';

-- Materialized View
CREATE MATERIALIZED VIEW default.graze_events_mv TO default.graze_events AS
SELECT
    parseDateTime64BestEffort(JSONExtractString(raw_message, 'graze_time')) AS graze_time,
    JSONExtractString(raw_message, 'user1_id') AS user1_id,
    JSONExtractString(raw_message, 'user2_id') AS user2_id,
    JSONExtractFloat(raw_message, 'position', 'lat') AS position_lat,
    JSONExtractFloat(raw_message, 'position', 'lng') AS position_lng
FROM default.graze_events_kafka;
```

### 데이터 예시 (`graze-events` 토픽)

```json
{
  "user1_id": "user-8ad83910-47fe-475b-ba71-625b11c48345",
  "user2_id": "user-a1202d46-99c2-4302-ba8f-cdcd45dd6cf4",
  "graze_time": "2025-07-05T11:17:03.500Z",
  "position": {
    "lat": 37.50389047998182,
    "lng": 127.02813923026903
  }
}
```

---

## 2. 시간대별 인구 밀도 (Hourly Grid Density)

Airflow가 주기적으로 실행하는 Spark 배치 작업(`grid_density_detector`)의 결과물인 시간대별 그리드 인구 밀도 데이터를 저장한다.

### 최종 저장 테이블: `grid_density_hourly`

-   **역할**: 특정 시간(정시 기준)에 특정 그리드 내에 존재했던 고유 사용자 수를 저장한다.
-   **엔진**: `MergeTree`
-   **스키마**:
    ```sql
    CREATE TABLE IF NOT EXISTS default.grid_density_hourly
    (
        `hourly_timestamp` DateTime64(3, 'UTC'),
        `grid_id` String,
        `user_count` UInt64
    )
    ENGINE = MergeTree
    ORDER BY (hourly_timestamp, grid_id);
    ```

### 데이터 흐름 (Kafka -> ClickHouse)

1.  **`grid_density_hourly_kafka` (Kafka 엔진 테이블)**: `grid-density-hourly` 토픽의 메시지를 읽어온다.
2.  **`grid_density_hourly_mv` (Materialized View)**: 새로운 밀도 데이터가 들어오면 JSON을 파싱하여 `grid_density_hourly` 테이블에 자동으로 삽입한다.

```sql
-- Kafka 엔진 테이블
CREATE TABLE IF NOT EXISTS default.grid_density_hourly_kafka ( raw_message String )
ENGINE = Kafka
SETTINGS kafka_broker_list = 'kafka:29092', kafka_topic_list = 'grid-density-hourly',
         kafka_group_name = 'grid_density_clickhouse_group', kafka_format = 'JSONAsString';

-- Materialized View
CREATE MATERIALIZED VIEW default.grid_density_hourly_mv TO default.grid_density_hourly AS
SELECT
    parseDateTime64BestEffort(JSONExtractString(raw_message, 'hourly_timestamp')) AS hourly_timestamp,
    JSONExtractString(raw_message, 'grid_id') AS grid_id,
    JSONExtractUInt(raw_message, 'user_count') AS user_count
FROM default.grid_density_hourly_kafka;
```

### 데이터 예시 (`grid-density-hourly` 토픽)

```json
{
  "hourly_timestamp": "2025-07-05T10:00:00.000Z",
  "grid_id": "37494_126997",
  "user_count": 1
}
