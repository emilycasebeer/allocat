import { createClient } from '@supabase/supabase-js'
import { createBrowserClient, createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { Database } from '@/lib/database.types'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Client-side Supabase client
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
    auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true
    }
})

// Server-side Supabase client with cookies
export const createServerSupabaseClient = async () => {
    const cookieStore = await cookies()

    return createServerClient<Database>(
        supabaseUrl,
        supabaseAnonKey,
        {
            cookies: {
                getAll() {
                    return cookieStore.getAll()
                },
                setAll(cookiesToSet) {
                    try {
                        cookiesToSet.forEach(({ name, value, options }) =>
                            cookieStore.set(name, value, options)
                        )
                    } catch {
                        // The `setAll` method was called from a Server Component.
                        // This can be ignored if you have middleware refreshing
                        // user sessions.
                    }
                },
            },
        }
    )
}

// Server-side client authenticated with a user's access token (for API routes).
// This sets the Authorization header so RLS policies work correctly even when
// the session is not available in cookies (e.g. bearer-token-only API calls).
export const createAuthenticatedSupabaseClient = (accessToken: string) => {
    return createClient<Database>(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: `Bearer ${accessToken}` } },
        auth: { autoRefreshToken: false, persistSession: false },
    })
}

// Browser client for client components
export const createBrowserSupabaseClient = () => {
    return createBrowserClient<Database>(
        supabaseUrl,
        supabaseAnonKey
    )
}
