-- VRBright DB Update — Clear all adjustments and storage objects
-- Run this in the Supabase SQL Editor.

-- 1) Clear all rows in adjustments table
TRUNCATE TABLE public.adjustments RESTART IDENTITY CASCADE;

-- 2) Clear all files metadata in adjustment-receipts storage bucket
DELETE FROM storage.objects WHERE bucket_id = 'adjustment-receipts';
