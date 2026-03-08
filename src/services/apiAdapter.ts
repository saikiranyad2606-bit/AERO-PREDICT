/**
 * API Adapter Layer - Backend Client
 * 
 * Connects to the Python FastAPI backend (single source of truth).
 * Frontend only renders data received from backend.
 * NO local physics, ETA, or sequencing calculations.
 * 
 * Backend URL: http://localhost:8000 (default)
 * Set VITE_BACKEND_URL environment variable to override.
 */

import { Aircraft } from '@/types/aircraft';

// Backend configuration
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';
const TICK_INTERVAL_MS = 1000; // 1 second

export interface SimulationState {
  aircraft: Aircraft[];
  tickCount: number;
  runways: {
    id: string;
    occupied: boolean;
    occupyingAircraftId: string | null;
    queue_length?: number;
    utilization?: number;
  }[];
  analytics?: {
    total_active: number;
    total_landed: number;
    avg_delay: number;
    max_delay: number;
    runway_capacity: number;
    landings_per_hour: number;
    arrival_rate: number;
    peak_hour_enabled: boolean;
    queue_length_09L: number;
    queue_length_09R: number;
    arrival_pressure?: number;
    queue_length?: number;
    runway_utilization?: number;
  };
}

export interface AddAircraftParams {
  callsign?: string;
  runway: '09L' | '09R';
  distanceNm?: number;
  altitude?: number;
  speed?: number;
  heading?: number;
}

export interface AnalyticsHistory {
  history: {
    hour: number;
    hour_label: string;
    landings: number;
    avg_delay: number;
    max_delay: number;
    utilization_09L: number;
    utilization_09R: number;
    is_peak: boolean;
  }[];
  busiest_hour: string;
  highest_utilization_runway: string;
  peak_hours: string;
}

export interface ApiAdapter {
  getAircraftState(): Promise<SimulationState>;
  addAircraft(params: AddAircraftParams): Promise<Aircraft>;
  removeAircraft(id: string): Promise<void>;
  tick(): Promise<SimulationState>;
  startSimulation(): void;
  stopSimulation(): void;
  isRunning(): boolean;
  reset(): Promise<void>;
  subscribe(listener: (state: SimulationState) => void): () => void;

  // Peak hour controls
  enablePeakHour(): Promise<void>;
  disablePeakHour(): Promise<void>;
  getPeakHourStatus(): Promise<{ peak_hour_enabled: boolean; arrival_rate: number }>;

  // Analytics
  getAnalytics(): Promise<any>;
  getAnalyticsHistory(hours?: number): Promise<AnalyticsHistory>;
}

/**
 * Backend API Adapter
 * Connects to Python FastAPI backend as single source of truth.
 */
class BackendApiAdapter implements ApiAdapter {
  private listeners: Set<(state: SimulationState) => void> = new Set();
  private tickInterval: number | null = null;
  private lastState: SimulationState | null = null;
  private isConnected: boolean = false;

  /**
   * Fetch current state from backend
   */
  async getAircraftState(): Promise<SimulationState> {
    try {
      const response = await fetch(`${BACKEND_URL}/sequence`);

      if (!response.ok) {
        throw new Error(`Backend error: ${response.status}`);
      }

      const data = await response.json();
      this.isConnected = true;

      // Map backend response to frontend format
      const state: SimulationState = {
        aircraft: data.aircraft.map(this.mapBackendAircraft),
        tickCount: data.tick_count,
        runways: data.runways,
        analytics: data.analytics,
      };

      this.lastState = state;
      return state;
    } catch (error) {
      this.isConnected = false;
      console.error('Backend connection failed:', error);

      // Return empty state on error
      return {
        aircraft: [],
        tickCount: 0,
        runways: [
          { id: '09L', occupied: false, occupyingAircraftId: null },
          { id: '09R', occupied: false, occupyingAircraftId: null },
        ],
      };
    }
  }

