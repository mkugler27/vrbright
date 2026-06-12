-- VRBright chat rewrite — DB changes
-- Run this ONCE in the Supabase SQL Editor before testing the rewritten chat.

-- 1) Add the Bubble role column on users (used to gate group creation).
ALTER TABLE users ADD COLUMN IF NOT EXISTS tipo_user_bubble TEXT;

-- 2) Email index for the teamSync lookup (Bubble email → Supabase user).
CREATE INDEX IF NOT EXISTS users_email_idx ON users(email);

-- 3) Wipe the existing test data (user authorized this).
TRUNCATE TABLE chat_files CASCADE;
TRUNCATE TABLE messages CASCADE;
TRUNCATE TABLE conversation_participants CASCADE;
TRUNCATE TABLE conversations CASCADE;
