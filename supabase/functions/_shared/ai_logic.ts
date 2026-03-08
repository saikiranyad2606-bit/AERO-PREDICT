/**
 * AMAN AI Logic - The Brain (Async version)
 * 
 * This is the CORE AMAN decision engine.
 * 
 * KEY RULES:
 * 1. 20 NM Optimization Zone - Only aircraft inside 20 NM are sequenced
 * 2. Distance-based priority - NOT FIFO, closest aircraft lands first
 * 3. One landing at a time per runway
 * 4. Holding patterns for all other aircraft inside 20 NM
 */

import { 
  Aircraft, 
  RunwayId, 
  Waypoint,
  haversineDistance,
  remainingDistanceNM,
  updateETA
} from './models.ts';
import {
  getAircraftList,
  getRunwayState,
  updateAircraft,
  setRunwayOccupied,
  setRunwayClearanceLock,
  AIRPORT
} from './state.ts';

// AMAN Constants
const OPTIMIZATION_ZONE_NM = 20;   // Aircraft inside this zone are sequenced
const MIN_SEPARATION_NM = 3;       // Minimum horizontal separation
const MIN_SEPARATION_TIME = 90;    // Seconds between landings on same runway

// Speed profiles (knots) - used by physics engine
export const SPEED_PROFILES = {
  APPROACHING: { min: 220, max: 250 },  // Outside 20 NM
  HOLDING: { min: 170, max: 190 },      // Inside 20 NM, waiting
  LANDING: { min: 130, max: 150 },      // Final approach
  ROLLOUT: { min: 0, max: 60 },         // On runway
};

/**
 * Get appropriate speed for aircraft status
 */
export function getTargetSpeed(status: string, distanceToThreshold: number): number {
  switch (status) {
    case 'LANDING':
      return SPEED_PROFILES.LANDING.max; // 150 knots on final
    case 'ROLLOUT':
      return SPEED_PROFILES.ROLLOUT.max;
    case 'HOLDING':
      return SPEED_PROFILES.HOLDING.max; // 190 knots in holding
    case 'APPROACHING':
    default:
      // Slow down as we get closer
      if (distanceToThreshold < 25) {
        return SPEED_PROFILES.APPROACHING.min; // 220 knots
      }
      return SPEED_PROFILES.APPROACHING.max; // 250 knots
  }
}

/**
 * Main AMAN sequencing function - called every tick
 * Implements proper 20 NM optimization zone with distance-based priority
 */
export async function runSequencing(): Promise<void> {
  const aircraft = await getAircraftList();
  if (aircraft.length === 0) return;
  
  // Group by runway
  const byRunway = new Map<RunwayId, Aircraft[]>();
  byRunway.set('09L', []);
  byRunway.set('09R', []);
  
  for (const ac of aircraft) {
    if (ac.status !== 'LANDED') {
      byRunway.get(ac.runway)?.push(ac);
    }
  }
  
  // Process each runway independently
  for (const [runwayId, runwayAircraft] of byRunway) {
    await processRunwaySequence(runwayId, runwayAircraft);
  }
  
  // Check for conflicts between all aircraft
  await detectConflicts(aircraft);
}

/**
 * Process sequencing for a single runway
 * CRITICAL: Implements 20 NM optimization zone with distance-based priority
 */
