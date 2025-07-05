import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import './App.css';

import RouteGenerator from './components/RouteGenerator';
import MapView from './components/MapView';
import DummyTable from './components/DummyTable';
import GrazeView from './components/GrazeView';
import { useThrottle } from './utils/useThrottle';
import { calculatePosition } from './utils/pathUtils';

function App() {
    // 생성된 모든 경로의 정의(경유지, 속도, 거리 등)를 담는 배열
    const [routes, setRoutes] = useState([]);
    // 각 더미의 실시간 상태(현재 위치, 이동 거리 등)를 담는 배열
    const [dummies, setDummies] = useState([]);
    // 시뮬레이션 상태: 'idle', 'running', 'paused'
    const [simulationState, setSimulationState] = useState('idle');
    // 경로 생성 여부: true 또는 false
    const [isRouteGenerated, setIsRouteGenerated] = useState(false);
    
    // 화면 모드: 'simulation' 또는 'graze'
    const [viewMode, setViewMode] = useState('simulation');
    // API로부터 받아온 스침 이벤트 데이터
    const [grazeEvents, setGrazeEvents] = useState([]);
    // 스침 이벤트 데이터 로딩 상태
    const [isLoadingGraze, setIsLoadingGraze] = useState(false);
    // 조회할 스침 이벤트 개수
    const [grazeLimit, setGrazeLimit] = useState(30);

    // 애니메이션 요청을 추적하기 위한 참조
    const requestRef = useRef();
    // 이전 프레임 시간을 추적하기 위한 참조
    const previousTimeRef = useRef();

    // 더미 데이터를 서버로 전송하는 함수 (최대 1초마다 한 번씩 호출)
    const sendDummyDataToServer = useThrottle((dummiesData) => {
      if (!dummiesData || dummiesData.length === 0) return;
      dummiesData.forEach(dummy => {
          if (dummy.isCompleted || !dummy.position) return;
          const payload = { id: dummy.userId, route_id: dummy.routeId, timestamp: new Date().toISOString(), position: { lng: dummy.position[0], lat: dummy.position[1] }, speed_mps: dummy.speed };
          fetch(`http://localhost:8080/api/dummy/${dummy.userId}/update`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).catch(err => console.error(`API 전송 실패 (ID: ${dummy.userId}):`, err));
      });
    }, 1000);

    // 매 프레임마다 호출되는 핵심 애니메이션 루프
    const animate = useCallback((time) => {
        if (previousTimeRef.current != null) {
            const deltaTime = (time - previousTimeRef.current) / 1000;
            setDummies(prevDummies => {
                if (prevDummies.length === 0) { setSimulationState('idle'); return []; }
                let allCompleted = true;
                const updatedDummies = prevDummies.map(dummy => {
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
        } else {
            cancelAnimationFrame(requestRef.current);
        }
        return () => cancelAnimationFrame(requestRef.current);
    }, [simulationState, animate]);

    // 경로가 생성되면 더미 데이터 초기화 및 상태 설정
    const handleRoutesGenerated = (newRoutes) => {
        setRoutes(newRoutes);
        setDummies(newRoutes.map(route => ({ userId: route.userId, routeId: route.routeId, speed: route.speed, totalDistance: route.totalDistance, position: route.waypoints[0], distanceTraveled: 0, isCompleted: false, route: route })));
        setSimulationState('idle');
        setIsRouteGenerated(true);
    };

    // 시뮬레이션 제어 함수
    const handleSimulationControl = (action) => {
        switch(action) {
            case 'start': if (dummies.length > 0 && dummies.some(d => !d.isCompleted)) setSimulationState('running'); break;
            case 'pause': setSimulationState('paused'); break;
            case 'stop': setDummies(prev => prev.map(d => ({ ...d, position: d.route.waypoints[0], distanceTraveled: 0, isCompleted: false }))); setSimulationState('idle'); break;
            case 'reset': setRoutes([]); setDummies([]); setIsRouteGenerated(false); setSimulationState('idle'); break;
            default: break;
        }
    };

    // 스침 이벤트를 가져오는 함수
    const fetchGrazeEvents = useCallback(async (limit) => {
        setIsLoadingGraze(true);
        try {
            const response = await fetch(`http://localhost:8080/api/graze-events/recent?limit=${limit}`);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const data = await response.json();
            const parsedData = data.map(event => ({
                ...event,
                grazeTime: new Date(event.grazeTime[0], event.grazeTime[1] - 1, event.grazeTime[2], event.grazeTime[3], event.grazeTime[4], event.grazeTime[5], event.grazeTime.length > 6 ? event.grazeTime[6] / 1000000 : 0)
            }));
            setGrazeEvents(parsedData);
            setGrazeLimit(limit); // 현재 limit 상태 업데이트
        } catch (error) {
            console.error("Failed to fetch graze events:", error);
            alert("스침 기록을 불러오는데 실패했습니다.");
        } finally {
            setIsLoadingGraze(false);
        }
    }, []); // 의존성 배열이 비어있으므로 함수는 한 번만 생성됩니다.

    // 헤더의 탭 버튼 클릭 시 화면을 전환하는 함수
    const handleViewChange = (mode) => {
        if (mode === 'graze' && viewMode !== 'graze') {
            setViewMode('graze');
            fetchGrazeEvents(grazeLimit); // 현재 설정된 limit으로 데이터 조회
        } else {
            setViewMode('simulation');
        }
    };

    const defaultBounds = useMemo(() => ({ northLat: 37.5200, southLat: 37.4800, eastLng: 127.0500, westLng: 126.9800 }), []);
    const bounds = isRouteGenerated && routes.length > 0 ? routes[0].bounds : defaultBounds;

    return (
        <div className="App">
            <header className="App-header">
                <nav className="header-nav">
                    <button onClick={() => handleViewChange('simulation')} className={viewMode === 'simulation' ? 'active' : ''}>
                        시뮬레이터
                    </button>
                    <button onClick={() => handleViewChange('graze')} className={viewMode === 'graze' ? 'active' : ''}>
                        스침 기록 확인
                    </button>
                </nav>
                <h1 className="header-title">Dummy Path Movement Simulator</h1>
            </header>
            
            {viewMode === 'simulation' ? (
                <div className="main-container">
                    <div className="left-panel">
                        <RouteGenerator 
                            onRoutesGenerated={handleRoutesGenerated} 
                            simulationState={simulationState} 
                            onControl={handleSimulationControl} 
                            isRouteGenerated={isRouteGenerated} 
                            defaultBounds={defaultBounds}
                        />
                        <DummyTable dummies={dummies} simulationState={simulationState} />
                    </div>
                    <div className="right-panel">
                        <MapView routes={routes} dummies={dummies} currentBounds={bounds} isRouteGenerated={isRouteGenerated} />
                    </div>
                </div>
            ) : (
                <div className="main-container">
                    <GrazeView 
                        grazeEvents={grazeEvents} 
                        isLoading={isLoadingGraze}
                        onFetch={fetchGrazeEvents}
                        currentLimit={grazeLimit}
                    />
                </div>
            )}
        </div>
    );
}

export default App;
