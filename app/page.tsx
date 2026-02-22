'use client'

import { useAuth } from './providers'
import { LoginPage } from './auth/login-page'
import { Dashboard } from './dashboard/dashboard'

export default function HomePage() {
    const { user, loading } = useAuth()

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
            </div>
        )
    }

    if (!user) {
        return <LoginPage />
    }

    return <Dashboard />
}
