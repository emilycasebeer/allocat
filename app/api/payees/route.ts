import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createServerSupabaseClient } from '@/lib/supabase'

export async function GET(request: NextRequest) {
    try {
        const user = await requireAuth(request)
        const supabase = await createServerSupabaseClient()

        const { data: payees, error } = await supabase
            .from('payees')
            .select('id, name, default_category_id')
            .eq('user_id', user.id)
            .order('name')

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        return NextResponse.json({ payees: payees ?? [] })
    } catch (error) {
        if (error instanceof Error && error.message === 'Unauthorized') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

export async function POST(request: NextRequest) {
    try {
        const user = await requireAuth(request)
        const supabase = await createServerSupabaseClient()
        const body = await request.json()
        const { name } = body

        if (!name || typeof name !== 'string' || !name.trim()) {
            return NextResponse.json({ error: 'name is required' }, { status: 400 })
        }

        const trimmedName = name.trim()

        // Find or create
        const { data: existing } = await supabase
            .from('payees')
            .select('id, name, default_category_id')
            .eq('user_id', user.id)
            .eq('name', trimmedName)
            .maybeSingle()

        if (existing) {
            return NextResponse.json({ payee: existing })
        }

        const { data: payee, error } = await supabase
            .from('payees')
            .insert({ user_id: user.id, name: trimmedName })
            .select('id, name, default_category_id')
            .single()

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        return NextResponse.json({ payee }, { status: 201 })
    } catch (error) {
        if (error instanceof Error && error.message === 'Unauthorized') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
