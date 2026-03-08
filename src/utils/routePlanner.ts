/**
 * Route Planning Utilities
 * 
 * NOTE: Route planning is now primarily handled by the backend AMAN system.
 * These utilities are kept for legacy/fallback purposes only.
 */

import { Aircraft } from '@/types/aircraft';
import {
  haversineDistance,
  calculateETA,
  generateApproachPath,
  checkConflict,
  calculateSafetyPercent,
} from './geo';

const VOHS_LAT = 17.2403;
const VOHS_LON = 78.4294;

export interface PlanningInput {
  id: string;
  callsign: string;
  lat: number;
  lon: number;
  altitude: number;
  speed: number;
  heading: number;
  runway: '09L' | '09R';
}

export function planRoutes(aircraft: PlanningInput[]): Partial<Aircraft>[] {
  if (aircraft.length === 0) return [];
  
  // Calculate distance to airport for each aircraft
  const withDistance = aircraft.map((a) => ({
    ...a,
    distance: haversineDistance(a.lat, a.lon, VOHS_LAT, VOHS_LON),
  }));
  
  // Sort by distance - nearest first
  withDistance.sort((a, b) => a.distance - b.distance);
  
  const plannedAircraft: Partial<Aircraft>[] = [];
  
  // ALL aircraft get landing route - straight line to their assigned runway
  for (let i = 0; i < withDistance.length; i++) {
    const ac = withDistance[i];
    
    const eta = calculateETA(ac.distance, ac.speed);
    
    // Get runway position based on runway assignment - match MapView runway positions
    const runwayLat = ac.runway === '09L' ? 17.250 : 17.230;
    const runwayLon = 78.43; // Center of runway
    const runwayHeading = 90; // East-facing runway
    
    // ALL aircraft get straight landing path to their assigned runway
    const waypoints = generateApproachPath(
      ac.lat,
      ac.lon,
      ac.altitude,
      runwayLat,
      runwayLon,
      runwayHeading
    );
    const role: 'landing' | 'holding' = 'landing';
    const status: Aircraft['status'] = 'APPROACHING';
    
    // Calculate safety percent relative to other aircraft
    const otherAircraft = withDistance
      .filter((other) => other.id !== ac.id)
      .map((other) => ({
        lat: other.lat,
        lon: other.lon,
        altitude: other.altitude,
      }));
    
    const safetyPercent = calculateSafetyPercent(
      { lat: ac.lat, lon: ac.lon, altitude: ac.altitude },
      otherAircraft
    );
    
    // Check for conflicts
    let hasConflict = false;
    for (const other of otherAircraft) {
      if (checkConflict({ lat: ac.lat, lon: ac.lon, altitude: ac.altitude }, other)) {
        hasConflict = true;
        break;
      }
    }
    
    // Generate ATC note
    let atcNote = `Cleared ILS approach RWY ${ac.runway}, descend to 3000ft`;
    if (hasConflict) {
      atcNote += ' - TRAFFIC ALERT';
    }
    
    plannedAircraft.push({
      id: ac.id,
      callsign: ac.callsign,
      lat: ac.lat,
      lon: ac.lon,
      altitude: ac.altitude,
      speed: ac.speed,
      heading: ac.heading,
      runway: ac.runway,
      status,
      role,
      eta,
      safetyPercent,
      distanceToThreshold: ac.distance,
      waypoints,
      atcNote,
      hasConflict,
      sequenceNumber: i + 1,
    });
  }
  
  return plannedAircraft;
}

// Optimize routes to reduce conflicts
export function optimizeRoutes(aircraft: Partial<Aircraft>[]): Partial<Aircraft>[] {
  const optimized = [...aircraft];
  
  // Find conflicts and adjust holding altitudes
  for (let i = 0; i < optimized.length; i++) {
    for (let j = i + 1; j < optimized.length; j++) {
      const ac1 = optimized[i];
      const ac2 = optimized[j];
      
      if (
        ac1.lat !== undefined &&
        ac1.lon !== undefined &&
        ac1.altitude !== undefined &&
        ac2.lat !== undefined &&
        ac2.lon !== undefined &&
        ac2.altitude !== undefined
      ) {
        if (
          checkConflict(
            { lat: ac1.lat, lon: ac1.lon, altitude: ac1.altitude },
            { lat: ac2.lat, lon: ac2.lon, altitude: ac2.altitude }
          )
        ) {
          // Adjust altitude of holding aircraft
          if (ac2.role === 'holding' && ac2.altitude !== undefined) {
            ac2.altitude += 1000;
            ac2.hasConflict = false;
            ac2.atcNote = `Climb to ${ac2.altitude}ft - traffic avoidance`;
            
            // Recalculate safety
            const others = optimized
              .filter((a) => a.id !== ac2.id)
              .map((a) => ({
                lat: a.lat!,
                lon: a.lon!,
                altitude: a.altitude!,
              }));
            ac2.safetyPercent = calculateSafetyPercent(
              { lat: ac2.lat, lon: ac2.lon, altitude: ac2.altitude },
              others
            );
          }
        }
      }
    }
  }
  
  return optimized;
}
