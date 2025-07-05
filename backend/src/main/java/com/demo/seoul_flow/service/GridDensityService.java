package com.demo.seoul_flow.service;

import com.demo.seoul_flow.dto.GridDensityResponseDto;
import com.demo.seoul_flow.data.GridDensityData;
import com.demo.seoul_flow.repository.GridDensityRepository;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
public class GridDensityService {

    private final GridDensityRepository gridDensityRepository;

    public GridDensityService(GridDensityRepository gridDensityRepository) {
        this.gridDensityRepository = gridDensityRepository;
    }

    // 반환 타입을 Map 형태로 변경
    public Mono<Map<LocalDateTime, List<GridDensityResponseDto>>> findRecentHourlyDataGroupedByTime() {
        return Mono.fromCallable(() -> {
            // 1. Repository에서 24시간치 데이터를 모두 가져옴
            List<GridDensityData> flatList = gridDensityRepository.findRecentHourlyData();

            // 2. Stream API를 사용하여 hourlyTimestamp를 기준으로 그룹핑
            return flatList.stream()
                    .collect(Collectors.groupingBy(
                            GridDensityData::hourlyTimestamp, // Map의 Key가 될 타임스탬프
                            Collectors.mapping( // Value를 변환하는 로직
                                    dto -> new GridDensityResponseDto(dto.gridId(), dto.userCount()), // GridDensityDto -> GridData
                                    Collectors.toList() // 변환된 GridData를 List로 수집
                            )
                    ));
        }).subscribeOn(Schedulers.boundedElastic());
    }
}