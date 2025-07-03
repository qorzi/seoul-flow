package com.demo.seoul_flow.repository;

import com.demo.seoul_flow.dto.GrazeEventDto;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;

@Repository
public class GrazeEventRepository {

    private final JdbcTemplate jdbcTemplate;

    public GrazeEventRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public List<GrazeEventDto> findRecentEvents(int limit) {
        // --- 중복 제거 로직이 적용된 SQL ---
        String sql = """
            WITH DeduplicatedEvents AS (
                SELECT
                    graze_time,
                    user1_id,
                    user2_id,
                    position_lat,
                    position_lng,
                    ROW_NUMBER() OVER (
                        PARTITION BY
                            LEAST(user1_id, user2_id),
                            GREATEST(user1_id, user2_id),
                            graze_time
                    ) as rn
                FROM graze_events
            )
            SELECT graze_time, user1_id, user2_id, position_lat, position_lng
            FROM DeduplicatedEvents
            WHERE rn = 1
            ORDER BY graze_time DESC
            LIMIT ?
        """;

        return jdbcTemplate.query(sql, this::mapRowToGrazeEvent, limit);
    }

    private GrazeEventDto mapRowToGrazeEvent(ResultSet rs, int rowNum) throws SQLException {
        return new GrazeEventDto(
                rs.getTimestamp("graze_time").toLocalDateTime(),
                rs.getString("user1_id"),
                rs.getString("user2_id"),
                rs.getDouble("position_lat"),
                rs.getDouble("position_lng")
        );
    }
}