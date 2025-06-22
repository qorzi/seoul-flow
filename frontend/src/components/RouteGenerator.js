import React, { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';

//--- turf.js 대체 함수 ---

const getDistance = (p1, p2) => {
    const R = 6371e3; // 지구 반지름 (미터)
    const toRad = (val) => (val * Math.PI) / 180;

    const lat1 = p1[1];
    const lon1 = p1[0];
    const lat2 = p2[1];
    const lon2 = p2[0];

    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
};

/**
 * 시뮬레이션 설정을 담당하는 컴포넌트 (아코디언 UI 적용)
 */
const RouteGenerator = ({ onRoutesGenerated, simulationState, onControl, isRouteGenerated, defaultBounds }) => {
    const [formData, setFormData] = useState({
        minSpeed: 30, // km/h
        maxSpeed: 80, // km/h
        overlapRatio: 0.3,
        routeCount: 5,
        routeType: 'linear',
        ...defaultBounds
    });
    const [isOpen, setIsOpen] = useState(true); // 아코디언 상태

    const handleInputChange = (e) => {
        const { name, value, type } = e.target;
        setFormData(prev => ({ ...prev, [name]: type === 'number' ? parseFloat(value) : value }));
    };

    const createRandomPosition = (bounds) => {
        const { westLng, southLat, eastLng, northLat } = bounds;
        const lng = westLng + Math.random() * (eastLng - westLng);
        const lat = southLat + Math.random() * (northLat - southLat);
        return [lng, lat];
    };

    const generateRoutes = () => {
        try {
            const { minSpeed, maxSpeed, overlapRatio, routeCount, routeType, ...bounds } = formData;
            const newRoutes = [];

            for (let i = 0; i < routeCount; i++) {
                let startPoint, endPoint;
                
                if (i > 0 && newRoutes.length > 0 && overlapRatio > 0) {
                    const prev = newRoutes[i - 1];
                    startPoint = [
                        lerp(prev.startPoint[0], prev.endPoint[0], overlapRatio),
                        lerp(prev.startPoint[1], prev.endPoint[1], overlapRatio)
                    ];
                } else {
                    startPoint = createRandomPosition(bounds);
                }
                
                let attempts = 0;
                const maxAttempts = 50; 
                do {
                    endPoint = createRandomPosition(bounds);
                    attempts++;
                    if (attempts > maxAttempts) break;
                } while (getDistance(startPoint, endPoint) < 500);

                const speedKmh = minSpeed + Math.random() * (maxSpeed - minSpeed);
                const speedMps = speedKmh * 1000 / 3600;
                
                newRoutes.push({
                    id: uuidv4(),
                    startPoint,
                    endPoint,
                    speed: speedMps,
                    type: routeType,
                    totalDistance: getDistance(startPoint, endPoint),
                    bounds,
                });
            }
            onRoutesGenerated(newRoutes);
            setIsOpen(false); // 경로 생성 후 자동으로 닫기
        } catch (error) {
            console.error("경로 생성 오류:", error);
            alert("경로 생성 중 오류가 발생했습니다.");
        }
    };
    
    const lerp = (a, b, t) => a + (b - a) * t;
    const isIdle = simulationState === 'idle';

    return (
        <div className={`route-generator ${isOpen ? 'is-open' : 'is-closed'}`}>
            <div className="generator-header" onClick={() => setIsOpen(!isOpen)}>
                <h2>시뮬레이션 설정</h2>
                <span className="toggle-icon">{isOpen ? '▲' : '▼'}</span>
            </div>
            {isOpen && (
                <div className="generator-content">
                    <div className="form-group">
                        <label>경로 수:</label>
                        <input type="number" name="routeCount" value={formData.routeCount} onChange={handleInputChange} min="1" max="50" disabled={!isIdle} />
                    </div>
                    <div className="form-group">
                        <label>최소 속도 (km/h):</label>
                        <input type="number" name="minSpeed" value={formData.minSpeed} onChange={handleInputChange} min="1" disabled={!isIdle} />
                    </div>
                    <div className="form-group">
                        <label>최대 속도 (km/h):</label>
                        <input type="number" name="maxSpeed" value={formData.maxSpeed} onChange={handleInputChange} min="1" disabled={!isIdle} />
                    </div>
                    <div className="form-group">
                        <label>겹침 비율 (0-1):</label>
                        <input type="number" name="overlapRatio" value={formData.overlapRatio} onChange={handleInputChange} step="0.1" min="0" max="1" disabled={!isIdle} />
                    </div>
                    <div className="form-group">
                        <label>경로 유형:</label>
                        <select name="routeType" value={formData.routeType} onChange={handleInputChange} disabled={!isIdle}>
                            <option value="linear">직선</option>
                            <option value="arc">곡선</option>
                            <option value="zigzag">지그재그</option>
                        </select>
                    </div>
                    
                    <div className="button-group">
                        <button className="btn btn-primary" onClick={generateRoutes} disabled={!isIdle}>
                            {isRouteGenerated ? '경로 재생성' : '경로 생성'}
                        </button>
                        <button className="btn btn-success" onClick={() => onControl('start')} disabled={!isRouteGenerated || simulationState === 'running'}>
                            {simulationState === 'paused' ? '재개' : '시작'}
                        </button>
                        <button className="btn btn-warning" onClick={() => onControl('pause')} disabled={simulationState !== 'running'}>
                            일시정지
                        </button>
                        <button className="btn btn-danger" onClick={() => onControl('stop')} disabled={isIdle}>
                            정지
                        </button>
                    </div>
                    <button className="btn btn-reset" onClick={() => onControl('reset')}>
                        전체 초기화
                    </button>
                </div>
            )}
        </div>
    );
};

export default RouteGenerator;
