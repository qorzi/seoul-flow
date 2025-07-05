//--- 경로 계산 유틸리티 함수 (React 코드와 동일) ---

/** 각도를 라디안으로 변환 */
export const toRad = (val) => (val * Math.PI) / 180;

/** 라디안을 각도로 변환합니다. */
export const toDeg = (val) => (val * 180) / Math.PI;

/** 두 지점 간의 거리를 미터 단위로 계산 */
export const getDistance = (p1, p2) => {
    if (!p1 || !p2) return 0;
    const R = 6371e3; // 지구 반지름 (미터)
    const [lon1, lat1] = p1;
    const [lon2, lat2] = p2;

    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
};

/** 특정 지점에서 특정 거리와 방향(bearing)에 있는 새로운 지점의 좌표를 계산 */
export const getDestination = (point, distance, bearing) => {
    const R = 6371e3;
    const [lon1, lat1] = [toRad(point[0]), toRad(point[1])];
    const bearingRad = toRad(bearing);

    const lat2 = Math.asin(Math.sin(lat1) * Math.cos(distance / R) +
                         Math.cos(lat1) * Math.sin(distance / R) * Math.cos(bearingRad));
    
    const lon2 = lon1 + Math.atan2(Math.sin(bearingRad) * Math.sin(distance / R) * Math.cos(lat1),
                                 Math.cos(distance / R) - Math.sin(lat1) * Math.sin(lat2));

    return [toDeg(lon2), toDeg(lat2)];
};

/** 경로와 진행률에 따라 현재 위치를 계산 (직선 경로만 지원) */
export const calculatePosition = (route, progress) => {
    const { waypoints, totalDistance } = route;
    if (progress >= 1) return waypoints[waypoints.length - 1];
    if (progress <= 0) return waypoints[0];

    const distanceTraveled = totalDistance * progress;
    let distanceCovered = 0;

    for (let i = 0; i < waypoints.length - 1; i++) {
        const segmentStart = waypoints[i];
        const segmentEnd = waypoints[i+1];
        const segmentDistance = getDistance(segmentStart, segmentEnd);

        if (distanceCovered + segmentDistance >= distanceTraveled) {
            const distanceInSegment = distanceTraveled - distanceCovered;
            const segmentProgress = segmentDistance > 0 ? distanceInSegment / segmentDistance : 0;
            
            const [lon1, lat1] = segmentStart;
            const [lon2, lat2] = segmentEnd;
            
            return [lerp(lon1, lon2, segmentProgress), lerp(lat1, lat2, segmentProgress)];
        }
        distanceCovered += segmentDistance;
    }
    return waypoints[waypoints.length - 1]; // Fallback
};

/** 두 점 사이를 선형 보간 */
export const lerp = (a, b, t) => a + (b - a) * t;
