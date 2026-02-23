import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createAuthenticatedSupabaseClient } from '@/lib/supabase'

const createErrorResponse = (message: string, status: number) =>
    NextResponse.json({ error: message }, { status })

function advanceDate(dateStr: string, frequency: string): string | null {
    const d = new Date(dateStr + 'T00:00:00')
    switch (frequency) {
        case 'once':           return null
        case 'daily':          d.setDate(d.getDate() + 1); break
        case 'weekly':         d.setDate(d.getDate() + 7); break
        case 'every_other_week': d.setDate(d.getDate() + 14); break
        case 'every_4_weeks':  d.setDate(d.getDate() + 28); break
        case 'twice_a_month':  d.setDate(d.getDate() + 15); break
        case 'monthly':        d.setMonth(d.getMonth() + 1); break
        case 'every_other_month': d.setMonth(d.getMonth() + 2); break
        case 'twice_a_year':   d.setMonth(d.getMonth() + 6); break
        case 'yearly':         d.setFullYear(d.getFullYear() + 1); break
        default:               return null
    }
    return d.toISOString().split('T')[0]
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const user = await requireAuth(request)
        const supabase = createAuthenticatedSupabaseClient(user.accessToken)
        const { id } = await params

        // Fetch and verify ownership
        const { data: s, error: fetchError } = await supabase
            .from('scheduled_transactions')
            .select('*, accounts!inner(user_id)')
            .eq('id', id)
            .eq('accounts.user_id', user.id)
            .single()

        if (fetchError || !s) {
            return createErrorResponse('Scheduled transaction not found', 404)
        }

        // Create the actual transaction
        const txType = s.amount >= 0 ? 'income' : 'expense'
        const { data: transaction, error: txError } = await supabase
            .from('transactions')
            .insert({
                account_id: s.account_id,
                payee_id: s.payee_id ?? null,
                category_id: s.category_id ?? null,
                amount: s.amount,
                date: s.next_date,
                memo: s.memo ?? null,
                type: txType,
                cleared: 'uncleared',
                scheduled_transaction_id: s.id,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            })
            .select()
            .single()

        if (txError) {
            return createErrorResponse(txError.message, 500)
        }

        // Advance or delete the scheduled transaction
        const newNextDate = advanceDate(s.next_date, s.frequency)
        const shouldDelete =
            newNextDate === null ||
            (s.end_date && newNextDate > s.end_date)

        let scheduledTransaction = null
        if (shouldDelete) {
            await supabase.from('scheduled_transactions').delete().eq('id', id)
        } else {
            const { data: updated } = await supabase
                .from('scheduled_transactions')
                .update({ next_date: newNextDate, updated_at: new Date().toISOString() })
                .eq('id', id)
                .select()
                .single()
            scheduledTransaction = updated
        }

        return NextResponse.json({ transaction, scheduled_transaction: scheduledTransaction })
    } catch (error) {
        if (error instanceof Error && error.message === 'Unauthorized') {
            return createErrorResponse('Unauthorized', 401)
        }
        return createErrorResponse('Internal server error', 500)
    }
}
