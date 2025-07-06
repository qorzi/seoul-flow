import React, { useState, useEffect, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, Rectangle, Tooltip } from 'react-leaflet';
import L from 'leaflet';

// 그리드 ID를 실제 위경도 경계로 변환하는 함수
const getBoundsFromGridId = (gridId) => {
    const GRID_PRECISION = 1000.0;
    const [latInt, lngInt] = gridId.split('_').map(Number);

    const southLat = latInt / GRID_PRECISION;
    const westLng = lngInt / GRID_PRECISION;
    const northLat = (latInt + 1) / GRID_PRECISION;
    const eastLng = (lngInt + 1) / GRID_PRECISION;

    return [[southLat, westLng], [northLat, eastLng]];
};

const GridLayer = ({ data, getColor }) => {
    return (
        <>
            {data.map(grid => (
                <Rectangle
                    key={grid.gridId} // 이제 key는 gridId만으로 충분합니다.
                    bounds={getBoundsFromGridId(grid.gridId)}
                    pathOptions={{
                        fillColor: getColor(grid.userCount),
                        color: getColor(grid.userCount),
                        weight: 1,
                        fillOpacity: 0.6
                    }}
                >
                    <Tooltip>
                        Grid: {grid.gridId}<br/>
                        인원: {grid.userCount}명
                    </Tooltip>
                </Rectangle>
            ))}
        </>
    );
};

const DensityView = ({ densityData, isLoading }) => {
    const mapRef = useRef();
    // 시간대 목록 (API 응답의 key)을 시간순으로 정렬
    const timeKeys = useMemo(() => Object.keys(densityData).sort(), [densityData]);
    // 현재 선택된 시간 인덱스
    const [selectedTimeIndex, setSelectedTimeIndex] = useState(0);
    
    // 초기 줌이 완료되었는지 추적하는 상태
    const [initialZoomDone, setInitialZoomDone] = useState(false);

    // 표시할 현재 시간대 데이터
    const currentDisplayData = densityData[timeKeys[selectedTimeIndex]] || [];

    // userCount에 따라 색상을 결정하는 함수
    const getColor = useMemo(() => {
        // 전체 데이터에서 최대 userCount를 찾아 동적으로 임계값 설정
        const allCounts = Object.values(densityData).flat().map(d => d.userCount);
        if (allCounts.length === 0) {
            return () => '#5cb85c'; // 데이터가 없으면 기본색
        }
        const maxCount = Math.max(...allCounts);

        return (count) => {
            if (count > maxCount * 0.66) return '#d9534f'; // 빨간색 (과밀)
            if (count > maxCount * 0.33) return '#f0ad4e'; // 주황색 (혼잡)
            return '#5cb85c'; // 녹색 (원활)
        };
    }, [densityData]);

    // 데이터가 처음 로드되었을 때 '한 번만' 전체 데이터에 맞춰 뷰를 조정합니다.
    useEffect(() => {
        // 데이터 로딩이 완료되고, 데이터가 있으며, 아직 초기 줌을 실행하지 않았을 때만 실행
        if (!isLoading && !initialZoomDone && Object.keys(densityData).length > 0 && mapRef.current) {
            const allGrids = Object.values(densityData).flat();
            if (allGrids.length === 0) return;

            const bounds = L.latLngBounds();
            allGrids.forEach(grid => {
                const gridBounds = getBoundsFromGridId(grid.gridId);
                bounds.extend(gridBounds[0]);
                bounds.extend(gridBounds[1]);
            });

            if (bounds.isValid()) {
                mapRef.current.fitBounds(bounds, { padding: [50, 50] });
                // 초기 줌이 완료되었음을 상태에 기록
                setInitialZoomDone(true);
            }
        }
    }, [densityData, isLoading, initialZoomDone]);

    // 탭이 변경되어 컴포넌트가 다시 마운트될 때, 초기 줌 상태를 리셋
    useEffect(() => {
        return () => {
            setInitialZoomDone(false);
        };
    }, []);

    const selectedTimestamp = timeKeys[selectedTimeIndex] 
        ? new Date(timeKeys[selectedTimeIndex]).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
        : "데이터 없음";

    return (
        <div className="density-view-container">
            <div className="density-map-header">
                <div className="density-title-section">
                    <h2>시간대별 인구 밀도</h2>
                    <p>{isLoading ? "데이터 로딩 중..." : `시간: ${selectedTimestamp}`}</p>
                </div>
                <div className="density-slider-container">
                    <input
                        type="range"
                        min="0"
                        max={timeKeys.length > 0 ? timeKeys.length - 1 : 0}
                        value={selectedTimeIndex}
                        onChange={(e) => setSelectedTimeIndex(Number(e.target.value))}
                        disabled={isLoading || timeKeys.length === 0}
                        className="time-slider"
                    />
                </div>
            </div>
            <MapContainer ref={mapRef} center={[37.50, 127.03]} zoom={12} style={{ height: '100%', width: '100%' }}>
                <TileLayer
                    url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                />
                {!isLoading && (
                    <GridLayer
                        key={timeKeys[selectedTimeIndex]} 
                        data={currentDisplayData}
                        getColor={getColor}
                    />
                )}
            </MapContainer>
        </div>
    );
};

export default DensityView;
