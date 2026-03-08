import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { BarChart3, Clock, Plane, TrendingUp, Gauge, Timer } from 'lucide-react';
import { Aircraft } from '@/types/aircraft';

interface AnalyticsPanelProps {
  aircraft: Aircraft[];
  landedCount: number;
  analytics?: {
    total_active: number;
    total_landed: number;
    avg_delay: number;
    max_delay: number;
    runway_capacity: number;
    landings_per_hour: number;
    arrival_rate: number;
    peak_hour_enabled: boolean;
    queue_length_09L: number;
    queue_length_09R: number;
    arrival_pressure?: number;
    queue_length?: number;
    runway_utilization?: number;
  } | null;
}

export function AnalyticsPanel({ aircraft, landedCount, analytics }: AnalyticsPanelProps) {
  // All analytics from backend only — no fake fallbacks
  const avgDelay = analytics?.avg_delay ?? 0;
  const landingsPerHour = Math.round(analytics?.landings_per_hour ?? 0);
  const runway09LQueue = analytics?.queue_length_09L ?? 0;
  const runway09RQueue = analytics?.queue_length_09R ?? 0;
  const runwayCapacity = analytics?.runway_capacity ?? 30;
  const arrivalRate = analytics?.arrival_rate ?? 0;

  // Real utilization = actual landings/hr ÷ capacity × 100
  const utilizationPercent = useMemo(() => {
    if (analytics?.runway_utilization !== undefined) return Math.round(analytics.runway_utilization);
    if (runwayCapacity > 0 && landingsPerHour > 0) {
      return Math.min(100, Math.round((landingsPerHour / runwayCapacity) * 100));
    }
    return 0;
  }, [analytics, runwayCapacity, landingsPerHour]);

  // Real arrival pressure = aircraft_inside_TMA / capacity
  const arrivalPressure = useMemo(() => {
    if (analytics?.arrival_pressure !== undefined) return Math.round(analytics.arrival_pressure);
    const totalQueue = runway09LQueue + runway09RQueue;
    if (runwayCapacity > 0) return Math.min(100, Math.round((totalQueue / runwayCapacity) * 100));
    return 0;
  }, [analytics, runway09LQueue, runway09RQueue, runwayCapacity]);

  const getLoadStatus = (pressure: number) => {
    if (pressure < 40) return { text: 'LOW', color: 'text-landing-green' };
    if (pressure < 70) return { text: 'MEDIUM', color: 'text-holding-yellow' };
    return { text: 'HIGH', color: 'text-alert-red' };
  };

  const getDelayColor = (delay: number) => {
    if (delay < 2) return 'text-landing-green';
    if (delay < 5) return 'text-holding-yellow';
    if (delay < 10) return 'text-orange-500';
    return 'text-alert-red';
  };

  const loadStatus = getLoadStatus(arrivalPressure);

  return (
    <motion.div
      className="bg-card/50 backdrop-blur-sm border border-border/50 rounded-lg p-3"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="flex items-center gap-2 mb-3">
        <BarChart3 className="w-4 h-4 text-primary" />
        <span className="text-xs font-semibold text-primary uppercase tracking-wider">
          AI Analytics
        </span>
        {analytics?.peak_hour_enabled && (
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-alert-red/20 text-alert-red animate-pulse">
            PEAK
          </span>
        )}
      </div>

      <div className="space-y-2">
        {/* Runway Utilization */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Gauge className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Runway Utilization</span>
          </div>
          <span className={`text-xs font-bold font-mono ${
            utilizationPercent > 90 ? 'text-alert-red' :
            utilizationPercent > 70 ? 'text-holding-yellow' : 'text-landing-green'
          }`}>
            {utilizationPercent}%
          </span>
        </div>

        {/* Arrival Pressure */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Arrival Pressure</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-xs font-bold font-mono ${loadStatus.color}`}>
              {arrivalPressure}%
            </span>
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${loadStatus.color} bg-current/10`}>
              {loadStatus.text}
            </span>
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-1.5 bg-muted/30 rounded-full overflow-hidden">
          <motion.div
            className={`h-full rounded-full ${
              arrivalPressure < 40 ? 'bg-landing-green' :
              arrivalPressure < 70 ? 'bg-holding-yellow' : 'bg-alert-red'
            }`}
            initial={{ width: 0 }}
            animate={{ width: `${arrivalPressure}%` }}
            transition={{ duration: 0.5 }}
          />
        </div>

        {/* Queue Length */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Timer className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Queue Length</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-runway-green" />
              <span className="text-xs font-mono text-muted-foreground">{runway09LQueue}</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-runway-amber" />
              <span className="text-xs font-mono text-muted-foreground">{runway09RQueue}</span>
            </div>
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border/30">
          <div className="flex items-center gap-2">
            <Clock className="w-3.5 h-3.5 text-muted-foreground" />
            <div>
              <div className="text-[10px] text-muted-foreground uppercase">Avg Delay</div>
              <div className={`text-sm font-bold font-mono ${getDelayColor(avgDelay)}`}>
                {avgDelay > 0 ? `+${avgDelay.toFixed(1)} min` : '0 min'}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Plane className="w-3.5 h-3.5 text-muted-foreground" />
            <div>
              <div className="text-[10px] text-muted-foreground uppercase">Landings/hr</div>
              <div className="text-sm font-bold font-mono text-primary">
                {landingsPerHour}
              </div>
            </div>
          </div>
        </div>

        {/* Capacity info */}
        <div className="flex items-center justify-between pt-2 border-t border-border/30 text-[10px]">
          <span className="text-muted-foreground">
            Capacity: <span className="font-mono text-foreground">{runwayCapacity}/hr</span>
          </span>
          <span className="text-muted-foreground">
            Arrivals: <span className="font-mono text-foreground">{arrivalRate}/hr</span>
          </span>
        </div>
      </div>
    </motion.div>
  );
}