  /**
   * Map backend aircraft format to frontend format
   */
  private mapBackendAircraft(ac: any): Aircraft {
    return {
      id: ac.id,
      callsign: ac.callsign,
      lat: ac.lat,
      lon: ac.lon,
      altitude: ac.altitude,
      speed: ac.speed,
      heading: ac.heading,
      runway: ac.runway,
      status: ac.status,
      role: ac.role || 'landing',
      eta: ac.eta,
      safetyPercent: ac.safetyPercent || 100,
      distanceToThreshold: ac.distanceToThreshold,
      waypoints: ac.waypoints || [],
      atcNote: ac.atcNote,
      hasConflict: ac.hasConflict || false,
      sequenceNumber: ac.sequenceNumber || 0,
    };
  }

  /**
   * Add aircraft via backend API
   */
  async addAircraft(params: AddAircraftParams): Promise<Aircraft> {
    const response = await fetch(`${BACKEND_URL}/aircraft`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        callsign: params.callsign || `AC${Math.floor(Math.random() * 9000) + 1000}`,
        runway: params.runway,
        distance_nm: params.distanceNm || 30,
        altitude: params.altitude || 10000,
        speed: params.speed || 235,
        heading: params.heading || 90,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to add aircraft: ${response.status}`);
    }

    const data = await response.json();
    return this.mapBackendAircraft(data.aircraft);
  }

  /**
   * Remove aircraft via backend API
   */
  async removeAircraft(id: string): Promise<void> {
    const response = await fetch(`${BACKEND_URL}/aircraft/${id}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      throw new Error(`Failed to remove aircraft: ${response.status}`);
    }
  }

  /**
   * Advance simulation by one tick via backend
   */
  async tick(): Promise<SimulationState> {
    try {
      const response = await fetch(`${BACKEND_URL}/simulate`, {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error(`Tick failed: ${response.status}`);
      }

      const data = await response.json();
      this.isConnected = true;

      const state: SimulationState = {
        aircraft: data.aircraft.map(this.mapBackendAircraft),
        tickCount: data.tick_count,
        runways: data.runways,
        analytics: data.analytics,
      };

      this.lastState = state;
      this.notifyListeners(state);

      return state;
    } catch (error) {
      this.isConnected = false;
      console.error('Tick failed:', error);
      throw error;
    }
  }

  /**
   * Start automatic simulation loop
   */
  startSimulation(): void {
    if (this.tickInterval) return;

    this.tickInterval = window.setInterval(async () => {
      try {
        await this.tick();
      } catch (error) {
        // Continue trying even on error
        console.error('Simulation tick error:', error);
      }
    }, TICK_INTERVAL_MS);
  }

  /**
   * Stop automatic simulation
   */
  stopSimulation(): void {
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
   * Reset simulation via backend
   */
  async reset(): Promise<void> {
    await fetch(`${BACKEND_URL}/reset`, { method: 'POST' });
    this.lastState = null;
  }

  /**
   * Subscribe to state updates
   */
  subscribe(listener: (state: SimulationState) => void): () => void {
    this.listeners.add(listener);

    // Send last known state immediately
    if (this.lastState) {
      listener(this.lastState);
    }

    return () => this.listeners.delete(listener);
  }

  /**
   * Notify all listeners of state change
   */
  private notifyListeners(state: SimulationState): void {
    this.listeners.forEach(listener => listener(state));
  }

  // =========================================================================
  // PEAK HOUR CONTROLS
  // =========================================================================

  async enablePeakHour(): Promise<void> {
    await fetch(`${BACKEND_URL}/peak-hour/enable`, { method: 'POST' });
  }

  async disablePeakHour(): Promise<void> {
    await fetch(`${BACKEND_URL}/peak-hour/disable`, { method: 'POST' });
  }

  async getPeakHourStatus(): Promise<{ peak_hour_enabled: boolean; arrival_rate: number }> {
    const response = await fetch(`${BACKEND_URL}/peak-hour/status`);
    return response.json();
  }

  // =========================================================================
  // ANALYTICS
  // =========================================================================

  async getAnalytics(): Promise<any> {
    const response = await fetch(`${BACKEND_URL}/analytics`);
    return response.json();
  }

  async getAnalyticsHistory(hours: number = 4): Promise<AnalyticsHistory> {
    const response = await fetch(`${BACKEND_URL}/analytics/history?hours=${hours}`);
    return response.json();
  }
}

// Export the backend adapter
export const apiAdapter: ApiAdapter = new BackendApiAdapter();
