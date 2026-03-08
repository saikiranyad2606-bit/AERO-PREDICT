"""
AMAN AI Logic — Sequencing decisions ONLY.
No movement. No state transitions. Those are in physics.py.

EUROCONTROL AMAN Rules:
- Aircraft sorted by ETT (distance/speed)
- Sequence numbers are always stable (committed aircraft first)
- Only ONE aircraft LANDING/ROLLOUT per runway at a time
- If runway free → next sequence aircraft must directly land (when ≤ 6 NM)
- Speed reduction FIRST, holding is LAST RESORT
- Routes assigned ONCE — never reset every tick
"""

import math
from typing import List, Tuple, Optional, Dict
from models import (
    Aircraft, AircraftStatus, WakeCategory, WAKE_SEPARATION_SEC,
    haversine_distance, calculate_bearing, offset_position,
)
from state import atc_state
from config import (
    RUNWAYS, OPTIMIZATION_ZONE_NM, SEPARATION_TIME_SEC,
    SPEED_PROFILES, FINAL_APPROACH_START_NM, MIN_SEPARATION_NM,
    DELAY_SMALL_THRESHOLD_SEC, DELAY_MEDIUM_THRESHOLD_SEC, DELAY_HOLD_RELEASE_SEC,
)


def run_sequencing() -> None:
    """Main entry — called every tick BEFORE physics."""
    aircraft_list = atc_state.get_active_aircraft()
    if not aircraft_list:
        return

    # Refresh distances from actual positions
    for ac in aircraft_list:
        ac.distance_to_threshold = ac.remaining_distance_nm()

    # Group by runway (only APPROACH/HOLDING/LANDING/ROLLOUT)
    groups: Dict[str, List[Aircraft]] = {rwy: [] for rwy in RUNWAYS}
    for ac in aircraft_list:
        if ac.runway in groups and ac.status != AircraftStatus.LANDED:
            groups[ac.runway].append(ac)

    for runway_id, acs in groups.items():
        _sequence_runway(runway_id, acs)

    _detect_conflicts([ac for ac in aircraft_list if ac.status != AircraftStatus.LANDED])

    # Write back to state
    for ac in aircraft_list:
        atc_state.aircraft[ac.id] = ac


def _get_separation(leader: Aircraft, follower: Aircraft) -> float:
    """Wake turbulence separation in seconds."""
    return WAKE_SEPARATION_SEC.get(
        leader.wake_category, {}
    ).get(follower.wake_category, SEPARATION_TIME_SEC)


