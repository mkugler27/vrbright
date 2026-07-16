-- Create price list items (composite services) table
CREATE TABLE IF NOT EXISTS public.price_list_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type_id uuid REFERENCES public.price_list_types(id) ON DELETE SET NULL,
  size_id uuid REFERENCES public.price_list_sizes(id) ON DELETE SET NULL,
  service_id uuid REFERENCES public.price_list_services(id) ON DELETE SET NULL,
  custom_text text,
  job_id uuid REFERENCES public.price_list_jobs(id) ON DELETE SET NULL,
  type_list_id uuid REFERENCES public.price_list_type_lists(id) ON DELETE SET NULL,
  description text NOT NULL,
  worker_value numeric(10, 2) NOT NULL DEFAULT 0.00,
  show_in_proposal boolean NOT NULL DEFAULT true,
  show_worker_value boolean NOT NULL DEFAULT true,
  show_in_wo boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true,
  deleted boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.price_list_items ENABLE ROW LEVEL SECURITY;

-- Add RLS Policies (Allow all operations for development simplicity)
CREATE POLICY "Allow public select on price_list_items" ON public.price_list_items FOR SELECT USING (true);
CREATE POLICY "Allow public insert on price_list_items" ON public.price_list_items FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on price_list_items" ON public.price_list_items FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on price_list_items" ON public.price_list_items FOR DELETE USING (true);
