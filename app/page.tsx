'use client'

import { useAuth } from './providers'
import { LoginPage } from './auth/login-page'
import { Dashboard } from './dashboard/dashboard'

export default function HomePage() {
    const { user, loading } = useAuth()

    if (loading) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-transparent border-t-primary/60"></div>
            </div>
        )
    }

    if (!user) {
        return <LoginPage />
    }

    return <Dashboard />
}
