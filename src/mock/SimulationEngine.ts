/**
 * Mock Simulation Engine
 * 
 * Frontend-only aircraft movement simulation for standalone mode.
 * This engine generates realistic aircraft movement without a backend.
 * 
 * Features:
 * - Distance-based sequencing (not FIFO)
 * - 20 NM optimization zone
 * - Realistic speed profiles
 * - Smooth heading transitions
 * - Route generation
 */

import { Aircraft } from '@/types/aircraft';
import { AIRPORT, RUNWAYS, PHYSICS, SPAWN_CONFIG } from './constants';
import {
  calculateDistanceNm,
  distanceToAirport,
  calculateBearing,
  moveAlongHeading,
  positionFromAirport,
  normalizeHeading,
  headingDifference,
  smoothTransition,
  calculateEta,
  generateAircraftId,
  generateCallsign,
} from './utils';

export interface SimulationState {
  aircraft: Aircraft[];
  tickCount: number;
  runways: {
    id: string;
    occupied: boolean;
    occupyingAircraftId: string | null;
  }[];
}

export interface AddAircraftParams {
  callsign?: string;
  runway: '09L' | '09R';
  distanceNm?: number;
  altitude?: number;
  speed?: number;
  heading?: number;
}

class SimulationEngine {
  private state: SimulationState;
  private tickInterval: number | null = null;
  private listeners: Set<(state: SimulationState) => void> = new Set();

  constructor() {
    this.state = {
      aircraft: [],
      tickCount: 0,
      runways: [
        { id: '09L', occupied: false, occupyingAircraftId: null },
        { id: '09R', occupied: false, occupyingAircraftId: null },
      ],
    };
  }

