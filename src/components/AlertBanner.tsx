import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle } from 'lucide-react';
import { Alert } from '@/types/aircraft';

interface AlertBannerProps {
  alerts: Alert[];
}

export function AlertBanner({ alerts }: AlertBannerProps) {
  const activeAlerts = alerts.filter(a => a.type === 'conflict' || a.type === 'warning');
  
  if (activeAlerts.length === 0) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="alert-banner"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
      >
        <motion.div
          animate={{ scale: [1, 1.2, 1] }}
          transition={{ duration: 1, repeat: Infinity }}
        >
          <AlertTriangle className="w-5 h-5 text-alert-red" />
        </motion.div>
        <div>
          <span className="text-alert-red font-semibold text-sm">
            {activeAlerts.length} ALERT{activeAlerts.length > 1 ? 'S' : ''}
          </span>
          <p className="text-xs text-foreground/80">
            {activeAlerts[0].message}
          </p>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