def _sequence_runway(runway_id: str, aircraft: List[Aircraft]) -> None:
    """
    EUROCONTROL AMAN sequencing for a single runway.
    Committed (LANDING/ROLLOUT) → first. Sequenceable (APPROACH/HOLDING) → sorted by ETT.
    """
    if not aircraft:
        return
    rc = RUNWAYS.get(runway_id)
    if not rc:
        return

    threshold = (rc["threshold_lat"], rc["threshold_lon"])

    # Split committed vs. sequenceable
    committed = [ac for ac in aircraft
                 if ac.status in (AircraftStatus.LANDING, AircraftStatus.ROLLOUT)]
    sequenceable = [ac for ac in aircraft
                    if ac.status in (AircraftStatus.APPROACH, AircraftStatus.HOLDING)]

    # Sort sequenceable by ETT (ascending = closest first)
    for ac in sequenceable:
        ac._ett = ac.compute_ett()
    sequenceable.sort(key=lambda a: a._ett)

    # Assign stable sequence numbers: committed first, then ETT order
    for idx, ac in enumerate(committed):
        ac.sequence_position = idx + 1
        ac.queue_position = 0

    # Determine if runway is occupied by a committed aircraft
    runway_occupied = len(committed) > 0

    # Estimate when runway will next be free
    base_rta = atc_state.simulation_time
    if runway_occupied:
        rollout = [ac for ac in committed if ac.status == AircraftStatus.ROLLOUT]
        landing = [ac for ac in committed if ac.status == AircraftStatus.LANDING]
        if rollout:
            # Rollout aircraft: ~ 30 seconds to vacate
            base_rta = atc_state.simulation_time + 30
        elif landing:
            ac_l = landing[0]
            time_to_thresh = (ac_l.distance_to_threshold / max(ac_l.speed, 1)) * 3600
            base_rta = atc_state.simulation_time + time_to_thresh + 35  # + rollout
    else:
        # Check separation from last cleared aircraft
        rwy = atc_state.get_runway(runway_id)
        if rwy and rwy.last_cleared_time > 0:
            since = atc_state.simulation_time - rwy.last_cleared_time
            if since < SEPARATION_TIME_SEC:
                base_rta = atc_state.simulation_time + (SEPARATION_TIME_SEC - since)

    # Assign RTA slots to sequenceable aircraft
    prev_ac: Optional[Aircraft] = committed[-1] if committed else None
    prev_rta = base_rta

    for idx, ac in enumerate(sequenceable):
        seq_num = len(committed) + idx + 1
        ac.sequence_position = seq_num
        ac.queue_position = idx

        ett = ac._ett
        # Absolute RTA must be at least (simulation_time + ETT) and satisfy separation
        if idx == 0:
            rta_abs = max(base_rta, atc_state.simulation_time + ett)
        else:
            sep = _get_separation(prev_ac, ac) if prev_ac else SEPARATION_TIME_SEC
            rta_abs = max(prev_rta + sep, atc_state.simulation_time + ett)

        rta_from_now = max(0.0, rta_abs - atc_state.simulation_time)
        ac.rta = rta_from_now
        delay = max(0.0, rta_from_now - ett)
        ac.predicted_delay = delay
        atc_state.record_delay(ac.id, delay)

        # Compute optimal speed to meet RTA
        ac.optimal_speed = _compute_optimal_speed(ac, rta_from_now)

        prev_rta = rta_abs
        prev_ac = ac

        # ── LANDING CLEARANCE DECISION ──────────────────────────────────────
        # Skip if already cleared for landing
        if getattr(ac, '_landing_cleared', False):
            continue

        # EUROCONTROL rule: runway free + first in sequence + ≤ FINAL_APPROACH_START_NM
        if (idx == 0
                and not runway_occupied
                and ac.distance_to_threshold <= FINAL_APPROACH_START_NM):
            _clear_landing(ac, runway_id, threshold, rc)
            runway_occupied = True

        elif ac.distance_to_threshold > OPTIMIZATION_ZONE_NM:
            # Far out — normal approach, speed reduction only
            _set_approach(ac, runway_id, seq_num)

        else:
            # Inside TMA but cannot land yet — absorb delay
            _absorb_delay(ac, runway_id, threshold, delay, seq_num)


def _compute_optimal_speed(ac: Aircraft, rta_from_now: float) -> float:
    """Calculate speed needed to meet RTA without holding."""
    if rta_from_now <= 0 or ac.distance_to_threshold <= 0:
        return ac.speed
    required_kts = (ac.distance_to_threshold / rta_from_now) * 3600
    profile = SPEED_PROFILES["APPROACH"]
    return max(profile["min"], min(profile["max"], required_kts))


# =============================================================================
# STATE ASSIGNMENTS
# =============================================================================

def _set_approach(ac: Aircraft, runway_id: str, seq_num: int = 0) -> None:
    """Normal approach — speed control only, no route override."""
    if ac.status in (AircraftStatus.LANDING, AircraftStatus.ROLLOUT):
        return
    # If holding with active route, let it finish before switching back
    if (ac.status == AircraftStatus.HOLDING
            and ac.route
            and ac.current_waypoint_index < len(ac.route)):
        return
    ac.status = AircraftStatus.APPROACH
    ac.aman_heading_override = False
    ac.delay_mode = "speed"

    # ATC instruction: speed reduction
    spd = int(ac.optimal_speed) if ac.optimal_speed > 0 else int(ac.speed)
    if seq_num > 0:
        ac.instruction = f"{ac.callsign}, reduce speed {spd} knots, sequence #{seq_num}."
    else:
        ac.instruction = f"{ac.callsign}, reduce speed {spd} knots."


