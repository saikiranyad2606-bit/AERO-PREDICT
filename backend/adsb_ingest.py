"""
ADS-B Ingestion Module — OpenSky Network REST API (NO AUTH REQUIRED)

Fetches live aircraft states around VOHS (Hyderabad) using the public endpoint.

When USE_ADSB_MODE = False: this module is dormant.
When USE_ADSB_MODE = True:
  - Fetches IMMEDIATELY on startup (no initial wait)
  - Polls OpenSky every ADSB_REFRESH_INTERVAL seconds
  - Filters aircraft within ADSB_RADIUS_NM of VOHS
  - Keeps only inbound / descending aircraft
  - Syncs with atc_state, removing stale entries after ADSB_STALE_THRESHOLD_SEC
  - Continues safely if API returns empty data
"""

import asyncio
import logging
from typing import Optional

import httpx

from config import (
    AIRPORT_LAT, AIRPORT_LON, AIRPORT_ICAO,
    USE_ADSB_MODE,
    ADSB_API_URL, ADSB_BBOX, ADSB_RADIUS_NM,
    ADSB_REFRESH_INTERVAL, ADSB_STALE_THRESHOLD_SEC,
    RUNWAYS,
)
from models import Aircraft, AircraftStatus, WakeCategory, haversine_distance

logger = logging.getLogger("adsb_ingest")

_adsb_tracked_ids: set = set()


def _m_to_ft(m: float) -> float:
    return m * 3.28084


def _assign_runway_for_adsb(lat: float, lon: float) -> str:
    return "09L" if lat >= AIRPORT_LAT else "09R"


def _is_inbound_or_descending(state: list) -> bool:
    """Filter: only accept aircraft likely on approach to VOHS."""
    try:
        on_ground = state[8]
        if on_ground:
            return False

        baro_alt_m = state[7]
        if baro_alt_m is None:
            return False

        baro_alt_ft = _m_to_ft(baro_alt_m)
        if baro_alt_ft > 20000:
            return False

        vertical_rate = state[11]
        if vertical_rate is not None and vertical_rate < -1.0:
            return True
        if baro_alt_ft < 8000:
            return True

        return False
    except (IndexError, TypeError):
        return False


def _parse_opensky_state(state: list, sim_time: float) -> Optional[Aircraft]:
    """Parse one OpenSky state vector into an Aircraft model."""
    try:
        icao24 = state[0]
        raw_callsign = state[1]
        callsign = raw_callsign.strip() if raw_callsign else icao24.upper()
        if not callsign:
            callsign = icao24.upper()

        lon = state[5]
        lat = state[6]
        if lat is None or lon is None:
            return None

        baro_alt_m = state[7]
        altitude_ft = _m_to_ft(baro_alt_m) if baro_alt_m is not None else 5000.0

        velocity_ms = state[9]
        speed_kts = (velocity_ms * 1.94384) if velocity_ms is not None else 200.0

        heading = state[10] if state[10] is not None else 90.0
        last_contact = state[4] if state[4] is not None else sim_time

        dist_nm = haversine_distance(lat, lon, AIRPORT_LAT, AIRPORT_LON)
        if dist_nm > ADSB_RADIUS_NM:
            return None

        runway = _assign_runway_for_adsb(lat, lon)
        aircraft_id = f"ADSB-{icao24.upper()}"

        aircraft = Aircraft(
            id=aircraft_id,
            callsign=callsign,
            lat=lat,
            lon=lon,
            altitude=altitude_ft,
            speed=max(50.0, speed_kts),
            heading=heading,
            user_heading=heading,
            runway=runway,
            status=AircraftStatus.APPROACH,
            wake_category=WakeCategory.MEDIUM,
            route=[],
            current_waypoint_index=0,
            distance_to_threshold=dist_nm,
            eta=(dist_nm / max(speed_kts, 1)) * 3600,
            scheduled_arrival=sim_time + (dist_nm / max(speed_kts, 1)) * 3600,
            predicted_delay=0.0,
            instruction=f"{callsign}, ADS-B contact. Monitoring approach.",
            has_conflict=False,
            safety_percent=100.0,
            aman_heading_override=False,
            source="adsb",
            is_live=True,
            last_update_timestamp=float(last_contact),
            delay_mode="speed",
        )
        return aircraft

    except Exception as exc:
        logger.warning(f"Failed to parse ADS-B state: {exc}")
        return None


