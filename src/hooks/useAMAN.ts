/**
 * AMAN Hook - Backend Client Interface
 * 
 * Connects React components to the Python backend (single source of truth).
 * Frontend is render-only - all physics, ETA, and sequencing come from backend.
 * 
 * IMPORTANT: This hook does NOT calculate anything locally.
 * It only fetches and displays backend state.
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { Aircraft } from '@/types/aircraft';
import { apiAdapter, SimulationState, AnalyticsHistory } from '@/services/apiAdapter';

interface UseAMANOptions {
  autoStart?: boolean;
  onError?: (error: Error) => void;
}

export interface AddAircraftParams {
  callsign?: string;
  runway: '09L' | '09R';
  distanceNm?: number;
  altitude?: number;
  speed?: number;
  heading?: number;
}

export interface BackendAnalytics {
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
}

export function useAMAN(options: UseAMANOptions = {}) {
  const { onError, autoStart = true } = options;

  // State from backend
  const [aircraft, setAircraft] = useState<Aircraft[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [tickCount, setTickCount] = useState(0);
  const [error, setError] = useState<Error | null>(null);

  // Backend analytics
  const [analytics, setAnalytics] = useState<BackendAnalytics | null>(null);
  const [peakHourEnabled, setPeakHourEnabled] = useState(false);

  // Runways state
  const [runways, setRunways] = useState<{ id: string; occupied: boolean; occupyingAircraftId: string | null }[]>([]);

  const isInitializedRef = useRef(false);

  /**
   * Handle state updates from backend
   */
  const handleStateUpdate = useCallback((state: SimulationState) => {
    setAircraft(state.aircraft);
    setTickCount(state.tickCount);
    setRunways(state.runways);
    setIsConnected(true);
    setError(null);

    if (state.analytics) {
      setAnalytics(state.analytics);
      setPeakHourEnabled(state.analytics.peak_hour_enabled);
    }
  }, []);

  /**
   * Initialize and subscribe to backend updates
   */
  useEffect(() => {
    if (isInitializedRef.current) return;
    isInitializedRef.current = true;

    // Subscribe to state updates
    const unsubscribe = apiAdapter.subscribe(handleStateUpdate);

    // Get initial state
    apiAdapter.getAircraftState()
      .then(handleStateUpdate)
      .catch(err => {
        const error = err instanceof Error ? err : new Error('Failed to connect to backend');
        setError(error);
        setIsConnected(false);
        onError?.(error);
      });

    // Auto-start simulation loop
    if (autoStart) {
      apiAdapter.startSimulation();
    }

    return () => {
      unsubscribe();
      apiAdapter.stopSimulation();
    };
  }, [autoStart, handleStateUpdate, onError]);

  /**
   * Add aircraft via backend
   */
  const addAircraft = useCallback(async (params: AddAircraftParams) => {
    try {
      setIsLoading(true);
      const newAircraft = await apiAdapter.addAircraft(params);
      return newAircraft;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to add aircraft');
      setError(error);
      onError?.(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [onError]);

  /**
   * Remove aircraft via backend
   */
  const removeAircraft = useCallback(async (id: string) => {
    try {
      await apiAdapter.removeAircraft(id);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to remove aircraft');
      setError(error);
      onError?.(error);
    }
  }, [onError]);

  /**
   * Reset simulation via backend
   */
  const reset = useCallback(async () => {
    try {
      await apiAdapter.reset();
      setAircraft([]);
      setTickCount(0);
      setAnalytics(null);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to reset simulation');
      setError(error);
      onError?.(error);
    }
  }, [onError]);

  /**
   * Toggle peak hour mode
   */
  const togglePeakHour = useCallback(async () => {
    try {
      if (peakHourEnabled) {
        await apiAdapter.disablePeakHour();
        setPeakHourEnabled(false);
      } else {
        await apiAdapter.enablePeakHour();
        setPeakHourEnabled(true);
      }
    } catch (err) {
      console.error('Failed to toggle peak hour:', err);
    }
  }, [peakHourEnabled]);

  /**
   * Get analytics history for charts
   */
  const getAnalyticsHistory = useCallback(async (hours: number = 4): Promise<AnalyticsHistory | null> => {
    try {
      return await apiAdapter.getAnalyticsHistory(hours);
    } catch (err) {
      console.error('Failed to get analytics history:', err);
      return null;
    }
  }, []);

  /**
   * Manual tick (for debugging)
   */
  const tick = useCallback(async () => {
    try {
      await apiAdapter.tick();
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to tick');
      setError(error);
      onError?.(error);
    }
  }, [onError]);

  /**
   * Fetch current state manually
   */
  const fetchState = useCallback(async () => {
    try {
      const state = await apiAdapter.getAircraftState();
      handleStateUpdate(state);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to fetch state');
      setError(error);
      onError?.(error);
    }
  }, [handleStateUpdate, onError]);

  return {
    // State from backend
    aircraft,
    isConnected,
    isLoading,
    tickCount,
    error,
    runways,

    // Backend analytics
    analytics,
    peakHourEnabled,

    // Actions
    addAircraft,
    removeAircraft,
    reset,
    tick,
    fetchState,

    // Peak hour controls
    togglePeakHour,

    // Analytics
    getAnalyticsHistory,
  };
}
