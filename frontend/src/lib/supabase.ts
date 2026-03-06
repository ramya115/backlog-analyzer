import { createClient } from "@supabase/supabase-js";

const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
if(!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Supabase URL and Anon Key must be set in environment variables.");
}/**
 * Initiates Google OAuth sign-in restricted to the SASTRA college domain.
 *
 * - Provider      : Google
 * - Domain lock   : hd=sastra.ac.in  (only @sastra.ac.in accounts are allowed)
 * - Redirect URL  : http://localhost:3000/dashboard
 *
 * Call this from your Sign-In button's onClick handler.
 */
export async function signInWithGoogle() {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      queryParams: {
        hd: "sastra.ac.in",   // restrict to SASTRA college domain
      },
      redirectTo: "http://localhost:3000/dashboard",
    },
  });

  if (error) {
    console.error("Google sign-in error:", error.message);
    throw error;
  }

  return data;
}