  /**
   * Subscribe to state updates
   */
  subscribe(listener: (state: SimulationState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Notify all listeners of state change
   */
  private notifyListeners(): void {
    this.listeners.forEach(listener => listener(this.getState()));
  }

  /**
   * Get current simulation state
   */
  getState(): SimulationState {
    return {
      ...this.state,
      aircraft: [...this.state.aircraft],
      runways: [...this.state.runways],
    };
  }

  /**
   * Start automatic simulation ticks
   */
  start(): void {
    if (this.tickInterval) return;
    
    this.tickInterval = window.setInterval(() => {
      this.tick();
    }, PHYSICS.TICK_INTERVAL_MS);
  }

  /**
   * Stop automatic simulation ticks
   */
  stop(): void {
    if (this.tickInterval) {
      window.clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
  }

  /**
   * Check if simulation is running
   */
  isRunning(): boolean {
    return this.tickInterval !== null;
  }

  /**
   * Add a new aircraft to the simulation
   */
  addAircraft(params: AddAircraftParams): Aircraft {
    const runway = RUNWAYS[params.runway];
    const distanceNm = params.distanceNm ?? SPAWN_CONFIG.DEFAULT_DISTANCE_NM;
    
    // Calculate spawn position (approach from west for runway 09)
    const spawnBearing = (runway.heading + 180) % 360; // Approach from opposite direction
    const position = positionFromAirport(distanceNm, spawnBearing);
    
    // Calculate heading towards airport
    const headingToAirport = calculateBearing(position.lat, position.lon, AIRPORT.lat, AIRPORT.lon);
    
    const aircraft: Aircraft = {
      id: generateAircraftId(),
      callsign: params.callsign || generateCallsign(),
      lat: position.lat,
      lon: position.lon,
      altitude: params.altitude ?? SPAWN_CONFIG.DEFAULT_ALTITUDE,
      speed: params.speed ?? SPAWN_CONFIG.DEFAULT_SPEED,
      heading: params.heading ?? headingToAirport,
      runway: params.runway,
      status: 'APPROACHING',
      role: 'landing',
      eta: calculateEta(distanceNm, params.speed ?? SPAWN_CONFIG.DEFAULT_SPEED),
      safetyPercent: 100,
      distanceToThreshold: distanceNm,
      waypoints: this.generateRoute(position.lat, position.lon, params.runway),
      atcNote: 'Cleared for approach',
      hasConflict: false,
      sequenceNumber: this.state.aircraft.length + 1,
    };

    this.state.aircraft.push(aircraft);
    this.updateSequencing();
    this.notifyListeners();
    
    return aircraft;
  }

  /**
   * Remove an aircraft from the simulation
   */
  removeAircraft(id: string): void {
    const index = this.state.aircraft.findIndex(ac => ac.id === id);
    if (index !== -1) {
      const aircraft = this.state.aircraft[index];
      
      // Clear runway occupation
      const runway = this.state.runways.find(r => r.id === aircraft.runway);
      if (runway && runway.occupyingAircraftId === id) {
        runway.occupied = false;
        runway.occupyingAircraftId = null;
      }
      
      this.state.aircraft.splice(index, 1);
      this.updateSequencing();
      this.notifyListeners();
    }
  }

  /**
   * Reset the simulation
   */
  reset(): void {
    this.state = {
      aircraft: [],
      tickCount: 0,
      runways: [
        { id: '09L', occupied: false, occupyingAircraftId: null },
        { id: '09R', occupied: false, occupyingAircraftId: null },
      ],
    };
    this.notifyListeners();
  }

  /**
   * Execute one simulation tick
   */
  tick(): void {
    this.state.tickCount++;
    
    // Update each aircraft
    this.state.aircraft.forEach(aircraft => {
      this.updateAircraft(aircraft);
    });
    
    // Remove landed aircraft
    this.state.aircraft = this.state.aircraft.filter(ac => ac.status !== 'LANDED');
    
    // Update sequencing based on distance
    this.updateSequencing();
    
    this.notifyListeners();
  }

  /**
   * Update a single aircraft's position and state
   */
  private updateAircraft(aircraft: Aircraft): void {
    // Calculate distance to threshold
    aircraft.distanceToThreshold = distanceToAirport(aircraft.lat, aircraft.lon);
    
    // Update speed based on status
    const targetSpeed = this.getTargetSpeed(aircraft);
    aircraft.speed = smoothTransition(aircraft.speed, targetSpeed, PHYSICS.SPEED_TRANSITION_RATE);
    
    // Update heading (turn towards next waypoint or airport)
    const targetHeading = this.getTargetHeading(aircraft);
    const headingDiff = headingDifference(aircraft.heading, targetHeading);
    aircraft.heading = normalizeHeading(
      aircraft.heading + Math.sign(headingDiff) * Math.min(Math.abs(headingDiff), PHYSICS.HEADING_CHANGE_RATE)
    );
    
    // Calculate movement distance (speed in knots, tick in 1 second)
    const distanceNm = aircraft.speed / PHYSICS.SECONDS_PER_HOUR;
    
    // Move aircraft
    const newPos = moveAlongHeading(aircraft.lat, aircraft.lon, aircraft.heading, distanceNm);
    aircraft.lat = newPos.lat;
    aircraft.lon = newPos.lon;
    
    // Update altitude
    this.updateAltitude(aircraft);
    
    // Update status based on distance and conditions
    this.updateStatus(aircraft);
    
    // Update ETA
    aircraft.eta = calculateEta(aircraft.distanceToThreshold, aircraft.speed);
    
    // Update waypoints (remove passed waypoints)
    this.updateWaypoints(aircraft);
    
    // Update ATC instruction
    this.updateATCInstruction(aircraft);
  }

  /**
   * Get target speed based on aircraft status
   */
  private getTargetSpeed(aircraft: Aircraft): number {
    switch (aircraft.status) {
      case 'APPROACHING':
        return (PHYSICS.SPEED_APPROACHING.min + PHYSICS.SPEED_APPROACHING.max) / 2;
      case 'HOLDING':
        return (PHYSICS.SPEED_HOLDING.min + PHYSICS.SPEED_HOLDING.max) / 2;
      case 'LANDING':
        return (PHYSICS.SPEED_LANDING.min + PHYSICS.SPEED_LANDING.max) / 2;
      case 'ROLLOUT':
        return Math.max(aircraft.speed - 5, PHYSICS.SPEED_TAXI);
      default:
        return 0;
    }
  }

  /**
   * Get target heading for aircraft
   */
  private getTargetHeading(aircraft: Aircraft): number {
    // If in rollout, maintain runway heading
    if (aircraft.status === 'ROLLOUT' || aircraft.status === 'LANDED') {
      return RUNWAYS[aircraft.runway].heading;
    }
    
    // If has waypoints, head towards next waypoint
    if (aircraft.waypoints.length > 0) {
      const [wpLat, wpLon] = aircraft.waypoints[0];
      return calculateBearing(aircraft.lat, aircraft.lon, wpLat, wpLon);
    }
    
    // Otherwise head towards airport
    return calculateBearing(aircraft.lat, aircraft.lon, AIRPORT.lat, AIRPORT.lon);
  }

  /**
   * Update aircraft altitude
   */
  private updateAltitude(aircraft: Aircraft): void {
    if (aircraft.status === 'ROLLOUT' || aircraft.status === 'LANDED') {
      aircraft.altitude = 0;
      return;
    }
    
    // Gradual descent
    const targetAlt = aircraft.distanceToThreshold < PHYSICS.FINAL_APPROACH_NM 
      ? PHYSICS.FINAL_ALTITUDE 
      : PHYSICS.APPROACH_ALTITUDE;
    
    if (aircraft.altitude > targetAlt) {
      aircraft.altitude = Math.max(aircraft.altitude - 50, targetAlt);
    }
  }

  /**
   * Update aircraft status based on conditions
   */
  private updateStatus(aircraft: Aircraft): void {
    const runway = this.state.runways.find(r => r.id === aircraft.runway)!;
    
    switch (aircraft.status) {
      case 'APPROACHING':
        // Check if inside optimization zone
        if (aircraft.distanceToThreshold <= PHYSICS.OPTIMIZATION_ZONE_NM) {
          // Check if this aircraft should land (first in sequence)
          if (aircraft.sequenceNumber === 1 && !runway.occupied) {
            aircraft.status = 'LANDING';
            aircraft.role = 'landing';
            runway.occupied = true;
            runway.occupyingAircraftId = aircraft.id;
          } else if (aircraft.sequenceNumber !== 1) {
            aircraft.status = 'HOLDING';
            aircraft.role = 'holding';
          }
        }
        break;
        
      case 'HOLDING':
        // Check if became first in sequence
        if (aircraft.sequenceNumber === 1 && !runway.occupied) {
          aircraft.status = 'LANDING';
          aircraft.role = 'landing';
          runway.occupied = true;
          runway.occupyingAircraftId = aircraft.id;
        }
        break;
        
      case 'LANDING':
        // Check if reached threshold
        if (aircraft.distanceToThreshold <= PHYSICS.THRESHOLD_TOLERANCE_NM) {
          aircraft.status = 'ROLLOUT';
          aircraft.altitude = 0;
        }
        break;
        
      case 'ROLLOUT':
        // Check if slowed to taxi speed
        if (aircraft.speed <= PHYSICS.SPEED_TAXI) {
          aircraft.status = 'LANDED';
          runway.occupied = false;
          runway.occupyingAircraftId = null;
        }
        break;
    }
  }

  /**
   * Update waypoints - remove passed waypoints
   */
  private updateWaypoints(aircraft: Aircraft): void {
    if (aircraft.waypoints.length === 0) return;
    
    const [wpLat, wpLon] = aircraft.waypoints[0];
    const distToWp = calculateDistanceNm(aircraft.lat, aircraft.lon, wpLat, wpLon);
    
    // Remove waypoint if close enough
    if (distToWp < 0.5) {
      aircraft.waypoints.shift();
    }
  }

  /**
   * Update ATC instruction based on status
   */
  private updateATCInstruction(aircraft: Aircraft): void {
    switch (aircraft.status) {
      case 'APPROACHING':
        aircraft.atcNote = `Continue approach RWY ${aircraft.runway}`;
        break;
      case 'HOLDING':
        aircraft.atcNote = `Hold position, seq #${aircraft.sequenceNumber}`;
        break;
      case 'LANDING':
        aircraft.atcNote = `Cleared to land RWY ${aircraft.runway}`;
        break;
      case 'ROLLOUT':
        aircraft.atcNote = 'Vacate runway when able';
        break;
      case 'LANDED':
        aircraft.atcNote = 'Contact ground';
        break;
    }
  }

  /**
   * Update sequencing based on distance (not FIFO)
   */
  private updateSequencing(): void {
    // Group by runway
    const byRunway: Record<string, Aircraft[]> = { '09L': [], '09R': [] };
    
    this.state.aircraft.forEach(ac => {
      byRunway[ac.runway].push(ac);
    });
    
    // Sort each runway's aircraft by distance and assign sequence
    Object.values(byRunway).forEach(runwayAircraft => {
      // Sort by distance to threshold (nearest first)
      runwayAircraft.sort((a, b) => a.distanceToThreshold - b.distanceToThreshold);
      
      // Assign sequence numbers
      runwayAircraft.forEach((ac, index) => {
        ac.sequenceNumber = index + 1;
        
        // Check for conflicts (too close to next aircraft)
        if (index > 0) {
          const prevAc = runwayAircraft[index - 1];
          const separation = ac.distanceToThreshold - prevAc.distanceToThreshold;
          ac.hasConflict = separation < 3; // Less than 3 NM separation
          ac.safetyPercent = Math.min(100, Math.max(0, (separation / 5) * 100));
        } else {
          ac.hasConflict = false;
          ac.safetyPercent = 100;
        }
      });
    });
  }

  /**
   * Generate approach route waypoints
   */
  private generateRoute(lat: number, lon: number, runway: '09L' | '09R'): [number, number, number][] {
    const rwy = RUNWAYS[runway];
    const waypoints: [number, number, number][] = [];
    
    // Generate intermediate waypoints towards runway
    const distToAirport = distanceToAirport(lat, lon);
    const numWaypoints = Math.min(5, Math.floor(distToAirport / 5));
    
    for (let i = 1; i <= numWaypoints; i++) {
      const fraction = i / (numWaypoints + 1);
      const wpLat = lat + (AIRPORT.lat - lat) * fraction;
      const wpLon = lon + (AIRPORT.lon - lon) * fraction;
      const wpAlt = PHYSICS.APPROACH_ALTITUDE - (PHYSICS.APPROACH_ALTITUDE - PHYSICS.FINAL_ALTITUDE) * fraction;
      waypoints.push([wpLat, wpLon, wpAlt]);
    }
    
    // Final approach point
    waypoints.push([rwy.thresholdLat, rwy.thresholdLon, 0]);
    
    return waypoints;
  }
}

// Singleton instance
export const simulationEngine = new SimulationEngine();
