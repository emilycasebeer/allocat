import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createAuthenticatedSupabaseClient } from '@/lib/supabase'
import Decimal from 'decimal.js'

const createErrorResponse = (message: string, status: number) =>
    NextResponse.json({ error: message }, { status })

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const user = await requireAuth(request)
        const supabase = createAuthenticatedSupabaseClient(user.accessToken)
        const { id: accountId } = await params
        const body = await request.json()

        const { balance, create_adjustment } = body

        if (balance === undefined || balance === null) {
            return createErrorResponse('balance is required', 400)
        }

        // Verify account belongs to user
        const { data: account, error: accountError } = await supabase
            .from('accounts')
            .select('id, name')
            .eq('id', accountId)
            .eq('user_id', user.id)
            .single()

        if (accountError || !account) {
            return createErrorResponse('Account not found', 404)
        }

        // Mark all 'cleared' transactions as 'reconciled'
        const { data: updated, error: updateError } = await supabase
            .from('transactions')
            .update({ cleared: 'reconciled', updated_at: new Date().toISOString() })
            .eq('account_id', accountId)
            .eq('cleared', 'cleared')
            .select('id')

        if (updateError) {
            return createErrorResponse(updateError.message, 500)
        }

        const reconciledCount = updated?.length ?? 0

        let adjustmentTransaction = null

        if (create_adjustment) {
            // Compute the current reconciled balance after the update
            const { data: txData } = await supabase
                .from('transactions')
                .select('amount')
                .eq('account_id', accountId)
                .eq('cleared', 'reconciled')
                .is('parent_transaction_id', null)

            const reconciledBalance = (txData ?? []).reduce(
                (sum, t) => new Decimal(sum).plus(t.amount).toNumber(),
                0
            )

            const difference = new Decimal(parseFloat(balance)).minus(reconciledBalance).toNumber()

            if (Math.abs(difference) > 0.001) {
                const { data: adj, error: adjError } = await supabase
                    .from('transactions')
                    .insert({
                        account_id: accountId,
                        amount: difference,
                        date: new Date().toISOString().split('T')[0],
                        memo: 'Reconciliation Adjustment',
                        type: difference > 0 ? 'income' : 'expense',
                        cleared: 'reconciled',
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                    })
                    .select()
                    .single()

                if (adjError) {
                    return createErrorResponse(adjError.message, 500)
                }

                adjustmentTransaction = adj
            }
        }

        return NextResponse.json({ reconciled_count: reconciledCount, adjustment_transaction: adjustmentTransaction })
    } catch (error) {
        if (error instanceof Error && error.message === 'Unauthorized') {
            return createErrorResponse('Unauthorized', 401)
        }
        return createErrorResponse('Internal server error', 500)
    }
}
