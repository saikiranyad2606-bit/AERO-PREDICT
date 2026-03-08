/**
 * AMAN Data Models
 * Aviation-grade type definitions for aircraft state management
 */

export type AircraftStatus = 
  | 'APPROACHING'  // En-route to holding/approach
  | 'HOLDING'      // In delay absorption route
  | 'LANDING'      // Cleared for landing, on final approach
  | 'ROLLOUT'      // On runway, decelerating
  | 'LANDED';      // Cleared runway, ready for removal

export type RunwayId = '09L' | '09R';

export interface Waypoint {
  lat: number;
  lon: number;
  alt: number; // feet
}

export interface Aircraft {
  id: string;
  callsign: string;
  lat: number;
  lon: number;
  altitude: number;       // feet
  speed: number;          // knots
  heading: number;        // degrees (0-360)
  runway: RunwayId;
  status: AircraftStatus;
  route: Waypoint[];      // Planned route waypoints
  currentWaypointIndex: number;
  distanceToThreshold: number;  // nautical miles
  eta: number;            // seconds to threshold
  sequenceNumber: number; // Position in landing sequence (1 = next to land)
  atcInstruction: string; // Current ATC clearance/instruction
  hasConflict: boolean;
  safetyPercent: number;  // 0-100, separation quality
}

export interface RunwayState {
  id: RunwayId;
  occupied: boolean;
  occupyingAircraftId: string | null;
  lastClearedTime: number; // Unix timestamp
  clearanceLock: boolean;  // Prevents multiple simultaneous clearances
}

export interface ATCState {
  aircraft: Map<string, Aircraft>;
  runways: Map<RunwayId, RunwayState>;
  simulationTime: number;     // Unix timestamp (ms)
  tickRate: number;           // Hz
  separationMinimum: number;  // seconds between landings
}

// Request/Response types for API
export interface AddAircraftRequest {
  callsign: string;
  // Frontend is display-only; backend can spawn aircraft if lat/lon omitted.
  lat?: number;
  lon?: number;
  // Spawn helper: distance from airport (NM). If provided and lat/lon missing,
  // backend derives initial position from (distanceNm, heading).
  distanceNm?: number;
  altitude?: number;
  speed?: number;
  heading?: number;
  runway: RunwayId;
}

export interface AircraftStateResponse {
  id: string;
  callsign: string;
  lat: number;
  lon: number;
  altitude: number;
  speed: number;
  heading: number;
  runway: RunwayId;
  status: AircraftStatus;
  route: Waypoint[];
  eta: number;
  sequenceNumber: number;
  atcInstruction: string;
  hasConflict: boolean;
  safetyPercent: number;
}

export interface SimulationStateResponse {
  aircraft: AircraftStateResponse[];
  runways: {
    id: RunwayId;
    occupied: boolean;
    occupyingAircraftId: string | null;
  }[];
  simulationTime: number;
  tickCount: number;
}

// Helper methods for Aircraft
export function remainingDistanceNM(aircraft: Aircraft): number {
  if (aircraft.route.length === 0) return aircraft.distanceToThreshold;
  
  let totalDist = 0;
  const currentIdx = aircraft.currentWaypointIndex;
  
  // Distance from current position to next waypoint
  if (currentIdx < aircraft.route.length) {
    const nextWp = aircraft.route[currentIdx];
    totalDist += haversineDistance(
      aircraft.lat, aircraft.lon,
      nextWp.lat, nextWp.lon
    );
  }
  
  // Sum remaining waypoint distances
  for (let i = currentIdx; i < aircraft.route.length - 1; i++) {
    const wp1 = aircraft.route[i];
    const wp2 = aircraft.route[i + 1];
    totalDist += haversineDistance(wp1.lat, wp1.lon, wp2.lat, wp2.lon);
  }
  
  return totalDist;
}

export function updateETA(aircraft: Aircraft): number {
  const distNM = remainingDistanceNM(aircraft);
  if (aircraft.speed <= 0) return 0;
  // ETA in seconds = (distance NM / speed knots) * 3600
  return (distNM / aircraft.speed) * 3600;
}

// Haversine formula for distance calculation
export function haversineDistance(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const R = 3440.065; // Earth radius in nautical miles
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function calculateBearing(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const dLon = toRad(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(toRad(lat2));
  const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
            Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
  const bearing = (Math.atan2(y, x) * 180) / Math.PI;
  return (bearing + 360) % 360;
}
