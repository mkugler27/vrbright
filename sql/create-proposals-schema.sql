-- VRBright DB Update — Proposals, Templates & Client Services Schema
-- Run this in the Supabase SQL Editor.

-- 1) Create Details Templates Table
CREATE TABLE IF NOT EXISTS public.proposal_details_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- RLS for details templates
ALTER TABLE public.proposal_details_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public CRUD on proposal_details_templates" ON public.proposal_details_templates;
CREATE POLICY "Allow public CRUD on proposal_details_templates" ON public.proposal_details_templates FOR ALL USING (true) WITH CHECK (true);

-- Seed default details templates
INSERT INTO public.proposal_details_templates (title, content) VALUES
('LABOR ONLY', '• All prices included just labor.\n• 15 at 20 small holes or scratch''s we no charge extra.'),
('MATERIALS AND LABOR', '• Price includes all premium paint materials and expert labor.\n• Surface preparation, patching, and clean-up included.'),
('PAYMENT TERMS', '• 50% deposit upon acceptance of proposal.\n• 50% balance due upon completion and satisfactory walk-through.')
ON CONFLICT DO NOTHING;


-- 2) Create Proposals Table
CREATE TABLE IF NOT EXISTS public.proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  number TEXT UNIQUE NOT NULL,
  number_seq INTEGER NOT NULL,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  client_type TEXT CHECK (client_type IN ('commercial', 'residential')) NOT NULL,
  type TEXT CHECK (type IN ('price_list', 'custom')) NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'declined')),
  total_value NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  created_by TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- RLS for proposals
ALTER TABLE public.proposals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public CRUD on proposals" ON public.proposals;
CREATE POLICY "Allow public CRUD on proposals" ON public.proposals FOR ALL USING (true) WITH CHECK (true);


-- 3) Create Proposal Items Table
CREATE TABLE IF NOT EXISTS public.proposal_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  service_id UUID REFERENCES public.price_list_items(id) ON DELETE SET NULL,
  description TEXT NOT NULL DEFAULT '',
  quantity NUMERIC(10, 2),
  unit_price NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  apply_quantity BOOLEAN NOT NULL DEFAULT true,
  subtotal NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  sequence INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- RLS for proposal items
ALTER TABLE public.proposal_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public CRUD on proposal_items" ON public.proposal_items;
CREATE POLICY "Allow public CRUD on proposal_items" ON public.proposal_items FOR ALL USING (true) WITH CHECK (true);


-- 4) Create Proposal Attached Details Table (Snapshot copy of detail text)
CREATE TABLE IF NOT EXISTS public.proposal_details (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  template_id UUID REFERENCES public.proposal_details_templates(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  sequence INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- RLS for proposal details
ALTER TABLE public.proposal_details ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public CRUD on proposal_details" ON public.proposal_details;
CREATE POLICY "Allow public CRUD on proposal_details" ON public.proposal_details FOR ALL USING (true) WITH CHECK (true);


-- 5) Create Proposal Photos Table
CREATE TABLE IF NOT EXISTS public.proposal_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  description TEXT DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- RLS for proposal photos
ALTER TABLE public.proposal_photos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public CRUD on proposal_photos" ON public.proposal_photos;
CREATE POLICY "Allow public CRUD on proposal_photos" ON public.proposal_photos FOR ALL USING (true) WITH CHECK (true);


-- 6) Create Client Services Table (Approved Contracted Prices)
CREATE TABLE IF NOT EXISTS public.client_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  proposal_id UUID REFERENCES public.proposals(id) ON DELETE SET NULL,
  service_id UUID REFERENCES public.price_list_items(id) ON DELETE SET NULL,
  description TEXT NOT NULL DEFAULT '',
  unit_price NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  apply_quantity BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- RLS for client services
ALTER TABLE public.client_services ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public CRUD on client_services" ON public.client_services;
CREATE POLICY "Allow public CRUD on client_services" ON public.client_services FOR ALL USING (true) WITH CHECK (true);


-- 7) Create Client Service Logs Table (Audit Trail)
CREATE TABLE IF NOT EXISTS public.client_service_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  client_service_id UUID REFERENCES public.client_services(id) ON DELETE SET NULL,
  changed_by TEXT NOT NULL,
  action TEXT NOT NULL, -- 'update_price', 'add_service', 'delete_service', 'proposal_approved'
  details TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- RLS for client service logs
ALTER TABLE public.client_service_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public CRUD on client_service_logs" ON public.client_service_logs;
CREATE POLICY "Allow public CRUD on client_service_logs" ON public.client_service_logs FOR ALL USING (true) WITH CHECK (true);


-- 8) Create Proposal Templates Table
CREATE TABLE IF NOT EXISTS public.proposal_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT UNIQUE NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- RLS for proposal templates
ALTER TABLE public.proposal_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public CRUD on proposal_templates" ON public.proposal_templates;
CREATE POLICY "Allow public CRUD on proposal_templates" ON public.proposal_templates FOR ALL USING (true) WITH CHECK (true);


-- 9) Create Proposal Template Items Table
CREATE TABLE IF NOT EXISTS public.proposal_template_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.proposal_templates(id) ON DELETE CASCADE,
  service_id UUID REFERENCES public.price_list_items(id) ON DELETE SET NULL,
  description TEXT NOT NULL DEFAULT '',
  quantity NUMERIC(10, 2),
  unit_price NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  apply_quantity BOOLEAN NOT NULL DEFAULT true,
  sequence INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- RLS for proposal template items
ALTER TABLE public.proposal_template_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public CRUD on proposal_template_items" ON public.proposal_template_items;
CREATE POLICY "Allow public CRUD on proposal_template_items" ON public.proposal_template_items FOR ALL USING (true) WITH CHECK (true);


-- 10) Create Proposal Template Details Table
CREATE TABLE IF NOT EXISTS public.proposal_template_details (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.proposal_templates(id) ON DELETE CASCADE,
  template_detail_id UUID REFERENCES public.proposal_details_templates(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  sequence INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- RLS for proposal template details
ALTER TABLE public.proposal_template_details ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public CRUD on proposal_template_details" ON public.proposal_template_details;
CREATE POLICY "Allow public CRUD on proposal_template_details" ON public.proposal_template_details FOR ALL USING (true) WITH CHECK (true);


-- 11) Storage Configuration for proposal_photos
INSERT INTO storage.buckets (id, name, public) 
VALUES ('proposal_photos', 'proposal_photos', true)
ON CONFLICT (id) DO NOTHING;

-- RLS Policies for proposal_photos storage bucket
DROP POLICY IF EXISTS "Public Read proposal_photos" ON storage.objects;
CREATE POLICY "Public Read proposal_photos" ON storage.objects FOR SELECT USING (bucket_id = 'proposal_photos');

DROP POLICY IF EXISTS "Authenticated Insert proposal_photos" ON storage.objects;
CREATE POLICY "Authenticated Insert proposal_photos" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'proposal_photos');

DROP POLICY IF EXISTS "Authenticated Update proposal_photos" ON storage.objects;
CREATE POLICY "Authenticated Update proposal_photos" ON storage.objects FOR UPDATE USING (bucket_id = 'proposal_photos');

DROP POLICY IF EXISTS "Authenticated Delete proposal_photos" ON storage.objects;
CREATE POLICY "Authenticated Delete proposal_photos" ON storage.objects FOR DELETE USING (bucket_id = 'proposal_photos');
