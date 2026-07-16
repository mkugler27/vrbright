-- VRBright DB Update — Create company_settings table and storage policies
-- Run this in the Supabase SQL Editor.

-- 1) Create Table
CREATE TABLE IF NOT EXISTS public.company_settings (
  id TEXT PRIMARY KEY DEFAULT 'default',
  name TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  city_state TEXT NOT NULL DEFAULT '',
  zip_code TEXT NOT NULL DEFAULT '',
  contact_person TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  logo_url TEXT DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 2) Enable Row Level Security (RLS)
ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;

-- 3) Create Policies for company_settings table
DROP POLICY IF EXISTS "Allow public select on company_settings" ON public.company_settings;
CREATE POLICY "Allow public select on company_settings" 
  ON public.company_settings FOR SELECT 
  USING (true);

DROP POLICY IF EXISTS "Allow public insert on company_settings" ON public.company_settings;
CREATE POLICY "Allow public insert on company_settings" 
  ON public.company_settings FOR INSERT 
  WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public update on company_settings" ON public.company_settings;
CREATE POLICY "Allow public update on company_settings" 
  ON public.company_settings FOR UPDATE 
  USING (true);

-- 4) Create Storage Bucket for company assets (logo etc) if not exists
INSERT INTO storage.buckets (id, name, public) 
VALUES ('company_assets', 'company_assets', true)
ON CONFLICT (id) DO NOTHING;

-- 5) Storage Policies for company_assets bucket
DROP POLICY IF EXISTS "Public Access to Company Assets" ON storage.objects;
CREATE POLICY "Public Access to Company Assets" 
  ON storage.objects FOR SELECT 
  USING (bucket_id = 'company_assets');

DROP POLICY IF EXISTS "Authenticated Upload of Company Assets" ON storage.objects;
CREATE POLICY "Authenticated Upload of Company Assets" 
  ON storage.objects FOR INSERT 
  WITH CHECK (bucket_id = 'company_assets');

DROP POLICY IF EXISTS "Authenticated Update of Company Assets" ON storage.objects;
CREATE POLICY "Authenticated Update of Company Assets" 
  ON storage.objects FOR UPDATE 
  USING (bucket_id = 'company_assets');

-- 6) Seed default empty record if not exists
INSERT INTO public.company_settings (id, name)
VALUES ('default', 'VR BRIGHT PAINTING & REMODELING')
ON CONFLICT (id) DO NOTHING;