def _clear_landing(ac: Aircraft, runway_id: str, threshold: Tuple, rc: dict) -> None:
    """
    Clear for landing — EUROCONTROL AMAN landing clearance.
    Assigns route ONCE: current position → threshold → exit.
    Snaps to threshold on touchdown (in physics.py).
    """
    ac.status = AircraftStatus.LANDING
    ac.predicted_delay = 0
    ac.delay_mode = "speed"
    ac.aman_heading_override = True
    ac._landing_cleared = True
    ac.instruction = f"{ac.callsign}, runway {runway_id} cleared to land. Wind calm."

    # Generate ILS approach route: intermediate points → threshold
    route = []
    steps = max(4, int(ac.distance_to_threshold / 1.0))
    for i in range(1, steps + 1):
        t = i / steps
        lat = ac.lat + (threshold[0] - ac.lat) * t
        lon = ac.lon + (threshold[1] - ac.lon) * t
        alt = max(0.0, ac.altitude * (1.0 - t))
        route.append([lat, lon, alt])
    # Final point: exactly at threshold, altitude 0
    route[-1] = [threshold[0], threshold[1], 0.0]

    # Rollout segment: threshold → runway exit (4 intermediate points)
    exit_lat, exit_lon = rc["exit_lat"], rc["exit_lon"]
    for i in range(1, 5):
        t = i / 4
        lat = threshold[0] + (exit_lat - threshold[0]) * t
        lon = threshold[1] + (exit_lon - threshold[1]) * t
        route.append([lat, lon, 0.0])

    ac.route = route
    ac.current_waypoint_index = 0

    # Lock the runway
    atc_state.set_runway_occupied(runway_id, ac)


def _absorb_delay(
    ac: Aircraft,
    runway_id: str,
    threshold: Tuple,
    delay: float,
    seq_num: int,
) -> None:
    """
    3-tier delay absorption strategy.
    Tier 1: Speed reduction (primary — preferred)
    Tier 2: Trombone vectoring (medium delay, 1–3 min)
    Tier 3: Holding pattern (last resort, > 3 min)
    """

    # ── Release from holding if delay dissipated ────────────────────────────
    if ac.delay_mode in ("holding", "trombone") and delay < DELAY_HOLD_RELEASE_SEC:
        ac.delay_mode = "speed"
        ac.status = AircraftStatus.APPROACH
        ac.aman_heading_override = False
        ac.route = []
        ac.current_waypoint_index = 0
        spd = int(ac.optimal_speed) if ac.optimal_speed > 0 else int(ac.speed)
        ac.instruction = (
            f"{ac.callsign}, #{seq_num}. Holding cancelled, resume approach. "
            f"Reduce speed {spd} knots."
        )
        atc_state.record_holding_exit(ac.id)
        return

    # ── Tier 1: Speed reduction ──────────────────────────────────────────────
    profile = SPEED_PROFILES["APPROACH"]
    min_speed_nm_per_sec = profile["min"] / 3600.0
    time_at_min_speed = (
        (ac.distance_to_threshold / profile["min"]) * 3600
        if profile["min"] > 0 else 0
    )
    max_speed_absorption_sec = time_at_min_speed - ac._ett  # extra time by flying min speed

    if delay <= max(max_speed_absorption_sec, DELAY_SMALL_THRESHOLD_SEC):
        ac.delay_mode = "speed"
        if ac.status != AircraftStatus.HOLDING:
            ac.status = AircraftStatus.APPROACH
        ac.aman_heading_override = False
        spd = int(ac.optimal_speed) if ac.optimal_speed > 0 else int(ac.speed)
        ac.instruction = (
            f"{ac.callsign}, #{seq_num}. Reduce speed {spd} knots. "
            f"{int(delay)}s delay."
        )
        return

    # ── Tier 2: Trombone vectoring ───────────────────────────────────────────
    if delay <= DELAY_MEDIUM_THRESHOLD_SEC:
        ac.delay_mode = "trombone"
        # Only generate route if none active or completed
        if not ac.route or ac.current_waypoint_index >= len(ac.route) - 1:
            ac.route = _generate_trombone(ac, threshold, delay, runway_id)
            ac.current_waypoint_index = 0
        ac.status = AircraftStatus.HOLDING
        ac.aman_heading_override = True
        ac.instruction = (
            f"{ac.callsign}, #{seq_num}. Vectoring for spacing. "
            f"{round(delay / 60, 1)} min delay."
        )
        return

    # ── Tier 3: Holding (last resort) ────────────────────────────────────────
    prev_mode = ac.delay_mode
    ac.delay_mode = "holding"
    if (not ac.route
            or ac.current_waypoint_index >= len(ac.route) - 1
            or prev_mode != "holding"):
        ac.route = _generate_trombone(ac, threshold, delay, runway_id)
        ac.current_waypoint_index = 0
        atc_state.record_holding_entry(ac.id)

    ac.status = AircraftStatus.HOLDING
    ac.aman_heading_override = True
    ac.instruction = (
        f"{ac.callsign}, #{seq_num}. Hold present position. "
        f"{round(delay / 60, 1)} min delay. "
        f"Maintain {int(ac.altitude)} ft."
    )


