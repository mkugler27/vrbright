-- Add work_order_id to messages table
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS work_order_id text;

-- Create an index to optimize filtering by work_order_id
CREATE INDEX IF NOT EXISTS idx_messages_work_order_id ON public.messages(work_order_id);
