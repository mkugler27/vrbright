-- VRBright DB Update — Add invoice_code to work_orders
-- Run this in the Supabase SQL Editor to add the column.

ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS invoice_code TEXT;
