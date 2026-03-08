import { useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import { motion } from 'framer-motion';
import { Aircraft } from '@/types/aircraft';
import { RadarRings } from './RadarRings';

const VOHS_CENTER: [number, number] = [17.2403, 78.4294];


// Create realistic plane icon - larger, more detailed airplane
const createAircraftIcon = (aircraft: Aircraft, isSelected: boolean, isHighlighted: boolean) => {
  const size = isSelected ? 52 : 44;
  const color = aircraft.runway === '09L' ? '#22c55e' : '#eab308';
  const glowColor = aircraft.hasConflict ? '#ef4444' : color;
  // Add blink class when highlighted
  const iconBlinkClass = isHighlighted ? 'aircraft-blink-active' : '';
  const labelBlinkClass = isHighlighted ? 'label-blink-active' : '';
  const conflictGlow = aircraft.hasConflict ? 'conflict-glow-active' : '';
  
  return L.divIcon({
    className: 'aircraft-div-icon',
    html: `
      <div style="
        transform: rotate(${aircraft.heading}deg);
        filter: drop-shadow(0 0 ${isSelected || isHighlighted ? '20px' : '8px'} ${glowColor});
      ">
        <div class="${isHighlighted ? 'aircraft-highlight-pulse' : ''} ${conflictGlow}" style="transform-origin: center;">
          <svg width="${size}" height="${size}" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
            <!-- Highlight ring when selected -->
            ${isHighlighted ? `<circle cx="24" cy="24" r="22" fill="none" stroke="${color}" stroke-width="3" opacity="0.6"/>` : ''}
            <!-- Main fuselage -->
            <path d="M24 4 L22 12 L18 14 L18 16 L22 15 L22 32 L14 38 L14 42 L22 38 L23 44 L24 46 L25 44 L26 38 L34 42 L34 38 L26 32 L26 15 L30 16 L30 14 L26 12 L24 4Z"
              fill="${color}"
              stroke="#1a1a1a"
              stroke-width="1.5"
              stroke-linejoin="round"
            />
            <!-- Cockpit window -->
            <ellipse cx="24" cy="10" rx="1.5" ry="3" fill="#000" opacity="0.5"/>
            <!-- Wing details -->
            <path d="M22 18 L8 24 L8 26 L22 23 Z" fill="${color}" stroke="#1a1a1a" stroke-width="0.8"/>
            <path d="M26 18 L40 24 L40 26 L26 23 Z" fill="${color}" stroke="#1a1a1a" stroke-width="0.8"/>
            <!-- Engine glow -->
            <ellipse cx="24" cy="44" rx="2" ry="3" fill="${color}" opacity="0.7"/>
            <ellipse cx="24" cy="45" rx="1" ry="2" fill="#fff" opacity="0.5"/>
          </svg>
        </div>
      </div>
      ${aircraft.callsign ? `
      <div style="
        position: absolute;
        left: 50%;
        top: ${size + 4}px;
        transform: translateX(-50%);
        white-space: nowrap;
        text-align: center;
      ">
        <div class="${isHighlighted ? 'label-highlight-pulse' : ''}" style="
          font-family: 'JetBrains Mono', monospace;
          font-size: 11px;
          font-weight: bold;
          color: ${color};
          background: ${isHighlighted ? color + '30' : 'rgba(0,0,0,0.9)'};
          padding: 3px 8px;
          border-radius: 3px;
          border: 2px solid ${color};
          box-shadow: ${isHighlighted ? `0 0 15px ${color}` : 'none'};
        ">${aircraft.callsign}</div>
      </div>
      ` : ''}
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
};

// Runway component - broad runway lines at VOHS with labels
function RunwayMarkers() {
  // Runway 09L - northern runway (green)
  const runway09L: [number, number][] = [
    [17.250, 78.38],
    [17.250, 78.48],
  ];
  
  // Runway 09R - southern runway (yellow)
  const runway09R: [number, number][] = [
    [17.230, 78.38],
    [17.230, 78.48],
  ];

  // Create runway label icons
  const runway09LLabel = L.divIcon({
    className: 'runway-label',
    html: `<div style="
      font-family: 'JetBrains Mono', monospace;
      font-size: 14px;
      font-weight: bold;
      color: #22c55e;
      background: rgba(0,0,0,0.8);
      padding: 4px 10px;
      border-radius: 4px;
      border: 2px solid #22c55e;
      white-space: nowrap;
    ">09L</div>`,
    iconSize: [60, 30],
    iconAnchor: [30, 15],
  });

  const runway09RLabel = L.divIcon({
    className: 'runway-label',
    html: `<div style="
      font-family: 'JetBrains Mono', monospace;
      font-size: 14px;
      font-weight: bold;
      color: #eab308;
      background: rgba(0,0,0,0.8);
      padding: 4px 10px;
      border-radius: 4px;
      border: 2px solid #eab308;
      white-space: nowrap;
    ">09R</div>`,
    iconSize: [60, 30],
    iconAnchor: [30, 15],
  });

  return (
    <>
      <Polyline
        positions={runway09L}
        pathOptions={{
          color: '#22c55e',
          weight: 14,
          opacity: 0.95,
        }}
      />
      <Marker position={[17.250, 78.36]} icon={runway09LLabel} />
      <Polyline
        positions={runway09R}
        pathOptions={{
          color: '#eab308',
          weight: 14,
          opacity: 0.95,
        }}
      />
      <Marker position={[17.230, 78.36]} icon={runway09RLabel} />
    </>
  );
}

// Flight path visualization - dashed lines showing only path AHEAD (from current position to runway)
function FlightPaths({ aircraft }: { aircraft: Aircraft[] }) {
  return (
    <>
      {aircraft.map((ac) => {
        if (ac.status === 'LANDED') return null;
        if (!ac.waypoints || ac.waypoints.length < 1) return null;
        
        // Backend already sends only remaining waypoints (future path)
        const positions: [number, number][] = [];
        
        // Start with current aircraft position
        positions.push([ac.lat, ac.lon]);
        
        // Add all waypoints (already trimmed by backend)
        for (const wp of ac.waypoints) {
          positions.push([wp[0], wp[1]]);
        }
        
        if (positions.length < 2) return null;
        
        const color = ac.runway === '09L' ? '#22c55e' : '#eab308';
        
        return (
          <Polyline
            key={`path-${ac.id}`}
            positions={positions}
            pathOptions={{
              color,
              weight: 3,
              opacity: 0.7,
              dashArray: '12, 8',
            }}
          />
        );
      })}
    </>
  );
}

// Map bounds control
function MapController() {
  const map = useMap();
  
  useMemo(() => {
    map.setView(VOHS_CENTER, 10);
  }, [map]);
  
  return null;
}

interface MapViewProps {
  aircraft: Aircraft[];
  selectedAircraftId?: string;
  highlightedAircraftId?: string;
  showDetailsPopup?: boolean;
  onSelectAircraft: (id: string) => void;
  onClosePopup?: () => void;
}

export function MapView({ 
  aircraft, 
  selectedAircraftId, 
  highlightedAircraftId, 
  showDetailsPopup,
  onSelectAircraft,
  onClosePopup 
}: MapViewProps) {
  const selectedAircraft = aircraft.find(ac => ac.id === selectedAircraftId);

  const handleAircraftClick = (id: string) => {
    onSelectAircraft(id);
  };

  const handleClosePopup = () => {
    onClosePopup?.();
  };

  return (
    <div className="relative w-full h-full radar-container">
      {/* Radar overlay */}
      <div className="absolute inset-0 z-10 pointer-events-none">
        <RadarRings
          centerX={window.innerWidth * 0.35}
          centerY={window.innerHeight * 0.5}
          maxRadius={Math.min(window.innerWidth * 0.3, window.innerHeight * 0.45)}
        />
      </div>
      
      {/* VOHS label */}
      <motion.div
        className="absolute z-20 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
      >
        <div className="flex flex-col items-center">
          <div className="w-10 h-10 rounded-full border-2 border-primary flex items-center justify-center bg-background/60 backdrop-blur-sm">
            <div className="w-4 h-4 rounded-full bg-primary animate-pulse" />
          </div>
          <span className="mt-2 font-mono text-base font-bold text-primary">VOHS</span>
        </div>
      </motion.div>

      {/* Legend */}
      <motion.div
        className="absolute z-20 bottom-6 left-6 pointer-events-none"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
      >
        <div className="bg-background/80 backdrop-blur-sm rounded-lg p-3 border border-border/50">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-3 h-3 rounded-full bg-[#22c55e]"></div>
            <span className="text-xs font-mono text-foreground">09L Route</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-[#eab308]"></div>
            <span className="text-xs font-mono text-foreground">09R Route</span>
          </div>
        </div>
      </motion.div>


      {/* Leaflet map */}
      <MapContainer
        center={VOHS_CENTER}
        zoom={10}
        className="w-full h-full z-0"
        zoomControl={false}
        attributionControl={false}
        style={{ background: 'transparent' }}
      >
        <MapController />
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          className="opacity-30"
        />
        
        <RunwayMarkers />
        <FlightPaths aircraft={aircraft} />
        
        {/* Aircraft markers - hide landed aircraft */}
        {aircraft
          .filter(ac => ac.status !== 'LANDED')
          .map((ac) => (
            <Marker
              key={ac.id}
              position={[ac.lat, ac.lon]}
              icon={createAircraftIcon(ac, ac.id === selectedAircraftId, ac.id === highlightedAircraftId)}
              eventHandlers={{
                click: () => handleAircraftClick(ac.id),
              }}
            />
          ))}
      </MapContainer>
    </div>
  );
}
