import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, PlaneTakeoff, Plus } from 'lucide-react';

interface AddAircraftModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (aircraft: {
    callsign: string;
    runway: '09L' | '09R';
    speed: number;
    heading: number;
    altitude: number;
    distance: number;
  }) => void;
}

export function AddAircraftModal({ isOpen, onClose, onAdd }: AddAircraftModalProps) {
  const [callsign, setCallsign] = useState('');
  const [runway, setRunway] = useState<'09L' | '09R'>('09L');
  const [speed, setSpeed] = useState<number | ''>('');
  const [heading, setHeading] = useState<number | ''>('');
  const [altitude, setAltitude] = useState<number | ''>('');
  const [distance, setDistance] = useState<number | ''>('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Add aircraft with defaults - no required fields
    onAdd({
      callsign: callsign || '',
      runway,
      speed: Number(speed) || 220,
      heading: Number(heading) || 270, // Default heading from west
      altitude: Number(altitude) || 10000,
      distance: Number(distance) || 30,
    });
    // Reset form for next aircraft
    setCallsign('');
    setSpeed('');
    setHeading('');
    setAltitude('');
    setDistance('');
    // Close modal after adding
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="w-full max-w-md p-6 rounded-xl bg-card border border-border shadow-2xl"
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <PlaneTakeoff className="w-5 h-5 text-primary" />
                <h2 className="text-lg font-semibold text-foreground">ADD AIRCRAFT</h2>
              </div>
              <button
                onClick={onClose}
                className="p-1 rounded-lg hover:bg-muted transition-colors"
              >
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Callsign */}
              <div>
                <label className="block text-xs text-muted-foreground uppercase tracking-wider mb-1">
                  CALLSIGN
                </label>
                <input
                  type="text"
                  value={callsign}
                  onChange={(e) => setCallsign(e.target.value)}
                  className="w-full px-3 py-2 bg-input border border-border rounded-lg font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="AI-999"
                />
              </div>

              {/* Runway */}
              <div>
                <label className="block text-xs text-muted-foreground uppercase tracking-wider mb-1">
                  RUNWAY
                </label>
                <select
                  value={runway}
                  onChange={(e) => setRunway(e.target.value as '09L' | '09R')}
                  className="w-full px-3 py-2 bg-input border border-border rounded-lg font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="09L">RWY 09L (GREEN)</option>
                  <option value="09R">RWY 09R (YELLOW)</option>
                </select>
              </div>

              {/* Speed & Heading */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-muted-foreground uppercase tracking-wider mb-1">
                    SPEED (kt)
                  </label>
                  <input
                    type="number"
                    value={speed}
                    onChange={(e) => setSpeed(e.target.value ? Number(e.target.value) : '')}
                    className="w-full px-3 py-2 bg-input border border-border rounded-lg font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="--"
                  />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground uppercase tracking-wider mb-1">
                    HEADING (°)
                  </label>
                  <input
                    type="number"
                    value={heading}
                    onChange={(e) => setHeading(e.target.value ? Number(e.target.value) : '')}
                    className="w-full px-3 py-2 bg-input border border-border rounded-lg font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="--"
                  />
                </div>
              </div>

              {/* Distance & ETA */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-muted-foreground uppercase tracking-wider mb-1">
                    DISTANCE (nm)
                  </label>
                  <input
                    type="number"
                    value={distance}
                    onChange={(e) => setDistance(e.target.value ? Number(e.target.value) : '')}
                    className="w-full px-3 py-2 bg-input border border-border rounded-lg font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="--"
                  />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground uppercase tracking-wider mb-1">
                    ALTITUDE (ft)
                  </label>
                  <input
                    type="number"
                    value={altitude}
                    onChange={(e) => setAltitude(e.target.value ? Number(e.target.value) : '')}
                    className="w-full px-3 py-2 bg-input border border-border rounded-lg font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="--"
                  />
                </div>
              </div>

              {/* Submit */}
              <button
                type="submit"
                className="btn-primary-glow w-full justify-center mt-4"
              >
                <Plus className="w-4 h-4" />
                ADD TO SEQUENCE
              </button>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
