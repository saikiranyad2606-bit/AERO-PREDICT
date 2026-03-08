<<<<<<< HEAD
# AeroPredict - AMAN Arrival Sequencing Visualization

A high-fidelity Air Traffic Control (ATC) arrival sequencing simulator for Hyderabad Airport (VOHS).

## 🎯 Overview

AeroPredict is a **frontend-only** AMAN (Arrival Manager) visualization system that simulates aircraft approach, sequencing, and landing operations. The system provides a realistic radar-style interface with:

- Real-time aircraft movement simulation
- Distance-based sequencing (not FIFO)
- 20 NM optimization zone implementation
- Realistic speed profiles for different flight phases
- Conflict detection and resolution
- Route visualization

## 🚀 Quick Start

```bash
# Install dependencies
bun install

# Start development server
bun run dev
```

The application will open at `http://localhost:5173`

## 📁 Project Structure

```
src/
├── components/          # React UI components
│   ├── AeroPredict.tsx  # Main application component
│   ├── MapView.tsx      # Radar map display
│   ├── FlightCard.tsx   # Aircraft information cards
│   ├── ATCInstructions.tsx
│   └── ...
├── hooks/
│   └── useAMAN.ts       # Main simulation hook
├── mock/                # Mock simulation engine
│   ├── SimulationEngine.ts  # Core physics & sequencing
│   ├── constants.ts     # Configuration values
│   ├── utils.ts         # Geometry helpers
│   └── index.ts
├── services/
│   └── apiAdapter.ts    # Backend adapter layer
├── types/
│   └── aircraft.ts      # TypeScript definitions
└── ...
```

## 🔧 How It Works

### Simulation Engine

The mock simulation engine (`src/mock/SimulationEngine.ts`) provides:

1. **Aircraft Movement**: Realistic position updates based on speed and heading
2. **Speed Profiles**:
   - APPROACHING: 220-250 knots
   - HOLDING: 170-190 knots
   - LANDING: 130-150 knots
   - ROLLOUT: Decelerating to taxi speed

3. **Sequencing Logic**:
   - Aircraft are sorted by distance to threshold (NOT creation order)
   - 20 NM optimization zone triggers sequencing
   - Only one aircraft lands at a time per runway
   - Others hold until cleared

4. **State Updates**: 1 Hz tick rate for smooth visualization

### API Adapter Layer

The adapter (`src/services/apiAdapter.ts`) provides a clean interface:

```typescript
import { apiAdapter } from '@/services/apiAdapter';

// Get current state
const state = await apiAdapter.getAircraftState();

// Add aircraft
await apiAdapter.addAircraft({ runway: '09L', distanceNm: 25 });

// Control simulation
apiAdapter.startSimulation();
apiAdapter.stopSimulation();
```

## 🔌 Connecting a Real Backend

To connect to a real backend API:

1. Open `src/services/apiAdapter.ts`
2. Uncomment the `RealApiAdapter` class
3. Implement the API calls for your backend
4. Update the export to use `RealApiAdapter`

Example backend endpoints expected:
- `GET /aman/state` - Get current simulation state
- `POST /aman/tick` - Advance simulation
- `POST /aman/aircraft` - Add aircraft
- `DELETE /aman/aircraft/:id` - Remove aircraft
- `POST /aman/reset` - Reset simulation

## 🎮 Usage

1. **View Radar**: The main map shows aircraft positions with route lines
2. **Add Aircraft**: Click "+ Add Aircraft" to spawn new aircraft
3. **Monitor Sequence**: Sidebar shows arrival sequence sorted by distance
4. **Track Status**: Status indicators show APPROACHING → HOLDING → LANDING → ROLLOUT

## ⚙️ Configuration

Edit `src/mock/constants.ts` to adjust:

```typescript
// Airport coordinates
export const AIRPORT = {
  lat: 17.2403,
  lon: 78.4294,
};

// Speed profiles
export const PHYSICS = {
  SPEED_APPROACHING: { min: 220, max: 250 },
  SPEED_HOLDING: { min: 170, max: 190 },
  // ...
};
```

## 🛠️ Technology Stack

