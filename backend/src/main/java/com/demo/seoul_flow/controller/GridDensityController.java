package com.demo.seoul_flow.controller;

import com.demo.seoul_flow.dto.GridDensityResponseDto;
import com.demo.seoul_flow.service.GridDensityService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/grid-density")
public class GridDensityController {

    private final GridDensityService gridDensityService;

    public GridDensityController(GridDensityService gridDensityService) {
        this.gridDensityService = gridDensityService;
    }

    // GET /api/grid-density/recent 엔드포인트 정의
    @GetMapping("/recent")
    public Mono<Map<LocalDateTime, List<GridDensityResponseDto>>> getRecentHourlyData() {
        // 그룹핑 로직이 포함된 서비스 메서드 호출
        return gridDensityService.findRecentHourlyDataGroupedByTime();
    }
}