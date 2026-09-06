import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// If these aren't set yet (e.g. local dev before Vercel env vars exist),
// `supabase` is null and saveResultsToSupabase() in App.jsx fails gracefully
// instead of crashing the app.
export const supabase =
  supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;
