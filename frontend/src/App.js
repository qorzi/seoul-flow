import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import './App.css';

import RouteGenerator from './components/RouteGenerator';
import MapView from './components/MapView';
import DummyTable from './components/DummyTable';
import { useThrottle } from './utils/useThrottle';

//--- 위치 계산 함수 (turf.js 비의존) ---
const lerp = (a, b, t) => a + (b - a) * t;

const calculatePosition = (route, progress) => {
    const { startPoint, endPoint, type } = route;
    if (progress >= 1) return endPoint;
    if (progress <= 0) return startPoint;

    const [lon1, lat1] = startPoint;
    const [lon2, lat2] = endPoint;

    // 직선 이동 (Linear Interpolation)
    const currentLon = lerp(lon1, lon2, progress);
    const currentLat = lerp(lat1, lat2, progress);

    switch (type) {
        case 'arc': {
            // 포물선 형태의 호(arc)를 만들기 위해 위도에 offset 추가
            const arcHeight = (lon2 - lon1) * 0.2; // 호의 높이
            const latOffset = arcHeight * Math.sin(Math.PI * progress);
            return [currentLon, currentLat + latOffset];
        }
        case 'zigzag': {
            // 사인파를 이용해 좌우로 흔들리는 지그재그 구현
            const numZigzags = 5;
            const perpendicularAngle = Math.atan2(lat2 - lat1, lon2 - lon1) + Math.PI / 2;
            const zigzagMagnitude = Math.sqrt(Math.pow(lon2-lon1, 2) + Math.pow(lat2-lat1, 2)) * 0.05;
            const offset = Math.sin(progress * Math.PI * (2 * numZigzags)) * zigzagMagnitude;
            
            const lonOffset = Math.cos(perpendicularAngle) * offset;
            const latOffset = Math.sin(perpendicularAngle) * offset;
            
            return [currentLon + lonOffset, currentLat + latOffset];
        }
        case 'linear':
        default: {
             return [currentLon, currentLat];
        }
    }
};

function App() {
    const [routes, setRoutes] = useState([]);
    const [dummies, setDummies] = useState([]);
    const [simulationState, setSimulationState] = useState('idle');
    const [isRouteGenerated, setIsRouteGenerated] = useState(false);

    const requestRef = useRef();
    const previousTimeRef = useRef();

    const sendDummyDataToServer = useThrottle((dummiesData) => {
        if (!dummiesData || dummiesData.length === 0) return;
        dummiesData.forEach(dummy => {
            if (dummy.isCompleted || !dummy.position) return;
            const payload = { id: dummy.id, position: dummy.position, speed_mps: dummy.speed };
            console.log(`[API Call] Sending data for Dummy ID: ${dummy.id}`, payload);
        });
    }, 2000);

    const animate = useCallback((time) => {
        if (previousTimeRef.current != null) {
            const deltaTime = (time - previousTimeRef.current) / 1000;

            setDummies(prevDummies => {
                if (prevDummies.length === 0) {
                    setSimulationState('idle');
                    return [];
                }
                
                let allCompleted = true;
                const updatedDummies = prevDummies.map(dummy => {
                    if (dummy.isCompleted) return dummy;
                    
                    allCompleted = false;
                    const newDistance = dummy.distanceTraveled + (dummy.speed * deltaTime);
                    const progress = dummy.totalDistance > 0 ? Math.min(newDistance / dummy.totalDistance, 1) : 1;
                    
                    const newPosition = calculatePosition(dummy.route, progress);

                    return {
                        ...dummy,
                        position: newPosition,
                        distanceTraveled: newDistance,
                        isCompleted: progress >= 1,
                    };
                });

                if (allCompleted) setSimulationState('idle');
                sendDummyDataToServer(updatedDummies);
                return updatedDummies;
            });
        }
        previousTimeRef.current = time;
        requestRef.current = requestAnimationFrame(animate);
    }, [sendDummyDataToServer]);

    useEffect(() => {
        if (simulationState === 'running') {
            previousTimeRef.current = performance.now();
            requestRef.current = requestAnimationFrame(animate);
        } else {
            cancelAnimationFrame(requestRef.current);
        }
        return () => cancelAnimationFrame(requestRef.current);
    }, [simulationState, animate]);

    const handleRoutesGenerated = (newRoutes) => {
        setRoutes(newRoutes);
        const newDummies = newRoutes.map(route => ({
            id: route.id,
            route: route,
            speed: route.speed,
            totalDistance: route.totalDistance,
            position: route.startPoint,
            distanceTraveled: 0,
            isCompleted: false,
        }));
        setDummies(newDummies);
        setSimulationState('idle');
        setIsRouteGenerated(true);
    };

    const handleSimulationControl = (action) => {
        switch(action) {
            case 'start':
                if (dummies.length > 0 && dummies.some(d => !d.isCompleted)) setSimulationState('running');
                break;
            case 'pause':
                setSimulationState('paused');
                break;
            case 'stop':
                setDummies(prev => prev.map(d => ({ ...d, position: d.route.startPoint, distanceTraveled: 0, isCompleted: false })));
                setSimulationState('idle');
                break;
            case 'reset':
                setRoutes([]); setDummies([]); setIsRouteGenerated(false); setSimulationState('idle');
                break;
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
