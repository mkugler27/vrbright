-- 1. Add new columns to public.users table
ALTER TABLE public.users 
  ADD COLUMN IF NOT EXISTS nickname text,
  ADD COLUMN IF NOT EXISTS company_name text,
  ADD COLUMN IF NOT EXISTS ein text,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS dob date,
  ADD COLUMN IF NOT EXISTS date_hired date,
  ADD COLUMN IF NOT EXISTS fired_date date,
  ADD COLUMN IF NOT EXISTS works_comp_url text,
  ADD COLUMN IF NOT EXISTS works_comp_valid_until date,
  ADD COLUMN IF NOT EXISTS insurance_url text,
  ADD COLUMN IF NOT EXISTS insurance_valid_until date,
  ADD COLUMN IF NOT EXISTS requires_password_change boolean DEFAULT true;

-- 2. Create the storage bucket for user documents and avatars (if not exists)
INSERT INTO storage.buckets (id, name, public) 
VALUES ('user_docs', 'user_docs', true)
ON CONFLICT (id) DO NOTHING;

-- Enable public storage policies for user_docs bucket
DROP POLICY IF EXISTS "Public Read user_docs" ON storage.objects;
DROP POLICY IF EXISTS "Public Insert user_docs" ON storage.objects;
DROP POLICY IF EXISTS "Public Update user_docs" ON storage.objects;
DROP POLICY IF EXISTS "Public Delete user_docs" ON storage.objects;

CREATE POLICY "Public Read user_docs" ON storage.objects FOR SELECT USING (bucket_id = 'user_docs');
CREATE POLICY "Public Insert user_docs" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'user_docs');
CREATE POLICY "Public Update user_docs" ON storage.objects FOR UPDATE USING (bucket_id = 'user_docs');
CREATE POLICY "Public Delete user_docs" ON storage.objects FOR DELETE USING (bucket_id = 'user_docs');

-- 3. Create security definer function to create users from admin UI
CREATE OR REPLACE FUNCTION public.create_user_admin(
  user_email text,
  user_password text,
  user_nome text,
  user_tipo text
) RETURNS uuid AS $$
DECLARE
  new_user_id uuid;
  encrypted_pw text;
BEGIN
  -- Generate encrypted password compatible with Supabase Auth (bcrypt)
  encrypted_pw := crypt(user_password, gen_salt('bf', 10));

  -- Insert user into auth.users schema
  INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    is_super_admin,
    phone
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    gen_random_uuid(),
    'authenticated',
    'authenticated',
    user_email,
    encrypted_pw,
    now(),
    '{"provider":"email","providers":["email"]}',
    jsonb_build_object('nome', user_nome, 'role', user_tipo),
    now(),
    now(),
    false,
    NULL
  ) RETURNING id INTO new_user_id;

  -- Create public.users profile row
  INSERT INTO public.users (
    id,
    nome,
    email,
    tipo_user_bubble,
    ativo,
    requires_password_change
  ) VALUES (
    new_user_id,
    user_nome,
    user_email,
    user_tipo,
    true,
    true
  );

  RETURN new_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Enable public CRUD access on public.users
DROP POLICY IF EXISTS "Allow public select on users" ON public.users;
DROP POLICY IF EXISTS "Allow public insert on users" ON public.users;
DROP POLICY IF EXISTS "Allow public update on users" ON public.users;
DROP POLICY IF EXISTS "Allow public delete on users" ON public.users;

CREATE POLICY "Allow public select on users" ON public.users FOR SELECT USING (true);
CREATE POLICY "Allow public insert on users" ON public.users FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on users" ON public.users FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on users" ON public.users FOR DELETE USING (true);
