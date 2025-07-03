package com.demo.seoul_flow.dto;

import java.time.LocalDateTime;

public record GrazeEventDto(
        LocalDateTime grazeTime,
        String user1Id,
        String user2Id,
        double latitude,
        double longitude
) {}