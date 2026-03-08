/**
 * AMAN API - Main Entry Point (Async version)
 * 
 * RESTful API for the Arrival Manager system.
 * Handles:
 * - Adding aircraft to simulation
 * - Getting current state
 * - Simulation tick control
 * - WebSocket for real-time updates (future)
 */

import { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import { cors } from "https://deno.land/x/hono@v4.3.11/middleware/cors/index.ts";

import { 
  AddAircraftRequest,
  SimulationStateResponse,
  Aircraft
} from '../_shared/models.ts';
import {
  getAircraftList,
  getAllRunways,
  getTickCount,
  addAircraft,
  removeAircraft,
  resetState,
  incrementTick,
  AIRPORT,
} from '../_shared/state.ts';
import { runSequencing } from '../_shared/ai_logic.ts';
import { runPhysics } from '../_shared/physics.ts';

const app = new Hono().basePath('/aman');

// Enable CORS for frontend
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'x-client-info', 'apikey'],
}));

// Health check
app.get('/', (c) => {
  return c.json({ 
    status: 'ok', 
    service: 'AMAN - Arrival Manager',
    version: '1.0.0',
    tickRate: '1 Hz',
  });
});

/**
 * GET /state - Get current simulation state
 * Returns all aircraft positions, routes, ETA, etc.
 */
app.get('/state', async (c) => {
  const aircraft = await getAircraftList();
  const runways = await getAllRunways();
  const tickCount = await getTickCount();
  
  const response: SimulationStateResponse = {
    aircraft: aircraft.map((ac: Aircraft) => ({
      id: ac.id,
      callsign: ac.callsign,
      lat: ac.lat,
      lon: ac.lon,
      altitude: ac.altitude,
      speed: ac.speed,
      heading: ac.heading,
      runway: ac.runway,
      status: ac.status,
      route: ac.route,
      eta: ac.eta,
      sequenceNumber: ac.sequenceNumber,
      atcInstruction: ac.atcInstruction,
      hasConflict: ac.hasConflict,
      safetyPercent: ac.safetyPercent,
    })),
    runways: runways.map((r) => ({
      id: r.id as '09L' | '09R',
      occupied: r.occupied,
      occupyingAircraftId: r.occupying_aircraft_id,
    })),
    simulationTime: Date.now(),
    tickCount,
  };
  
  return c.json(response);
});

/**
 * POST /aircraft - Add new aircraft to simulation
 */
app.post('/aircraft', async (c) => {
  try {
    const body = await c.req.json() as AddAircraftRequest;
    
    // Validate required fields
    if (!body.callsign || !body.runway) {
      return c.json({ error: 'Missing required fields: callsign, runway' }, 400);
    }
    
    // Validate runway
    if (body.runway !== '09L' && body.runway !== '09R') {
      return c.json({ error: 'Invalid runway. Must be 09L or 09R' }, 400);
    }
    
    // Derive initial position (backend truth). Frontend must not do position math.
    const spawn = deriveSpawn(body);

    // Add aircraft
    const aircraft = await addAircraft({
      callsign: body.callsign,
      lat: spawn.lat,
      lon: spawn.lon,
      altitude: body.altitude ?? 10000,
      speed: body.speed ?? 220,
      heading: body.heading ?? 90,
      runway: body.runway,
    });
    
    // Run immediate sequencing to assign routes
    await runSequencing();
    
    return c.json({ 
      success: true, 
      aircraft: {
        id: aircraft.id,
        callsign: aircraft.callsign,
        status: aircraft.status,
        sequenceNumber: aircraft.sequenceNumber,
      }
    });
  } catch (error) {
    console.error('Error adding aircraft:', error);
    return c.json({ error: 'Invalid request body' }, 400);
  }
});

function deriveSpawn(body: AddAircraftRequest): { lat: number; lon: number } {
  // If explicit position provided, trust it.
  if (typeof body.lat === 'number' && typeof body.lon === 'number') {
    return { lat: body.lat, lon: body.lon };
  }

  const distanceNm = typeof body.distanceNm === 'number' ? body.distanceNm : 30;
  const inboundHeading = typeof body.heading === 'number' ? body.heading : 90;

  // Place the aircraft 'distanceNm' away from airport along reciprocal bearing,
  // so that its current heading (inboundHeading) points roughly toward the airport.
  const bearingFromAirportToAircraft = (inboundHeading + 180) % 360;
  return offsetFrom(AIRPORT.lat, AIRPORT.lon, bearingFromAirportToAircraft, distanceNm);
}

function offsetFrom(lat: number, lon: number, bearingDeg: number, distanceNm: number) {
  // Local tangent-plane approximation (good enough at terminal-area distances)
  const rad = (d: number) => (d * Math.PI) / 180;
  const br = rad(bearingDeg);

  const dLatDeg = (distanceNm / 60) * Math.cos(br);
  const dLonDeg = (distanceNm / (60 * Math.cos(rad(lat)))) * Math.sin(br);

  return {
    lat: lat + dLatDeg,
    lon: lon + dLonDeg,
  };
}

/**
 * DELETE /aircraft/:id - Remove aircraft from simulation
 */
app.delete('/aircraft/:id', async (c) => {
  const id = c.req.param('id');
  await removeAircraft(id);
  return c.json({ success: true });
});

/**
 * POST /tick - Advance simulation by one tick
 * This is the main simulation loop entry point
 */
app.post('/tick', async (c) => {
  // Increment tick counter
  const tickCount = await incrementTick();
  
  // Run AMAN sequencing logic (the brain)
  await runSequencing();
  
  // Run physics (movement)
  await runPhysics(1); // 1 second per tick
  
  // Return updated state
  const aircraft = await getAircraftList();
  
  return c.json({
    tickCount,
    simulationTime: Date.now(),
    aircraftCount: aircraft.length,
    aircraft: aircraft.map((ac: Aircraft) => ({
      id: ac.id,
      callsign: ac.callsign,
      lat: ac.lat,
      lon: ac.lon,
      altitude: ac.altitude,
      speed: ac.speed,
      heading: ac.heading,
      status: ac.status,
      eta: ac.eta,
      sequenceNumber: ac.sequenceNumber,
      atcInstruction: ac.atcInstruction,
    })),
  });
});

/**
 * POST /reset - Reset simulation to initial state
 */
app.post('/reset', async (c) => {
  await resetState();
  return c.json({ success: true, message: 'Simulation reset' });
});

/**
 * GET /runway/:id - Get runway state
 */
app.get('/runway/:id', async (c) => {
  const id = c.req.param('id') as '09L' | '09R';
  const runways = await getAllRunways();
  const runway = runways.find(r => r.id === id);
  
  if (!runway) {
    return c.json({ error: 'Runway not found' }, 404);
  }
  
  return c.json({
    id: runway.id,
    occupied: runway.occupied,
    occupyingAircraftId: runway.occupying_aircraft_id,
  });
});

// Export for Deno
Deno.serve(app.fetch);
