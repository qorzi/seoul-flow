package com.demo.seoul_flow.service;

import com.demo.seoul_flow.data.LocationData;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor // final 필드에 대한 생성자를 자동으로 생성
@Slf4j // 로깅을 위한 Lombok 어노테이션
public class KafkaProducerService {

    // application.yml에 정의된 토픽 이름을 주입받습니다.
    @Value("${kafka-topics.user-location-topic}")
    private String topicName;

    // KafkaTemplate을 주입받아 사용합니다. Key: String, Value: LocationData 객체
    private final KafkaTemplate<String, LocationData> kafkaTemplate;

    /**
     * LocationData 객체를 Kafka 토픽으로 전송합니다.
     * @param data 전송할 데이터
     */
    public void sendLocationData(LocationData data) {
        log.info("Sending data to Kafka topic '{}' for user ID: {}", topicName, data.getId());

        // Kafka로 메시지를 전송합니다.
        // 토픽 이름, 메시지 키(사용자 ID), 메시지 본문(LocationData 객체)을 전달합니다.
        // 메시지 키를 설정하면 동일한 키는 동일한 파티션으로 전송되어 순서를 보장하는 데 도움이 됩니다.
        kafkaTemplate.send(topicName, data.getId(), data);
    }
}