import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createServerSupabaseClient } from '@/lib/supabase'

const createErrorResponse = (message: string, status: number) =>
    NextResponse.json({ error: message }, { status })

export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const user = await requireAuth(request)
        const supabase = await createServerSupabaseClient()
        const { id } = await params
        const body = await request.json()
        const { name, default_category_id } = body

        if (name !== undefined && (typeof name !== 'string' || !name.trim())) {
            return createErrorResponse('name must be a non-empty string', 400)
        }

        if (name === undefined && default_category_id === undefined) {
            return createErrorResponse('At least one of name or default_category_id is required', 400)
        }

        const { data: existing, error: fetchError } = await supabase
            .from('payees')
            .select('id')
            .eq('id', id)
            .eq('user_id', user.id)
            .single()

        if (fetchError || !existing) {
            return createErrorResponse('Payee not found', 404)
        }

        const updatePayload: Record<string, unknown> = { updated_at: new Date().toISOString() }
        if (name !== undefined) updatePayload.name = name.trim()
        if (default_category_id !== undefined) updatePayload.default_category_id = default_category_id || null

        const { data: payee, error } = await supabase
            .from('payees')
            .update(updatePayload)
            .eq('id', id)
            .eq('user_id', user.id)
            .select('id, name, default_category_id')
            .single()

        if (error) {
            return createErrorResponse(error.message, 500)
        }

        return NextResponse.json({ payee })
    } catch (error) {
        if (error instanceof Error && error.message === 'Unauthorized') {
            return createErrorResponse('Unauthorized', 401)
        }
        return createErrorResponse('Internal server error', 500)
    }
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const user = await requireAuth(request)
        const supabase = await createServerSupabaseClient()
        const { id } = await params

        const { data: existing, error: fetchError } = await supabase
            .from('payees')
            .select('id')
            .eq('id', id)
            .eq('user_id', user.id)
            .single()

        if (fetchError || !existing) {
            return createErrorResponse('Payee not found', 404)
        }

        const { error } = await supabase
            .from('payees')
            .delete()
            .eq('id', id)
            .eq('user_id', user.id)

        if (error) {
            return createErrorResponse(error.message, 500)
        }

        return NextResponse.json({ message: 'Payee deleted successfully' })
    } catch (error) {
        if (error instanceof Error && error.message === 'Unauthorized') {
            return createErrorResponse('Unauthorized', 401)
        }
        return createErrorResponse('Internal server error', 500)
    }
}
