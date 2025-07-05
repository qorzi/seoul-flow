import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import axios from 'axios';
import { generateRoutes } from './routeGenerator.js';
import { calculatePosition } from './pathUtils.js';

// --- 헬퍼 함수: Throttle ---
function throttle(func, limit) {
    let inThrottle;
    return function(...args) {
        if (!inThrottle) {
            func.apply(this, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

// --- 데이터 전송 함수 ---
const sendDataToServer = throttle((dummiesData) => {
    if (!dummiesData || dummiesData.length === 0) return;

    dummiesData.forEach(dummy => {
        if (dummy.isCompleted || !dummy.position) return;

        const payload = {
            id: dummy.userId,
            route_id: dummy.routeId,
            timestamp: new Date().toISOString(),
            position: { lng: dummy.position[0], lat: dummy.position[1] },
            speed_mps: dummy.speed,
        };
        
        // 실제 API 엔드포인트로 수정 필요
        axios.post(`http://localhost:8080/api/dummy/${dummy.userId}/update`, payload)
            .then(() => {
                // 성공 로그는 너무 많아질 수 있으므로 필요 시 주석 해제
                // console.log(`[${new Date().toISOString()}] Data sent for ${dummy.userId}`);
            })
            .catch(err => console.error(`[ERROR] API 전송 실패 (ID: ${dummy.userId}):`, err.message));
    });
}, 1000); // 1초에 한 번만 전송

// --- 시뮬레이션 실행 함수 ---
async function runSimulationCycle(config, cycleNumber) {
    const startTime = new Date();
    console.log(`\n==================================================`);
    console.log(`[${startTime.toISOString()}] 시뮬레이션 사이클 #${cycleNumber} 시작`);
    console.log(`[CONFIG] 경로: ${config.routeCount}개, 속도: ${config.minSpeed}-${config.maxSpeed}km/h, 겹침: ${config.overlapRatio*100}%`);
    
    // 1. 경로 생성
    const routes = generateRoutes(config);
    if (routes.length === 0) {
        console.error("경로 생성에 실패하여 사이클을 종료합니다.");
        return;
    }

    // 2. 더미 초기화
    let dummies = routes.map(route => ({
        userId: route.userId,
        routeId: route.routeId,
        speed: route.speed,
        totalDistance: route.totalDistance,
        position: route.waypoints[0],
        distanceTraveled: 0,
        isCompleted: false,
        route: route,
    }));

    // 3. 시뮬레이션 루프 실행 (Promise를 사용하여 종료 시점 제어)
    await new Promise(resolve => {
        let previousTime = Date.now();
        const interval = setInterval(() => {
            const currentTime = Date.now();
            const deltaTime = (currentTime - previousTime) / 1000; // 초 단위 시간 변화량
            previousTime = currentTime;

            let allCompleted = true;
            dummies = dummies.map(dummy => {
                if (dummy.isCompleted) return dummy;
                
                allCompleted = false; // 아직 완료되지 않은 더미가 하나라도 있으면 false
                const newDistance = dummy.distanceTraveled + (dummy.speed * deltaTime);
                const progress = dummy.totalDistance > 0 ? Math.min(newDistance / dummy.totalDistance, 1) : 1;
                const newPosition = calculatePosition(dummy.route, progress);

                return { ...dummy, position: newPosition, distanceTraveled: newDistance, isCompleted: progress >= 1 };
            });

            // 업데이트된 데이터 전송
            sendDataToServer(dummies);

            // 모든 더미가 완료되면 루프 종료
            if (allCompleted) {
                clearInterval(interval);
                resolve();
            }
        }, 100); // 100ms 간격으로 업데이트 (0.1초)
    });

    const endTime = new Date();
    const duration = (endTime - startTime) / 1000;
    console.log(`[${endTime.toISOString()}] 시뮬레이션 사이클 #${cycleNumber} 완료 (소요 시간: ${duration.toFixed(2)}초)`);
    console.log(`==================================================`);
}

// --- 메인 함수 ---
async function main() {
    // 1. CLI 인자 파싱
    const argv = yargs(hideBin(process.argv))
        .option('routeCount', { alias: 'c', type: 'number', default: 10, describe: '생성할 경로 수' })
        .option('minSpeed', { type: 'number', default: 30, describe: '최소 속도 (km/h)' })
        .option('maxSpeed', { type: 'number', default: 80, describe: '최대 속도 (km/h)' })
        .option('overlapRatio', { alias: 'o', type: 'number', default: 0.4, describe: '교차/겹침 경로 비율 (0-1)' })
        .option('overlapType', { type: 'string', default: 'temporal', choices: ['temporal', 'spatial'], describe: '겹침 유형' })
        .option('pathLengthType', { alias: 'l', type: 'string', default: 'short', choices: ['short', 'medium', 'long'], describe: '경로 길이 유형' })
        .help()
        .argv;

    const config = {
        ...argv,
        // 서울 중심부 좌표 경계
        northLat: 37.5200, southLat: 37.4800, eastLng: 127.0500, westLng: 126.9800
    };

    let cycleCounter = 1;
    // 2. 무한 루프 실행
    while (true) {
        await runSimulationCycle(config, cycleCounter);
        cycleCounter++;
        // 다음 사이클 시작 전 잠시 대기 (선택 사항)
        await new Promise(resolve => setTimeout(resolve, 2000)); // 2초 대기
    }
}

main().catch(console.error);
