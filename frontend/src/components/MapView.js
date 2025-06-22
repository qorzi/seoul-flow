import React, { useEffect, useRef, useMemo } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, Popup, Rectangle } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { calculatePosition } from '../utils/pathUtils'; // 유틸리티 함수 import

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const getPathPoints = (route) => {
    const points = [];
    const numPoints = 100; // 경로를 그릴 때 사용할 점의 개수
    for (let i = 0; i <= numPoints; i++) {
        const progress = i / numPoints;
        const position = calculatePosition(route, progress);
        if (position) points.push(position);
    }
    return points;
};

const toLatLng = (coord) => {
    if (!coord || !Array.isArray(coord) || coord.length < 2) return null;
    return [coord[1], coord[0]];
};

const MapView = ({ routes, dummies, currentBounds, isRouteGenerated }) => {
    const mapRef = useRef();

    useEffect(() => {
        if (!mapRef.current) return;
        let boundsToFit;

        if (isRouteGenerated && routes.length > 0) {
            const newBounds = L.latLngBounds();
            routes.forEach(route => {
                const points = getPathPoints(route);
                points.forEach(p => {
                    const latLng = toLatLng(p);
                    if (latLng) newBounds.extend(latLng);
                });
            });
            boundsToFit = newBounds;
        } 
        else if (currentBounds) {
            const southWest = toLatLng([currentBounds.westLng, currentBounds.southLat]);
            const northEast = toLatLng([currentBounds.eastLng, currentBounds.northLat]);
            if (southWest && northEast) boundsToFit = L.latLngBounds(southWest, northEast);
        }

        if (boundsToFit && boundsToFit.isValid()) {
            mapRef.current.fitBounds(boundsToFit, { padding: [50, 50] });
        }
    }, [routes, isRouteGenerated, currentBounds]);

    const routeColors = useMemo(() => ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9'], []);
    const createDummyIcon = useMemo(() => (color) => L.divIcon({ className: 'custom-dummy-marker', html: `<div style="width:12px; height:12px; background-color:${color}; border:2px solid white; border-radius:50%; box-shadow:0 2px 4px rgba(0,0,0,0.3);"></div>`, iconSize: [12, 12], iconAnchor: [6, 6] }), []);
    const startIcon = useMemo(() => L.divIcon({ className: 'start-marker', html: `<div style="width:16px;height:16px;background-color:#28a745;border:2px solid white;border-radius:50%;box-shadow:0 2px 4px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;color:white;font-size:10px;font-weight:bold;">S</div>`, iconSize: [16, 16], iconAnchor: [8, 8] }), []);
    const endIcon = useMemo(() => L.divIcon({ className: 'end-marker', html: `<div style="width:16px;height:16px;background-color:#dc3545;border:2px solid white;border-radius:50%;box-shadow:0 2px 4px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;color:white;font-size:10px;font-weight:bold;">E</div>`, iconSize: [16, 16], iconAnchor: [8, 8] }), []);

    const rectangleBounds = currentBounds ? [[currentBounds.southLat, currentBounds.westLng], [currentBounds.northLat, currentBounds.eastLng]] : null;

    return (
        <MapContainer ref={mapRef} center={[37.50, 127.03]} zoom={13} style={{ height: '100%', width: '100%' }}>
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' />
            {rectangleBounds && <Rectangle bounds={rectangleBounds} pathOptions={{ fillColor: 'rgba(0,123,255,0.1)', color: '#007bff', weight: 3, fillOpacity: 0.1, dashArray: '10,5' }} />}

            {routes.map((route, index) => {
                 const pathPoints = getPathPoints(route).map(toLatLng).filter(p => p);
                 const startPos = toLatLng(route.waypoints[0]);
                 const endPos = toLatLng(route.waypoints[route.waypoints.length - 1]);
                 return (
                    <React.Fragment key={route.id}>
                        <Polyline positions={pathPoints} color={routeColors[index % routeColors.length]} weight={4} opacity={0.7} />
                        {startPos && <Marker position={startPos} icon={startIcon} />}
                        {endPos && <Marker position={endPos} icon={endIcon} />}
                    </React.Fragment>
                 )
            })}

            {dummies.map((dummy, index) => {
                const dummyPos = toLatLng(dummy.position);
                return !dummy.isCompleted && dummyPos && (
                    <Marker key={dummy.id} position={dummyPos} icon={createDummyIcon(routeColors[index % routeColors.length])}>
                        <Popup><b>{`더미 ${index + 1}`}</b></Popup>
                    </Marker>
                )
            })}
        </MapContainer>
    );
};

export default MapView;
