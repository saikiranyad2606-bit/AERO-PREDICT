# AMAN Backend - Arrival Manager

A real-time Air Traffic Control Arrival Manager (AMAN) backend built with FastAPI.

## Features

- **Distance-Based Sequencing**: Aircraft are sequenced by remaining distance, not FIFO
- **20 NM Optimization Zone**: Only aircraft inside zone are actively sequenced
- **Realistic Speed Profiles**: APPROACHING (220-250kt), HOLDING (170-190kt), LANDING (130-150kt)
- **Delay-Absorption Holding**: Elongated holding routes, not circular patterns
- **Single Runway Occupancy**: Only one aircraft in LANDING/ROLLOUT per runway

## Installation

```bash
cd backend
pip install -r requirements.txt
```

## Running

```bash
python main.py
```

Server starts at `http://localhost:8000`

## API Endpoints

### Health Check
```
GET /health
```

### Get Simulation State
```
GET /sequence
```
Returns all aircraft positions, routes, and runway states.

### Add Aircraft
```
POST /aircraft
Content-Type: application/json

{
  "callsign": "UAL123",
  "runway": "09L",
  "distance_nm": 25,
  "altitude": 3000,
  "speed": 220,
  "heading": 90
}
```

### Advance Simulation
```
POST /simulate
```
Runs one tick (1 second) of simulation:
1. AI sequencing decisions
2. Physics movement
3. State transitions
4. Cleanup landed aircraft

### Reset Simulation
```
POST /reset
```

### Remove Aircraft
```
DELETE /aircraft/{aircraft_id}
```

### Get Runway State
```
GET /runway/{runway_id}
```

## Aircraft Object Structure

```json
{
  "id": "AC-1234567890-abcd",
  "callsign": "UAL123",
  "lat": 17.5,
  "lon": 78.2,
  "speed": 220,
  "heading": 90,
  "altitude": 3000,
  "runway": "09L",
  "status": "APPROACHING",
  "route": [[17.4, 78.3], [17.35, 78.35]],
  "eta": 180,
  "sequence_position": 2,
  "instruction": "Hold for sequence, expect runway 09L in 90s."
}
```

## Status Values

- `APPROACHING`: Outside optimization zone, normal approach
- `HOLDING`: Inside zone, waiting for runway (following delay route)
- `LANDING`: Cleared to land, on final approach
- `ROLLOUT`: On runway, decelerating
- `LANDED`: Vacated runway, will be removed

## Integration with Frontend

The frontend should:

1. Start a 1-second interval calling `POST /simulate`
2. After each tick, use the response (or call `GET /sequence`) to update UI
3. Use `POST /aircraft` to add new aircraft
4. Aircraft appear immediately in the response

## Architecture

```
backend/
├── main.py        # FastAPI app, endpoints
├── models.py      # Pydantic models, geometry utilities
├── state.py       # In-memory state management
├── ai_logic.py    # AMAN sequencing brain (no physics)
├── physics.py     # Movement engine (no sequencing)
├── config.py      # Airport/runway configuration
└── requirements.txt
```

## Configuration

Edit `config.py` to change:
- Airport position (default: Hyderabad VOHS)
- Runway thresholds and headings
- Speed profiles
- Separation minimums
- Turn rates

## License

MIT
