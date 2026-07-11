-- VRBright DB Update — Add delete policies for adjustments and storage objects
-- Run this in the Supabase SQL Editor.

-- 1) Create DELETE policy for public.adjustments table
DROP POLICY IF EXISTS "Workers can delete their own adjustments" ON public.adjustments;
CREATE POLICY "Workers can delete their own adjustments" 
  ON public.adjustments FOR DELETE 
  USING (auth.jwt() ->> 'email' = worker_email);

-- 2) Create DELETE policy for storage.objects (adjustment-receipts bucket)
DROP POLICY IF EXISTS "Workers can delete their own receipts" ON storage.objects;
CREATE POLICY "Workers can delete their own receipts" 
  ON storage.objects FOR DELETE 
  USING (
    bucket_id = 'adjustment-receipts' 
    AND (storage.foldername(name))[1] = auth.jwt() ->> 'email'
  );
