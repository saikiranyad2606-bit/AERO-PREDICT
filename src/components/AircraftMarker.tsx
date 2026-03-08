import { motion } from 'framer-motion';
import { Plane } from 'lucide-react';
import { Aircraft } from '@/types/aircraft';

interface AircraftMarkerProps {
  aircraft: Aircraft;
  isSelected?: boolean;
  onClick?: () => void;
}

export function AircraftMarker({ aircraft, isSelected, onClick }: AircraftMarkerProps) {
  const getMarkerClass = () => {
    if (aircraft.hasConflict) return 'conflict';
    if (aircraft.status === 'LANDING' || aircraft.status === 'ROLLOUT') return 'landing';
    if (aircraft.status === 'HOLDING') return 'holding';
    return '';
  };

  const getColor = () => {
    if (aircraft.hasConflict) return 'hsl(0 85% 55%)';
    if (aircraft.status === 'LANDING' || aircraft.status === 'ROLLOUT') return 'hsl(160 100% 42%)';
    if (aircraft.status === 'HOLDING') return 'hsl(45 93% 47%)';
    return 'hsl(180 100% 50%)';
  };

  const formatETA = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Get phase based on distance to threshold (from backend)
  const getPhase = () => {
    const dist = aircraft.distanceToThreshold || 0;
    if (dist < 5) return 'FINAL';
    if (dist < 10) return 'SHORT';
    if (dist < 20) return 'NEAR';
    return 'FAR';
  };

  const getPhaseColor = () => {
    const dist = aircraft.distanceToThreshold || 0;
    if (dist < 5) return 'text-alert-red';
    if (dist < 10) return 'text-holding-yellow';
    if (dist < 20) return 'text-primary';
    return 'text-landing-green';
  };

  return (
    <motion.div
      className={`aircraft-marker ${getMarkerClass()} cursor-pointer`}
      onClick={onClick}
      initial={{ opacity: 0, scale: 0 }}
      animate={{ 
        opacity: 1, 
        scale: isSelected ? 1.3 : 1,
      }}
      whileHover={{ scale: 1.2 }}
      transition={{ duration: 0.3 }}
    >
      {/* Aircraft icon */}
      <motion.div
        style={{ transform: `rotate(${aircraft.heading}deg)` }}
        animate={aircraft.hasConflict ? { opacity: [1, 0.3, 1] } : {}}
        transition={aircraft.hasConflict ? { duration: 0.5, repeat: Infinity } : {}}
      >
        <Plane
          size={24}
          fill={getColor()}
          color={getColor()}
          style={{ filter: `drop-shadow(0 0 6px ${getColor()})` }}
        />
      </motion.div>
      
      {/* Info label */}
      <div className="absolute left-8 top-0 flex flex-col gap-0.5 whitespace-nowrap">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs font-bold text-foreground">
            {aircraft.callsign}
          </span>
          <span className={`font-mono text-[10px] ${getPhaseColor()}`}>
            {getPhase()}
          </span>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-mono">
          <span>ETA {formatETA(aircraft.eta)}</span>
          <span className={aircraft.safetyPercent >= 70 ? 'text-landing-green' : aircraft.safetyPercent >= 40 ? 'text-holding-yellow' : 'text-alert-red'}>
            {aircraft.safetyPercent}%
          </span>
        </div>
      </div>
    </motion.div>
  );
}
