"""
AMAN Data Models
"""

from enum import Enum
from typing import List, Optional, Tuple
from pydantic import BaseModel, Field, PrivateAttr
import math

from config import EARTH_RADIUS_NM, RUNWAYS


class AircraftStatus(str, Enum):
    APPROACH = "APPROACH"
    HOLDING = "HOLDING"
    LANDING = "LANDING"
    ROLLOUT = "ROLLOUT"
    LANDED = "LANDED"


class WakeCategory(str, Enum):
    HEAVY = "HEAVY"
    MEDIUM = "MEDIUM"
    LIGHT = "LIGHT"


WAKE_SEPARATION_SEC = {
    WakeCategory.HEAVY:  {WakeCategory.HEAVY: 96,  WakeCategory.MEDIUM: 120, WakeCategory.LIGHT: 150},
    WakeCategory.MEDIUM: {WakeCategory.HEAVY: 60,  WakeCategory.MEDIUM: 90,  WakeCategory.LIGHT: 120},
    WakeCategory.LIGHT:  {WakeCategory.HEAVY: 60,  WakeCategory.MEDIUM: 60,  WakeCategory.LIGHT: 90},
}


class Aircraft(BaseModel):
    id: str
    callsign: str
    lat: float
    lon: float
    altitude: float = 10000
    speed: float = 235
    heading: float = 90
    user_heading: float = 90
    runway: str = "09L"
    status: AircraftStatus = AircraftStatus.APPROACH
    wake_category: WakeCategory = WakeCategory.MEDIUM

    # Route — assigned ONCE by AI, NOT reset every tick
    route: List[List[float]] = Field(default_factory=list)
    current_waypoint_index: int = 0

    # Sequencing
    sequence_position: int = 0
    queue_position: int = 0

    # Timing
    eta: float = 0.0
    rta: float = 0.0
    predicted_delay: float = 0.0
    scheduled_arrival: float = 0.0

    # Speed control
    target_speed: float = 235
    optimal_speed: float = 0.0

    # ATC
    instruction: str = "Contact Approach, radar identified."
    aman_heading_override: bool = False

    # Metrics
    distance_to_threshold: float = 0.0
    has_conflict: bool = False
    safety_percent: float = 100.0

    # Data source
    source: str = "simulation"
    is_live: bool = False
    last_update_timestamp: float = 0.0
    delay_mode: str = "speed"

    # Internal private attrs (not serialised, Pydantic V2 style)
    _ett: float = PrivateAttr(default=0.0)
    _landing_cleared: bool = PrivateAttr(default=False)
    _last_spoken_status: Optional[AircraftStatus] = PrivateAttr(default=None)

    model_config = {"arbitrary_types_allowed": True}

    def remaining_distance_nm(self) -> float:
        rc = RUNWAYS.get(self.runway)
        if not rc:
            return 0.0
        return haversine_distance(self.lat, self.lon, rc["threshold_lat"], rc["threshold_lon"])

    def compute_ett(self) -> float:
        dist = self.remaining_distance_nm()
        if self.speed <= 0:
            return 99999
        return (dist / self.speed) * 3600

    def to_frontend_dict(self) -> dict:
        status_map = {
            "APPROACH": "APPROACHING",
            "HOLDING": "HOLDING",
            "LANDING": "LANDING",
            "ROLLOUT": "ROLLOUT",
            "LANDED": "LANDED",
        }
        remaining_wps = self.route[self.current_waypoint_index:] if self.route else []
        return {
            "id": self.id,
            "callsign": self.callsign,
            "lat": round(self.lat, 6),
            "lon": round(self.lon, 6),
            "altitude": round(self.altitude, 0),
            "speed": round(self.speed, 1),
            "heading": round(self.heading, 1),
            "runway": self.runway,
            "status": status_map.get(self.status.value, self.status.value),
            "role": "landing" if self.status in (AircraftStatus.LANDING, AircraftStatus.ROLLOUT) else "holding",
            "eta": round(max(0, self.eta), 0),
            "safetyPercent": round(self.safety_percent, 0),
            "distanceToThreshold": round(max(0, self.distance_to_threshold), 2),
            "waypoints": [[wp[0], wp[1], wp[2] if len(wp) > 2 else 0] for wp in remaining_wps],
            "atcNote": self.instruction,
            "hasConflict": self.has_conflict,
            "sequenceNumber": self.sequence_position,
            "predicted_delay": round(max(0, self.predicted_delay), 0),
            "queue_position": self.queue_position,
            "delay_mode": self.delay_mode,
            "is_live": self.is_live,
            "source": self.source,
        }


class RunwayStatus(BaseModel):
    id: str
    occupied: bool = False
    occupying_aircraft: Optional[str] = None
    occupying_aircraft_id: Optional[str] = None
    clearance_lock: bool = False
    last_cleared_time: float = 0.0
    queue_length: int = 0
    utilization: float = 0.0
    occupied_time: float = 0.0

    def to_frontend_dict(self) -> dict:
        return {
            "id": self.id,
            "occupied": self.occupied,
            "occupying_aircraft": self.occupying_aircraft,
            "occupyingAircraftId": self.occupying_aircraft_id,
            "queue_length": self.queue_length,
            "utilization": round(self.utilization, 1),
        }


class AddAircraftRequest(BaseModel):
    callsign: str
    lat: Optional[float] = None
    lon: Optional[float] = None
    distance_nm: Optional[float] = 30.0
    altitude: Optional[float] = 10000
    speed: Optional[float] = 235
    heading: Optional[float] = 90
    runway: str = "09L"


# =============================================================================
# GEOMETRY
# =============================================================================

def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    d_lat = math.radians(lat2 - lat1)
    d_lon = math.radians(lon2 - lon1)
    a = (math.sin(d_lat / 2) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
         math.sin(d_lon / 2) ** 2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return EARTH_RADIUS_NM * c


def calculate_bearing(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    d_lon = math.radians(lon2 - lon1)
    y = math.sin(d_lon) * math.cos(math.radians(lat2))
    x = (math.cos(math.radians(lat1)) * math.sin(math.radians(lat2)) -
         math.sin(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.cos(d_lon))
    bearing = math.degrees(math.atan2(y, x))
    return (bearing + 360) % 360


def offset_position(lat: float, lon: float, bearing_deg: float, distance_nm: float) -> Tuple[float, float]:
    bearing_rad = math.radians(bearing_deg)
    d_lat_deg = (distance_nm / 60) * math.cos(bearing_rad)
    d_lon_deg = (distance_nm / (60 * math.cos(math.radians(lat)))) * math.sin(bearing_rad)
    return (lat + d_lat_deg, lon + d_lon_deg)


def normalize_heading(heading: float) -> float:
    return ((heading % 360) + 360) % 360
