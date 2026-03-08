"""
AMAN API — FastAPI Backend (Single Source of Truth)
Simulation loop: sequencing → physics → state transitions → tick
"""

import time
import uuid
import asyncio
import logging
from typing import Optional
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from models import Aircraft, AircraftStatus, AddAircraftRequest, offset_position, haversine_distance
from state import atc_state
from ai_logic import run_sequencing, process_state_transitions
from physics import run_physics
from config import (
    RUNWAYS, AIRPORT, AIRPORT_ICAO,
    PEAK_ARRIVAL_RATE, NORMAL_ARRIVAL_RATE, RUNWAY_CAPACITY_PER_HOUR,
    USE_ADSB_MODE,
)
from adsb_ingest import adsb_refresh_loop

logger = logging.getLogger("aman.main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    print(f"[AMAN] Backend starting -- {AIRPORT['name']} ({AIRPORT_ICAO})")
    print(f"   Runways: {', '.join(RUNWAYS.keys())}")
    print(f"   Mode: {'ADS-B LIVE' if USE_ADSB_MODE else 'SIMULATION'}")
    if USE_ADSB_MODE:
        asyncio.create_task(adsb_refresh_loop(atc_state))
    else:
        # Background simulation loop for real-time operation
        asyncio.create_task(simulation_background_loop())
    yield
    print("[AMAN] Backend shutting down")


app = FastAPI(title="AMAN", version="7.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_credentials=True,
    allow_methods=["*"], allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {
        "status": "healthy", "service": "AMAN", "version": "7.0.0",
        "airport": AIRPORT_ICAO,
        "mode": "adsb" if USE_ADSB_MODE else "simulation",
        "tick_count": atc_state.tick_count,
        "aircraft_count": len([ac for ac in atc_state.aircraft.values()
                               if ac.status != AircraftStatus.LANDED]),
    }


@app.get("/sequence")
async def get_sequence():
    return atc_state.to_response()


@app.post("/aircraft")
async def add_aircraft(request: AddAircraftRequest):
    if USE_ADSB_MODE:
        raise HTTPException(400, "Cannot add aircraft in ADS-B mode")
    if request.runway not in RUNWAYS:
        raise HTTPException(400, f"Invalid runway: {request.runway}")

    ac_id = f"AC-{int(time.time()*1000)}-{uuid.uuid4().hex[:4]}"

    if request.lat is not None and request.lon is not None:
        lat, lon = request.lat, request.lon
    else:
        dist = request.distance_nm or 30.0
        hdg = request.heading or 90
        rc = RUNWAYS[request.runway]
        lat, lon = offset_position(rc["threshold_lat"], rc["threshold_lon"], (hdg+180)%360, dist)

    rc = RUNWAYS[request.runway]
    d = haversine_distance(lat, lon, rc["threshold_lat"], rc["threshold_lon"])
    spd = request.speed or 235
    hdg = request.heading or 90
    eta = (d / spd) * 3600 if spd > 0 else 0

    aircraft = Aircraft(
        id=ac_id, callsign=request.callsign,
        lat=lat, lon=lon, altitude=request.altitude or 10000,
        speed=spd, heading=hdg, user_heading=hdg,
        runway=request.runway, status=AircraftStatus.APPROACH,
        distance_to_threshold=d, eta=eta,
        scheduled_arrival=atc_state.simulation_time + eta,
        instruction=f"{request.callsign}, radar contact. Proceed direct {AIRPORT_ICAO}.",
        source="simulation", is_live=False,
        last_update_timestamp=atc_state.simulation_time,
    )
    
    # Duplicate Check
    existing = [ac for ac in atc_state.aircraft.values() if ac.callsign == request.callsign]
    if existing:
        raise HTTPException(400, f"Aircraft {request.callsign} already exists.")
        
    atc_state.add_aircraft(aircraft)
    run_sequencing()
    updated = atc_state.get_aircraft(ac_id)
    return {"success": True, "aircraft": updated.to_frontend_dict() if updated else None}


@app.delete("/aircraft/{aircraft_id}")
async def remove_aircraft(aircraft_id: str):
    ac = atc_state.remove_aircraft(aircraft_id)
    if not ac:
        raise HTTPException(404, "Aircraft not found")
    return {"success": True, "aircraft_id": aircraft_id}


@app.post("/simulate")
async def simulate_tick():
    """Advance simulation: sequencing → physics → cleanup → tick."""
    run_sequencing()
    run_physics(delta_time=1.0)
    process_state_transitions()
    atc_state.increment_tick()
    return atc_state.to_response()


@app.post("/reset")
async def reset():
    atc_state.reset()
    return {"success": True, "message": "Simulation reset", "tick_count": 0}


@app.post("/peak-hour/enable")
async def enable_peak():
    atc_state.peak_hour_enabled = True
    atc_state.arrival_rate = PEAK_ARRIVAL_RATE
    return {"success": True, "peak_hour_enabled": True, "arrival_rate": PEAK_ARRIVAL_RATE,
            "runway_capacity": RUNWAY_CAPACITY_PER_HOUR}


@app.post("/peak-hour/disable")
async def disable_peak():
    atc_state.peak_hour_enabled = False
    atc_state.arrival_rate = NORMAL_ARRIVAL_RATE
    return {"success": True, "peak_hour_enabled": False, "arrival_rate": NORMAL_ARRIVAL_RATE}


@app.get("/peak-hour/status")
async def peak_status():
    return {
        "peak_hour_enabled": atc_state.peak_hour_enabled,
        "arrival_rate": atc_state.arrival_rate,
        "runway_capacity": RUNWAY_CAPACITY_PER_HOUR,
        "queue_length_09L": atc_state.runways["09L"].queue_length,
        "queue_length_09R": atc_state.runways["09R"].queue_length,
    }


@app.get("/analytics")
async def analytics():
    u09L = atc_state.get_runway_utilization("09L")
    u09R = atc_state.get_runway_utilization("09R")
    pressure = atc_state.get_arrival_pressure()
    avg_delay = atc_state.get_avg_delay()
    max_delay = atc_state.get_max_delay()
    lph = atc_state.get_landings_per_hour()
    
    # Dual-case support for maximum frontend compatibility
    return {
        "total_active": len(atc_state.get_active_aircraft()),
        "totalActive": len(atc_state.get_active_aircraft()),
        "total_landed": atc_state.landed_count,
        "totalLanded": atc_state.landed_count,
        "avg_delay_min": round(avg_delay / 60, 1),
        "avgDelayMin": round(avg_delay / 60, 1),
        "max_delay_min": round(max_delay / 60, 1),
        "maxDelayMin": round(max_delay / 60, 1),
        "landings_per_hour": round(lph, 1),
        "landingsPerHour": round(lph, 1),
        "arrival_pressure": round(pressure, 1),
        "arrivalPressure": round(pressure, 1),
        "queue_length": atc_state.get_queue_length(),
        "queueLength": atc_state.get_queue_length(),
        "runway_capacity": RUNWAY_CAPACITY_PER_HOUR,
        "runwayCapacity": RUNWAY_CAPACITY_PER_HOUR,
        "simulation_time": atc_state.simulation_time,
        "runways": {
            "09L": {
                "utilization": round(u09L, 1),
                "runwayUtilization": round(u09L, 1),
                "occupied": atc_state.runways["09L"].occupied,
                "queue_length": atc_state.runways["09L"].queue_length
            },
            "09R": {
                "utilization": round(u09R, 1),
                "runwayUtilization": round(u09R, 1),
                "occupied": atc_state.runways["09R"].occupied,
                "queue_length": atc_state.runways["09R"].queue_length
            }
        }
    }


@app.get("/analytics/history")
async def analytics_history(hours: int = Query(default=4, ge=1, le=24)):
    snapshots = atc_state.analytics_snapshots
    if not snapshots:
        return {"history": [], "busiest_hour": "N/A",
                "highest_utilization_runway": "N/A", "peak_hours": "N/A",
                "message": "No historical data yet."}

    buckets = {}
    for s in snapshots:
        k = int(s["minute"] / 5) * 5
        buckets.setdefault(k, []).append(s)

    history = []
    for bmin, snaps in sorted(buckets.items()):
        history.append({
            "minute": bmin, "hour_label": f"{bmin}m", "hour": bmin,
            "landings": snaps[-1]["landed_count"],
            "avg_delay": round(sum(s["avg_delay"] for s in snaps)/len(snaps), 2),
            "max_delay": round(max(s["max_delay"] for s in snaps), 2),
            "utilization_09L": round(sum(s["utilization_09L"] for s in snaps)/len(snaps), 1),
            "utilization_09R": round(sum(s["utilization_09R"] for s in snaps)/len(snaps), 1),
            "queue_length": round(sum(s["queue_length"] for s in snaps)/len(snaps), 1),
            "holding_count": round(sum(s["holding_count"] for s in snaps)/len(snaps), 1),
            "is_peak": atc_state.peak_hour_enabled,
        })

    busiest = max(history, key=lambda h: h["landings"]) if history else None
    max_util = max(history, key=lambda h: h["utilization_09L"]+h["utilization_09R"]) if history else None
    return {
        "history": history,
        "busiest_hour": busiest["hour_label"] if busiest else "N/A",
        "highest_utilization_runway": "09L" if (max_util and max_util["utilization_09L"] >= max_util["utilization_09R"]) else "09R",
        "peak_hours": "Peak active" if atc_state.peak_hour_enabled else "Normal",
    }


@app.get("/runway/{runway_id}")
async def get_runway(runway_id: str):
    if runway_id not in RUNWAYS:
        raise HTTPException(404, "Runway not found")
    rwy = atc_state.get_runway(runway_id)
    acs = [ac.to_frontend_dict() for ac in atc_state.get_aircraft_by_runway(runway_id)]
    return {**rwy.to_frontend_dict(), "aircraft": acs, "config": RUNWAYS[runway_id]}



@app.get("/adsb/status")
async def adsb_status():
    live = sum(1 for ac in atc_state.aircraft.values() if ac.is_live)
    return {
        "adsb_mode": USE_ADSB_MODE, "live_aircraft_count": live,
        "simulated_aircraft_count": len(atc_state.aircraft) - live,
        "airport": AIRPORT_ICAO,
    }


import random

def _spawn_random_aircraft():
    """Create a new random aircraft for simulation."""
    prefixes = ["AIC", "SEJ", "VTI", "IGO", "AXB", "IAD", "SIA", "BAW", "UAE"]
    callsign = f"{random.choice(prefixes)}{random.randint(100, 999)}"
    
    # Pick a random runway
    rwy_id = random.choice(list(RUNWAYS.keys()))
    rc = RUNWAYS[rwy_id]
    
    # Position: 30 to 45 NM out
    dist = random.uniform(30.0, 45.0)
    # Heading: approach roughly from 'hdg+180' +/- 30 degrees
    base_hdg = (rc["heading"] + 180) % 360
    hdg = (base_hdg + random.uniform(-30, 30)) % 360
    
    # Calculate starting lat/lon
    lat, lon = offset_position(rc["threshold_lat"], rc["threshold_lon"], hdg, dist)
    
    spd = random.uniform(220, 250)
    eta = (dist / spd) * 3600
    
    ac_id = f"AC-{int(time.time()*1000)}-{uuid.uuid4().hex[:4]}"
    aircraft = Aircraft(
        id=ac_id, callsign=callsign,
        lat=lat, lon=lon, altitude=random.choice([10000, 11000, 12000]),
        speed=spd, heading=rc["heading"], user_heading=rc["heading"],
        runway=rwy_id, status=AircraftStatus.APPROACH,
        distance_to_threshold=dist, eta=eta,
        scheduled_arrival=atc_state.simulation_time + eta,
        instruction=f"{callsign}, radar contact. Proceed direct {AIRPORT_ICAO}.",
        source="simulation", is_live=False,
        last_update_timestamp=atc_state.simulation_time,
    )
    atc_state.add_aircraft(aircraft)
    logger.info(f"Generated random aircraft: {callsign} for runway {rwy_id}")


async def simulation_background_loop():
    """Background task to advance simulation every second."""
    print("[AMAN] Real-time simulation loop started")
    while True:
        try:
            # Advance simulation
            run_sequencing()
            run_physics(delta_time=1.0)
            process_state_transitions()
            atc_state.increment_tick()

            # Console heartbeat every 30 seconds
            if atc_state.tick_count % 30 == 0:
                active = len(atc_state.get_active_aircraft())
                pressure = atc_state.get_arrival_pressure()
                print(f"[AMAN Health] Tick: {atc_state.tick_count} | Active: {active} | Pressure: {pressure:.1f}%")
                
        except Exception as e:
            logger.error(f"Error in simulation loop: {e}")
        await asyncio.sleep(1.0)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

