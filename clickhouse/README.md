# ClickHouse 데이터베이스 스키마

본 문서는 프로젝트의 최종 분석 데이터를 저장하는 ClickHouse 데이터베이스의 테이블 구조와 데이터 흐름에 대해 설명한다.

ClickHouse는 Kafka 토픽을 직접 구독하는 **Materialized View**를 통해, Spark에서 처리된 분석 결과를 실시간으로 최종 테이블에 적재한다.

## 1. 스침 이벤트 (Graze Events)

실시간 Spark 스트리밍 작업(`grazing_detector`)을 통해 분석된 '스침' 이벤트 데이터를 저장한다. 이 부분의 구조는 간단한 데이터 저장이므로 `MergeTree`를 사용한다.

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

주기적으로 실행되는 Spark 배치 작업의 결과물인 인구 밀도 데이터를 저장한다. 이 데이터는 동일한 키(`hourly_timestamp`, `grid_id`)에 대해 데이터가 중복으로 들어올 수 있으므로, **자동으로 값을 합산(Rollup)하는 `AggregatingMergeTree` 엔진을 사용**하여 저장 효율과 쿼리 성능을 극대화한다.

### 최종 저장 테이블: `grid_density_hourly`

-   **역할**: 특정 시간과 그리드에 대한 `user_count`의 '중간 집계 상태'를 저장한다. 동일한 키의 데이터가 들어오면 기존 상태에 새로운 상태를 자동으로 병합한다.
-   **엔진**: `AggregatingMergeTree`
-   **스키마**:
    ```sql
    CREATE TABLE IF NOT EXISTS default.grid_density_hourly
    (
        `hourly_timestamp` DateTime64(3, 'UTC'),
        `grid_id` String,
        `user_count` AggregateFunction(sum, UInt64)
    )
    ENGINE = AggregatingMergeTree
    ORDER BY (hourly_timestamp, grid_id);
    ```

### 쿼리용 뷰: `grid_density_hourly_view`

-   **역할**: `AggregatingMergeTree`에 저장된 '중간 집계 상태'를 최종 합계 값으로 변환하여 보여주는 읽기 전용 뷰. 사용자는 이 뷰를 일반 테이블처럼 조회하면 되므로, 매번 `sumMerge`, `GROUP BY`를 사용할 필요가 없어 편리하다.
-   **스키마**:
    ```sql
    CREATE VIEW default.grid_density_hourly_view AS
    SELECT
        hourly_timestamp,
        grid_id,
        sumMerge(user_count) AS user_count
    FROM default.grid_density_hourly
    GROUP BY hourly_timestamp, grid_id;
    ```

### 데이터 흐름 (Kafka -> ClickHouse)

1.  **`grid_density_hourly_kafka` (Kafka 엔진 테이블)**: `grid-density-hourly` 토픽의 메시지를 읽어온다.
2.  **`grid_density_hourly_mv` (Materialized View)**: 새로운 메시지가 들어오면 `sumState` 함수를 사용해 `user_count`를 '집계 상태'로 변환한 후, `grid_density_hourly` 테이블에 자동으로 삽입한다.

### 데이터 예시 (`grid-density-hourly` 토픽)

```json
{
  "hourly_timestamp": "2025-07-05T10:00:00.000Z",
  "grid_id": "37494_126997",
  "user_count": 1
}
