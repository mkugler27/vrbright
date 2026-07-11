-- VRBright DB Update — Create adjustments table and storage policies
-- Run this in the Supabase SQL Editor.

-- 1) Create Table
CREATE TABLE IF NOT EXISTS public.adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_email TEXT NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  description TEXT NOT NULL,
  value NUMERIC(10, 2) NOT NULL,
  invoice_code TEXT NOT NULL,
  qual_invoice_data TEXT,
  image_url TEXT,
  paid BOOLEAN NOT NULL DEFAULT FALSE,
  payment_receipt_url TEXT,
  bubble_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 2) Enable Row Level Security (RLS)
ALTER TABLE public.adjustments ENABLE ROW LEVEL SECURITY;

-- 3) Create Policies for adjustments table
DROP POLICY IF EXISTS "Workers can select their own adjustments" ON public.adjustments;
CREATE POLICY "Workers can select their own adjustments" 
  ON public.adjustments FOR SELECT 
  USING (auth.jwt() ->> 'email' = worker_email);

DROP POLICY IF EXISTS "Workers can insert their own adjustments" ON public.adjustments;
CREATE POLICY "Workers can insert their own adjustments" 
  ON public.adjustments FOR INSERT 
  WITH CHECK (auth.jwt() ->> 'email' = worker_email);

-- 4) Create Storage Bucket for receipt images
INSERT INTO storage.buckets (id, name, public) 
VALUES ('adjustment-receipts', 'adjustment-receipts', true)
ON CONFLICT (id) DO NOTHING;

-- 5) Storage Policies for adjustment-receipts bucket
DROP POLICY IF EXISTS "Public Access to Receipts" ON storage.objects;
CREATE POLICY "Public Access to Receipts" 
  ON storage.objects FOR SELECT 
  USING (bucket_id = 'adjustment-receipts');

DROP POLICY IF EXISTS "Authenticated Upload of Receipts" ON storage.objects;
CREATE POLICY "Authenticated Upload of Receipts" 
  ON storage.objects FOR INSERT 
  WITH CHECK (bucket_id = 'adjustment-receipts');

DROP POLICY IF EXISTS "Workers can delete their own adjustments" ON public.adjustments;
CREATE POLICY "Workers can delete their own adjustments" 
  ON public.adjustments FOR DELETE 
  USING (auth.jwt() ->> 'email' = worker_email);

DROP POLICY IF EXISTS "Workers can delete their own receipts" ON storage.objects;
CREATE POLICY "Workers can delete their own receipts" 
  ON storage.objects FOR DELETE 
  USING (
    bucket_id = 'adjustment-receipts' 
    AND (storage.foldername(name))[1] = auth.jwt() ->> 'email'
  );
