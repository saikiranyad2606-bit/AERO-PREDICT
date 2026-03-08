import { motion, AnimatePresence } from 'framer-motion';
import { X, Plane, Clock, Gauge, Mountain, Navigation, AlertTriangle } from 'lucide-react';
import { Aircraft } from '@/types/aircraft';

interface FlightDetailsPopupProps {
  aircraft: Aircraft | null;
  onClose: () => void;
}

export function FlightDetailsPopup({ aircraft, onClose }: FlightDetailsPopupProps) {
  if (!aircraft) return null;

  const formatETA = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getStatusColor = () => {
    switch (aircraft.status) {
      case 'APPROACHING': return 'text-landing-green';
      case 'HOLDING': return 'text-holding-yellow';
      case 'LANDING': return 'text-primary';
      case 'ROLLOUT': return 'text-holding-yellow';
      case 'LANDED': return 'text-muted-foreground';
      default: return 'text-foreground';
    }
  };
  
  // Get phase based on distance
  const getPhase = () => {
    const dist = aircraft.distanceToThreshold || 0;
    if (dist < 5) return 'FINAL';
    if (dist < 10) return 'SHORT';
    if (dist < 20) return 'NEAR';
    return 'FAR';
  };

  return (
    <AnimatePresence>
      <motion.div
        className="absolute z-50 bg-card/95 backdrop-blur-md border border-border rounded-lg shadow-2xl p-4 min-w-[280px]"
        style={{
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
        }}
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.8 }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
              <Plane className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="font-bold text-lg text-foreground">{aircraft.callsign}</h3>
              <span className={`text-sm font-mono ${getStatusColor()}`}>{aircraft.status}</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-muted transition-colors"
          >
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        {/* Conflict Alert */}
        {aircraft.hasConflict && (
          <div className="flex items-center gap-2 p-2 mb-3 bg-alert-red/20 border border-alert-red/50 rounded text-alert-red text-sm">
            <AlertTriangle className="w-4 h-4" />
            <span>Traffic Conflict Detected</span>
          </div>
        )}

        {/* Details Grid */}
        <div className="grid grid-cols-2 gap-3">
          <div className="flex items-center gap-2 p-2 bg-muted/50 rounded">
            <Clock className="w-4 h-4 text-primary" />
            <div>
              <div className="text-[10px] text-muted-foreground">ETA</div>
              <div className="font-mono font-bold text-foreground">{formatETA(aircraft.eta)}</div>
            </div>
          </div>
          
          <div className="flex items-center gap-2 p-2 bg-muted/50 rounded">
            <Gauge className="w-4 h-4 text-primary" />
            <div>
              <div className="text-[10px] text-muted-foreground">SPEED</div>
              <div className="font-mono font-bold text-foreground">{aircraft.speed} kts</div>
            </div>
          </div>
          
          <div className="flex items-center gap-2 p-2 bg-muted/50 rounded">
            <Mountain className="w-4 h-4 text-primary" />
            <div>
              <div className="text-[10px] text-muted-foreground">ALTITUDE</div>
              <div className="font-mono font-bold text-foreground">{aircraft.altitude} ft</div>
            </div>
          </div>
          
          <div className="flex items-center gap-2 p-2 bg-muted/50 rounded">
            <Navigation className="w-4 h-4 text-primary" />
            <div>
              <div className="text-[10px] text-muted-foreground">HEADING</div>
              <div className="font-mono font-bold text-foreground">{aircraft.heading}°</div>
            </div>
          </div>
        </div>

        {/* Additional Info */}
        <div className="mt-3 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Runway</span>
            <span className={`font-mono font-bold ${aircraft.runway === '09L' ? 'text-landing-green' : 'text-holding-yellow'}`}>
              RWY {aircraft.runway}
            </span>
          </div>
          
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Phase</span>
            <span className="font-mono text-primary uppercase">{getPhase()}</span>
          </div>
          
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Distance</span>
            <span className="font-mono text-foreground">{(aircraft.distanceToThreshold || 0).toFixed(1)} NM</span>
          </div>
          
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Role</span>
            <span className={`font-mono uppercase ${aircraft.role === 'landing' ? 'text-landing-green' : 'text-holding-yellow'}`}>
              {aircraft.role}
            </span>
          </div>
          
          {/* Safety Bar */}
          <div className="mt-2">
            <div className="flex items-center justify-between text-sm mb-1">
              <span className="text-muted-foreground">Safety</span>
              <span className={`font-mono font-bold ${
                aircraft.safetyPercent >= 70 ? 'text-landing-green' : 
                aircraft.safetyPercent >= 40 ? 'text-holding-yellow' : 'text-alert-red'
              }`}>
                {aircraft.safetyPercent}%
              </span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <motion.div
                className={`h-full rounded-full ${
                  aircraft.safetyPercent >= 70 ? 'bg-landing-green' : 
                  aircraft.safetyPercent >= 40 ? 'bg-holding-yellow' : 'bg-alert-red'
                }`}
                initial={{ width: 0 }}
                animate={{ width: `${aircraft.safetyPercent}%` }}
                transition={{ duration: 0.5 }}
              />
            </div>
          </div>
        </div>

        {/* ATC Note */}
        {aircraft.atcNote && (
          <div className="mt-3 p-2 bg-primary/10 border border-primary/30 rounded text-xs text-primary">
            <span className="font-bold">ATC: </span>{aircraft.atcNote}
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
