import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { 
  BarChart3, 
  Clock, 
  TrendingUp, 
  Calendar,
  Activity,
  AlertTriangle
} from 'lucide-react';
import { AnalyticsHistory } from '@/services/apiAdapter';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Legend,
} from 'recharts';

interface HistoricalAnalyticsProps {
  getAnalyticsHistory: (hours?: number) => Promise<AnalyticsHistory | null>;
}

export function HistoricalAnalytics({ getAnalyticsHistory }: HistoricalAnalyticsProps) {
  const [history, setHistory] = useState<AnalyticsHistory | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    setIsLoading(true);
    const data = await getAnalyticsHistory(6);
    setHistory(data);
    setIsLoading(false);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted-foreground">Loading analytics...</div>
      </div>
    );
  }

  if (!history) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted-foreground">No historical data available</div>
      </div>
    );
  }

  return (
    <motion.div
      className="h-full overflow-y-auto p-6 space-y-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BarChart3 className="w-6 h-6 text-primary" />
          <div>
            <h2 className="text-lg font-bold text-foreground">Historical Analytics</h2>
            <p className="text-sm text-muted-foreground">Performance metrics and trends</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Calendar className="w-4 h-4" />
          <span>Peak Hours: {history.peak_hours}</span>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-4">
        <KPICard
          icon={<Clock className="w-5 h-5" />}
          label="Avg Delay"
          value={`${history.history.reduce((sum, h) => sum + h.avg_delay, 0) / history.history.length || 0}min`}
          trend="down"
          color="text-primary"
        />
        <KPICard
          icon={<AlertTriangle className="w-5 h-5" />}
          label="Max Delay"
          value={`${Math.max(...history.history.map(h => h.max_delay))}min`}
          trend="up"
          color="text-alert-red"
        />
        <KPICard
          icon={<Activity className="w-5 h-5" />}
          label="Busiest Hour"
          value={history.busiest_hour}
          trend="neutral"
          color="text-holding-yellow"
        />
        <KPICard
          icon={<TrendingUp className="w-5 h-5" />}
          label="Top Runway"
          value={history.highest_utilization_runway}
          trend="neutral"
          color="text-landing-green"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-2 gap-6">
        {/* Delay by Hour Chart */}
        <div className="bg-card/50 backdrop-blur-sm border border-border/50 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-foreground mb-4">Delay by Hour</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={history.history}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis 
                  dataKey="hour_label" 
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={12}
                />
                <YAxis 
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={12}
                  label={{ value: 'Minutes', angle: -90, position: 'insideLeft', fill: 'hsl(var(--muted-foreground))' }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                  }}
                />
                <Area 
                  type="monotone" 
                  dataKey="avg_delay" 
                  stroke="hsl(var(--primary))" 
                  fill="hsl(var(--primary) / 0.2)"
                  name="Avg Delay"
                />
                <Area 
                  type="monotone" 
                  dataKey="max_delay" 
                  stroke="hsl(var(--destructive))" 
                  fill="hsl(var(--destructive) / 0.1)"
                  name="Max Delay"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Runway Utilization Chart */}
        <div className="bg-card/50 backdrop-blur-sm border border-border/50 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-foreground mb-4">Runway Utilization by Hour</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={history.history}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis 
                  dataKey="hour_label" 
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={12}
                />
                <YAxis 
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={12}
                  label={{ value: '%', angle: -90, position: 'insideLeft', fill: 'hsl(var(--muted-foreground))' }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                  }}
                />
                <Legend />
                <Bar 
                  dataKey="utilization_09L" 
                  fill="hsl(var(--runway-green))" 
                  name="09L"
                  radius={[4, 4, 0, 0]}
                />
                <Bar 
                  dataKey="utilization_09R" 
                  fill="hsl(var(--runway-amber))" 
                  name="09R"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Traffic vs Delay Chart */}
      <div className="bg-card/50 backdrop-blur-sm border border-border/50 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-foreground mb-4">Traffic Volume vs Delay</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={history.history}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis 
                dataKey="hour_label" 
                stroke="hsl(var(--muted-foreground))"
                fontSize={12}
              />
              <YAxis 
                yAxisId="left"
                stroke="hsl(var(--muted-foreground))"
                fontSize={12}
              />
              <YAxis 
                yAxisId="right"
                orientation="right"
                stroke="hsl(var(--muted-foreground))"
                fontSize={12}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                }}
              />
              <Legend />
              <Area 
                yAxisId="left"
                type="monotone" 
                dataKey="landings" 
                stroke="hsl(var(--primary))" 
                fill="hsl(var(--primary) / 0.3)"
                name="Landings"
              />
              <Area 
                yAxisId="right"
                type="monotone" 
                dataKey="avg_delay" 
                stroke="hsl(var(--holding-yellow))" 
                fill="hsl(var(--holding-yellow) / 0.2)"
                name="Delay (min)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Peak Hour Indicator */}
      <div className="bg-card/50 backdrop-blur-sm border border-border/50 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-foreground mb-4">Hourly Status</h3>
        <div className="flex gap-2 flex-wrap">
          {history.history.map((h) => (
            <div
              key={h.hour}
              className={`px-3 py-2 rounded-lg border ${
                h.is_peak 
                  ? 'border-alert-red/50 bg-alert-red/10' 
                  : 'border-border/50 bg-card/30'
              }`}
            >
              <div className="text-xs font-mono text-muted-foreground">{h.hour_label}</div>
              <div className={`text-sm font-bold ${h.is_peak ? 'text-alert-red' : 'text-foreground'}`}>
                {h.landings} flights
              </div>
              {h.is_peak && (
                <div className="text-[10px] text-alert-red font-semibold">PEAK</div>
              )}
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

interface KPICardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  trend: 'up' | 'down' | 'neutral';
  color: string;
}

function KPICard({ icon, label, value, trend, color }: KPICardProps) {
  return (
    <div className="bg-card/50 backdrop-blur-sm border border-border/50 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className={color}>{icon}</span>
        <span className="text-xs text-muted-foreground uppercase">{label}</span>
      </div>
      <div className={`text-2xl font-bold font-mono ${color}`}>{value}</div>
    </div>
  );
}
