import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createAuthenticatedSupabaseClient } from '@/lib/supabase'

export async function POST(request: NextRequest) {
    try {
        const user = await requireAuth(request)
        const supabase = createAuthenticatedSupabaseClient(user.accessToken)
        const { name } = await request.json()

        if (!name) {
            return NextResponse.json({ error: 'name is required' }, { status: 400 })
        }

        const { data: group, error } = await supabase
            .from('category_groups')
            .insert({
                user_id: user.id,
                name,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            })
            .select('id, name')
            .single()

        if (error || !group) {
            return NextResponse.json({ error: error?.message ?? 'Failed to create group' }, { status: 500 })
        }

        return NextResponse.json({ group }, { status: 201 })
    } catch (error) {
        if (error instanceof Error && error.message === 'Unauthorized') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
