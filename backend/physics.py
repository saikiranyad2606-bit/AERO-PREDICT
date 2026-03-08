"""
AMAN Physics Engine — Movement + State Transitions ONLY.
No sequencing decisions. Those are in ai_logic.py.

Per-tick order:
  1. update_speed
  2. update_heading
  3. update_position
  4. update_altitude
  5. check_waypoint_capture
  6. check_state_transitions
  7. update_eta
  8. update_atc_instruction  (dynamic ATC text)
"""

from models import (
    Aircraft, AircraftStatus,
    haversine_distance, calculate_bearing, offset_position, normalize_heading,
)
from state import atc_state
from config import (
    RUNWAYS, MAX_TURN_RATE_DEG_SEC, SPEED_TRANSITION_RATE,
    SPEED_PROFILES, WAYPOINT_CAPTURE_NM, THRESHOLD_TOLERANCE_NM,
    DESCENT_RATE_FT_PER_NM, FINAL_DESCENT_RATE,
)


# =====================================================================
# MAIN LOOP
# =====================================================================

def run_physics(delta_time: float = 1.0) -> None:
    """Update every active aircraft for one simulation tick."""
    for ac in atc_state.get_active_aircraft():

        if ac.status == AircraftStatus.LANDED:
            ac.speed = 0.0
            continue

        if ac.source == "adsb":
            # ADS-B aircraft: just refresh derived fields
            ac.distance_to_threshold = ac.remaining_distance_nm()
            _update_eta(ac)
            continue

        _update_speed(ac, delta_time)
        _update_heading(ac, delta_time)
        _update_position(ac, delta_time)
        _update_altitude(ac, delta_time)
        _check_waypoint_capture(ac)
        _check_state_transitions(ac)

        ac.distance_to_threshold = ac.remaining_distance_nm()
        _update_eta(ac)
        _update_atc_instruction(ac)

        atc_state.aircraft[ac.id] = ac


# =====================================================================
# SPEED
# =====================================================================

def _update_speed(ac: Aircraft, dt: float) -> None:
    target = _get_target_speed(ac)
    diff = target - ac.speed
    max_change = SPEED_TRANSITION_RATE * dt

    if abs(diff) <= max_change:
        ac.speed = target
    elif diff > 0:
        ac.speed += max_change
    else:
        ac.speed -= max_change

    ac.speed = max(0.0, ac.speed)


def _get_target_speed(ac: Aircraft) -> float:
    """Target speed by phase of flight."""

    if ac.status in (AircraftStatus.APPROACH, AircraftStatus.HOLDING):
        if ac.optimal_speed > 0:
            return ac.optimal_speed
        if ac.status == AircraftStatus.APPROACH:
            return SPEED_PROFILES["APPROACH"]["target"]
        return SPEED_PROFILES["HOLDING"]["target"]

    if ac.status == AircraftStatus.LANDING:
        return SPEED_PROFILES["LANDING"]["target"]

    if ac.status == AircraftStatus.ROLLOUT:
        rc = RUNWAYS.get(ac.runway)
        if rc:
            runway_len = haversine_distance(
                rc["threshold_lat"], rc["threshold_lon"],
                rc["exit_lat"], rc["exit_lon"],
            )
            dist_exit = haversine_distance(
                ac.lat, ac.lon,
                rc["exit_lat"], rc["exit_lon"],
            )
            # Decelerate smoothly:
            # Maintain ~100 kts for first 80% of runway, then
            # decelerate linearly: 100 -> 20 kts over final 20% of runway.
            decel_start = max(0.5, runway_len * 0.20)  # begin braking 20% from exit
            if dist_exit > decel_start:
                return 100.0
            return max(20.0, 20.0 + (dist_exit / decel_start) * 80.0)
        return 100.0

    return 0.0


# =====================================================================
# HEADING
# =====================================================================

