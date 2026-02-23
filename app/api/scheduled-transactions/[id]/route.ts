import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createAuthenticatedSupabaseClient } from '@/lib/supabase'

const createErrorResponse = (message: string, status: number) =>
    NextResponse.json({ error: message }, { status })

async function verifyOwnership(supabase: any, id: string, userId: string) {
    const { data, error } = await supabase
        .from('scheduled_transactions')
        .select('id, user_id')
        .eq('id', id)
        .eq('user_id', userId)
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
        if (!found) return createErrorResponse('Scheduled transaction not found', 404)

        const {
            account_id, category_id, amount, memo,
            frequency, next_date, end_date, flag_color,
            payee_name,
        } = body

        // Resolve payee
        let payee_id: string | null | undefined = undefined
        if (payee_name !== undefined) {
            if (!payee_name || !payee_name.trim()) {
                payee_id = null
            } else {
                const trimmedName = payee_name.trim()
                const { data: existing } = await supabase
                    .from('payees')
                    .select('id')
                    .eq('user_id', user.id)
                    .eq('name', trimmedName)
                    .maybeSingle()

                if (existing) {
                    payee_id = existing.id
                } else {
                    const { data: newPayee } = await supabase
                        .from('payees')
                        .insert({ user_id: user.id, name: trimmedName })
                        .select('id')
                        .single()
                    payee_id = newPayee?.id ?? null
                }
            }
        }

        const updatePayload: Record<string, unknown> = { updated_at: new Date().toISOString() }
        if (account_id !== undefined) updatePayload.account_id = account_id
        if (category_id !== undefined) updatePayload.category_id = category_id ?? null
        if (amount !== undefined) updatePayload.amount = parseFloat(amount)
        if (memo !== undefined) updatePayload.memo = memo ?? null
        if (frequency !== undefined) updatePayload.frequency = frequency
        if (next_date !== undefined) updatePayload.next_date = next_date
        if (end_date !== undefined) updatePayload.end_date = end_date ?? null
        if (flag_color !== undefined) updatePayload.flag_color = flag_color ?? null
        if (payee_id !== undefined) updatePayload.payee_id = payee_id

        const { data: scheduled, error } = await supabase
            .from('scheduled_transactions')
            .update(updatePayload)
            .eq('id', id)
            .eq('user_id', user.id)
            .select()
            .single()

        if (error) return createErrorResponse(error.message, 500)

        return NextResponse.json({ scheduled })
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
        if (!found) return createErrorResponse('Scheduled transaction not found', 404)

        const { error } = await supabase
            .from('scheduled_transactions')
            .delete()
            .eq('id', id)
            .eq('user_id', user.id)

        if (error) return createErrorResponse(error.message, 500)

        return NextResponse.json({ message: 'Scheduled transaction deleted' })
    } catch (error) {
        if (error instanceof Error && error.message === 'Unauthorized') {
            return createErrorResponse('Unauthorized', 401)
        }
        return createErrorResponse('Internal server error', 500)
    }
}
