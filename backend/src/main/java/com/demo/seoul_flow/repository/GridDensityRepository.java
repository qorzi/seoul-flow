package com.demo.seoul_flow.repository;

import com.demo.seoul_flow.data.GridDensityData;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.List;

@Repository
public class GridDensityRepository {

    private final JdbcTemplate jdbcTemplate;

    public GridDensityRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    // 최근 24시간 동안의 그리드 밀도 데이터를 조회하는 메서드
    public List<GridDensityData> findRecentHourlyData() {
        String sql = """
            SELECT
                hourly_timestamp,
                grid_id,
                sum(user_count) as user_count
            FROM grid_density_hourly_view
            WHERE hourly_timestamp >= ? AND hourly_timestamp < ?
            GROUP BY hourly_timestamp, grid_id
            ORDER BY hourly_timestamp
        """;

        // ClickHouse는 UTC 기준으로 시간을 저장하므로, 시간 계산도 UTC로 수행
        LocalDateTime nowUtc = LocalDateTime.now(ZoneOffset.UTC);
        // 현재 시간의 '정시'를 계산 (예: 14:30 -> 14:00)
        LocalDateTime endHour = nowUtc.truncatedTo(ChronoUnit.HOURS);
        // 24시간 전의 '정시'를 계산
        LocalDateTime startHour = endHour.minusHours(24);

        // SQL 쿼리에 시작 시간과 종료 시간을 파라미터로 전달
        return jdbcTemplate.query(sql, this::mapRowToGridDensity, startHour, endHour);
    }

    // ResultSet의 한 행을 GridDensityData 객체로 매핑
    private GridDensityData mapRowToGridDensity(ResultSet rs, int rowNum) throws SQLException {
        return new GridDensityData(
                rs.getTimestamp("hourly_timestamp").toLocalDateTime(),
                rs.getString("grid_id"),
                rs.getLong("user_count")
        );
    }
}