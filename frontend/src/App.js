import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import './App.css';

import RouteGenerator from './components/RouteGenerator';
import MapView from './components/MapView';
import DummyTable from './components/DummyTable';
import { useThrottle } from './utils/useThrottle';
import { calculatePosition } from './utils/pathUtils'; // 유틸리티 함수 import

function App() {
    // 생성된 모든 경로의 정의(경유지, 속도, 거리 등)를 담는 배열
    const [routes, setRoutes] = useState([]);
    // 각 더미의 실시간 상태(현재 위치, 이동 거리 등)를 담는 배열
    const [dummies, setDummies] = useState([]);
    // 시뮬레이션 상태: 'idle', 'running', 'paused'
    const [simulationState, setSimulationState] = useState('idle');
    // 경로 생성 여부: true 또는 false
    const [isRouteGenerated, setIsRouteGenerated] = useState(false);

    // 애니메이션 요청을 추적하기 위한 참조
    const requestRef = useRef();
    // 이전 프레임 시간을 추적하기 위한 참조
    const previousTimeRef = useRef();

    // 더미 데이터를 서버로 전송하는 함수 (최대 1초마다 한 번씩 호출)
    const sendDummyDataToServer = useThrottle((dummiesData) => {
        if (!dummiesData || dummiesData.length === 0) return;
        // 각 더미에 대해 서버로 데이터 전송
        dummiesData.forEach(dummy => {
            if (dummy.isCompleted || !dummy.position) return;
            const payload = { id: dummy.id, position: dummy.position, speed_mps: dummy.speed };
            console.log(`[API Call] Sending data for Dummy ID: ${dummy.id}`, payload);
        });
    }, 1000);

    // 매 프레임마다 호출되는 핵심 애니메이션 루프
    const animate = useCallback((time) => {
        // 이전 프레임 시간이 존재하는 경우에만 애니메이션 실행
        if (previousTimeRef.current != null) {
            // 이전 프레임과 현재 프레임 사이의 시간 차이 계산
            const deltaTime = (time - previousTimeRef.current) / 1000;

            // 더미 데이터 업데이트
            setDummies(prevDummies => {
                if (prevDummies.length === 0) { setSimulationState('idle'); return []; }
                
                // 모든 더미가 완료되었는지 확인
                let allCompleted = true;
                // 각 더미에 대해 위치 업데이트
                const updatedDummies = prevDummies.map(dummy => {
                    // 이미 완료된 더미는 건너뜀
                    if (dummy.isCompleted) return dummy;
                    
                    allCompleted = false;
                    const newDistance = dummy.distanceTraveled + (dummy.speed * deltaTime);
                    const progress = dummy.totalDistance > 0 ? Math.min(newDistance / dummy.totalDistance, 1) : 1;
                    const newPosition = calculatePosition(dummy.route, progress);

                    return { ...dummy, position: newPosition, distanceTraveled: newDistance, isCompleted: progress >= 1 };
                });

                if (allCompleted) setSimulationState('idle');
                sendDummyDataToServer(updatedDummies);
                return updatedDummies;
            });
        }
        previousTimeRef.current = time;
        requestRef.current = requestAnimationFrame(animate);
    }, [sendDummyDataToServer]);

    // 시뮬레이션 상태가 변경될 때마다 애니메이션 실행 또는 중지
    useEffect(() => {
        if (simulationState === 'running') {
            previousTimeRef.current = performance.now();
            requestRef.current = requestAnimationFrame(animate);
        } else { cancelAnimationFrame(requestRef.current); }
        return () => cancelAnimationFrame(requestRef.current);
    }, [simulationState, animate]);

    // 경로가 생성되면 더미 데이터 초기화 및 상태 설정
    const handleRoutesGenerated = (newRoutes) => {
        setRoutes(newRoutes);
        const newDummies = newRoutes.map(route => ({
            id: route.id,
            route: route,
            speed: route.speed,
            totalDistance: route.totalDistance,
            position: route.waypoints[0],
            distanceTraveled: 0,
            isCompleted: false,
        }));
        setDummies(newDummies);
        setSimulationState('idle');
        setIsRouteGenerated(true);
    };

    // 시뮬레이션 제어 함수
    const handleSimulationControl = (action) => {
        switch(action) {
            case 'start': if (dummies.length > 0 && dummies.some(d => !d.isCompleted)) setSimulationState('running'); break;
            case 'pause': setSimulationState('paused'); break;
            case 'stop':
                setDummies(prev => prev.map(d => ({ ...d, position: d.route.waypoints[0], distanceTraveled: 0, isCompleted: false })));
                setSimulationState('idle');
                break;
            case 'reset': setRoutes([]); setDummies([]); setIsRouteGenerated(false); setSimulationState('idle'); break;
            default: break;
        }
    };

    const defaultBounds = useMemo(() => ({ northLat: 37.5200, southLat: 37.4800, eastLng: 127.0500, westLng: 126.9800 }), []);
    const bounds = isRouteGenerated && routes.length > 0 ? routes[0].bounds : defaultBounds;

    return (
        <div className="App">
            <header className="App-header"><h1>Dummy Path Movement Simulator</h1></header>
            <div className="main-container">
                <div className="left-panel">
                    <RouteGenerator onRoutesGenerated={handleRoutesGenerated} simulationState={simulationState} onControl={handleSimulationControl} isRouteGenerated={isRouteGenerated} defaultBounds={defaultBounds} />
                    <DummyTable dummies={dummies} simulationState={simulationState} />
                </div>
                <div className="right-panel">
                    <MapView routes={routes} dummies={dummies} currentBounds={bounds} isRouteGenerated={isRouteGenerated} />
                </div>
            </div>
        </div>
    );
}

export default App;
