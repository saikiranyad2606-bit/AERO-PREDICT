"""
AMAN State Management — Single Source of Truth.
Storage ONLY. No AI or physics logic.

Analytics:
- runway_utilization: occupied_time / simulation_time * 100
- arrival_pressure: active_aircraft / capacity * 100
- landings_per_hour: rolling 1-hour window
- avg_delay: mean of current predicted delays
- queue_length: aircraft with positive delay in APPROACH/HOLDING
"""

import time
from collections import deque
from typing import Dict, List, Optional
from models import Aircraft, RunwayStatus, AircraftStatus
from config import RUNWAYS, RUNWAY_CAPACITY_PER_HOUR


class ATCState:
    def __init__(self):
        self.reset()

    def reset(self) -> None:
        self.aircraft: Dict[str, Aircraft] = {}
        self.runways: Dict[str, RunwayStatus] = {}
        self.simulation_time: float = 0.0
        self.tick_count: int = 0
        self.start_time: float = time.time()
        self.landed_count: int = 0
        self.peak_hour_enabled: bool = False
        self.arrival_rate: float = 0.0

        # Event-driven analytics
        self.landing_events: deque = deque(maxlen=3600)
        self.landing_delay_events: deque = deque(maxlen=500)
        self._holding_aircraft: set = set()
        self._current_delays: Dict[str, float] = {}
        self.analytics_snapshots: List[dict] = []
        self._snapshot_interval: int = 5

        # Real-time windowed analytics (rolling 120 seconds for faster updates)
        self.occupancy_history: Dict[str, deque] = {r: deque(maxlen=120) for r in RUNWAYS.keys()}
        self.pressure_history: deque = deque(maxlen=120)

        for runway_id in RUNWAYS.keys():
            self.runways[runway_id] = RunwayStatus(
                id=runway_id,
                occupied=False,
                occupying_aircraft=None,
                occupying_aircraft_id=None,
                clearance_lock=False,
                last_cleared_time=0.0,
                occupied_time=0.0,
            )

    # =========================================================================
    # AIRCRAFT MANAGEMENT
    # =========================================================================

    def add_aircraft(self, aircraft: Aircraft) -> None:
        self.aircraft[aircraft.id] = aircraft

    def remove_aircraft(self, aircraft_id: str) -> Optional[Aircraft]:
        aircraft = self.aircraft.pop(aircraft_id, None)
        if aircraft:
            # Release runway if this aircraft held it
            for runway in self.runways.values():
                if runway.occupying_aircraft_id == aircraft_id:
                    self._do_clear_runway(runway.id)
            self._current_delays.pop(aircraft_id, None)
            self._holding_aircraft.discard(aircraft_id)
        return aircraft

    def get_aircraft(self, aircraft_id: str) -> Optional[Aircraft]:
        return self.aircraft.get(aircraft_id)

    def get_active_aircraft(self) -> List[Aircraft]:
        """Return all aircraft that have NOT yet vacated the runway."""
        return [
            ac for ac in self.aircraft.values()
            if ac.status != AircraftStatus.LANDED
        ]

    def get_aircraft_by_runway(self, runway_id: str) -> List[Aircraft]:
        return [ac for ac in self.aircraft.values() if ac.runway == runway_id]

    # =========================================================================
    # RUNWAY MANAGEMENT
    # =========================================================================

    def get_runway(self, runway_id: str) -> Optional[RunwayStatus]:
        return self.runways.get(runway_id)

    def set_runway_occupied(self, runway_id: str, aircraft: Aircraft) -> bool:
        """Mark runway as occupied by aircraft. Returns False if already occupied."""
        runway = self.runways.get(runway_id)
        if not runway or runway.occupied:
            return False
        runway.occupied = True
        runway.occupying_aircraft_id = aircraft.id
        runway.occupying_aircraft = aircraft.callsign
        runway.clearance_lock = True
        runway.last_cleared_time = self.simulation_time
        return True

    def clear_runway(self, runway_id: str) -> None:
        """
        Clear runway and record landing event.
        Only increments landed_count if runway was occupied — safe to call once.
        """
        runway = self.runways.get(runway_id)
        if runway and runway.occupied:
            self._do_clear_runway(runway_id)
            self.landed_count += 1
            self.landing_events.append(self.simulation_time)

    def _do_clear_runway(self, runway_id: str) -> None:
        runway = self.runways.get(runway_id)
        if runway:
            runway.occupied = False
            runway.occupying_aircraft_id = None
            runway.occupying_aircraft = None
            runway.clearance_lock = False
            # Record clear time so separation logic can enforce correct gap
            runway.last_cleared_time = self.simulation_time

    def is_runway_occupied(self, runway_id: str) -> bool:
        runway = self.runways.get(runway_id)
        return runway.occupied if runway else True

    # =========================================================================
    # ANALYTICS RECORDING
    # =========================================================================

    def record_delay(self, aircraft_id: str, delay_seconds: float) -> None:
        """Record/update the current predicted delay for an aircraft."""
        self._current_delays[aircraft_id] = delay_seconds

    def record_landing_delay(self, delay_seconds: float) -> None:
        """Record the landing delay when touchdown occurs."""
        self.landing_delay_events.append((self.simulation_time, delay_seconds))

    def record_holding_entry(self, aircraft_id: str) -> None:
        self._holding_aircraft.add(aircraft_id)

    def record_holding_exit(self, aircraft_id: str) -> None:
        self._holding_aircraft.discard(aircraft_id)

    # =========================================================================
    # SIMULATION CONTROL
    # =========================================================================

    def increment_tick(self) -> int:
        self.tick_count += 1
        self.simulation_time += 1.0

        # Update real-time history
        active_now = len(self.get_active_aircraft())
        self.pressure_history.append(active_now)

        for runway_id, runway in self.runways.items():
            # Demand-based utilization: 
            # 1 if physically occupied, OR if any aircraft is on final approach (< 12 NM)
            has_demand = any(
                ac for ac in self.aircraft.values()
                if ac.runway == runway_id and ac.distance_to_threshold < 12.0
                and ac.status in (AircraftStatus.APPROACH, AircraftStatus.LANDING)
            )
            occupied_bit = 1 if (runway.occupied or has_demand) else 0
            
            if runway_id in self.occupancy_history:
                self.occupancy_history[runway_id].append(occupied_bit)
            if runway.occupied:
                runway.occupied_time += 1.0

        # Periodic analytics snapshot
        if self.tick_count % self._snapshot_interval == 0:
            self._take_analytics_snapshot()

        return self.tick_count

    # =========================================================================
    # ANALYTICS QUERIES
    # =========================================================================

    def get_avg_delay(self) -> float:
        """Mean predicted delay across all active aircraft (seconds)."""
        delays = [v for v in self._current_delays.values() if v > 0]
        return sum(delays) / len(delays) if delays else 0.0

    def get_max_delay(self) -> float:
        delays = list(self._current_delays.values())
        return max(delays) if delays else 0.0

    def get_landings_per_hour(self) -> float:
        """Rolling 1-hour landing rate."""
        if self.simulation_time < 10:
            return 0.0
        window_start = max(0.0, self.simulation_time - 3600.0)
        # Prune old events
        while self.landing_events and self.landing_events[0] < window_start:
            self.landing_events.popleft()
        count = len(self.landing_events)
        elapsed_hours = min(self.simulation_time, 3600.0) / 3600.0
        return count / elapsed_hours if elapsed_hours > 0 else 0.0


    def get_arrival_pressure(self) -> float:
        """
        Real-time arrival pressure: Actual landings per hour vs capacity.
        For manual mode, we use (active planes * 10) as a pressure proxy
        when landings are zero.
        """
        current_rate = self.get_landings_per_hour()
        active_now = len(self.get_active_aircraft())
        
        if RUNWAY_CAPACITY_PER_HOUR <= 0 or (current_rate == 0 and active_now == 0):
            self._calculated_arrival_rate = 0.0
            return 0.0
        
        proxy_rate = active_now * 10
        effective_rate = max(current_rate, proxy_rate)
        
        # Store effective_rate so it can be exported as arrival_rate in to_response
        self._calculated_arrival_rate = effective_rate
        return min(100.0, (effective_rate / RUNWAY_CAPACITY_PER_HOUR) * 100.0)

    def get_queue_length(self) -> int:
        """Aircraft in APPROACH or HOLDING with positive predicted delay."""
        return sum(
            1 for ac in self.aircraft.values()
            if ac.status in (AircraftStatus.HOLDING, AircraftStatus.APPROACH)
            and ac.predicted_delay > 0
        )

    def get_holding_count(self) -> int:
        """Number of aircraft currently in holding patterns."""
        return len(self._holding_aircraft)

    def get_runway_utilization(self, runway_id: str) -> float:
        """
        Real-time runway utilization percentage based on instantaneous demand.
        1 aircraft on runway approach = 33.3%, 3+ aircraft = 100%.
        """
        active_count = len([ac for ac in self.aircraft.values() if ac.runway == runway_id and ac.status != AircraftStatus.LANDED])
        return min(100.0, active_count * 33.3)

    def _update_runway_stats(self) -> None:
        """Refresh queue lengths and utilization on runway objects."""
        for runway_id, runway in self.runways.items():
            runway.utilization = self.get_runway_utilization(runway_id)
            runway.queue_length = len([
                ac for ac in self.aircraft.values()
                if ac.runway == runway_id and ac.status != AircraftStatus.LANDED
            ])

    def _take_analytics_snapshot(self) -> None:
        self._update_runway_stats()
        self.analytics_snapshots.append({
            "time": self.simulation_time,
            "minute": int(self.simulation_time / 60),
            "active_count": len(self.get_active_aircraft()),
            "landed_count": self.landed_count,
            "avg_delay": round(self.get_avg_delay() / 60, 2),
            "max_delay": round(self.get_max_delay() / 60, 2),
            "landings_per_hour": round(self.get_landings_per_hour(), 1),
            "queue_length": self.get_queue_length(),
            "holding_count": self.get_holding_count(),
            "arrival_pressure": round(self.get_arrival_pressure(), 1),
            "utilization_09L": round(self.get_runway_utilization("09L"), 1),
            "utilization_09R": round(self.get_runway_utilization("09R"), 1),
        })
        # Keep last 720 snapshots (1 hour at 5-second intervals)
        if len(self.analytics_snapshots) > 720:
            self.analytics_snapshots = self.analytics_snapshots[-720:]

    def to_response(self) -> dict:
        self._update_runway_stats()
        all_ac = self.get_active_aircraft()
        all_ac.sort(key=lambda a: a.sequence_position)

        u09L = self.get_runway_utilization("09L")
        u09R = self.get_runway_utilization("09R")
        pressure = self.get_arrival_pressure()
        avg_delay = self.get_avg_delay()
        lph = self.get_landings_per_hour()

        return {
            "aircraft": [ac.to_frontend_dict() for ac in all_ac],
            "runways": [rwy.to_frontend_dict() for rwy in self.runways.values()],
            "simulation_time": self.simulation_time,
            "tick_count": self.tick_count,
            "analytics": {
                "total_active": len(all_ac),
                "totalActive": len(all_ac),
                "total_landed": self.landed_count,
                "totalLanded": self.landed_count,
                "avg_delay_min": round(avg_delay / 60, 1),
                "avg_delay": round(avg_delay / 60, 1),
                "avgDelayMin": round(avg_delay / 60, 1),
                "max_delay": round(self.get_max_delay() / 60, 1),
                "landings_per_hour": round(lph, 1),
                "landingsPerHour": round(lph, 1),
                "arrival_pressure": round(pressure, 1),
                "arrivalPressure": round(pressure, 1),
                "queue_length": self.get_queue_length(),
                "queueLength": self.get_queue_length(),
                "runway_utilization": round((u09L + u09R) / 2.0, 1),
                "runway_capacity": 30,
                "runwayCapacity": 30,
                "arrival_rate": round(getattr(self, "_calculated_arrival_rate", self.arrival_rate), 1),
                "peak_hour_enabled": self.peak_hour_enabled,
                "queue_length_09L": self.runways["09L"].queue_length,
                "queue_length_09R": self.runways["09R"].queue_length,
                "runways": {
                    "09L": {
                        "utilization": round(u09L, 1),
                        "occupied": self.runways["09L"].occupied,
                        "queue_length": self.runways["09L"].queue_length,
                    },
                    "09R": {
                        "utilization": round(u09R, 1),
                        "occupied": self.runways["09R"].occupied,
                        "queue_length": self.runways["09R"].queue_length,
                    },
                },
            },
        }


atc_state = ATCState()