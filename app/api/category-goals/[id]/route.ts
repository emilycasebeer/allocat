import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createAuthenticatedSupabaseClient } from '@/lib/supabase'

const createErrorResponse = (message: string, status: number) =>
    NextResponse.json({ error: message }, { status })

async function verifyOwnership(supabase: any, goalId: string, userId: string) {
    // Join through categories to verify user ownership
    const { data, error } = await supabase
        .from('category_goals')
        .select('id, categories!inner(user_id)')
        .eq('id', goalId)
        .eq('categories.user_id', userId)
        .single()
    return { found: !error && !!data }
}

export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const user = await requireAuth(request)
        const supabase = createAuthenticatedSupabaseClient(user.accessToken)
        const { id } = await params
        const body = await request.json()

        const { found } = await verifyOwnership(supabase, id, user.id)
        if (!found) return createErrorResponse('Goal not found', 404)

        const { goal_type, target_amount, target_date, monthly_amount } = body

        const updatePayload: Record<string, unknown> = { updated_at: new Date().toISOString() }
        if (goal_type !== undefined) updatePayload.goal_type = goal_type
        if (target_amount !== undefined) updatePayload.target_amount = target_amount ?? null
        if (target_date !== undefined) updatePayload.target_date = target_date ?? null
        if (monthly_amount !== undefined) updatePayload.monthly_amount = monthly_amount ?? null

        const { data: goal, error } = await supabase
            .from('category_goals')
            .update(updatePayload)
            .eq('id', id)
            .select()
            .single()

        if (error) return createErrorResponse(error.message, 500)

        return NextResponse.json({ goal })
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
        const supabase = createAuthenticatedSupabaseClient(user.accessToken)
        const { id } = await params

        const { found } = await verifyOwnership(supabase, id, user.id)
        if (!found) return createErrorResponse('Goal not found', 404)

        const { error } = await supabase
            .from('category_goals')
            .delete()
            .eq('id', id)

        if (error) return createErrorResponse(error.message, 500)

        return NextResponse.json({ message: 'Goal deleted' })
    } catch (error) {
        if (error instanceof Error && error.message === 'Unauthorized') {
            return createErrorResponse('Unauthorized', 401)
        }
        return createErrorResponse('Internal server error', 500)
    }
}
