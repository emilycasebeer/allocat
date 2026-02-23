import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createServerSupabaseClient } from '@/lib/supabase'

const createErrorResponse = (message: string, status: number) =>
    NextResponse.json({ error: message }, { status })

async function verifyOwnership(supabase: any, transactionId: string, userId: string) {
    const { data, error } = await supabase
        .from('transactions')
        .select('id, transfer_transaction_id, accounts!inner(user_id)')
        .eq('id', transactionId)
        .eq('accounts.user_id', userId)
        .single()
    return { found: !error && !!data, transaction: data }
}

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const user = await requireAuth(request)
        const supabase = await createServerSupabaseClient()
        const { id } = await params
        const body = await request.json()

        const { found, transaction: existing } = await verifyOwnership(supabase, id, user.id)
        if (!found) return createErrorResponse('Transaction not found', 404)

        const { amount, date, memo, type, cleared, category_id, payee_name, flag_color, splits } = body

        // Resolve payee if name provided
        let payee_id: string | null | undefined = undefined
        if (payee_name !== undefined) {
            if (payee_name && payee_name.trim()) {
                const trimmedName = payee_name.trim()
                const { data: existingPayee } = await supabase
                    .from('payees')
                    .select('id')
                    .eq('user_id', user.id)
                    .eq('name', trimmedName)
                    .maybeSingle()

                if (existingPayee) {
                    payee_id = existingPayee.id
                } else {
                    const { data: newPayee } = await supabase
                        .from('payees')
                        .insert({ user_id: user.id, name: trimmedName })
                        .select('id')
                        .single()
                    payee_id = newPayee?.id ?? null
                }
            } else {
                payee_id = null
            }
        }

        const updatePayload: Record<string, unknown> = { updated_at: new Date().toISOString() }
        if (amount !== undefined) updatePayload.amount = parseFloat(amount)
        if (date !== undefined) updatePayload.date = date
        if (memo !== undefined) updatePayload.memo = memo ?? null
        if (type !== undefined) updatePayload.type = type
        if (cleared !== undefined) updatePayload.cleared = cleared
        if (category_id !== undefined) updatePayload.category_id = category_id ?? null
        if (flag_color !== undefined) updatePayload.flag_color = flag_color ?? null
        if (payee_id !== undefined) updatePayload.payee_id = payee_id

        const { data: transaction, error } = await supabase
            .from('transactions')
            .update(updatePayload)
            .eq('id', id)
            .select()
            .single()

        if (error) return createErrorResponse(error.message, 500)

        // Re-sync split children if splits array provided
        if (Array.isArray(splits)) {
            await supabase.from('transactions').delete().eq('parent_transaction_id', id)

            if (splits.length > 0) {
                const children = splits.map((s: { category_id: string | null; amount: number; memo?: string }) => ({
                    account_id: transaction.account_id,
                    parent_transaction_id: id,
                    category_id: s.category_id ?? null,
                    amount: s.amount,
                    memo: s.memo ?? null,
                    date: transaction.date,
                    type: transaction.type,
                    cleared: transaction.cleared,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                }))
                await supabase.from('transactions').insert(children)
            }
        }

        // If this is one leg of a transfer, mirror amount and date to the other leg
        if (existing.transfer_transaction_id && (amount !== undefined || date !== undefined)) {
            const pairPayload: Record<string, unknown> = { updated_at: new Date().toISOString() }
            if (amount !== undefined) pairPayload.amount = -parseFloat(amount)
            if (date !== undefined) pairPayload.date = date
            await supabase
                .from('transactions')
                .update(pairPayload)
                .eq('id', existing.transfer_transaction_id)
        }

        return NextResponse.json({ transaction })
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

        const { found } = await verifyOwnership(supabase, id, user.id)
        if (!found) return createErrorResponse('Transaction not found', 404)

        const { error } = await supabase
            .from('transactions')
            .delete()
            .eq('id', id)

        if (error) return createErrorResponse(error.message, 500)

        return NextResponse.json({ message: 'Transaction deleted' })
    } catch (error) {
        if (error instanceof Error && error.message === 'Unauthorized') {
            return createErrorResponse('Unauthorized', 401)
        }
        return createErrorResponse('Internal server error', 500)
    }
}
