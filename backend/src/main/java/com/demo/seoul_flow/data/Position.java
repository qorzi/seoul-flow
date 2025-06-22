package com.demo.seoul_flow.data;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data // Getter, Setter, toString, equals, hashCode 자동 생성
@NoArgsConstructor // 파라미터 없는 생성자
@AllArgsConstructor // 모든 필드를 파라미터로 받는 생성자
public class Position {
    private double lat;
    private double lng;
}