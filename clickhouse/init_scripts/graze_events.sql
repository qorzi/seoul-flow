-- 데이터를 영구적으로 저장할 최종 테이블을 생성합니다.
-- Druid의 dataSource 'graze_events'에 해당합니다.
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


-- Kafka 토픽에서 데이터를 직접 읽는 Kafka 엔진 테이블을 생성합니다.
CREATE TABLE IF NOT EXISTS default.graze_events_kafka
(
    -- Kafka 메시지 전체를 JSON(또는 String)으로 받습니다.
    raw_message String
)
ENGINE = Kafka
SETTINGS
    kafka_broker_list = 'kafka:29092',
    kafka_topic_list = 'graze-events',
    kafka_group_name = 'graze_events_clickhouse_group',
    kafka_format = 'JSONAsString', -- JSON 객체 전체를 하나의 문자열로 읽습니다.
    kafka_num_consumers = 1;


-- Kafka 테이블에서 데이터를 읽어 파싱한 후, 최종 테이블(graze_events)에 삽입하는 Materialized View를 생성합니다.
CREATE MATERIALIZED VIEW default.graze_events_mv TO default.graze_events
AS SELECT
    parseDateTime64BestEffort(JSONExtractString(raw_message, 'graze_time')) AS graze_time,
    JSONExtractString(raw_message, 'user1_id') AS user1_id,
    JSONExtractString(raw_message, 'user2_id') AS user2_id,
    JSONExtractFloat(raw_message, 'position', 'lat') AS position_lat,
    JSONExtractFloat(raw_message, 'position', 'lng') AS position_lng
FROM default.graze_events_kafka;
