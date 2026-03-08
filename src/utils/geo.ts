// Haversine formula to calculate distance between two points
export function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 3440.065; // Earth's radius in nautical miles
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

// Calculate ETA in seconds based on distance and speed
export function calculateETA(distanceNM: number, speedKnots: number): number {
  if (speedKnots <= 0) return 0;
  return (distanceNM / speedKnots) * 3600; // Convert hours to seconds
}

// Determine speed phase based on distance
export function getSpeedPhase(distanceNM: number): 'far' | 'mid' | 'near' | 'final' {
  if (distanceNM > 50) return 'far';
  if (distanceNM > 25) return 'mid';
  if (distanceNM > 10) return 'near';
  return 'final';
}

// Generate holding pattern waypoints (racetrack pattern)
export function generateHoldingPattern(
  centerLat: number,
  centerLon: number,
  altitude: number,
  heading: number
): [number, number, number][] {
  const pattern: [number, number, number][] = [];
  const legLengthNM = 2;
  const turnRadius = 0.5;
  
  // Convert to radians
  const hdgRad = toRad(heading);
  const perpRad = hdgRad + Math.PI / 2;
  
  // Generate 8 waypoints for a racetrack pattern
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * 2 * Math.PI;
    const isOutbound = i < 4;
    const progress = (i % 4) / 4;
    
    let latOffset: number;
    let lonOffset: number;
    
    if (i < 2 || i >= 6) {
      // Turns
      const turnAngle = isOutbound ? progress * Math.PI : Math.PI + progress * Math.PI;
      latOffset = Math.cos(hdgRad + turnAngle) * turnRadius;
      lonOffset = Math.sin(hdgRad + turnAngle) * turnRadius;
    } else {
      // Straight legs
      const legProgress = ((i - 2) % 4) / 2;
      const direction = i < 4 ? 1 : -1;
      latOffset = Math.cos(hdgRad) * legLengthNM * legProgress * direction;
      lonOffset = Math.sin(hdgRad) * legLengthNM * legProgress * direction;
    }
    
    pattern.push([
      centerLat + latOffset / 60, // Convert NM to degrees (approximate)
      centerLon + lonOffset / 60,
      altitude,
    ]);
  }
  
  return pattern;
}

// Generate STRAIGHT approach path - aircraft approaches from WEST side and lands moving EAST
export function generateApproachPath(
  startLat: number,
  startLon: number,
  startAlt: number,
  runwayLat: number,
  runwayLon: number,
  runwayHeading: number
): [number, number, number][] {
  const path: [number, number, number][] = [];
  const numWaypoints = 30; // More waypoints for smoother animation
  
  // Start point - always from the WEST side of runway (left side on map)
  const runwayStartLon = 78.36; // West end of runway
  const runwayEndLon = 78.50; // East end of runway (past the runway for full landing)
  
  // First, fly from current position to approach point (west of runway)
  const approachLat = runwayLat;
  const approachLon = runwayStartLon;
  
  // Phase 1: Fly to approach point (first half of waypoints)
  for (let i = 0; i <= numWaypoints / 2; i++) {
    const t = i / (numWaypoints / 2);
    const lat = startLat + (approachLat - startLat) * t;
    const lon = startLon + (approachLon - startLon) * t;
    const alt = startAlt * (1 - t * 0.7); // Descend to 30% of original altitude
    path.push([lat, lon, Math.max(alt, 500)]);
  }
  
  // Phase 2: Fly straight across runway from west to east (landing)
  for (let i = 1; i <= numWaypoints / 2; i++) {
    const t = i / (numWaypoints / 2);
    const lat = runwayLat; // Stay on runway centerline
    const lon = runwayStartLon + (runwayEndLon - runwayStartLon) * t;
    const alt = 500 * (1 - t); // Final descent to 0
    path.push([lat, lon, Math.max(alt, 0)]);
  }
  
  return path;
}

// Check for conflicts between aircraft
export function checkConflict(
  aircraft1: { lat: number; lon: number; altitude: number },
  aircraft2: { lat: number; lon: number; altitude: number }
): boolean {
  const horizontalDistance = haversineDistance(
    aircraft1.lat,
    aircraft1.lon,
    aircraft2.lat,
    aircraft2.lon
  );
  const verticalDistance = Math.abs(aircraft1.altitude - aircraft2.altitude);
  
  // Conflict if within 3NM horizontally AND 1000ft vertically
  return horizontalDistance < 3 && verticalDistance < 1000;
}

// Calculate safety percentage based on aircraft spacing
export function calculateSafetyPercent(
  aircraft: { lat: number; lon: number; altitude: number },
  otherAircraft: { lat: number; lon: number; altitude: number }[]
): number {
  if (otherAircraft.length === 0) return 100;
  
  let minSeparation = Infinity;
  
  for (const other of otherAircraft) {
    const horizontalDist = haversineDistance(
      aircraft.lat,
      aircraft.lon,
      other.lat,
      other.lon
    );
    const verticalDist = Math.abs(aircraft.altitude - other.altitude) / 1000; // Convert to similar scale
    const separation = Math.sqrt(horizontalDist * horizontalDist + verticalDist * verticalDist);
    minSeparation = Math.min(minSeparation, separation);
  }
  
  // Safety score based on minimum separation
  // 5NM+ = 100%, 0NM = 0%
  const safetyScore = Math.min(100, (minSeparation / 5) * 100);
  return Math.round(safetyScore);
}

// Calculate bearing between two points
export function calculateBearing(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const dLon = toRad(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
  const bearing = (Math.atan2(y, x) * 180) / Math.PI;
  return (bearing + 360) % 360;
}
