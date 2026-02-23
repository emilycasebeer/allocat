import { createServerSupabaseClient } from './supabase'
import { NextRequest } from 'next/server'

export interface AuthenticatedUser {
    id: string
    email: string
    accessToken: string
}

export async function getAuthenticatedUser(request: NextRequest): Promise<AuthenticatedUser | null> {
    try {
        const authHeader = request.headers.get('authorization')
        if (!authHeader?.startsWith('Bearer ')) {
            return null
        }

        const token = authHeader.substring(7)
        const supabase = await createServerSupabaseClient()

        const { data: { user }, error } = await supabase.auth.getUser(token)

        if (error || !user) {
            return null
        }

        return {
            id: user.id,
            email: user.email!,
            accessToken: token,
        }
    } catch (error) {
        console.error('Authentication error:', error)
        return null
    }
}

export async function requireAuth(request: NextRequest): Promise<AuthenticatedUser> {
    const user = await getAuthenticatedUser(request)
    if (!user) {
        throw new Error('Unauthorized')
    }
    return user
}

export function createAuthResponse(userId: string, data: any) {
    return {
        ...data,
        user_id: userId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    }
}
