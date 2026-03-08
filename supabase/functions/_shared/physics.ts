/**
 * AMAN Physics Engine (Async version)
 * 
 * ONLY handles aircraft movement:
 * - Position updates along routes
 * - Heading changes (smooth, max 3°/sec)
 * - Realistic speed profiles based on status
 * - State transitions (LANDING → ROLLOUT → LANDED)
 * 
 * NO sequencing logic here - that's in ai_logic.ts!
 */

import {
  Aircraft,
  Waypoint,
  haversineDistance,
  calculateBearing,
  remainingDistanceNM
} from './models.ts';
import {
  getAircraftList,
  updateAircraft,
  AIRPORT
} from './state.ts';
import { vacateRunway, SPEED_PROFILES, getTargetSpeed } from './ai_logic.ts';

// Physics constants
const MAX_TURN_RATE = 3;           // degrees per second
const ROLLOUT_DECEL = 8;           // knots per second deceleration
const SPEED_CHANGE_RATE = 5;       // knots per second acceleration/deceleration
const TICK_INTERVAL = 1;           // seconds per tick

/**
 * Main physics update - called every tick
 */
export async function runPhysics(deltaTimeSeconds: number = TICK_INTERVAL): Promise<void> {
  const aircraft = await getAircraftList();
  
  for (const ac of aircraft) {
    await updateAircraftPhysics(ac, deltaTimeSeconds);
  }
}

/**
 * Update single aircraft physics
 */
async function updateAircraftPhysics(aircraft: Aircraft, dt: number): Promise<void> {
  if (aircraft.status === 'LANDED') {
    return; // No physics for landed aircraft
  }
  
  // Handle based on status
  switch (aircraft.status) {
    case 'APPROACHING':
    case 'HOLDING':
    case 'LANDING':
      await updateFlightPhysics(aircraft, dt);
      break;
    case 'ROLLOUT':
      await updateRolloutPhysics(aircraft, dt);
      break;
  }
}

/**
 * Flight physics - follow waypoints with realistic speed profiles
 */
async function updateFlightPhysics(aircraft: Aircraft, dt: number): Promise<void> {
  // Calculate current distance to threshold
  const distance = remainingDistanceNM(aircraft);
  
  // Get target speed based on status
  const targetSpeed = getTargetSpeed(aircraft.status, distance);
  
  // Smooth speed change (accelerate/decelerate toward target)
  const currentSpeed = aircraft.speed;
  let newSpeed = currentSpeed;
  
  if (Math.abs(targetSpeed - currentSpeed) > 1) {
    const speedDelta = SPEED_CHANGE_RATE * dt;
    if (targetSpeed > currentSpeed) {
      newSpeed = Math.min(targetSpeed, currentSpeed + speedDelta);
    } else {
      newSpeed = Math.max(targetSpeed, currentSpeed - speedDelta);
    }
  } else {
    newSpeed = targetSpeed;
  }
  
  if (aircraft.route.length === 0) {
    // No route - fly toward airport (shouldn't happen in normal operation)
    const bearing = calculateBearing(
      aircraft.lat, aircraft.lon,
      AIRPORT.lat, AIRPORT.lon
    );
    const distanceTraveled = knotsToNMPerSecond(newSpeed) * dt;
    const newPos = projectPosition(aircraft.lat, aircraft.lon, bearing, distanceTraveled);
    
    await updateAircraft(aircraft.id, { 
      lat: newPos.lat, 
      lon: newPos.lon,
      speed: newSpeed,
      heading: smoothTurn(aircraft.heading, bearing, MAX_TURN_RATE * dt),
    });
    return;
  }
  
  // Get current target waypoint
  const wpIndex = aircraft.currentWaypointIndex;
  if (wpIndex >= aircraft.route.length) {
    // Completed route
    await handleRouteCompletion(aircraft);
    return;
  }
  
  const targetWp = aircraft.route[wpIndex];
  const distToWaypoint = haversineDistance(
    aircraft.lat, aircraft.lon,
    targetWp.lat, targetWp.lon
  );
  
  // Calculate desired heading to waypoint
  const desiredHeading = calculateBearing(
    aircraft.lat, aircraft.lon,
    targetWp.lat, targetWp.lon
  );
  
  // Smooth heading change (max 3° per second)
  const newHeading = smoothTurn(aircraft.heading, desiredHeading, MAX_TURN_RATE * dt);
  
  // Calculate movement
  const speedNMPerSec = knotsToNMPerSecond(newSpeed);
  const distanceTraveled = speedNMPerSec * dt;
  
  // Check if we'll reach the waypoint this tick
  if (distanceTraveled >= distToWaypoint) {
    // Move to waypoint and advance to next
    const newEta = calculateETA(targetWp.lat, targetWp.lon, newSpeed, aircraft);
    
    await updateAircraft(aircraft.id, {
      lat: targetWp.lat,
      lon: targetWp.lon,
      altitude: targetWp.alt,
      heading: newHeading,
      speed: newSpeed,
      currentWaypointIndex: wpIndex + 1,
      eta: newEta,
    });
    
    // Check if route is complete
    if (wpIndex + 1 >= aircraft.route.length) {
      await handleRouteCompletion(aircraft);
    }
  } else {
    // Move toward waypoint
    const newPos = projectPosition(aircraft.lat, aircraft.lon, newHeading, distanceTraveled);
    
    // Interpolate altitude
    const altProgress = distanceTraveled / distToWaypoint;
    const newAlt = aircraft.altitude + (targetWp.alt - aircraft.altitude) * altProgress;
    
    // Recalculate ETA based on new position and speed
    const newEta = calculateETA(newPos.lat, newPos.lon, newSpeed, aircraft);
    
    await updateAircraft(aircraft.id, {
      lat: newPos.lat,
      lon: newPos.lon,
      altitude: Math.max(0, newAlt),
      heading: newHeading,
      speed: newSpeed,
      eta: newEta,
    });
  }
}

