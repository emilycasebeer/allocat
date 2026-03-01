import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createAuthenticatedSupabaseClient } from '@/lib/supabase'
import Decimal from 'decimal.js'

const createErrorResponse = (message: string, status: number) =>
    NextResponse.json({ error: message }, { status })

export async function GET(request: NextRequest) {
    try {
        const user = await requireAuth(request)
        const supabase = createAuthenticatedSupabaseClient(user.accessToken)

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

        // Compute balance for each account: single bulk query instead of N per-account queries
        const accountIds = (accounts ?? []).map(a => a.id)
        const balanceByAccount = new Map<string, number>()

        if (accountIds.length > 0) {
            const { data: txData } = await supabase
                .from('transactions')
                .select('account_id, amount')
                .in('account_id', accountIds)
                .is('parent_transaction_id', null)

            for (const tx of txData ?? []) {
                balanceByAccount.set(
                    tx.account_id,
                    new Decimal(balanceByAccount.get(tx.account_id) ?? 0).plus(tx.amount).toNumber()
                )
            }
        }

        const accountsWithBalance = (accounts ?? []).map((account) => {
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
                balance: balanceByAccount.get(account.id) ?? 0,
            }
        })

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
        const supabase = createAuthenticatedSupabaseClient(user.accessToken)
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

        // For CC / Line of Credit accounts: auto-create a payment category
        const isCreditAccount = type_name === 'Credit Card' || type_name === 'Line of Credit'
        let paymentCategoryId: string | null = null

        if (isCreditAccount) {
            // Find or create the "Credit Card Payments" category group
            const groupName = 'Credit Card Payments'
            const { data: existingGroup } = await supabase
                .from('category_groups')
                .select('id')
                .eq('user_id', user.id)
                .eq('name', groupName)
                .maybeSingle()

            let groupId: string
            if (existingGroup) {
                groupId = existingGroup.id
            } else {
                const { data: newGroup, error: groupError } = await supabase
                    .from('category_groups')
                    .insert({ user_id: user.id, name: groupName, sort_order: 9999, created_at: new Date().toISOString(), updated_at: new Date().toISOString() })
                    .select('id')
                    .single()
                if (groupError || !newGroup) {
                    await supabase.from('accounts').delete().eq('id', account.id)
                    return createErrorResponse('Failed to create CC payment group', 500)
                }
                groupId = newGroup.id
            }

            // Create the payment category for this specific account
            const { data: paymentCategory, error: catError } = await supabase
                .from('categories')
                .insert({
                    user_id: user.id,
                    group_id: groupId,
                    name: `${name} Payment`,
                    is_system: true,
                    is_hidden: false,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                })
                .select('id')
                .single()

            if (catError || !paymentCategory) {
                await supabase.from('accounts').delete().eq('id', account.id)
                return createErrorResponse('Failed to create CC payment category', 500)
            }

            paymentCategoryId = paymentCategory.id

            // Link the payment category to the account
            await supabase
                .from('accounts')
                .update({ payment_category_id: paymentCategoryId, updated_at: new Date().toISOString() })
                .eq('id', account.id)

            // Seed $0 allocations across all existing budget months (matches POST /api/categories backfill behavior)
            const { data: allBudgets } = await supabase
                .from('budgets')
                .select('id')
                .eq('user_id', user.id)

            if (allBudgets && allBudgets.length > 0) {
                await supabase
                    .from('category_allocations')
                    .upsert(
                        allBudgets.map(b => ({
                            budget_id: b.id,
                            category_id: paymentCategoryId,
                            budgeted_amount: 0,
                            created_at: new Date().toISOString(),
                            updated_at: new Date().toISOString(),
                        })),
                        { onConflict: 'budget_id,category_id' }
                    )
            }
        }

        // Create a starting balance transaction if provided
        let balance = 0
        const amount = starting_balance !== undefined ? parseFloat(starting_balance) : 0
        if (!isNaN(amount) && amount !== 0) {
            const { error: txError } = await supabase
                .from('transactions')
                .insert({
                    account_id: account.id,
                    category_id: null,
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
                payment_category_id: paymentCategoryId,
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
