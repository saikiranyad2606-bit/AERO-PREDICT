/**
 * Mock Simulation Constants
 * 
 * Airport and simulation configuration for standalone frontend mode.
 */

// Hyderabad Airport (VOHS) coordinates
export const AIRPORT = {
  code: 'VOHS',
  name: 'Rajiv Gandhi International Airport',
  lat: 17.2403,
  lon: 78.4294,
} as const;

// Runway configurations
export const RUNWAYS = {
  '09L': {
    id: '09L',
    heading: 90,
    thresholdLat: 17.2403,
    thresholdLon: 78.4294,
    color: 'green' as const,
  },
  '09R': {
    id: '09R',
    heading: 90,
    thresholdLat: 17.2350,
    thresholdLon: 78.4294,
    color: 'amber' as const,
  },
} as const;

// Simulation physics parameters
export const PHYSICS = {
  // Tick interval in milliseconds
  TICK_INTERVAL_MS: 1000,
  
  // Speed profiles (knots)
  SPEED_APPROACHING: { min: 220, max: 250 },
  SPEED_HOLDING: { min: 170, max: 190 },
  SPEED_LANDING: { min: 130, max: 150 },
  SPEED_ROLLOUT_INITIAL: 60,
  SPEED_TAXI: 15,
  
  // Speed transition rate (knots per second)
  SPEED_TRANSITION_RATE: 5,
  
  // Heading change rate (degrees per second)
  HEADING_CHANGE_RATE: 3,
  
  // Distance thresholds (nautical miles)
  OPTIMIZATION_ZONE_NM: 20,
  FINAL_APPROACH_NM: 5,
  THRESHOLD_TOLERANCE_NM: 0.1,
  
  // Altitude (feet)
  APPROACH_ALTITUDE: 3000,
  FINAL_ALTITUDE: 1500,
  
  // Conversion factors
  NM_PER_DEGREE_LAT: 60,
  SECONDS_PER_HOUR: 3600,
} as const;

// Default spawn configuration
export const SPAWN_CONFIG = {
  DEFAULT_DISTANCE_NM: 25,
  MIN_DISTANCE_NM: 10,
  MAX_DISTANCE_NM: 50,
  DEFAULT_ALTITUDE: 3000,
  DEFAULT_SPEED: 220,
} as const;
