import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envFile = fs.existsSync('.env.local') ? fs.readFileSync('.env.local', 'utf-8') : fs.readFileSync('.env', 'utf-8');
const env = {};
envFile.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) env[match[1]] = match[2].trim();
});

const supabaseUrl = env['VITE_SUPABASE_URL'];
const supabaseKey = env['VITE_SUPABASE_ANON_KEY'];

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing environment variables.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log("Deletando conversas de WO...");
  const { error: convErr } = await supabase.from('conversations').delete().eq('tipo', 'wo');
  if (convErr) console.error("Erro em conversations:", convErr);

  console.log("Deletando work orders...");
  const { error: woErr } = await supabase.from('work_orders').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (woErr) console.error("Erro em work_orders:", woErr);

  console.log("Limpeza concluída.");
}

main();
