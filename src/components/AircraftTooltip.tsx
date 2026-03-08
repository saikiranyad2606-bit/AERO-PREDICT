import { motion } from 'framer-motion';
import { X, Plane, Clock, Gauge, Mountain, Navigation } from 'lucide-react';
import { Aircraft } from '@/types/aircraft';

interface AircraftTooltipProps {
  aircraft: Aircraft;
  onClose: () => void;
}

export function AircraftTooltip({ aircraft, onClose }: AircraftTooltipProps) {
  const formatETA = (seconds: number) => {
    if (seconds <= 0) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getStatusColor = () => {
    switch (aircraft.status) {
      case 'APPROACHING': return 'text-landing-green';
      case 'HOLDING': return 'text-holding-yellow';
      case 'LANDED': return 'text-primary';
      default: return 'text-foreground';
    }
  };

  const getRoleColor = () => {
    return aircraft.role === 'landing' ? 'text-landing-green' : 'text-holding-yellow';
  };

  return (
    <motion.div
      className="absolute z-50 bg-card/95 backdrop-blur-md border border-border rounded-lg shadow-2xl p-3 min-w-[220px]"
      style={{
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, -50%)',
      }}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.15 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2 pb-2 border-b border-border/50">
        <div className="flex items-center gap-2">
          <Plane className="w-4 h-4 text-primary" />
          <span className="font-mono font-bold text-foreground">{aircraft.callsign}</span>
        </div>
        <button
          onClick={onClose}
          className="p-0.5 rounded hover:bg-muted transition-colors"
        >
          <X className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      {/* Compact Details */}
      <div className="space-y-1.5 text-xs">
        {/* Status & Role */}
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Status</span>
          <span className={`font-mono font-semibold uppercase ${getStatusColor()}`}>
            {aircraft.status}
          </span>
        </div>
        
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Role</span>
          <span className={`font-mono font-semibold uppercase ${getRoleColor()}`}>
            {aircraft.role}
          </span>
        </div>

        {/* Speed */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Gauge className="w-3 h-3" />
            <span>Speed</span>
          </div>
          <span className="font-mono font-semibold text-foreground">{aircraft.speed} kts</span>
        </div>

        {/* Altitude */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Mountain className="w-3 h-3" />
            <span>Altitude</span>
          </div>
          <span className="font-mono font-semibold text-foreground">{Math.round(aircraft.altitude)} ft</span>
        </div>

        {/* ETA */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Clock className="w-3 h-3" />
            <span>ETA</span>
          </div>
          <span className="font-mono font-semibold text-primary">{formatETA(aircraft.eta)}</span>
        </div>

        {/* Heading */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Navigation className="w-3 h-3" />
            <span>Heading</span>
          </div>
          <span className="font-mono font-semibold text-foreground">{Math.round(aircraft.heading)}°</span>
        </div>

        {/* Runway */}
        <div className="flex items-center justify-between pt-1.5 border-t border-border/50">
          <span className="text-muted-foreground">Runway</span>
          <span className={`font-mono font-bold ${aircraft.runway === '09L' ? 'text-landing-green' : 'text-holding-yellow'}`}>
            RWY {aircraft.runway}
          </span>
        </div>

        {/* Conflict Warning */}
        {aircraft.hasConflict && (
          <div className="mt-1.5 px-2 py-1 bg-alert-red/20 border border-alert-red/50 rounded text-alert-red text-center font-semibold">
            ⚠ TRAFFIC CONFLICT
          </div>
        )}
      </div>
    </motion.div>
  );
}
