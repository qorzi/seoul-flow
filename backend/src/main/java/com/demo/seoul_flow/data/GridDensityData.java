package com.demo.seoul_flow.data;

import java.time.LocalDateTime;

// ClickHouse의 'grid_density_hourly' 테이블 데이터를 전달하기 위한 record
public record GridDensityData(
        LocalDateTime hourlyTimestamp,
        String gridId,
        long userCount
) {}