/**
 * Calculate ETA to threshold based on current position and speed
 */
function calculateETA(lat: number, lon: number, speed: number, aircraft: Aircraft): number {
  if (speed <= 0) return 0;
  
  // Calculate remaining distance from new position
  const threshold = AIRPORT.runwayThresholds[aircraft.runway];
  
  let totalDist = haversineDistance(lat, lon, threshold.lat, threshold.lon);
  
  // If on route, sum remaining waypoint distances
  if (aircraft.route.length > 0 && aircraft.currentWaypointIndex < aircraft.route.length) {
    totalDist = 0;
    
    // Distance to current waypoint
    const currentWp = aircraft.route[aircraft.currentWaypointIndex];
    totalDist += haversineDistance(lat, lon, currentWp.lat, currentWp.lon);
    
    // Add remaining waypoints
    for (let i = aircraft.currentWaypointIndex; i < aircraft.route.length - 1; i++) {
      const wp1 = aircraft.route[i];
      const wp2 = aircraft.route[i + 1];
      totalDist += haversineDistance(wp1.lat, wp1.lon, wp2.lat, wp2.lon);
    }
  }
  
  // ETA in seconds = (distance NM / speed knots) * 3600
  return (totalDist / speed) * 3600;
}

/**
 * Rollout physics - decelerate on runway
 */
async function updateRolloutPhysics(aircraft: Aircraft, dt: number): Promise<void> {
  const threshold = AIRPORT.runwayThresholds[aircraft.runway];
  const runwayHeading = AIRPORT.runwayHeading;
  
  // Decelerate more aggressively
  const newSpeed = Math.max(0, aircraft.speed - ROLLOUT_DECEL * dt);
  
  // Move along runway axis
  const distanceTraveled = knotsToNMPerSecond(newSpeed) * dt;
  const newPos = projectPosition(aircraft.lat, aircraft.lon, runwayHeading, distanceTraveled);
  
  // Check if reached runway end or stopped
  const distFromThreshold = haversineDistance(
    threshold.lat, threshold.lon,
    newPos.lat, newPos.lon
  );
  
  // Runway length approximately 2NM
  const runwayLength = 2;
  
  if (distFromThreshold >= runwayLength || newSpeed <= 5) {
    // Aircraft has vacated runway
    await updateAircraft(aircraft.id, {
      lat: newPos.lat,
      lon: newPos.lon,
      speed: 0,
      altitude: 0,
      status: 'LANDED',
      eta: 0,
      atcInstruction: `${aircraft.callsign}, vacate via taxiway Alpha. Contact ground 121.9.`,
    });
    
    // Free up the runway - triggers re-sequencing
    await vacateRunway(aircraft.id, aircraft.runway);
  } else {
    await updateAircraft(aircraft.id, {
      lat: newPos.lat,
      lon: newPos.lon,
      speed: newSpeed,
      altitude: 0,
      heading: runwayHeading,
    });
  }
}

/**
 * Handle route completion
 */
async function handleRouteCompletion(aircraft: Aircraft): Promise<void> {
  if (aircraft.status === 'LANDING') {
    // Transition to rollout
    await updateAircraft(aircraft.id, {
      status: 'ROLLOUT',
      speed: SPEED_PROFILES.ROLLOUT.max, // 60 knots
      altitude: 0,
      atcInstruction: `${aircraft.callsign}, touchdown. Vacate when able.`,
    });
  } else if (aircraft.status === 'HOLDING') {
    // Holding route complete - return to approaching for re-sequencing
    await updateAircraft(aircraft.id, {
      status: 'APPROACHING',
      currentWaypointIndex: 0,
      route: [],
    });
  }
}

/**
 * Smooth turn function - limits turn rate
 */
function smoothTurn(currentHeading: number, targetHeading: number, maxChange: number): number {
  // Normalize headings to 0-360
  currentHeading = (currentHeading + 360) % 360;
  targetHeading = (targetHeading + 360) % 360;
  
  // Calculate shortest turn direction
  let delta = targetHeading - currentHeading;
  
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  
  // Limit turn rate
  if (Math.abs(delta) <= maxChange) {
    return targetHeading;
  }
  
  const sign = delta > 0 ? 1 : -1;
  return (currentHeading + sign * maxChange + 360) % 360;
}

/**
 * Project position given heading and distance
 */
function projectPosition(
  lat: number, lon: number, 
  headingDeg: number, distanceNM: number
): { lat: number; lon: number } {
  const R = 3440.065; // Earth radius in NM
  const headingRad = (headingDeg * Math.PI) / 180;
  const latRad = (lat * Math.PI) / 180;
  
  // Angular distance
  const angularDist = distanceNM / R;
  
  // New latitude
  const newLatRad = Math.asin(
    Math.sin(latRad) * Math.cos(angularDist) +
    Math.cos(latRad) * Math.sin(angularDist) * Math.cos(headingRad)
  );
  
  // New longitude
  const newLonRad = ((lon * Math.PI) / 180) + Math.atan2(
    Math.sin(headingRad) * Math.sin(angularDist) * Math.cos(latRad),
    Math.cos(angularDist) - Math.sin(latRad) * Math.sin(newLatRad)
  );
  
  return {
    lat: (newLatRad * 180) / Math.PI,
    lon: (newLonRad * 180) / Math.PI,
  };
}

/**
 * Convert knots to nautical miles per second
 */
function knotsToNMPerSecond(knots: number): number {
  return knots / 3600;
}
