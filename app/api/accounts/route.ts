import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createServerSupabaseClient } from '@/lib/supabase'
import Decimal from 'decimal.js'

const createErrorResponse = (message: string, status: number) =>
    NextResponse.json({ error: message }, { status })

export async function GET(request: NextRequest) {
    try {
        const user = await requireAuth(request)
        const supabase = await createServerSupabaseClient()

        const { data: accounts, error } = await supabase
            .from('accounts')
            .select(`
                id, name, on_budget, is_closed, note, sort_order, payment_category_id,
                account_types!inner(name, is_liability, is_budget_account)
            `)
            .eq('user_id', user.id)
            .eq('is_closed', false)
            .order('sort_order')
            .order('name')

        if (error) {
            return createErrorResponse(error.message, 500)
        }

        // Compute balance for each account from cleared + reconciled transactions
        const accountsWithBalance = await Promise.all(
            (accounts ?? []).map(async (account) => {
                const { data: txData } = await supabase
                    .from('transactions')
                    .select('amount')
                    .eq('account_id', account.id)
                    .in('cleared', ['cleared', 'reconciled'])
                    .is('parent_transaction_id', null)

                const balance = (txData ?? []).reduce(
                    (sum, t) => new Decimal(sum).plus(t.amount).toNumber(),
                    0
                )

                const accountType = account.account_types as any
                return {
                    id: account.id,
                    name: account.name,
                    type_name: accountType.name as string,
                    is_liability: accountType.is_liability as boolean,
                    is_budget_account: (account.on_budget ?? accountType.is_budget_account) as boolean,
                    is_closed: account.is_closed,
                    note: account.note,
                    payment_category_id: account.payment_category_id,
                    balance,
                }
            })
        )

        return NextResponse.json({ accounts: accountsWithBalance })
    } catch (error) {
        if (error instanceof Error && error.message === 'Unauthorized') {
            return createErrorResponse('Unauthorized', 401)
        }
        return createErrorResponse('Internal server error', 500)
    }
}

export async function POST(request: NextRequest) {
    try {
        const user = await requireAuth(request)
        const supabase = await createServerSupabaseClient()
        const body = await request.json()

        const { name, type_name, starting_balance } = body

        if (!name || !type_name) {
            return createErrorResponse('name and type_name are required', 400)
        }

        // Look up account type by name
        const { data: accountType, error: typeError } = await supabase
            .from('account_types')
            .select('id, name, is_liability, is_budget_account')
            .eq('name', type_name)
            .single()

        if (typeError || !accountType) {
            return createErrorResponse(`Unknown account type: ${type_name}`, 400)
        }

        // Create the account
        const { data: account, error: accountError } = await supabase
            .from('accounts')
            .insert({
                user_id: user.id,
                name,
                type_id: accountType.id,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            })
            .select('id, name')
            .single()

        if (accountError || !account) {
            return createErrorResponse('Failed to create account', 500)
        }

        // Create a starting balance transaction if provided
        let balance = 0
        const amount = starting_balance !== undefined ? parseFloat(starting_balance) : 0
        if (!isNaN(amount) && amount !== 0) {
            const { error: txError } = await supabase
                .from('transactions')
                .insert({
                    account_id: account.id,
                    amount,
                    date: new Date().toISOString().split('T')[0],
                    memo: 'Starting Balance',
                    type: amount > 0 ? 'income' : 'expense',
                    cleared: 'cleared',
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                })

            if (txError) {
                await supabase.from('accounts').delete().eq('id', account.id)
                return createErrorResponse('Failed to create starting balance transaction', 500)
            }

            balance = amount
        }

        return NextResponse.json({
            account: {
                id: account.id,
                name: account.name,
                type_name: accountType.name,
                is_liability: accountType.is_liability,
                is_budget_account: accountType.is_budget_account,
                is_closed: false,
                balance,
            }
        }, { status: 201 })
    } catch (error) {
        if (error instanceof Error && error.message === 'Unauthorized') {
            return createErrorResponse('Unauthorized', 401)
        }
        return createErrorResponse('Internal server error', 500)
    }
}
