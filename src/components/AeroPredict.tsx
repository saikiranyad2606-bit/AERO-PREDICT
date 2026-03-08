import { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RotateCcw, Wifi, WifiOff, Clock, Radio, Plane, PlaneTakeoff, Zap, BarChart3, Map } from 'lucide-react';
import { MapView } from '@/components/MapView';
import { FlightCard } from '@/components/FlightCard';
import { AlertBanner } from '@/components/AlertBanner';
import { AddAircraftModal } from '@/components/AddAircraftModal';
import { ATCInstructions } from '@/components/ATCInstructions';
import { AnalyticsPanel } from '@/components/AnalyticsPanel';
import { HistoricalAnalytics } from '@/components/HistoricalAnalytics';
import { Switch } from '@/components/ui/switch';
import { Aircraft, Alert } from '@/types/aircraft';
import { useAMAN } from '@/hooks/useAMAN';

type ViewMode = 'live' | 'historical';

export function AeroPredict() {
  // Backend-driven state via useAMAN hook
  const {
    aircraft,
    isConnected,
    isLoading,
    tickCount,
    error,
    analytics,
    peakHourEnabled,
    addAircraft: backendAddAircraft,
    reset: backendReset,
    togglePeakHour,
    getAnalyticsHistory,
  } = useAMAN();

  const [landedTotal, setLandedTotal] = useState(0);
  const [selectedAircraftId, setSelectedAircraftId] = useState<string | undefined>();
  const [highlightedAircraftId, setHighlightedAircraftId] = useState<string | undefined>();
  const [showDetailsPopup, setShowDetailsPopup] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('live');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const highlightTimeoutRef = useRef<number | null>(null);

  // Track landed aircraft count from backend analytics
  const prevLandedRef = useRef(0);
  useEffect(() => {
    if (analytics?.total_landed !== undefined && analytics.total_landed > prevLandedRef.current) {
      setLandedTotal(analytics.total_landed);
      prevLandedRef.current = analytics.total_landed;
    }
  }, [analytics]);

  // Fallback: track by removed aircraft
  const prevAircraftRef = useRef<Aircraft[]>([]);
  useEffect(() => {
    const prevIds = new Set(prevAircraftRef.current.map(ac => ac.id));
    const currentIds = new Set(aircraft.map(ac => ac.id));

    const removedCount = [...prevIds].filter(id => !currentIds.has(id)).length;
    if (removedCount > 0 && !analytics?.total_landed) {
      setLandedTotal(prev => prev + removedCount);
    }

    prevAircraftRef.current = aircraft;
  }, [aircraft, analytics]);

  // Update clock
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Calculate alerts
  const alerts: Alert[] = useMemo(() => {
    const conflictAircraft = aircraft.filter(ac => ac.hasConflict);
    const holdingAircraft = aircraft.filter(ac => ac.role === 'holding');

    const alertList: Alert[] = [];

    if (conflictAircraft.length > 0) {
      alertList.push({
        id: 'conflict-1',
        type: 'conflict',
        message: `${conflictAircraft.length} aircraft conflict detected - immediate action required`,
        aircraftIds: conflictAircraft.map(ac => ac.id),
      });
    }

    if (holdingAircraft.length > 1) {
      alertList.push({
        id: 'holding-1',
        type: 'warning',
        message: 'Multiple aircraft in holding - monitor spacing',
      });
    }

    if (peakHourEnabled) {
      alertList.push({
        id: 'peak-1',
        type: 'warning',
        message: 'Peak hour mode active - congestion simulation enabled',
      });
    }

    return alertList;
  }, [aircraft, peakHourEnabled]);

  // Count by runway
  const runway09LAircraft = aircraft.filter((ac) => ac.runway === '09L');
  const runway09RAircraft = aircraft.filter((ac) => ac.runway === '09R');
  const runway09LCount = runway09LAircraft.length;
  const runway09RCount = runway09RAircraft.length;
  const landedCount = analytics?.total_landed ?? landedTotal;

  // Handle add aircraft
  const handleAddAircraft = async (newAircraft: {
    callsign: string;
    runway: '09L' | '09R';
    speed: number;
    heading: number;
    altitude: number;
    distance: number;
  }) => {
    try {
      await backendAddAircraft({
        callsign: newAircraft.callsign || undefined,
        runway: newAircraft.runway,
        altitude: newAircraft.altitude,
        speed: newAircraft.speed || undefined,
        heading: newAircraft.heading || undefined,
        distanceNm: newAircraft.distance,
      });
    } catch (err) {
      console.error('Failed to add aircraft:', err);
    }
  };

  // Handle reset
  const handleReset = async () => {
    setLandedTotal(0);
    prevLandedRef.current = 0;
    setSelectedAircraftId(undefined);
    await backendReset();
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  };

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden">
      {/* Left - Map View or Historical Analytics */}
      <div className="flex-1 relative">
        {/* Top header bar */}
        <div className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-background/90 to-transparent">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Radio className="w-5 h-5 text-primary" />
              <span className="font-bold text-lg text-primary">AeroPredict</span>
            </div>
            <span className="text-muted-foreground text-sm">
              AI Arrival Sequencing & Conflict Avoidance
            </span>
          </div>

          <div className="flex items-center gap-4">
            {/* View Mode Toggle */}
            <div className="flex items-center gap-2 bg-card/50 rounded-lg px-3 py-1.5 border border-border/50">
              <button
                onClick={() => setViewMode('live')}
                className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium transition-colors ${viewMode === 'live'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
                  }`}
              >
                <Map className="w-3.5 h-3.5" />
                Live
              </button>
              <button
                onClick={() => setViewMode('historical')}
                className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium transition-colors ${viewMode === 'historical'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
                  }`}
              >
                <BarChart3 className="w-3.5 h-3.5" />
                Analytics
              </button>
            </div>

            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Plane className="w-4 h-4 text-primary" />
              <span>{aircraft.filter(ac => ac.status !== 'LANDED').length} Active</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="font-mono">Tick: {tickCount}</span>
            </div>
            <div className={`flex items-center gap-2 text-xs ${isConnected ? 'text-landing-green' : 'text-destructive'}`}>
              {isConnected ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
              <span>{isConnected ? 'Connected' : 'Disconnected'}</span>
            </div>
            <div className="flex items-center gap-2 text-sm font-mono text-foreground">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <span>{formatTime(currentTime)}</span>
            </div>
          </div>
        </div>

        {/* Live Mode Content */}
        <AnimatePresence mode="wait">
          {viewMode === 'live' ? (
            <motion.div
              key="live"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="h-full"
            >
              {/* Runway Status Boxes */}
              <div className="absolute top-16 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3">
                <div className="flex items-center gap-2 px-4 py-2 rounded-lg border border-runway-green/60 bg-runway-green/10 backdrop-blur-sm shadow-[0_0_18px_hsl(var(--runway-green)/0.35)]">
                  <div className="w-3 h-3 rounded-full bg-runway-green animate-pulse" />
                  <span className="font-mono font-bold text-runway-green">09L</span>
                  <span className="text-runway-green text-sm">
                    {runway09LCount === 0 ? 'EMPTY' : `${runway09LCount} landing`}
                  </span>
                </div>
                <div className="flex items-center gap-2 px-4 py-2 rounded-lg border border-runway-amber/60 bg-runway-amber/10 backdrop-blur-sm shadow-[0_0_18px_hsl(var(--runway-amber)/0.35)]">
                  <div className="w-3 h-3 rounded-full bg-runway-amber animate-pulse" />
                  <span className="font-mono font-bold text-runway-amber">09R</span>
                  <span className="text-runway-amber text-sm">
                    {runway09RCount === 0 ? 'EMPTY' : `${runway09RCount} landing`}
                  </span>
                </div>
                <div className="flex items-center gap-2 px-4 py-2 rounded-lg border border-primary/50 bg-primary/10 backdrop-blur-sm shadow-[0_0_14px_hsl(var(--primary)/0.25)]">
                  <PlaneTakeoff className="w-4 h-4 text-primary" />
                  <span className="text-foreground text-sm">Landed:</span>
                  <span className="font-mono font-bold text-primary">{landedCount}</span>
                </div>
              </div>

              {/* Coordinate box */}
              <motion.div
                className="coord-box absolute top-28 left-4 z-30"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
              >
                17.2403°N, 78.4294°E
              </motion.div>

              {/* Control buttons */}
              <div className="absolute top-16 right-4 z-30 flex items-center gap-2">
                {/* Peak Hour Toggle */}
                <div className="flex items-center gap-2 bg-card/80 backdrop-blur-sm border border-border/50 rounded-lg px-3 py-2">
                  <Zap className={`w-4 h-4 ${peakHourEnabled ? 'text-alert-red' : 'text-muted-foreground'}`} />
                  <span className="text-xs text-muted-foreground">Peak Hour</span>
                  <Switch
                    checked={peakHourEnabled}
                    onCheckedChange={togglePeakHour}
                    className="data-[state=checked]:bg-alert-red"
                  />
                </div>
                <button onClick={handleReset} className="btn-radar">
                  <RotateCcw className="w-4 h-4" />
                  <span className="text-sm">Reset</span>
                </button>
              </div>

              {/* Live Sequence Panel */}
              <motion.div
                className="live-panel absolute top-40 left-4 z-30 w-48"
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <div className="text-xs font-semibold text-primary uppercase tracking-wider mb-3">
                  LIVE SEQUENCE
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-runway-green" />
                    <span className="text-xs font-mono text-foreground">09L:</span>
                    <span className="text-xs font-mono text-muted-foreground">
                      {runway09LCount} active
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-runway-amber" />
                    <span className="text-xs font-mono text-foreground">09R:</span>
                    <span className="text-xs font-mono text-muted-foreground">
                      {runway09RCount} active
                    </span>
                  </div>
                </div>
              </motion.div>

              {/* Map */}
              <MapView
                aircraft={aircraft}
                selectedAircraftId={selectedAircraftId}
                highlightedAircraftId={highlightedAircraftId}
                showDetailsPopup={showDetailsPopup}
                onSelectAircraft={(id) => {
                  setSelectedAircraftId(id);
                  setShowDetailsPopup(true);
                }}
                onClosePopup={() => setShowDetailsPopup(false)}
              />
            </motion.div>
          ) : (
            <motion.div
              key="historical"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="h-full pt-16"
            >
              <HistoricalAnalytics getAnalyticsHistory={getAnalyticsHistory} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Right - Sidebar */}
      <motion.div
        className="w-80 bg-sidebar border-l border-sidebar-border flex flex-col"
        initial={{ x: 100, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
      >
        {/* Sidebar header — compact, no large heading */}
        <div className="p-3 border-b border-sidebar-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                <Radio className="w-4 h-4 text-primary" />
              </div>
              <div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">AIRPORT</div>
                <div className="font-mono font-bold text-primary text-sm">VOHS</div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider">ACTIVE RWY</div>
              <div className="font-mono font-bold text-foreground text-sm">09</div>
            </div>
          </div>
        </div>

        {/* Alerts */}
        <div className="px-3 py-2">
          <AlertBanner alerts={alerts} />
        </div>

        {/* Three equal panels: Analytics, Arrival Sequence, ATC Instructions */}
        <div className="flex-1 flex flex-col overflow-hidden min-h-0 gap-1">
          {/* AI Analytics Panel — 1/3 */}
          <div className="flex-1 min-h-0 overflow-y-auto px-3">
            <AnalyticsPanel aircraft={aircraft} landedCount={landedCount} analytics={analytics} />
          </div>

          {/* Arrival Sequence — 1/3 */}
          <div className="flex-1 min-h-0 overflow-hidden flex flex-col px-3 border-t border-sidebar-border pt-2">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              ARRIVAL SEQUENCE ({aircraft.length})
            </div>
            <div className="flex-1 overflow-y-auto space-y-2 pb-2">
              {aircraft.length > 0 ? (
                aircraft.map((ac) => (
                  <FlightCard
                    key={ac.id}
                    aircraft={ac}
                    isSelected={ac.id === selectedAircraftId}
                    isBlinking={ac.id === highlightedAircraftId}
                    onClick={() => {
                      setHighlightedAircraftId(ac.id);
                      setSelectedAircraftId(ac.id);
                      if (highlightTimeoutRef.current) {
                        window.clearTimeout(highlightTimeoutRef.current);
                      }
                      highlightTimeoutRef.current = window.setTimeout(() => {
                        setHighlightedAircraftId(undefined);
                      }, 3000);
                    }}
                  />
                ))
              ) : (
                <div className="flex flex-col items-center justify-center py-6 text-muted-foreground">
                  <PlaneTakeoff className="w-8 h-8 mb-2 opacity-30" />
                  <p className="text-xs">No aircraft in sequence</p>
                </div>
              )}
            </div>
          </div>

          {/* ATC Instructions — 1/3 */}
          <div className="flex-1 min-h-0 overflow-y-auto px-3 border-t border-sidebar-border pt-2">
            <ATCInstructions aircraft={aircraft} />
          </div>
        </div>

        {/* Add Aircraft button */}
        <div className="p-4 border-t border-sidebar-border">
          <button
            onClick={() => setIsModalOpen(true)}
            className="btn-primary-glow w-full justify-center"
          >
            <PlaneTakeoff className="w-4 h-4" />
            + Add Aircraft
          </button>
        </div>
      </motion.div>

      {/* Add Aircraft Modal */}
      <AddAircraftModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onAdd={handleAddAircraft}
      />
    </div>
  );
}

export default AeroPredict;
