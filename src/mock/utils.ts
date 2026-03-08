/**
 * Mock Simulation Utilities
 * 
 * Geometry and physics helper functions for frontend-only simulation.
 */

import { AIRPORT, PHYSICS } from './constants';

/**
 * Calculate distance between two coordinates in nautical miles
 */
export function calculateDistanceNm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3440.065; // Earth radius in NM
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * Math.PI / 180) *
            Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Calculate distance from coordinates to airport threshold
 */
export function distanceToAirport(lat: number, lon: number): number {
  return calculateDistanceNm(lat, lon, AIRPORT.lat, AIRPORT.lon);
}

/**
 * Calculate bearing between two points in degrees
 */
export function calculateBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const y = Math.sin(dLon) * Math.cos(lat2 * Math.PI / 180);
  const x = Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) -
            Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos(dLon);
  let bearing = Math.atan2(y, x) * 180 / Math.PI;
  return (bearing + 360) % 360;
}

/**
 * Calculate new position given current position, heading, and distance
 */
export function moveAlongHeading(
  lat: number,
  lon: number,
  heading: number,
  distanceNm: number
): { lat: number; lon: number } {
  const headingRad = heading * Math.PI / 180;
  const dLat = (distanceNm / PHYSICS.NM_PER_DEGREE_LAT) * Math.cos(headingRad);
  const dLon = (distanceNm / (PHYSICS.NM_PER_DEGREE_LAT * Math.cos(lat * Math.PI / 180))) * Math.sin(headingRad);
  
  return {
    lat: lat + dLat,
    lon: lon + dLon,
  };
}

/**
 * Calculate position at given distance and bearing from airport
 */
export function positionFromAirport(distanceNm: number, bearing: number): { lat: number; lon: number } {
  const bearingRad = bearing * Math.PI / 180;
  const dLat = (distanceNm / PHYSICS.NM_PER_DEGREE_LAT) * Math.cos(bearingRad);
  const dLon = (distanceNm / (PHYSICS.NM_PER_DEGREE_LAT * Math.cos(AIRPORT.lat * Math.PI / 180))) * Math.sin(bearingRad);
  
  return {
    lat: AIRPORT.lat + dLat,
    lon: AIRPORT.lon + dLon,
  };
}

/**
 * Normalize heading to 0-360 degrees
 */
export function normalizeHeading(heading: number): number {
  return ((heading % 360) + 360) % 360;
}

/**
 * Calculate heading difference (shortest path)
 */
export function headingDifference(from: number, to: number): number {
  let diff = to - from;
  while (diff > 180) diff -= 360;
  while (diff < -180) diff += 360;
  return diff;
}

/**
 * Smoothly transition a value towards a target
 */
export function smoothTransition(current: number, target: number, maxChange: number): number {
  const diff = target - current;
  if (Math.abs(diff) <= maxChange) {
    return target;
  }
  return current + Math.sign(diff) * maxChange;
}

/**
 * Calculate ETA in seconds based on distance and speed
 */
export function calculateEta(distanceNm: number, speedKnots: number): number {
  if (speedKnots <= 0) return Infinity;
  return (distanceNm / speedKnots) * PHYSICS.SECONDS_PER_HOUR;
}

/**
 * Generate a unique aircraft ID
 */
export function generateAircraftId(): string {
  return `AC-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`.toUpperCase();
}

/**
 * Generate a random callsign
 */
export function generateCallsign(): string {
  const airlines = ['AI', 'UK', '6E', 'SG', 'G8', 'QP', 'I5'];
  const airline = airlines[Math.floor(Math.random() * airlines.length)];
  const number = Math.floor(Math.random() * 900) + 100;
  return `${airline}${number}`;
}
