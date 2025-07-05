package com.demo.seoul_flow.dto;

// 시간별로 그룹핑된 데이터의 '값'으로 사용될 DTO
public record GridDensityResponseDto(
        String gridId,
        long userCount
) {}