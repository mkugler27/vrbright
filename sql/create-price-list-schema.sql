-- Create price list attributes tables
CREATE TABLE IF NOT EXISTS public.price_list_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  description text NOT NULL,
  deleted boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.price_list_sizes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  description text NOT NULL,
  deleted boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.price_list_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  description text NOT NULL,
  deleted boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.price_list_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  description text NOT NULL,
  deleted boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.price_list_type_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  description text NOT NULL,
  deleted boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.price_list_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_list_sizes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_list_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_list_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_list_type_lists ENABLE ROW LEVEL SECURITY;

-- Add RLS Policies (Allow all operations for development simplicity)
CREATE POLICY "Allow public select on price_list_types" ON public.price_list_types FOR SELECT USING (true);
CREATE POLICY "Allow public insert on price_list_types" ON public.price_list_types FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on price_list_types" ON public.price_list_types FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on price_list_types" ON public.price_list_types FOR DELETE USING (true);

CREATE POLICY "Allow public select on price_list_sizes" ON public.price_list_sizes FOR SELECT USING (true);
CREATE POLICY "Allow public insert on price_list_sizes" ON public.price_list_sizes FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on price_list_sizes" ON public.price_list_sizes FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on price_list_sizes" ON public.price_list_sizes FOR DELETE USING (true);

CREATE POLICY "Allow public select on price_list_services" ON public.price_list_services FOR SELECT USING (true);
CREATE POLICY "Allow public insert on price_list_services" ON public.price_list_services FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on price_list_services" ON public.price_list_services FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on price_list_services" ON public.price_list_services FOR DELETE USING (true);

CREATE POLICY "Allow public select on price_list_jobs" ON public.price_list_jobs FOR SELECT USING (true);
CREATE POLICY "Allow public insert on price_list_jobs" ON public.price_list_jobs FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on price_list_jobs" ON public.price_list_jobs FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on price_list_jobs" ON public.price_list_jobs FOR DELETE USING (true);

CREATE POLICY "Allow public select on price_list_type_lists" ON public.price_list_type_lists FOR SELECT USING (true);
CREATE POLICY "Allow public insert on price_list_type_lists" ON public.price_list_type_lists FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on price_list_type_lists" ON public.price_list_type_lists FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on price_list_type_lists" ON public.price_list_type_lists FOR DELETE USING (true);
