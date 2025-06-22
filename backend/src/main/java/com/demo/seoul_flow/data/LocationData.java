package com.demo.seoul_flow.data;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class LocationData {

    private String id;

    @JsonProperty("route_id") // JSON의 'route_id' 필드를 'routeId' 필드에 매핑
    private String routeId;

    private String timestamp;

    private Position position;

    @JsonProperty("speed_mps") // JSON의 'speed_mps' 필드를 'speedMps' 필드에 매핑
    private Double speedMps;
}