package com.demo.seoul_flow.controller;


import com.demo.seoul_flow.data.LocationData;
import com.demo.seoul_flow.service.KafkaProducerService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
        import reactor.core.publisher.Mono;

@RestController
@RequestMapping("/api/dummy") // 공통 경로 설정
@RequiredArgsConstructor
@Slf4j
public class LocationController {

    private final KafkaProducerService kafkaProducerService;

    /**
     * 클라이언트로부터 더미의 위치 정보를 받아 Kafka로 전송합니다.
     * 프론트엔드 코드의 fetch 경로와 일치시킵니다.
     *
     * @param id 더미의 고유 ID (경로 변수)
     * @param locationData 요청 본문에 담긴 데이터 (JSON)
     * @return 처리 완료 후 빈 응답(200 OK)을 비동기적으로 반환
     */
    @PostMapping("/{id}/update")
    public Mono<ResponseEntity<Void>> updateDummyLocation(
            @PathVariable String id,
            @RequestBody LocationData locationData) {

        // 경로 변수의 id와 요청 본문의 id가 일치하는지 확인 (선택적)
        if (!id.equals(locationData.getId())) {
            log.warn("Path variable ID '{}' does not match payload ID '{}'", id, locationData.getId());
            // 일치하지 않을 경우 400 Bad Request 반환
            return Mono.just(ResponseEntity.badRequest().build());
        }

        log.info("[HTTP Request] Received data for Dummy ID: {}", id);

        // Kafka 서비스 호출하여 데이터 전송
        kafkaProducerService.sendLocationData(locationData);

        // 처리가 성공적으로 접수되었음을 알리는 200 OK 응답 반환
        return Mono.just(ResponseEntity.ok().build());
    }
}