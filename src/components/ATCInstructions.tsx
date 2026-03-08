import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Radio } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Aircraft } from '@/types/aircraft';

interface ATCInstructionsProps {
  aircraft: Aircraft[];
}

export function ATCInstructions({ aircraft }: ATCInstructionsProps) {
  // Get active aircraft with their ATC notes (from backend)
  const instructions = useMemo(() => {
    return aircraft
      .filter(ac => ac.status !== 'LANDED')
      .sort((a, b) => (a.sequenceNumber || 99) - (b.sequenceNumber || 99))
      .slice(0, 6) // Show top 6
      .map(ac => ({
        callsign: ac.callsign,
        instruction: ac.atcNote || `${ac.callsign}, radar contact.`,
        isConflict: ac.hasConflict,
        status: ac.status,
        sequence: ac.sequenceNumber || 0,
      }));
  }, [aircraft]);

  return (
    <motion.div
      className="rounded-lg border border-border bg-card/80"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <div className="flex items-center gap-2 p-2 border-b border-border/50">
        <Radio className="w-3 h-3 text-primary" />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          ATC Instructions
        </span>
      </div>

      <ScrollArea className="h-24">
        {instructions.length > 0 ? (
          <div className="p-1.5 space-y-1">
            {instructions.map((item, idx) => (
              <motion.div
                key={item.callsign}
                className={`text-[10px] font-mono px-2 py-1 rounded ${
                  item.isConflict 
                    ? 'bg-alert-red/20 text-alert-red border border-alert-red/30' 
                    : item.status === 'LANDING'
                    ? 'bg-primary/20 text-primary border border-primary/30'
                    : 'bg-muted/30 text-foreground/70'
                }`}
                initial={{ opacity: 0, x: -5 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.05 }}
              >
                {item.instruction}
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="p-2">
            <span className="text-[10px] text-muted-foreground italic">
              No active aircraft
            </span>
          </div>
        )}
      </ScrollArea>
    </motion.div>
  );
}
