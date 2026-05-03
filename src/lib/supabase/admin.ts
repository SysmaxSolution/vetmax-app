import { createClient } from '@supabase/supabase-js'

// Service role client — bypasses RLS.
// ONLY import in server-side files (Server Actions, Route Handlers).
// NEVER expose SUPABASE_SERVICE_ROLE_KEY to the client.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}
