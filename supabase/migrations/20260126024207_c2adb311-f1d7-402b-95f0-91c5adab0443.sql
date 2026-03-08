-- AMAN Simulation State Tables
-- Stores aircraft state and runway status for persistent simulation

-- Aircraft table - stores all active aircraft in simulation
CREATE TABLE public.aman_aircraft (
  id TEXT PRIMARY KEY,
  callsign TEXT NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lon DOUBLE PRECISION NOT NULL,
  altitude DOUBLE PRECISION NOT NULL DEFAULT 10000,
  speed DOUBLE PRECISION NOT NULL DEFAULT 220,
  heading DOUBLE PRECISION NOT NULL DEFAULT 90,
  runway TEXT NOT NULL CHECK (runway IN ('09L', '09R')),
  status TEXT NOT NULL DEFAULT 'APPROACHING' CHECK (status IN ('APPROACHING', 'HOLDING', 'LANDING', 'ROLLOUT', 'LANDED')),
  route JSONB NOT NULL DEFAULT '[]'::jsonb,
  current_waypoint_index INTEGER NOT NULL DEFAULT 0,
  distance_to_threshold DOUBLE PRECISION NOT NULL DEFAULT 0,
  eta DOUBLE PRECISION NOT NULL DEFAULT 0,
  sequence_number INTEGER NOT NULL DEFAULT 0,
  atc_instruction TEXT DEFAULT 'Contact Approach, radar identified.',
  has_conflict BOOLEAN NOT NULL DEFAULT false,
  safety_percent INTEGER NOT NULL DEFAULT 100,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Runway state table
CREATE TABLE public.aman_runways (
  id TEXT PRIMARY KEY CHECK (id IN ('09L', '09R')),
  occupied BOOLEAN NOT NULL DEFAULT false,
  occupying_aircraft_id TEXT REFERENCES public.aman_aircraft(id) ON DELETE SET NULL,
  last_cleared_time TIMESTAMP WITH TIME ZONE,
  clearance_lock BOOLEAN NOT NULL DEFAULT false
);

-- Simulation metadata
CREATE TABLE public.aman_simulation (
  id TEXT PRIMARY KEY DEFAULT 'main',
  tick_count INTEGER NOT NULL DEFAULT 0,
  separation_minimum INTEGER NOT NULL DEFAULT 90,
  last_tick_time TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Insert default runway states
INSERT INTO public.aman_runways (id, occupied, clearance_lock)
VALUES 
  ('09L', false, false),
  ('09R', false, false);

-- Insert default simulation state  
INSERT INTO public.aman_simulation (id, tick_count, separation_minimum)
VALUES ('main', 0, 90);

-- Enable RLS but allow public access for simulation (no auth required)
ALTER TABLE public.aman_aircraft ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aman_runways ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aman_simulation ENABLE ROW LEVEL SECURITY;

-- Public read/write access for simulation tables
CREATE POLICY "Allow public access to aircraft" ON public.aman_aircraft FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public access to runways" ON public.aman_runways FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public access to simulation" ON public.aman_simulation FOR ALL USING (true) WITH CHECK (true);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION public.update_aman_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_aman_aircraft_updated_at
BEFORE UPDATE ON public.aman_aircraft
FOR EACH ROW
EXECUTE FUNCTION public.update_aman_updated_at();

-- Enable realtime for live updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.aman_aircraft;
ALTER PUBLICATION supabase_realtime ADD TABLE public.aman_runways;