def _update_heading(ac: Aircraft, dt: float) -> None:
    target = _get_target_heading(ac)
    if target is None:
        return

    diff = target - ac.heading
    if diff > 180:
        diff -= 360
    elif diff < -180:
        diff += 360

    max_turn = MAX_TURN_RATE_DEG_SEC * dt

    if abs(diff) <= max_turn:
        ac.heading = target
    elif diff > 0:
        ac.heading += max_turn
    else:
        ac.heading -= max_turn

    ac.heading = normalize_heading(ac.heading)


def _get_target_heading(ac: Aircraft) -> float:
    rc = RUNWAYS.get(ac.runway)
    if not rc:
        return ac.heading

    # ROLLOUT: heading locked to runway heading at all times
    if ac.status == AircraftStatus.ROLLOUT:
        return rc["heading"]

    # LANDING: follow route → threshold
    if ac.status == AircraftStatus.LANDING:
        if ac.route and ac.current_waypoint_index < len(ac.route):
            wp = ac.route[ac.current_waypoint_index]
            return calculate_bearing(ac.lat, ac.lon, wp[0], wp[1])
        return rc["heading"]

    # APPROACH & HOLDING with AI route override
    if ac.aman_heading_override and ac.route and ac.current_waypoint_index < len(ac.route):
        wp = ac.route[ac.current_waypoint_index]
        return calculate_bearing(ac.lat, ac.lon, wp[0], wp[1])

    # APPROACH: steer direct threshold when < 20 NM, else user heading
    if ac.status == AircraftStatus.APPROACH:
        if ac.distance_to_threshold < 20.0:
            return calculate_bearing(ac.lat, ac.lon, rc["threshold_lat"], rc["threshold_lon"])
        return ac.user_heading

    return calculate_bearing(ac.lat, ac.lon, rc["threshold_lat"], rc["threshold_lon"])


# =====================================================================
# POSITION
# =====================================================================

def _update_position(ac: Aircraft, dt: float) -> None:
    if ac.speed <= 0:
        return

    dist_nm = (ac.speed / 3600.0) * dt
    new_lat, new_lon = offset_position(ac.lat, ac.lon, ac.heading, dist_nm)
    ac.lat = new_lat
    ac.lon = new_lon


# =====================================================================
# ALTITUDE
# =====================================================================

def _update_altitude(ac: Aircraft, dt: float) -> None:
    if ac.status in (AircraftStatus.ROLLOUT, AircraftStatus.LANDED):
        ac.altitude = 0.0
        return

    target = _target_altitude(ac)

    if ac.altitude > target:
        rate = FINAL_DESCENT_RATE if ac.status == AircraftStatus.LANDING else DESCENT_RATE_FT_PER_NM
        descent = (ac.speed / 3600.0) * dt * rate
        ac.altitude = max(target, ac.altitude - descent)
    elif ac.altitude < target:
        ac.altitude = min(target, ac.altitude + 100.0 * dt)


def _target_altitude(ac: Aircraft) -> float:
    d = ac.distance_to_threshold

    if ac.status == AircraftStatus.APPROACH:
        return max(3500.0, 10000.0 - max(0.0, 20.0 - d) * 325.0) if d <= 20 else 10000.0

    if ac.status == AircraftStatus.HOLDING:
        return 4000.0

    if ac.status == AircraftStatus.LANDING:
        # 3° glidepath: ~300 ft per NM
        return max(0.0, d * 300.0)

    return 0.0


# =====================================================================
# WAYPOINT CAPTURE
# =====================================================================

def _check_waypoint_capture(ac: Aircraft) -> None:
    """Advance waypoint index when within capture distance."""
    if not ac.route or ac.current_waypoint_index >= len(ac.route):
        return

    wp = ac.route[ac.current_waypoint_index]
    dist = haversine_distance(ac.lat, ac.lon, wp[0], wp[1])

    if dist < WAYPOINT_CAPTURE_NM:
        ac.current_waypoint_index += 1


# =====================================================================
# STATE TRANSITIONS
# =====================================================================

