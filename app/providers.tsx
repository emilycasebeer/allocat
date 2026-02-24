'use client'

import { createContext, useContext, useEffect, useLayoutEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { Database } from '@/lib/database.types'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey)

/**
 * Read the cached Supabase user from localStorage synchronously.
 * Supabase stores the session under a key matching `sb-*-auth-token`.
 * Returns null if there is no cached session or if called server-side.
 */
function getStoredUser(): any {
    if (typeof window === 'undefined') return null
    try {
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i)
            if (key?.startsWith('sb-') && key?.endsWith('-auth-token')) {
                const stored = JSON.parse(localStorage.getItem(key) ?? 'null')
                return stored?.user ?? null
            }
        }
    } catch {
        return null
    }
    return null
}

interface AuthContextType {
    user: any
    loading: boolean
    accessToken: string | null
    signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    loading: true,
    accessToken: null,
    signOut: async () => { },
})

export const useAuth = () => useContext(AuthContext)

export function Providers({ children }: { children: React.ReactNode }) {
    // Start with null/true to match SSR output and avoid hydration mismatch.
    const [user, setUser] = useState<any>(null)
    const [loading, setLoading] = useState(true)
    // accessToken starts null and is set once the session is verified by Supabase.
    // Components should read this from context instead of calling getSession() themselves
    // to avoid concurrent getSession() calls that can deadlock during token refresh.
    const [accessToken, setAccessToken] = useState<string | null>(null)

    // Runs synchronously before the first browser paint — reads localStorage and
    // resolves auth state instantly for returning users, eliminating the spinner.
    useLayoutEffect(() => {
        setUser(getStoredUser())
        setLoading(false)
    }, [])

    useEffect(() => {
        // Verify the cached session against Supabase in the background.
        // If the token is expired, this will refresh it and update both user and accessToken.
        supabase.auth.getSession().then(({ data: { session } }) => {
            setUser(session?.user ?? null)
            setAccessToken(session?.access_token ?? null)
        })

        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            (_event, session) => {
                setUser(session?.user ?? null)
                setAccessToken(session?.access_token ?? null)
            }
        )

        return () => subscription.unsubscribe()
    }, [])

    const signOut = async () => {
        await supabase.auth.signOut()
    }

    return (
        <AuthContext.Provider value={{ user, loading, accessToken, signOut }}>
            {children}
        </AuthContext.Provider>
    )
}
