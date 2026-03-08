/**
 * AMAN State Management with Database Persistence
 * Stores state in Supabase for persistence across edge function calls
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { Aircraft, RunwayId, Waypoint } from './models.ts';

// Airport configuration for VOHS (Hyderabad)
export const AIRPORT = {
  code: 'VOHS',
  name: 'Rajiv Gandhi International Airport',
  lat: 17.2403,
  lon: 78.4294,
  runwayThresholds: {
    '09L': { lat: 17.250, lon: 78.36 },
    '09R': { lat: 17.230, lon: 78.36 }
  },
  runwayHeading: 90, // East-facing
  runwayEndLon: 78.50, // East end of runway
  terminalAreaRadius: 40, // NM - aircraft within this are in terminal area
};

// Database types
interface DbAircraft {
  id: string;
  callsign: string;
  lat: number;
  lon: number;
  altitude: number;
  speed: number;
  heading: number;
  runway: string;
  status: string;
  route: Waypoint[];
  current_waypoint_index: number;
  distance_to_threshold: number;
  eta: number;
  sequence_number: number;
  atc_instruction: string;
  has_conflict: boolean;
  safety_percent: number;
}

interface DbRunway {
  id: string;
  occupied: boolean;
  occupying_aircraft_id: string | null;
  clearance_lock: boolean;
}

interface DbSimulation {
  tick_count: number;
  separation_minimum: number;
}

// Create Supabase client
function getClient() {
  const url = Deno.env.get('SUPABASE_URL')!;
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  return createClient(url, key);
}

// Convert DB aircraft to model
function toAircraft(db: DbAircraft): Aircraft {
  return {
    id: db.id,
    callsign: db.callsign,
    lat: db.lat,
    lon: db.lon,
    altitude: db.altitude,
    speed: db.speed,
    heading: db.heading,
    runway: db.runway as RunwayId,
    status: db.status as Aircraft['status'],
    route: db.route || [],
    currentWaypointIndex: db.current_waypoint_index,
    distanceToThreshold: db.distance_to_threshold,
    eta: db.eta,
    sequenceNumber: db.sequence_number,
    atcInstruction: db.atc_instruction,
    hasConflict: db.has_conflict,
    safetyPercent: db.safety_percent,
  };
}

// Convert model to DB format
function toDbAircraft(ac: Partial<Aircraft> & { id: string }): Partial<DbAircraft> {
  const result: Partial<DbAircraft> = { id: ac.id };
  
  if (ac.callsign !== undefined) result.callsign = ac.callsign;
  if (ac.lat !== undefined) result.lat = ac.lat;
  if (ac.lon !== undefined) result.lon = ac.lon;
  if (ac.altitude !== undefined) result.altitude = ac.altitude;
  if (ac.speed !== undefined) result.speed = ac.speed;
  if (ac.heading !== undefined) result.heading = ac.heading;
  if (ac.runway !== undefined) result.runway = ac.runway;
  if (ac.status !== undefined) result.status = ac.status;
  if (ac.route !== undefined) result.route = ac.route;
  if (ac.currentWaypointIndex !== undefined) result.current_waypoint_index = ac.currentWaypointIndex;
  if (ac.distanceToThreshold !== undefined) result.distance_to_threshold = ac.distanceToThreshold;
  if (ac.eta !== undefined) result.eta = ac.eta;
  if (ac.sequenceNumber !== undefined) result.sequence_number = ac.sequenceNumber;
  if (ac.atcInstruction !== undefined) result.atc_instruction = ac.atcInstruction;
  if (ac.hasConflict !== undefined) result.has_conflict = ac.hasConflict;
  if (ac.safetyPercent !== undefined) result.safety_percent = ac.safetyPercent;
  
  return result;
}

// State accessors
export async function getAircraftList(): Promise<Aircraft[]> {
  const supabase = getClient();
  const { data, error } = await supabase
    .from('aman_aircraft')
    .select('*')
    .neq('status', 'LANDED')
    .order('sequence_number', { ascending: true });
  
  if (error) {
    console.error('Error fetching aircraft:', error);
    return [];
  }
  
  return (data || []).map(toAircraft);
}

export async function getAircraftById(id: string): Promise<Aircraft | null> {
  const supabase = getClient();
  const { data, error } = await supabase
    .from('aman_aircraft')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  
  if (error || !data) return null;
  return toAircraft(data);
}

export async function getRunwayState(id: RunwayId): Promise<DbRunway | null> {
  const supabase = getClient();
  const { data, error } = await supabase
    .from('aman_runways')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  
  if (error) {
    console.error('Error fetching runway:', error);
    return null;
  }
  return data;
}

export async function getAllRunways(): Promise<DbRunway[]> {
  const supabase = getClient();
  const { data, error } = await supabase
    .from('aman_runways')
    .select('*');
  
  if (error) {
    console.error('Error fetching runways:', error);
    return [];
  }
  return data || [];
}

export async function isRunwayOccupied(id: RunwayId): Promise<boolean> {
  const runway = await getRunwayState(id);
  return runway?.occupied ?? false;
}

export async function getTickCount(): Promise<number> {
  const supabase = getClient();
  const { data, error } = await supabase
    .from('aman_simulation')
    .select('tick_count')
    .eq('id', 'main')
    .maybeSingle();
  
  if (error || !data) return 0;
  return data.tick_count;
}

// State mutators
export async function addAircraft(request: {
  callsign: string;
  lat: number;
  lon: number;
  altitude: number;
  speed: number;
  heading: number;
  runway: RunwayId;
}): Promise<Aircraft> {
  const supabase = getClient();
  const id = `AC-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
  
  const distanceToThreshold = calculateDistanceToThreshold(request.lat, request.lon, request.runway);
  
  const newAircraft: DbAircraft = {
    id,
    callsign: request.callsign,
    lat: request.lat,
    lon: request.lon,
    altitude: request.altitude,
    speed: request.speed,
    heading: request.heading,
    runway: request.runway,
    status: 'APPROACHING',
    route: [],
    current_waypoint_index: 0,
    distance_to_threshold: distanceToThreshold,
    eta: 0,
    sequence_number: 0,
    atc_instruction: 'Contact Approach, radar identified.',
    has_conflict: false,
    safety_percent: 100,
  };
  
  const { error } = await supabase
    .from('aman_aircraft')
    .insert(newAircraft);
  
  if (error) {
    console.error('Error adding aircraft:', error);
    throw new Error('Failed to add aircraft');
  }
  
  return toAircraft(newAircraft);
}

export async function updateAircraft(id: string, updates: Partial<Aircraft>): Promise<void> {
  const supabase = getClient();
  const dbUpdates = toDbAircraft({ id, ...updates });
  delete dbUpdates.id; // Don't update ID
  
  const { error } = await supabase
    .from('aman_aircraft')
    .update(dbUpdates)
    .eq('id', id);
  
  if (error) {
    console.error('Error updating aircraft:', error);
  }
}

export async function removeAircraft(id: string): Promise<void> {
  const supabase = getClient();
  const { error } = await supabase
    .from('aman_aircraft')
    .delete()
    .eq('id', id);
  
  if (error) {
    console.error('Error removing aircraft:', error);
  }
}

export async function setRunwayOccupied(
  runwayId: RunwayId, 
  occupied: boolean, 
  aircraftId: string | null = null
): Promise<void> {
  const supabase = getClient();
  const { error } = await supabase
    .from('aman_runways')
    .update({
      occupied,
      occupying_aircraft_id: aircraftId,
      last_cleared_time: occupied ? new Date().toISOString() : null,
    })
    .eq('id', runwayId);
  
  if (error) {
    console.error('Error updating runway:', error);
  }
}

export async function setRunwayClearanceLock(runwayId: RunwayId, locked: boolean): Promise<void> {
  const supabase = getClient();
  const { error } = await supabase
    .from('aman_runways')
    .update({ clearance_lock: locked })
    .eq('id', runwayId);
  
  if (error) {
    console.error('Error updating runway lock:', error);
  }
}

export async function incrementTick(): Promise<number> {
  const supabase = getClient();
  const currentTick = await getTickCount();
  const newTick = currentTick + 1;
  
  const { error } = await supabase
    .from('aman_simulation')
    .update({ 
      tick_count: newTick,
      last_tick_time: new Date().toISOString()
    })
    .eq('id', 'main');
  
  if (error) {
    console.error('Error incrementing tick:', error);
  }
  
  return newTick;
}

export async function resetState(): Promise<void> {
  const supabase = getClient();
  
  // Delete all aircraft
  await supabase.from('aman_aircraft').delete().neq('id', '');
  
  // Reset runways
  await supabase
    .from('aman_runways')
    .update({ occupied: false, occupying_aircraft_id: null, clearance_lock: false })
    .in('id', ['09L', '09R']);
  
  // Reset simulation
  await supabase
    .from('aman_simulation')
    .update({ tick_count: 0, last_tick_time: new Date().toISOString() })
    .eq('id', 'main');
}

// Helper function
function calculateDistanceToThreshold(lat: number, lon: number, runway: RunwayId): number {
  const threshold = AIRPORT.runwayThresholds[runway];
  const R = 3440.065; // Earth radius in NM
  const dLat = toRad(threshold.lat - lat);
  const dLon = toRad(threshold.lon - lon);
  const a = Math.sin(dLat / 2) ** 2 + 
            Math.cos(toRad(lat)) * Math.cos(toRad(threshold.lat)) * 
            Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}