async def _fetch_opensky() -> Optional[list]:
    """Fetch raw state vectors from OpenSky REST API (no auth)."""
    params = {
        "lamin": ADSB_BBOX["lamin"],
        "lomin": ADSB_BBOX["lomin"],
        "lamax": ADSB_BBOX["lamax"],
        "lomax": ADSB_BBOX["lomax"],
    }
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(ADSB_API_URL, params=params)
            if resp.status_code == 200:
                data = resp.json()
                return data.get("states", []) or []
            else:
                logger.warning(f"OpenSky returned HTTP {resp.status_code}")
                return None
    except Exception as exc:
        logger.error(f"OpenSky fetch failed: {exc}")
        return None


async def adsb_refresh_loop(atc_state) -> None:
    """
    Background async task that continuously polls OpenSky and syncs atc_state.
    ⭐ Fetches IMMEDIATELY on start (no initial wait).
    Continues safely if API returns empty/null.
    """
    if not USE_ADSB_MODE:
        logger.info("ADS-B mode disabled — ingestion loop not started.")
        return

    logger.info(f"ADS-B ingestion started for {AIRPORT_ICAO} (radius={ADSB_RADIUS_NM} NM)")

    # ⭐ Clear any old simulation aircraft on startup
    old_ids = [ac_id for ac_id in list(atc_state.aircraft.keys())
               if not ac_id.startswith("ADSB-")]
    for ac_id in old_ids:
        atc_state.remove_aircraft(ac_id)
    if old_ids:
        logger.info(f"ADS-B startup: cleared {len(old_ids)} old simulation aircraft")

    # ⭐ Fetch immediately (no initial wait)
    await _sync_adsb(atc_state)

    while True:
        await asyncio.sleep(ADSB_REFRESH_INTERVAL)
        await _sync_adsb(atc_state)


async def _sync_adsb(atc_state) -> None:
    """Fetch and sync ADS-B aircraft into atc_state."""
    try:
        states = await _fetch_opensky()
    except Exception as exc:
        logger.error(f"ADS-B sync exception: {exc}")
        return

    if states is None:
        logger.warning("Skipping ADS-B sync — no data received.")
        return

    current_time = atc_state.simulation_time
    received_ids = set()

    for state in states:
        try:
            if not _is_inbound_or_descending(state):
                continue

            aircraft = _parse_opensky_state(state, current_time)
            if aircraft is None:
                continue

            received_ids.add(aircraft.id)

            if aircraft.id in atc_state.aircraft:
                existing = atc_state.aircraft[aircraft.id]
                existing.lat = aircraft.lat
                existing.lon = aircraft.lon
                existing.altitude = aircraft.altitude
                existing.speed = aircraft.speed
                existing.heading = aircraft.heading
                existing.last_update_timestamp = aircraft.last_update_timestamp
                existing.distance_to_threshold = aircraft.distance_to_threshold
                atc_state.aircraft[aircraft.id] = existing
            else:
                atc_state.add_aircraft(aircraft)
                _adsb_tracked_ids.add(aircraft.id)
                logger.info(f"ADS-B: New aircraft {aircraft.callsign} at {aircraft.distance_to_threshold:.1f} NM")
        except Exception as exc:
            logger.warning(f"Error processing ADS-B state: {exc}")
            continue

    # Remove stale ADS-B aircraft
    stale_ids = []
    for ac_id in list(_adsb_tracked_ids):
        ac = atc_state.aircraft.get(ac_id)
        if ac is None:
            _adsb_tracked_ids.discard(ac_id)
            continue
        age = current_time - ac.last_update_timestamp
        if ac_id not in received_ids and age > ADSB_STALE_THRESHOLD_SEC:
            stale_ids.append(ac_id)

    for ac_id in stale_ids:
        atc_state.remove_aircraft(ac_id)
        _adsb_tracked_ids.discard(ac_id)
        logger.info(f"ADS-B: Removed stale aircraft {ac_id}")

    logger.info(
        f"ADS-B sync: {len(received_ids)} inbound, "
        f"{len(stale_ids)} removed, {len(atc_state.get_active_aircraft())} total"
    )
