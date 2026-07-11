-- VRBright DB Update — Enable Realtime replication for adjustments table
-- Run this in the Supabase SQL Editor.

ALTER PUBLICATION supabase_realtime ADD TABLE public.adjustments;