async function processRunwaySequence(runwayId: RunwayId, aircraft: Aircraft[]): Promise<void> {
  if (aircraft.length === 0) return;
  
  const runwayState = await getRunwayState(runwayId);
  if (!runwayState) return;
  
  // Calculate distance for each aircraft and update ETA
  const aircraftWithDistance: Array<{ aircraft: Aircraft; distance: number }> = [];
  
  for (const ac of aircraft) {
    const distance = remainingDistanceNM(ac);
    const targetSpeed = getTargetSpeed(ac.status, distance);
    const eta = (distance / targetSpeed) * 3600; // seconds
    
    await updateAircraft(ac.id, { 
      distanceToThreshold: distance,
      eta,
      speed: targetSpeed, // Update speed based on status
    });
    
    aircraftWithDistance.push({ aircraft: ac, distance });
  }
  
  // Sort ALL aircraft by remaining distance (closest first) - NOT FIFO!
  aircraftWithDistance.sort((a, b) => a.distance - b.distance);
  
  // Assign sequence numbers based on distance (for display purposes)
  for (let i = 0; i < aircraftWithDistance.length; i++) {
    await updateAircraft(aircraftWithDistance[i].aircraft.id, { 
      sequenceNumber: i + 1 
    });
  }
  
  // Separate aircraft by zone
  const insideZone = aircraftWithDistance.filter(a => a.distance <= OPTIMIZATION_ZONE_NM);
  const outsideZone = aircraftWithDistance.filter(a => a.distance > OPTIMIZATION_ZONE_NM);
  
  // Check if runway is occupied (LANDING or ROLLOUT in progress)
  const hasActiveLanding = aircraft.some(ac => 
    ac.status === 'LANDING' || ac.status === 'ROLLOUT'
  );
  
  // Process aircraft OUTSIDE 20 NM zone - normal approach, no holding
  for (const { aircraft: ac, distance } of outsideZone) {
    if (ac.status === 'HOLDING') {
      // Aircraft moved outside zone - return to approach
      await updateAircraft(ac.id, {
        status: 'APPROACHING',
        route: [],
        currentWaypointIndex: 0,
        atcInstruction: `${ac.callsign}, continue approach. Descend to FL100.`,
      });
    } else if (ac.status === 'APPROACHING') {
      // Normal approach - no action needed
      await updateAircraft(ac.id, {
        atcInstruction: `${ac.callsign}, radar contact. Continue approach runway ${runwayId}.`,
      });
    }
  }
  
  // Process aircraft INSIDE 20 NM zone - optimization logic
  for (let i = 0; i < insideZone.length; i++) {
    const { aircraft: ac, distance } = insideZone[i];
    const isNearest = i === 0;
    
    // Skip aircraft already committed to landing
    if (ac.status === 'LANDING' || ac.status === 'ROLLOUT' || ac.status === 'LANDED') {
      continue;
    }
    
    if (isNearest && !hasActiveLanding && !runwayState.clearance_lock) {
      // NEAREST aircraft inside 20 NM - clear for landing!
      await clearForLanding(ac, runwayId, distance);
    } else {
      // ALL OTHER aircraft inside 20 NM - must hold
      if (ac.status !== 'HOLDING') {
        await assignHolding(ac, i, insideZone.length, distance);
      } else {
        // Update holding instruction with current position in queue
        await updateAircraft(ac.id, {
          atcInstruction: `${ac.callsign}, #${i + 1} in sequence. Hold present position. Expect ${Math.ceil((i * MIN_SEPARATION_TIME) / 60)} min delay.`,
        });
      }
    }
  }
}

/**
 * Clear aircraft for landing
 */
async function clearForLanding(aircraft: Aircraft, runwayId: RunwayId, distance: number): Promise<void> {
  // Lock runway to prevent double clearance
  await setRunwayClearanceLock(runwayId, true);
  
  // Generate direct approach route to threshold
  const threshold = AIRPORT.runwayThresholds[runwayId];
  const finalRoute = generateFinalApproachRoute(
    aircraft.lat, aircraft.lon, aircraft.altitude,
    threshold.lat, threshold.lon
  );
  
  await updateAircraft(aircraft.id, {
    status: 'LANDING',
    route: finalRoute,
    currentWaypointIndex: 0,
    speed: SPEED_PROFILES.LANDING.max, // 150 knots
    atcInstruction: `${aircraft.callsign}, runway ${runwayId} cleared to land. Wind calm.`,
    hasConflict: false,
  });
  
  // Mark runway as occupied
  await setRunwayOccupied(runwayId, true, aircraft.id);
}

/**
 * Assign holding with delay absorption route
 * 
 * Uses elongated paths that absorb delay through track miles
 * NO circular holding patterns!
 */
async function assignHolding(
  aircraft: Aircraft, 
  sequencePosition: number, 
  totalInSequence: number,
  currentDistance: number
): Promise<void> {
  // Calculate required delay based on sequence position
  const baseDelay = MIN_SEPARATION_TIME; // seconds between each aircraft
  const requiredDelay = sequencePosition * baseDelay;
  
  // Generate delay absorption route
  const holdingRoute = generateDelayAbsorptionRoute(
    aircraft,
    requiredDelay,
    sequencePosition,
    currentDistance
  );
  
  const estimatedHoldTime = Math.ceil(requiredDelay / 60);
  
  await updateAircraft(aircraft.id, {
    status: 'HOLDING',
    route: holdingRoute,
    currentWaypointIndex: 0,
    speed: SPEED_PROFILES.HOLDING.max, // 190 knots
    atcInstruction: `${aircraft.callsign}, #${sequencePosition + 1} in sequence. Expect ${estimatedHoldTime} minute delay. Fly heading ${Math.round(aircraft.heading)}°, vectors for spacing.`,
  });
}

/**
 * Generate delay absorption route
 * 
 * Creates an elongated path (NOT circular) that:
 * 1. Starts from aircraft's current position
 * 2. Extends laterally to absorb required delay as track miles
 * 3. Gradually converges toward the runway
 */
