import { motion } from 'framer-motion';
import { Runway as RunwayType } from '@/types/aircraft';

interface RunwayProps {
  runway: RunwayType;
  scale: number;
}

export function Runway({ runway, scale }: RunwayProps) {
  const length = runway.length * scale;
  const isGreen = runway.color === 'green';
  
  return (
    <motion.div
      className="absolute flex items-center"
      style={{
        transform: `rotate(${runway.heading - 90}deg)`,
      }}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5 }}
    >
      {/* Runway strip */}
      <div
        className={`h-2 rounded-sm ${isGreen ? 'runway-green' : 'runway-amber'}`}
        style={{ width: `${length}px` }}
      />
      
      {/* Runway label */}
      <div
        className={`absolute -top-6 left-1/2 -translate-x-1/2 text-xs font-mono font-semibold whitespace-nowrap ${
          isGreen ? 'text-runway-green' : 'text-runway-amber'
        }`}
      >
        RWY {runway.name}
      </div>
    </motion.div>
  );
}
