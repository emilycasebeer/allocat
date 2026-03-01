'use client'

import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { Database } from '@/lib/database.types'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey)

/**
 * Read the cached Supabase session from localStorage synchronously.
 * Supabase stores the session under a key matching `sb-*-auth-token`.
 * Returns null if there is no cached session or if called server-side.
 * `isExpired` is true if the access token's `expires_at` has passed —
 * in that case we should NOT skip the loading state, because getSession()
 * may be able to refresh the token and produce a valid session.
 */
function getStoredSession(): { user: any; isExpired: boolean } | null {
    if (typeof window === 'undefined') return null
    try {
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i)
            if (key?.startsWith('sb-') && key?.endsWith('-auth-token')) {
                const stored = JSON.parse(localStorage.getItem(key) ?? 'null')
                if (!stored?.user) return null
                // expires_at is a Unix timestamp in seconds
                const isExpired = !stored.expires_at || stored.expires_at * 1000 < Date.now()
                return { user: stored.user, isExpired }
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

type Theme = 'dark' | 'light'

interface ThemeContextType {
    theme: Theme
    setTheme: (theme: Theme) => void
}

const ThemeContext = createContext<ThemeContextType>({
    theme: 'dark',
    setTheme: () => { },
})

export const useTheme = () => useContext(ThemeContext)

export function Providers({ children }: { children: React.ReactNode }) {
    // Start with null/true to match SSR output and avoid hydration mismatch.
    const [user, setUser] = useState<any>(null)
    const [loading, setLoading] = useState(true)
    // accessToken starts null and is set once the session is verified by Supabase.
    // Components should read this from context instead of calling getSession() themselves
    // to avoid concurrent getSession() calls that can deadlock during token refresh.
    const [accessToken, setAccessToken] = useState<string | null>(null)

    const [theme, setThemeState] = useState<Theme>('dark')

    // Track the previous user to detect when user changes
    const prevUserRef = useRef<any>(null)

    const setTheme = (newTheme: Theme) => {
        setThemeState(newTheme)
        localStorage.setItem('allocat-theme', newTheme)
        document.documentElement.classList.toggle('dark', newTheme === 'dark')
        document.documentElement.classList.toggle('light', newTheme === 'light')
    }

    // Runs synchronously before the first browser paint.
    // For a valid non-expired session: resolve loading immediately so returning users
    // see their dashboard without a spinner.
    // For no session: resolve loading immediately so logged-out users see LoginPage without a spinner.
    // For an expired session: leave loading=true so getSession() can attempt a token refresh
    // before deciding what to show — this prevents a flash of Dashboard followed by LoginPage.
    useLayoutEffect(() => {
        const session = getStoredSession()
        if (!session || !session.isExpired) {
            setUser(session?.user ?? null)
            setLoading(false)
        }
        // If session exists but is expired, leave loading=true; getSession() handles it below.
        const saved = localStorage.getItem('allocat-theme') as Theme | null
        const resolved = saved ?? 'dark'
        setThemeState(resolved)
        document.documentElement.classList.toggle('dark', resolved === 'dark')
        document.documentElement.classList.toggle('light', resolved === 'light')
    }, [])

    useEffect(() => {
        // Verify the cached session against Supabase in the background.
        // If the token is expired, this will refresh it and update both user and accessToken.
        // If refresh fails (e.g., invalid refresh token), clear the session.
        supabase.auth.getSession()
            .then(({ data: { session }, error }) => {
                if (error) {
                    // Refresh token is invalid/missing — clear the session
                    console.warn('Session refresh failed:', error.message)
                    setUser(null)
                    setAccessToken(null)
                    supabase.auth.signOut().catch(() => { })
                } else {
                    setUser(session?.user ?? null)
                    setAccessToken(session?.access_token ?? null)
                }
                // Always resolve loading here — covers the expired-token path where
                // useLayoutEffect left loading=true waiting for this result.
                setLoading(false)
            })
            .catch((error) => {
                // Fallback error handling
                console.error('Unexpected error during session verification:', error)
                setUser(null)
                setAccessToken(null)
                setLoading(false)
            })

        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            (_event, session) => {
                const newUser = session?.user ?? null
                // If user has changed (logged out or switched user), clear user-specific localStorage
                if (prevUserRef.current?.id !== newUser?.id) {
                    localStorage.removeItem('allocat_wizard_dismissed')
                }
                prevUserRef.current = newUser
                setUser(newUser)
                setAccessToken(session?.access_token ?? null)
            }
        )

        return () => subscription.unsubscribe()
    }, [])

    const signOut = async () => {
        // Clear user-specific localStorage items before signing out
        localStorage.removeItem('allocat_wizard_dismissed')
        await supabase.auth.signOut()
    }

    return (
        <ThemeContext.Provider value={{ theme, setTheme }}>
            <AuthContext.Provider value={{ user, loading, accessToken, signOut }}>
                {children}
            </AuthContext.Provider>
        </ThemeContext.Provider>
    )
}