function generateDelayAbsorptionRoute(
  aircraft: Aircraft,
  delaySeconds: number,
  sequencePosition: number,
  currentDistance: number
): Waypoint[] {
  const route: Waypoint[] = [];
  const threshold = AIRPORT.runwayThresholds[aircraft.runway];
  
  // Calculate track miles needed to absorb delay at holding speed
  const holdingSpeed = SPEED_PROFILES.HOLDING.max; // 190 knots
  const trackMilesNeeded = (delaySeconds / 3600) * holdingSpeed;
  
  // Current position
  const startLat = aircraft.lat;
  const startLon = aircraft.lon;
  const startAlt = aircraft.altitude;
  
  // Offset based on sequence position and runway
  const baseOffset = 0.03;
  const positionOffset = sequencePosition * 0.015;
  const lateralOffset = baseOffset + positionOffset;
  
  // Alternate north/south based on runway to separate traffic
  const isNorthOffset = aircraft.runway === '09L';
  const offsetDir = isNorthOffset ? 1 : -1;
  
  // Waypoint 1: Initial vector away from approach path
  const wp1Lat = startLat + (offsetDir * lateralOffset * 0.5);
  const wp1Lon = startLon - 0.03;
  route.push({ lat: wp1Lat, lon: wp1Lon, alt: startAlt });
  
  // Waypoint 2: Downwind leg (parallel to runway, offset)
  const extendedLength = Math.min(0.1, trackMilesNeeded / 150);
  const wp2Lat = startLat + (offsetDir * lateralOffset);
  const wp2Lon = startLon - 0.06 - extendedLength;
  route.push({ lat: wp2Lat, lon: wp2Lon, alt: Math.max(startAlt - 500, 3500) });
  
  // Waypoint 3: Base turn
  const wp3Lat = threshold.lat + (offsetDir * lateralOffset * 0.6);
  const wp3Lon = threshold.lon - 0.06;
  route.push({ lat: wp3Lat, lon: wp3Lon, alt: 3000 });
  
  // Waypoint 4: Final approach intercept
  const wp4Lat = threshold.lat + (offsetDir * 0.015);
  const wp4Lon = threshold.lon - 0.035;
  route.push({ lat: wp4Lat, lon: wp4Lon, alt: 2500 });
  
  // Waypoint 5: Final approach fix (stable approach point)
  const fafLat = threshold.lat;
  const fafLon = threshold.lon - 0.025;
  route.push({ lat: fafLat, lon: fafLon, alt: 2000 });
  
  return route;
}

/**
 * Generate final approach route (direct to runway)
 */
function generateFinalApproachRoute(
  startLat: number, startLon: number, startAlt: number,
  thresholdLat: number, thresholdLon: number
): Waypoint[] {
  const route: Waypoint[] = [];
  const numPoints = 15;
  
  // Runway end (touchdown zone + rollout)
  const runwayEndLon = AIRPORT.runwayEndLon;
  
  // Generate smooth descent to threshold
  for (let i = 0; i <= numPoints; i++) {
    const t = i / numPoints;
    
    // First 70%: approach to threshold
    if (t <= 0.7) {
      const approachT = t / 0.7;
      route.push({
        lat: startLat + (thresholdLat - startLat) * approachT,
        lon: startLon + (thresholdLon - startLon) * approachT,
        alt: Math.max(startAlt * (1 - approachT * 0.95), 50),
      });
    } else {
      // Last 30%: rollout on runway
      const rolloutT = (t - 0.7) / 0.3;
      route.push({
        lat: thresholdLat,
        lon: thresholdLon + (runwayEndLon - thresholdLon) * rolloutT,
        alt: 0,
      });
    }
  }
  
  return route;
}

/**
 * Detect conflicts between aircraft
 */
async function detectConflicts(aircraft: Aircraft[]): Promise<void> {
  for (let i = 0; i < aircraft.length; i++) {
    const ac1 = aircraft[i];
    let hasConflict = false;
    let minSeparation = Infinity;
    
    for (let j = 0; j < aircraft.length; j++) {
      if (i === j) continue;
      const ac2 = aircraft[j];
      
      // Calculate separation
      const horizontalDist = haversineDistance(ac1.lat, ac1.lon, ac2.lat, ac2.lon);
      const verticalDist = Math.abs(ac1.altitude - ac2.altitude);
      
      // Check for conflict (within 3NM horizontal AND 1000ft vertical)
      if (horizontalDist < MIN_SEPARATION_NM && verticalDist < 1000) {
        hasConflict = true;
      }
      
      // Track minimum separation for safety score
      const separation = Math.sqrt(
        horizontalDist * horizontalDist + 
        (verticalDist / 1000) * (verticalDist / 1000)
      );
      minSeparation = Math.min(minSeparation, separation);
    }
    
    // Calculate safety percentage (0-100)
    const safetyPercent = aircraft.length > 1 
      ? Math.min(100, Math.round((minSeparation / 5) * 100))
      : 100;
    
    if (hasConflict) {
      await updateAircraft(ac1.id, { 
        hasConflict: true, 
        safetyPercent,
        atcInstruction: `${ac1.callsign}, TRAFFIC ALERT! Maintain present altitude and heading.`
      });
    } else {
      await updateAircraft(ac1.id, { 
        hasConflict: false, 
        safetyPercent
      });
    }
  }
}

/**
 * Handle runway vacation (called when aircraft completes rollout)
 */
export async function vacateRunway(aircraftId: string, runwayId: RunwayId): Promise<void> {
  await setRunwayOccupied(runwayId, false, null);
  await setRunwayClearanceLock(runwayId, false);
  
  // The next aircraft in sequence will be cleared on next tick
  // This triggers re-sequencing based on distance
}
