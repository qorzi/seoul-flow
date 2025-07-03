package com.demo.seoul_flow.service;

import com.demo.seoul_flow.dto.GrazeEventDto;
import com.demo.seoul_flow.repository.GrazeEventRepository;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;

import java.util.List;

@Service
public class GrazeEventService {

    private final GrazeEventRepository grazeEventRepository;

    public GrazeEventService(GrazeEventRepository grazeEventRepository) {
        this.grazeEventRepository = grazeEventRepository;
    }

    public Mono<List<GrazeEventDto>> findRecentEvents(int limit) {
        return Mono.fromCallable(() -> grazeEventRepository.findRecentEvents(limit))
                .subscribeOn(Schedulers.boundedElastic());
    }
}