def _generate_trombone(
    ac: Aircraft,
    threshold: Tuple,
    delay_sec: float,
    runway_id: str,
) -> List[List[float]]:
    """
    Smooth trombone/racetrack route.
    lateral offset → downwind → base → FAF → threshold
    Does NOT loop — ends at runway threshold.
    """
    rc = RUNWAYS.get(runway_id)
    if not rc:
        return [[threshold[0], threshold[1], 50.0]]

    rwy_hdg = rc["heading"]
    hold_speed = SPEED_PROFILES["HOLDING"]["target"]
    extra_nm = (delay_sec / 3600.0) * hold_speed
    downwind_nm = max(3.0, min(25.0, extra_nm / 2.0))

    offset_dir = 1 if runway_id == "09L" else -1
    lat_bearing = (rwy_hdg + 90 * offset_dir) % 360
    opp_lat_bearing = (lat_bearing + 180) % 360
    approach_bearing = (rwy_hdg + 180) % 360
    lat_offset_nm = 3.0

    faf = offset_position(threshold[0], threshold[1], approach_bearing, FINAL_APPROACH_START_NM)
    hold_alt = min(ac.altitude, 5000.0)

    route = []
    # 1: lateral abeam offset
    abeam = offset_position(ac.lat, ac.lon, lat_bearing, lat_offset_nm)
    route.append([abeam[0], abeam[1], hold_alt])
    # 2: downwind leg
    dw = offset_position(abeam[0], abeam[1], approach_bearing, downwind_nm)
    route.append([dw[0], dw[1], 4000.0])
    # 3: base turn
    base = offset_position(dw[0], dw[1], opp_lat_bearing, lat_offset_nm)
    route.append([base[0], base[1], 3500.0])
    # 4: Final Approach Fix
    route.append([faf[0], faf[1], 2500.0])
    # 5: Threshold
    route.append([threshold[0], threshold[1], 50.0])

    return route


# =============================================================================
# CONFLICT DETECTION
# =============================================================================

def _detect_conflicts(aircraft: List[Aircraft]) -> None:
    """Minimum separation check — sets has_conflict flag on model."""
    for i, ac1 in enumerate(aircraft):
        min_sep = float("inf")
        conflict = False
        for j, ac2 in enumerate(aircraft):
            if i == j:
                continue
            h = haversine_distance(ac1.lat, ac1.lon, ac2.lat, ac2.lon)
            v = abs(ac1.altitude - ac2.altitude)
            if h < MIN_SEPARATION_NM and v < 1000:
                conflict = True
            if h < min_sep:
                min_sep = h
        ac1.has_conflict = conflict
        ac1.safety_percent = (
            min(100.0, max(0.0, (min_sep / MIN_SEPARATION_NM) * 100.0))
            if len(aircraft) > 1 else 100.0
        )


# =============================================================================
# STATE TRANSITIONS (post-physics cleanup)
# =============================================================================

def process_state_transitions() -> None:
    """
    Post-physics cleanup.
    Remove LANDED aircraft from state.
    NOTE: Runway is already cleared by physics.py when aircraft exits (ROLLOUT→LANDED).
    Do NOT call clear_runway() here — that would double-count the landing event.
    """
    # Iterate over ALL aircraft in state to find those that are LANDED
    to_remove = [
        ac_id
        for ac_id, ac in atc_state.aircraft.items()
        if ac.status == AircraftStatus.LANDED
    ]
    for ac_id in to_remove:
        atc_state.remove_aircraft(ac_id)
