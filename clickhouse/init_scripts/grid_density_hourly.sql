-- 데이터를 영구적으로 저장할 최종 테이블을 생성합니다.
-- 토픽 이름과 동일한 'grid_density_hourly'로 명명합니다.
CREATE TABLE IF NOT EXISTS default.grid_density_hourly
(
    `hourly_timestamp` DateTime64(3, 'UTC'),
    `grid_id` String,
    `user_count` AggregateFunction(sum, UInt64)
)
ENGINE = AggregatingMergeTree
ORDER BY (hourly_timestamp, grid_id);


-- Kafka 토픽에서 데이터를 직접 읽는 Kafka 엔진 테이블을 생성합니다.
CREATE TABLE IF NOT EXISTS default.grid_density_hourly_kafka
(
    -- Kafka 메시지 전체를 JSON 문자열로 받습니다.
    raw_message String
)
ENGINE = Kafka
SETTINGS
    kafka_broker_list = 'kafka:29092',
    kafka_topic_list = 'grid-density-hourly', -- 구독할 토픽을 'grid-density-hourly'로 지정
    kafka_group_name = 'grid_density_clickhouse_group_v2', -- 충돌을 피하기 위한 새로운 그룹 이름
    kafka_format = 'JSONAsString', -- JSON 객체 전체를 하나의 문자열로 읽음
    kafka_num_consumers = 1;


-- Kafka 테이블에서 데이터를 읽어 파싱한 후, 최종 테이블에 삽입하는 Materialized View를 생성합니다.
CREATE MATERIALIZED VIEW default.grid_density_hourly_mv TO default.grid_density_hourly
AS SELECT
    parseDateTime64BestEffort(JSONExtractString(raw_message, 'hourly_timestamp')) AS hourly_timestamp,
    JSONExtractString(raw_message, 'grid_id') AS grid_id,
    sumState(JSONExtractUInt(raw_message, 'user_count')) AS user_count
FROM default.grid_density_hourly_kafka
GROUP BY hourly_timestamp, grid_id;

-- group by 없이 최종 결과를 보여주기 위한 view 생성
CREATE VIEW IF NOT EXISTS default.grid_density_hourly_view AS
SELECT
    hourly_timestamp,
    grid_id,
    sumMerge(user_count) AS user_count
FROM default.grid_density_hourly
GROUP BY hourly_timestamp, grid_id;