- **React 19** with TypeScript
- **Vite** for build tooling
- **Tailwind CSS** for styling
- **Leaflet** for map rendering
- **Framer Motion** for animations
- **shadcn-ui** for UI components

## 📋 Aircraft Data Structure

```typescript
interface Aircraft {
  id: string;
  callsign: string;
  lat: number;
  lon: number;
  altitude: number;
  speed: number;
  heading: number;
  runway: '09L' | '09R';
  status: 'APPROACHING' | 'HOLDING' | 'LANDING' | 'ROLLOUT' | 'LANDED';
  eta: number;
  distanceToThreshold: number;
  waypoints: [number, number, number][];
  sequenceNumber?: number;
}
```

## 🔮 Future Enhancements

- [ ] WebSocket real-time updates
- [ ] Multiple airport support
- [ ] Weather integration
- [ ] Traffic density controls
- [ ] Replay functionality

## How can I edit this code?

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and start prompting.

**Use your preferred IDE**

Clone this repo and push changes. The only requirement is having Bun installed - [install Bun](https://bun.sh/docs/installation)

```sh
git clone <YOUR_GIT_URL>
cd <YOUR_PROJECT_NAME>
bun install
bun run dev
```

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and click on Share -> Publish.

## 📄 License

MIT License
=======
# AeroPredict – AI Arrival Management System (AMAN)

AI-powered aviation analytics system that simulates an Arrival Management System (AMAN) used in modern air traffic management to optimize airport arrival flow and runway utilization.

---

## Project Overview

Airports frequently experience congestion when multiple aircraft arrive within a short time window. When the demand for landing exceeds runway capacity, aircraft are forced into holding patterns, increasing delays, fuel consumption, and operational costs.

AeroPredict simulates how an Arrival Management System (AMAN) manages these situations by analyzing incoming aircraft traffic and assigning optimized landing sequences based on estimated time of arrival (ETA) and runway capacity constraints.

The project demonstrates how **data-driven decision systems and AI-based analytics** can improve airport operations and air traffic flow management.

---

## Key Features

* Aircraft arrival sequencing based on ETA
* Runway capacity modeling
* Detection of holding patterns and arrival delays
* Delay and holding time analytics
* Estimated fuel burn impact from holding patterns
* Aviation operations data simulation and analysis

---

## System Architecture

Flight Data Source (Simulation / ADS-B)

↓

Arrival Processing Engine

↓

Runway Capacity Model

↓

Arrival Sequencing Algorithm

↓

Operational Analytics Engine

↓

API Output / Dashboard

---

## Technologies Used

* **Python**
* **FastAPI**
* **Aviation analytics models**
* **Flight data simulation**

---

## Installation

Clone the repository:

git clone https://github.com/yourusername/AERO-PREDICT.git

Navigate to the project directory:

cd AERO-PREDICT

Install dependencies:

pip install -r requirements.txt

Run the server:

uvicorn main:app --reload

---

## API Endpoints

**GET /health**
Returns system health status.

**GET /aircraft**
Returns current aircraft in the simulation.

**GET /analytics**
Provides operational metrics such as delays, holding aircraft, and runway utilization.

**POST /plan-routes**
Processes aircraft arrivals and generates optimized landing sequencing.

---

## Example Output

{
"airport": "VOHS",
"total_aircraft": 12,
"runway_capacity": 8,
"holding_aircraft": 3,
"average_delay_minutes": 4.2
}

---

## Project Purpose

This project explores how **Artificial Intelligence and aviation analytics** can support airport and airline operations by improving arrival flow management, reducing congestion, and enhancing runway utilization.

It demonstrates concepts similar to those used in real-world arrival management systems deployed by airlines and air navigation service providers.

---

## Future Improvements

* Integration with **live ADS-B flight data**
* Machine learning models for **arrival time prediction**
* Fuel-efficient speed optimization
* Advanced runway scheduling algorithms
* Real-time airport traffic dashboard

---

## Author

Developed as part of research and experimentation in **AI-driven aviation operations and analytics systems**.
>>>>>>> 0ffd57c13db114dc4800ec8e827193deadb6de30
