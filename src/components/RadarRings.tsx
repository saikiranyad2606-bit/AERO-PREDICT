import { motion } from 'framer-motion';

interface RadarRingsProps {
  centerX: number;
  centerY: number;
  maxRadius: number;
  rings?: number;
}

export function RadarRings({ centerX, centerY, maxRadius, rings = 5 }: RadarRingsProps) {
  const ringRadii = Array.from({ length: rings }, (_, i) => ((i + 1) / rings) * maxRadius);

  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ overflow: 'visible' }}
    >
      <defs>
        <radialGradient id="radarGradient" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="hsl(160 100% 42% / 0.05)" />
          <stop offset="100%" stopColor="hsl(160 100% 42% / 0)" />
        </radialGradient>
      </defs>
      
      {/* Background glow */}
      <circle
        cx={centerX}
        cy={centerY}
        r={maxRadius}
        fill="url(#radarGradient)"
      />
      
      {/* Concentric rings */}
      {ringRadii.map((radius, i) => (
        <motion.circle
          key={i}
          cx={centerX}
          cy={centerY}
          r={radius}
          fill="none"
          stroke="hsl(160 60% 25% / 0.4)"
          strokeWidth={1}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: i * 0.1, duration: 0.5 }}
        />
      ))}
      
      {/* Cross lines */}
      <line
        x1={centerX - maxRadius}
        y1={centerY}
        x2={centerX + maxRadius}
        y2={centerY}
        stroke="hsl(160 60% 25% / 0.2)"
        strokeWidth={1}
        strokeDasharray="4 4"
      />
      <line
        x1={centerX}
        y1={centerY - maxRadius}
        x2={centerX}
        y2={centerY + maxRadius}
        stroke="hsl(160 60% 25% / 0.2)"
        strokeWidth={1}
        strokeDasharray="4 4"
      />
      
      {/* Diagonal lines */}
      <line
        x1={centerX - maxRadius * 0.707}
        y1={centerY - maxRadius * 0.707}
        x2={centerX + maxRadius * 0.707}
        y2={centerY + maxRadius * 0.707}
        stroke="hsl(160 60% 25% / 0.15)"
        strokeWidth={1}
        strokeDasharray="4 4"
      />
      <line
        x1={centerX + maxRadius * 0.707}
        y1={centerY - maxRadius * 0.707}
        x2={centerX - maxRadius * 0.707}
        y2={centerY + maxRadius * 0.707}
        stroke="hsl(160 60% 25% / 0.15)"
        strokeWidth={1}
        strokeDasharray="4 4"
      />
      
      {/* Center point */}
      <motion.circle
        cx={centerX}
        cy={centerY}
        r={8}
        fill="hsl(160 100% 42%)"
        initial={{ scale: 0 }}
        animate={{ scale: [1, 1.2, 1] }}
        transition={{ duration: 2, repeat: Infinity }}
      />
      <circle
        cx={centerX}
        cy={centerY}
        r={4}
        fill="hsl(210 50% 5%)"
      />
    </svg>
  );
}
