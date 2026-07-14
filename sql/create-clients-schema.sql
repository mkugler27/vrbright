-- Create property_managements table
CREATE TABLE IF NOT EXISTS public.property_managements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  created_at timestamptz DEFAULT now()
);

-- Enable Row Level Security (RLS) on property_managements
ALTER TABLE public.property_managements ENABLE ROW LEVEL SECURITY;

-- Add RLS Policies for property_managements (Allow all authenticated users/anon for development simplicity)
CREATE POLICY "Allow public select on property_managements" ON public.property_managements FOR SELECT USING (true);
CREATE POLICY "Allow public insert on property_managements" ON public.property_managements FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on property_managements" ON public.property_managements FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on property_managements" ON public.property_managements FOR DELETE USING (true);


-- Create clients table
CREATE TABLE IF NOT EXISTS public.clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL CHECK (type IN ('commercial', 'residential')),
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  address text,
  phone text,
  email text,
  area text CHECK (area IN ('PALM BEACH', 'BROWARD', 'MIAMI-DADE', 'SAINT LUCIE')),
  units integer DEFAULT 0,
  logo_url text,
  property_management_id uuid REFERENCES public.property_managements(id) ON DELETE SET NULL,
  details text,
  
  -- Commercial Contact details
  pm_name text,
  pm_email text,
  pm_phone text,
  pm_is_main boolean DEFAULT false,
  sup_name text,
  sup_email text,
  sup_phone text,
  sup_is_main boolean DEFAULT false,
  
  -- Residential Contact details
  additional_name text,
  additional_email text,
  
  created_at timestamptz DEFAULT now()
);

-- Enable RLS on clients
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

-- Add RLS Policies for clients
CREATE POLICY "Allow public select on clients" ON public.clients FOR SELECT USING (true);
CREATE POLICY "Allow public insert on clients" ON public.clients FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on clients" ON public.clients FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on clients" ON public.clients FOR DELETE USING (true);


-- Create client_labels table (for image-description pairs in commercial clients)
CREATE TABLE IF NOT EXISTS public.client_labels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  image_url text NOT NULL,
  notes text,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS on client_labels
ALTER TABLE public.client_labels ENABLE ROW LEVEL SECURITY;

-- Add RLS Policies for client_labels
CREATE POLICY "Allow public select on client_labels" ON public.client_labels FOR SELECT USING (true);
CREATE POLICY "Allow public insert on client_labels" ON public.client_labels FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on client_labels" ON public.client_labels FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on client_labels" ON public.client_labels FOR DELETE USING (true);


-- Create storage policies for client asset uploads
INSERT INTO storage.buckets (id, name, public) 
VALUES ('client_assets', 'client_assets', true)
ON CONFLICT (id) DO NOTHING;

-- Enable public select/read of files
CREATE POLICY "Public Read client_assets" ON storage.objects FOR SELECT USING (bucket_id = 'client_assets');
CREATE POLICY "Public Insert client_assets" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'client_assets');
CREATE POLICY "Public Update client_assets" ON storage.objects FOR UPDATE USING (bucket_id = 'client_assets');
CREATE POLICY "Public Delete client_assets" ON storage.objects FOR DELETE USING (bucket_id = 'client_assets');
