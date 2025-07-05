import React, { useState, useMemo, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';

// 스침 이벤트 마커 아이콘 생성
const GrazeIcon = () => {
    const iconHtml = `<div style="
        background-color: #ff5252;
        border-radius: 50%;
        width: 16px;
        height: 16px;
        border: 3px solid white;
        box-shadow: 0 0 0 rgba(255, 82, 82, 0.4);
        animation: pulse 2s infinite;
    "></div>`;

    return L.divIcon({
        className: 'graze-marker-icon-container',
        html: iconHtml,
        iconSize: [16, 16],
        iconAnchor: [8, 8]
    });
};

const GrazeView = ({ grazeEvents, isLoading, onFetch, currentLimit }) => {
    const grazeIcon = useMemo(() => GrazeIcon(), []);
    const mapRef = useRef();
    // 사용자가 입력하는 limit 값을 관리하기 위한 로컬 상태
    const [limitInput, setLimitInput] = useState(currentLimit);

    // 부모 컴포넌트에서 limit 값이 변경되면 입력 필드도 동기화
    useEffect(() => {
        setLimitInput(currentLimit);
    }, [currentLimit]);

    // grazeEvents 데이터가 변경될 때마다 지도 뷰를 조정
    useEffect(() => {
        if (grazeEvents && grazeEvents.length > 0 && mapRef.current) {
            const bounds = L.latLngBounds(grazeEvents.map(event => [event.latitude, event.longitude]));
            mapRef.current.fitBounds(bounds, { padding: [50, 50] });
        }
    }, [grazeEvents]);
    
    // Pulse 애니메이션 스타일 동적 주입
    useEffect(() => {
        const styleId = 'graze-marker-pulse-animation';
        if (!document.getElementById(styleId)) {
            const style = document.createElement('style');
            style.id = styleId;
            style.innerHTML = `
                @keyframes pulse {
                    0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(255, 82, 82, 0.7); }
                    70% { transform: scale(1); box-shadow: 0 0 0 12px rgba(255, 82, 82, 0); }
                    100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(255, 82, 82, 0); }
                }`;
            document.head.appendChild(style);
        }
    }, []);

    const handleFetch = () => {
        onFetch(limitInput);
    };

    return (
        <div className="graze-view-container">
            <div className="graze-map-header">
                <div className="header-title-section">
                    <h2>최근 스침 기록</h2>
                    <p>최근 {grazeEvents.length}개의 이벤트가 표시됩니다.</p>
                </div>
                <div className="header-controls">
                    <input
                        type="number"
                        value={limitInput}
                        onChange={(e) => setLimitInput(Math.max(1, Math.min(100, Number(e.target.value))))}
                        min="1"
                        max="100"
                        disabled={isLoading}
                    />
                    <button className="btn btn-primary" onClick={handleFetch} disabled={isLoading}>
                        {isLoading ? '조회중...' : '조회'}
                    </button>
                </div>
            </div>
            <MapContainer ref={mapRef} center={[37.50, 127.03]} zoom={13} style={{ height: '100%', width: '100%' }}>
                <TileLayer
                    url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                />
                {grazeEvents.map((event, index) => (
                    <Marker key={`${event.user1Id}-${event.user2Id}-${index}`} position={[event.latitude, event.longitude]} icon={grazeIcon}>
                        <Popup>
                            <b>스침 이벤트</b><br/>
                            시간: {event.grazeTime.toLocaleString('ko-KR')}<br/>
                            User1: {event.user1Id.substring(0, 13)}...<br/>
                            User2: {event.user2Id.substring(0, 13)}...
                        </Popup>
                    </Marker>
                ))}
            </MapContainer>
        </div>
    );
};

export default GrazeView;
