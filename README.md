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
