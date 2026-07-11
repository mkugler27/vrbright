-- VRBright DB Update — Add qual_invoice_data column to adjustments table
-- Run this in the Supabase SQL Editor.

ALTER TABLE public.adjustments 
ADD COLUMN IF NOT EXISTS qual_invoice_data TEXT;
