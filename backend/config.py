"""
AMAN Configuration — VOHS (Hyderabad)
All distances: NM, speeds: knots, altitudes: feet, time: seconds
"""

# =============================================================================
# AIRPORT
# =============================================================================
AIRPORT_ICAO = "VOHS"
AIRPORT_LAT = 17.2403
AIRPORT_LON = 78.4294

AIRPORT = {
    "code": AIRPORT_ICAO,
    "name": "Rajiv Gandhi International Airport",
    "lat": AIRPORT_LAT,
    "lon": AIRPORT_LON,
    "elevation_ft": 2024,
}

RUNWAYS = {
    "09L": {
        "id": "09L",
        "heading": 90,
        "threshold_lat": 17.2500,
        "threshold_lon": 78.3800,
        "exit_lat": 17.2500,
        "exit_lon": 78.4800,
        "length_nm": 5.7,
        "color": "green",
    },
    "09R": {
        "id": "09R",
        "heading": 90,
        "threshold_lat": 17.2300,
        "threshold_lon": 78.3800,
        "exit_lat": 17.2300,
        "exit_lon": 78.4800,
        "length_nm": 5.7,
        "color": "amber",
    },
}

# =============================================================================
# ADS-B (disabled for simulation mode)
# =============================================================================
USE_ADSB_MODE = False
ADSB_REFRESH_INTERVAL = 10
ADSB_RADIUS_NM = 80
ADSB_API_URL = "https://opensky-network.org/api/states/all"
ADSB_BBOX = {
    "lamin": AIRPORT_LAT - 1.5,
    "lomin": AIRPORT_LON - 1.5,
    "lamax": AIRPORT_LAT + 1.5,
    "lomax": AIRPORT_LON + 1.5,
}
ADSB_STALE_THRESHOLD_SEC = 30

# =============================================================================
# SEQUENCING
# =============================================================================
FINAL_APPROACH_START_NM = 6.0
OPTIMIZATION_ZONE_NM = 20.0
MIN_SEPARATION_NM = 5.0
SEPARATION_TIME_SEC = 90
THRESHOLD_TOLERANCE_NM = 0.05
WAYPOINT_CAPTURE_NM = 0.03

# =============================================================================
# DELAY ABSORPTION
# =============================================================================
DELAY_SMALL_THRESHOLD_SEC = 60
DELAY_MEDIUM_THRESHOLD_SEC = 180
DELAY_HOLD_RELEASE_SEC = 90

# =============================================================================
# SPEED PROFILES (knots)
# =============================================================================
SPEED_PROFILES = {
    "APPROACH": {"min": 140, "max": 250, "target": 235},
    "HOLDING":  {"min": 140, "max": 190, "target": 180},
    "LANDING":  {"min": 130, "max": 160, "target": 145},
    "ROLLOUT":  {"initial": 120, "decel_rate": 8, "taxi": 15},
    "LANDED":   {"speed": 0},
}

# =============================================================================
# PHYSICS
# =============================================================================
MAX_TURN_RATE_DEG_SEC = 3.0
SPEED_TRANSITION_RATE = 2.0
TICK_INTERVAL_SEC = 1.0
EARTH_RADIUS_NM = 3440.065
NM_PER_DEGREE_LAT = 60.0
DESCENT_RATE_FT_PER_NM = 300
FINAL_DESCENT_RATE = 500

# =============================================================================
# ANALYTICS / CAPACITY
# =============================================================================
RUNWAY_CAPACITY_PER_HOUR = 30
PEAK_HOUR_START = 18
PEAK_HOUR_END = 22
NORMAL_ARRIVAL_RATE = 0
PEAK_ARRIVAL_RATE = 0
