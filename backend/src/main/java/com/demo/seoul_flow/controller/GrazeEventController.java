package com.demo.seoul_flow.controller;

import com.demo.seoul_flow.dto.GrazeEventDto;
import com.demo.seoul_flow.service.GrazeEventService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;

import java.util.List;

@RestController
@RequestMapping("/api/graze-events")
public class GrazeEventController {

    private final GrazeEventService grazeEventService;

    public GrazeEventController(GrazeEventService grazeEventService) {
        this.grazeEventService = grazeEventService;
    }

    @GetMapping("/recent")
    public Mono<List<GrazeEventDto>> getRecentEvents(
            @RequestParam(defaultValue = "30") int limit) {
        // Mono<List<...>>를 그대로 반환하면 WebFlux가 알아서 비동기로 처리
        return grazeEventService.findRecentEvents(limit);
    }
}