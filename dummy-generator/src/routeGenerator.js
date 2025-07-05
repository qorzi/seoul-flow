import { v4 as uuidv4 } from 'uuid';
import { getDistance, getDestination } from './pathUtils.js';

// 랜덤 위치 생성 함수
const createRandomPosition = (bounds) => {
    const { westLng, southLat, eastLng, northLat } = bounds;
    const lng = westLng + Math.random() * (eastLng - westLng);
    const lat = southLat + Math.random() * (northLat - southLat);
    return [lng, lat];
};

/*
경로 생성 함수
- React 컴포넌트에서 로직을 그대로 가져와 Node.js 환경에 맞게 수정
*/
export function generateRoutes(config) {
    try {
        const { minSpeed, maxSpeed, overlapRatio, routeCount, overlapType, pathLengthType, ...bounds } = config;

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

        // 1. 교차점 기반 경로 생성
        for (let i = 0; i < numPairs; i++) {
            const intersectionPoint = createRandomPosition(bounds);

            // 경로 A 생성
            const totalDistanceA = minDist + Math.random() * (maxDist - minDist);
            const speedA = (minSpeed + Math.random() * (maxSpeed - minSpeed)) * 1000 / 3600;
            const intersectionProgressA = 0.3 + Math.random() * 0.4;
            const bearingA = Math.random() * 360;
            
            const distanceToStartA = totalDistanceA * intersectionProgressA;
            const startPointA = getDestination(intersectionPoint, distanceToStartA, bearingA + 180);
            const endPointA = getDestination(intersectionPoint, totalDistanceA - distanceToStartA, bearingA);
            
            finalRoutes.push({ waypoints: [startPointA, intersectionPoint, endPointA], speed: speedA, totalDistance: totalDistanceA });
            
            // 경로 B 생성
            const totalDistanceB = minDist + Math.random() * (maxDist - minDist);
            const intersectionProgressB = 0.3 + Math.random() * 0.4;
            const bearingB = Math.random() * 360;

            const distanceToStartB = totalDistanceB * intersectionProgressB;
            const startPointB = getDestination(intersectionPoint, distanceToStartB, bearingB + 180);
            const endPointB = getDestination(intersectionPoint, totalDistanceB - distanceToStartB, bearingB);
            
            let speedB;
            if(overlapType === 'temporal') {
                const timeToIntersectionA = distanceToStartA / speedA;
                speedB = timeToIntersectionA > 0 ? distanceToStartB / timeToIntersectionA : (minSpeed + Math.random() * (maxSpeed - minSpeed)) * 1000 / 3600;
            } else {
                speedB = (minSpeed + Math.random() * (maxSpeed - minSpeed)) * 1000 / 3600;
            }
            finalRoutes.push({ waypoints: [startPointB, intersectionPoint, endPointB], speed: speedB, totalDistance: totalDistanceB });
        }

        // 2. 일반 경로 생성
        for (let i = 0; i < numNormalRoutes; i++) {
            const totalDistance = minDist + Math.random() * (maxDist - minDist);
            const speed = (minSpeed + Math.random() * (maxSpeed - minSpeed)) * 1000 / 3600;
            const bearing = Math.random() * 360;
            
            const startPoint = createRandomPosition(bounds);
            const endPoint = getDestination(startPoint, totalDistance, bearing);
            finalRoutes.push({ waypoints: [startPoint, endPoint], speed, totalDistance });
        }

        // 3. 최종 정보 부여
        return finalRoutes.map(route => {
            let calculatedTotalDistance = 0;
            for (let j = 0; j < route.waypoints.length - 1; j++) {
                calculatedTotalDistance += getDistance(route.waypoints[j], route.waypoints[j+1]);
            }
            return {
                ...route,
                totalDistance: calculatedTotalDistance,
                userId: 'user-'+uuidv4(),
                routeId: uuidv4(),
                type: 'linear',
                bounds,
            };
        });

    } catch (error) {
        console.error("경로 생성 오류:", error);
        return [];
    }
}