def _check_state_transitions(ac: Aircraft) -> None:
    """
    APPROACH → LANDING: handled by ai_logic (_clear_landing).
    LANDING  → ROLLOUT: touchdown when within threshold tolerance.
    ROLLOUT  → LANDED:  when aircraft reaches runway exit.
    """
    rc = RUNWAYS.get(ac.runway)
    if not rc:
        return

    thresh = (rc["threshold_lat"], rc["threshold_lon"])
    exit_pos = (rc["exit_lat"], rc["exit_lon"])

    dist_thresh = haversine_distance(ac.lat, ac.lon, *thresh)
    dist_exit = haversine_distance(ac.lat, ac.lon, *exit_pos)

    # ── TOUCHDOWN ────────────────────────────────────────────────────────────
    if ac.status == AircraftStatus.LANDING and dist_thresh <= THRESHOLD_TOLERANCE_NM:
        # Snap to threshold
        ac.lat = thresh[0]
        ac.lon = thresh[1]
        ac.heading = rc["heading"]
        ac.altitude = 0.0
        ac.status = AircraftStatus.ROLLOUT
        ac.instruction = f"{ac.callsign}, touchdown runway {ac.runway}. Reduce speed, vacate at end."
        atc_state.record_landing_delay(ac.predicted_delay)

        # Advance waypoint index past threshold — rollout navigates by heading alone
        if ac.route:
            for wi, wp in enumerate(ac.route):
                if abs(wp[0] - thresh[0]) < 0.0001 and abs(wp[1] - thresh[1]) < 0.0001:
                    ac.current_waypoint_index = wi + 1
                    break

        return

    # ── RUNWAY EXIT ─────────────────────────────────────────────────────────
    # Use a generous tolerance (0.15 NM) so aircraft reliably triggers at runway end
    _EXIT_TOLERANCE_NM = 0.15
    if ac.status == AircraftStatus.ROLLOUT and dist_exit <= _EXIT_TOLERANCE_NM:
        # Snap aircraft cleanly to the runway exit point
        ac.lat = exit_pos[0]
        ac.lon = exit_pos[1]
        ac.speed = 0.0
        ac.altitude = 0.0
        ac.eta = 0.0
        ac.status = AircraftStatus.LANDED
        ac.instruction = f"{ac.callsign}, vacated runway {ac.runway}. Contact ground 121.7."

        # Clear runway immediately so next aircraft can land
        atc_state.clear_runway(ac.runway)


# =====================================================================
# ETA
# =====================================================================

def _update_eta(ac: Aircraft) -> None:
    if ac.status in (AircraftStatus.ROLLOUT, AircraftStatus.LANDED):
        ac.eta = 0.0
        return
    if ac.speed <= 0:
        ac.eta = 0.0
        return
    ac.eta = (ac.distance_to_threshold / ac.speed) * 3600.0


# =====================================================================
# ATC INSTRUCTION — dynamic update
# =====================================================================

# How often (in simulation ticks) to rebroadcast the same ATC instruction
_ATC_REBROADCAST_TICKS = 30


def _update_atc_instruction(ac: Aircraft) -> None:
    """
    Dynamically refresh ATC instruction text.
    Enqueues voice on:
    - Status changes (APPROACH -> LANDING)
    - Distance milestones (every 5 NM)
    - Speed instruction changes
    """
    # 1. Update text (happens every tick for ETA changes)
    if ac.status == AircraftStatus.APPROACH:
        spd = int(ac.optimal_speed) if ac.optimal_speed > 0 else int(ac.speed)
        eta_min = int(ac.eta / 60) if ac.eta > 0 else 0
        ac.instruction = f"{ac.callsign}, reduce speed {spd} knots. ETA {eta_min} minutes, runway {ac.runway}."
    elif ac.status == AircraftStatus.HOLDING:
        ac.instruction = f"{ac.callsign}, hold position at {int(ac.altitude)} feet. Sequence #{ac.sequence_position}."
    elif ac.status == AircraftStatus.LANDING:
        dist = round(ac.distance_to_threshold, 1)
        ac.instruction = f"{ac.callsign}, cleared to land runway {ac.runway}, {dist} miles final."
    elif ac.status == AircraftStatus.ROLLOUT:
        ac.instruction = f"{ac.callsign}, vacate at end. Contact ground 121.7."