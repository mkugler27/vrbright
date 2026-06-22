import { createClient } from '@supabase/supabase-js'

const supabase = createClient('https://bdkihcdislekrtjwwqff.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJka2loY2Rpc2xla3J0and3cWZmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA5NjIwNDYsImV4cCI6MjA5NjUzODA0Nn0.xZyIy7urMu7Frfgz-snQNbLHF9uJFBgjxXsX9oamqis')

async function test() {
  const { data, error } = await supabase
    .from('conversation_participants')
    .select('*')
    .limit(1)
  console.log(JSON.stringify(data))
}
test()
