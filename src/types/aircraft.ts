export interface Aircraft {
  id: string;
  callsign: string;
  lat: number;
  lon: number;
  altitude: number;
  speed: number;
  heading: number;
  runway: '09L' | '09R';
  status: 'APPROACHING' | 'HOLDING' | 'LANDING' | 'ROLLOUT' | 'LANDED';
  role: 'landing' | 'holding';
  eta: number; // in seconds
  safetyPercent: number;
  distanceToThreshold: number; // nautical miles
  waypoints: [number, number, number][]; // [lat, lon, alt]
  atcNote?: string;
  hasConflict?: boolean;
  sequenceNumber?: number;
  predicted_delay?: number; // seconds, from backend
  queue_position?: number;
  runway_utilization?: number;
}

export interface AirportInfo {
  code: string;
  name: string;
  lat: number;
  lon: number;
  activeRunway: string;
  runways: Runway[];
}

export interface Runway {
  id: string;
  name: string;
  lat: number;
  lon: number;
  heading: number;
  length: number; // in pixels for display
  color: 'green' | 'amber';
}

export interface Alert {
  id: string;
  type: 'conflict' | 'warning' | 'info';
  message: string;
  aircraftIds?: string[];
}

export interface RouteResponse {
  routes: {
    id: string;
    role: 'landing' | 'holding';
    eta_minutes: number;
    safety_percent: number;
    waypoints: [number, number, number][];
  }[];
}
