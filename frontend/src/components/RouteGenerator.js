import React, { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { getDistance, getDestination } from '../utils/pathUtils';

/**
 * 시뮬레이션 설정을 담당하는 컴포넌트
 * - 설정값에 따라 경로를 생성하는 로직 담당
 */
const RouteGenerator = ({ onRoutesGenerated, simulationState, onControl, isRouteGenerated, defaultBounds }) => {
    // 설정 폼 데이터 관리
    const [formData, setFormData] = useState({
        minSpeed: 30, maxSpeed: 80, overlapRatio: 0.4,
        overlapType: 'temporal', routeCount: 10,
        pathLengthType: 'medium',
        ...defaultBounds
    });
    // 폼 열림 상태 관리
    const [isOpen, setIsOpen] = useState(true);

    // 입력 필드 변경 핸들러
    const handleInputChange = (e) => {
      const { name, value, type } = e.target;
      let processedValue = type === 'number' ? parseFloat(value) : value;

      // 경로 수에 대한 상한선(50) 적용
      if (name === 'routeCount' && processedValue > 50) {
          processedValue = 50;
      }

      setFormData(prev => ({ ...prev, [name]: processedValue }));
  };

    // 랜덤 위치 생성 함수
    const createRandomPosition = (bounds) => {
        const { westLng, southLat, eastLng, northLat } = bounds;
        const lng = westLng + Math.random() * (eastLng - westLng);
        const lat = southLat + Math.random() * (northLat - southLat);
        return [lng, lat];
    };

    /*
    경로 생성 함수
    1. '경로 수'와 '교차 비율'을 기반으로 생성할 교차점의 개수를 계산
    2. 교차점의 개수만큼 교차점 좌표를 무작위로 생성
    3. 각 교차점에 두 개의 경로를 할당하고, 경로의 전체 거리와 속도를 미리 무작위로 설정
    4. 미리 정해진 정보(교차점, 거리, 속도, 방향)를 통해 경로 생성
    */
    const generateRoutes = () => {
      try {
          const { minSpeed, maxSpeed, overlapRatio, routeCount, overlapType, pathLengthType, ...bounds } = formData;

          const distanceConfig = {
              short: { min: 500, max: 2000 },
              medium: { min: 2000, max: 5000 },
              long: { min: 5000, max: 10000 }
          };
          const { min: minDist, max: maxDist } = distanceConfig[pathLengthType];

          const numIntersectingRoutes = Math.floor(routeCount * overlapRatio);
          const numPairs = Math.floor(numIntersectingRoutes / 2);
          const numNormalRoutes = routeCount - (numPairs * 2);

          let finalRoutes = [];

          // --- 1. 교차점 기반 경로 생성 ---
          for (let i = 0; i < numPairs; i++) {
              const intersectionPoint = createRandomPosition(bounds);

              // --- 경로 A 생성 ---
              const totalDistanceA = minDist + Math.random() * (maxDist - minDist);
              const speedA = (minSpeed + Math.random() * (maxSpeed - minSpeed)) * 1000 / 3600;
              const intersectionProgressA = 0.3 + Math.random() * 0.4; // 30% ~ 70% 지점
              const bearingA = Math.random() * 360;
              
              const distanceToStartA = totalDistanceA * intersectionProgressA;
              const startPointA = getDestination(intersectionPoint, distanceToStartA, bearingA + 180);
              const endPointA = getDestination(intersectionPoint, totalDistanceA - distanceToStartA, bearingA);
              
              finalRoutes.push({ waypoints: [startPointA, intersectionPoint, endPointA], speed: speedA, totalDistance: totalDistanceA });
              
              // --- 경로 B 생성 ---
              const totalDistanceB = minDist + Math.random() * (maxDist - minDist);
              const intersectionProgressB = 0.3 + Math.random() * 0.4;
              const bearingB = Math.random() * 360;

              const distanceToStartB = totalDistanceB * intersectionProgressB;
              const startPointB = getDestination(intersectionPoint, distanceToStartB, bearingB + 180);
              const endPointB = getDestination(intersectionPoint, totalDistanceB - distanceToStartB, bearingB);
              
              let speedB;
              if(overlapType === 'temporal') {
                  // 시간적 스침: B의 속도를 역산
                  const timeToIntersectionA = distanceToStartA / speedA;
                  speedB = timeToIntersectionA > 0 ? distanceToStartB / timeToIntersectionA : (minSpeed + Math.random() * (maxSpeed - minSpeed)) * 1000 / 3600;
              } else {
                  // 공간적 스침: B의 속도는 무작위
                  speedB = (minSpeed + Math.random() * (maxSpeed - minSpeed)) * 1000 / 3600;
              }
              finalRoutes.push({ waypoints: [startPointB, intersectionPoint, endPointB], speed: speedB, totalDistance: totalDistanceB });
          }

          // --- 2. 일반 경로 생성 ---
          for (let i = 0; i < numNormalRoutes; i++) {
              const totalDistance = minDist + Math.random() * (maxDist - minDist);
              const speed = (minSpeed + Math.random() * (maxSpeed - minSpeed)) * 1000 / 3600;
              const bearing = Math.random() * 360;
              
              const startPoint = createRandomPosition(bounds);
              const endPoint = getDestination(startPoint, totalDistance, bearing);
              finalRoutes.push({ waypoints: [startPoint, endPoint], speed, totalDistance });
          }

          // --- 3. 최종 정보 부여 ---
          const processedRoutes = finalRoutes.map(route => {
              // 경유지를 포함한 실제 총 거리를 다시 한번 정확히 계산
              let calculatedTotalDistance = 0;
              for (let j = 0; j < route.waypoints.length - 1; j++) {
                  calculatedTotalDistance += getDistance(route.waypoints[j], route.waypoints[j+1]);
              }
              return {
                  ...route,
                  totalDistance: calculatedTotalDistance, // 역산된 경로의 실제 거리로 덮어쓰기
                  userId: 'user-'+uuidv4(),
                  routeId: uuidv4(),
                  type: 'linear', // 경로는 항상 직선
                  bounds,
              };
          });

          onRoutesGenerated(processedRoutes);
      } catch (error) {
          console.error("경로 생성 오류:", error);
          alert("경로 생성 중 오류가 발생했습니다.");
      }
  };
  
  const isIdle = simulationState === 'idle';
  const helpTooltipText = `공간적 겹침: 두 더미가 같은 지점을 지나가지만, 각자 다른 시간에 도착합니다.\n시간적 스침: 두 더미가 같은 지점에 같은 시간에 도착하도록 한쪽 더미의 속도가 자동으로 조절됩니다.`;
  const routeCountHelpText = "성능 유지를 위해 최대 50개까지 생성할 수 있습니다.";

  return (
      <div className={`route-generator ${isOpen ? 'is-open' : 'is-closed'}`}>
          <div className="generator-header" onClick={() => setIsOpen(!isOpen)}>
              <h2>시뮬레이션 설정</h2>
              <span className="toggle-icon">{isOpen ? '▲' : '▼'}</span>
          </div>
          {isOpen && (
              <div className="generator-content">
                  <div className="form-group">
                      <label style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                          경로 수
                          <span className="help-tooltip" data-title={routeCountHelpText}>?</span>
                      </label>
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
                      <label>전체 경로 길이:</label>
                      <select name="pathLengthType" value={formData.pathLengthType} onChange={handleInputChange} disabled={!isIdle}>
                          <option value="short">짧음 (0.5-2km)</option>
                          <option value="medium">중간 (2-5km)</option>
                          <option value="long">김 (5-10km)</option>
                      </select>
                  </div>
                  <div className="form-group">
                      <label style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                          겹침 유형
                          <span className="help-tooltip" data-title={helpTooltipText}>?</span>
                      </label>
                      <select name="overlapType" value={formData.overlapType} onChange={handleInputChange} disabled={!isIdle}>
                          <option value="temporal">시간적 스침 (속도 조절)</option>
                          <option value="spatial">공간적 겹침 (단순 경유)</option>
                      </select>
                  </div>
                  <div className="form-group">
                      <label>교차/겹침 경로 비율 (0-1):</label>
                      <input type="number" name="overlapRatio" value={formData.overlapRatio} onChange={handleInputChange} step="0.1" min="0" max="1" disabled={!isIdle} />
                  </div>
                  
                  <div className="button-group">
                      <button className="btn btn-primary" onClick={generateRoutes} disabled={!isIdle}>
                          {isRouteGenerated ? '경로 재생성' : '경로 생성'}
                      </button>
                      <button 
                          className="btn btn-success" 
                          onClick={() => {
                              onControl('start');
                              setIsOpen(false);
                          }} 
                          disabled={!isRouteGenerated || simulationState === 'running'}
                      >
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
