'use client'

import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'
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

    // Runs synchronously before the first browser paint — reads localStorage and
    // resolves auth state instantly for returning users, eliminating the spinner.
    useLayoutEffect(() => {
        setUser(getStoredUser())
        setLoading(false)
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
            })
            .catch((error) => {
                // Fallback error handling
                console.error('Unexpected error during session verification:', error)
                setUser(null)
                setAccessToken(null)
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
