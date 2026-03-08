import { motion } from 'framer-motion';
import { Clock } from 'lucide-react';
import { Aircraft } from '@/types/aircraft';

interface FlightCardProps {
  aircraft: Aircraft;
  isSelected?: boolean;
  isBlinking?: boolean;
  onClick?: () => void;
}

export function FlightCard({ aircraft, isSelected, isBlinking, onClick }: FlightCardProps) {
  const formatETA = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getSafetyClass = () => {
    if (aircraft.safetyPercent >= 70) return 'high';
    if (aircraft.safetyPercent >= 40) return 'medium';
    return 'low';
  };

  const getStatusClass = () => {
    switch (aircraft.status) {
      case 'APPROACHING': return 'status-approaching';
      case 'HOLDING': return 'status-holding';
      case 'LANDED': return 'status-landed';
      default: return '';
    }
  };

  // Use real backend predicted delay (seconds → minutes)
  const predictedDelayMin = Math.round(((aircraft as any).predicted_delay ?? 0) / 60 * 10) / 10;

  const getDelayColor = (delay: number) => {
    if (delay < 2) return 'text-landing-green bg-landing-green/15 border-landing-green/40';
    if (delay <= 5) return 'text-holding-yellow bg-holding-yellow/15 border-holding-yellow/40';
    if (delay <= 10) return 'text-orange-500 bg-orange-500/15 border-orange-500/40';
    return 'text-alert-red bg-alert-red/15 border-alert-red/40';
  };

  const runwayColor = aircraft.runway === '09L' ? '#22c55e' : '#eab308';

  return (
    <motion.div
      className={`flight-card ${isSelected ? 'active' : ''} ${aircraft.hasConflict ? 'border-alert-red' : ''}`}
      onClick={onClick}
      initial={{ opacity: 0, x: 20 }}
      animate={{ 
        opacity: 1, 
        x: 0,
        boxShadow: isBlinking 
          ? [`0 0 5px ${runwayColor}`, `0 0 25px ${runwayColor}`, `0 0 5px ${runwayColor}`]
          : 'none',
        borderColor: isBlinking ? runwayColor : undefined,
        backgroundColor: isBlinking ? `${runwayColor}15` : undefined,
      }}
      whileHover={{ scale: 1.02 }}
      transition={{ 
        duration: 0.2,
        boxShadow: isBlinking ? { duration: 0.4, repeat: Infinity, repeatType: 'reverse' } : undefined,
        borderColor: isBlinking ? { duration: 0.4, repeat: Infinity, repeatType: 'reverse' } : undefined,
        backgroundColor: isBlinking ? { duration: 0.4, repeat: Infinity, repeatType: 'reverse' } : undefined,
      }}
      style={{
        borderWidth: isBlinking ? '2px' : undefined,
        borderStyle: isBlinking ? 'solid' : undefined,
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-muted-foreground">
            #{aircraft.sequenceNumber}
          </span>
          <span className="font-mono font-bold text-foreground">
            {aircraft.callsign || '—'}
          </span>
        </div>
        <span className={`status-badge ${getStatusClass()}`}>
          {aircraft.status}
        </span>
      </div>

      {/* Details grid */}
      <div className="grid grid-cols-3 gap-2 mb-2 text-xs">
        <div>
          <div className="text-muted-foreground uppercase tracking-wider text-[10px]">RWY</div>
          <div className={`font-mono font-semibold ${aircraft.runway === '09L' ? 'text-runway-green' : 'text-runway-amber'}`}>
            {aircraft.runway}
          </div>
        </div>
        <div>
          <div className="text-muted-foreground uppercase tracking-wider text-[10px]">SPD</div>
          <div className="font-mono font-semibold text-foreground">{aircraft.speed}kt</div>
        </div>
        <div>
          <div className="text-muted-foreground uppercase tracking-wider text-[10px]">ETA</div>
          <div className="font-mono font-semibold text-primary">{formatETA(aircraft.eta)}</div>
        </div>
      </div>

      {/* Predicted Delay Badge — from real backend data */}
      <div className="mb-2">
        <div className={`flex items-center gap-1.5 px-2 py-1 rounded border text-[10px] font-mono ${getDelayColor(predictedDelayMin)}`}>
          <Clock className="w-3 h-3" />
          <span className="uppercase tracking-wider">Delay:</span>
          <span className="font-bold">+{predictedDelayMin} min</span>
        </div>
      </div>

      {/* Safety bar */}
      <div className="mb-2">
        <div className="flex items-center justify-between text-[10px] mb-1">
          <span className="text-muted-foreground uppercase tracking-wider">Safety</span>
          <span className={`font-mono font-semibold ${
            aircraft.safetyPercent >= 70 ? 'text-landing-green' : 
            aircraft.safetyPercent >= 40 ? 'text-holding-yellow' : 'text-alert-red'
          }`}>
            {aircraft.safetyPercent}%
          </span>
        </div>
        <div className="safety-bar">
          <div 
            className={`safety-bar-fill ${getSafetyClass()}`}
            style={{ width: `${aircraft.safetyPercent}%` }}
          />
        </div>
      </div>

      {/* ATC Note */}
      {aircraft.atcNote && (
        <div className="text-[10px] text-muted-foreground italic border-t border-border/30 pt-2 mt-2">
          <span className="text-primary font-semibold">ATC:</span> {aircraft.atcNote}
        </div>
      )}
    </motion.div>
  );
}
