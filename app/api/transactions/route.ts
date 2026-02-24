import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createAuthenticatedSupabaseClient } from '@/lib/supabase'

const createErrorResponse = (message: string, status: number) =>
    NextResponse.json({ error: message }, { status })

export async function GET(request: NextRequest) {
    try {
        const user = await requireAuth(request)
        const supabase = createAuthenticatedSupabaseClient(user.accessToken)
        const { searchParams } = new URL(request.url)

        const accountId = searchParams.get('account_id')
        const categoryId = searchParams.get('category_id')
        const startDate = searchParams.get('start_date')
        const endDate = searchParams.get('end_date')

        let query = supabase
            .from('transactions')
            .select(`
                *,
                accounts!inner(user_id, name),
                categories(
                    name,
                    category_groups(name)
                ),
                payees(name),
                splits:transactions!parent_transaction_id(
                    id, amount, memo, category_id,
                    categories(name, category_groups(name))
                ),
                transfer_tx:transactions!transfer_transaction_id(account_id)
            `)
            .eq('accounts.user_id', user.id)
            .is('parent_transaction_id', null)

        if (accountId) query = query.eq('account_id', accountId)
        if (categoryId) query = query.eq('category_id', categoryId)
        if (startDate) query = query.gte('date', startDate)
        if (endDate) query = query.lte('date', endDate)

        const { data: transactions, error } = await query.order('date', { ascending: false })

        if (error) {
            return createErrorResponse(error.message, 500)
        }

        const result = (transactions ?? []).map((t) => {
            const cat = t.categories as any
            const payee = t.payees as any
            const rawTransferTx = t.transfer_tx
            const transferTx = Array.isArray(rawTransferTx)
                ? (rawTransferTx as any[])[0]
                : rawTransferTx as any
            const rawSplits = (t.splits as any[]) ?? []
            const splits = rawSplits.map((s) => ({
                id: s.id,
                amount: s.amount,
                memo: s.memo,
                category_id: s.category_id,
                category_name: s.categories?.name ?? null,
                group_name: s.categories?.category_groups?.name ?? null,
            }))
            return {
                ...t,
                category_name: cat?.name ?? null,
                group_name: cat?.category_groups?.name ?? null,
                payee_name: payee?.name ?? null,
                to_account_id: transferTx?.account_id ?? null,
                splits,
            }
        })

        return NextResponse.json({ transactions: result })
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

        const { account_id, category_id, amount, date, memo, type, payee_name, splits, to_account_id } = body

        if (!account_id || amount === undefined || !date || !type) {
            return createErrorResponse('account_id, amount, date, and type are required', 400)
        }

        if (type === 'transfer' && !to_account_id) {
            return createErrorResponse('to_account_id is required for transfer transactions', 400)
        }

        // Verify account belongs to user
        const { data: account, error: accountError } = await supabase
            .from('accounts')
            .select('id')
            .eq('id', account_id)
            .eq('user_id', user.id)
            .single()

        if (accountError || !account) {
            return createErrorResponse('Account not found', 404)
        }

        // Verify category belongs to user (if provided and not a split)
        if (category_id && !splits) {
            const { data: category, error: categoryError } = await supabase
                .from('categories')
                .select('id')
                .eq('id', category_id)
                .eq('user_id', user.id)
                .single()

            if (categoryError || !category) {
                return createErrorResponse('Category not found', 404)
            }
        }

        // Resolve payee: find or create by name
        let payee_id: string | null = null
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
        }

        // Auto-update payee's default category (fire-and-forget)
        if (payee_id && category_id) {
            supabase
                .from('payees')
                .update({ default_category_id: category_id })
                .eq('id', payee_id)
                .eq('user_id', user.id)
                .then(() => {})
                .catch(() => {})
        }

        const isSplit = Array.isArray(splits) && splits.length > 0

        const { data: transaction, error } = await supabase
            .from('transactions')
            .insert({
                account_id,
                category_id: isSplit ? null : (category_id ?? null),
                payee_id,
                amount: parseFloat(amount),
                date,
                memo: memo ?? null,
                type,
                cleared: 'uncleared',
                is_split: isSplit,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            })
            .select()
            .single()

        if (error) {
            return createErrorResponse(error.message, 500)
        }

        // Insert split children
        if (isSplit) {
            const children = splits.map((s: { category_id: string | null; amount: number; memo?: string }) => ({
                account_id,
                parent_transaction_id: transaction.id,
                category_id: s.category_id ?? null,
                amount: s.amount,
                memo: s.memo ?? null,
                date,
                type,
                cleared: 'uncleared',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            }))

            const { error: splitError } = await supabase.from('transactions').insert(children)
            if (splitError) {
                // Roll back parent if children fail
                await supabase.from('transactions').delete().eq('id', transaction.id)
                return createErrorResponse(splitError.message, 500)
            }
        }

        // Create the paired leg for transfers and link both sides
        if (type === 'transfer' && to_account_id) {
            // Verify destination account belongs to this user
            const { data: toAccount, error: toAccountError } = await supabase
                .from('accounts')
                .select('id')
                .eq('id', to_account_id)
                .eq('user_id', user.id)
                .single()

            if (toAccountError || !toAccount) {
                await supabase.from('transactions').delete().eq('id', transaction.id)
                return createErrorResponse('Destination account not found', 404)
            }

            const { data: pairedTx, error: pairError } = await supabase
                .from('transactions')
                .insert({
                    account_id: to_account_id,
                    amount: -parseFloat(amount), // opposite sign: money arrives at destination
                    date,
                    memo: memo ?? null,
                    type: 'transfer',
                    cleared: 'uncleared',
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                })
                .select()
                .single()

            if (pairError || !pairedTx) {
                await supabase.from('transactions').delete().eq('id', transaction.id)
                return createErrorResponse('Failed to create paired transfer transaction', 500)
            }

            // Link both legs to each other
            await supabase
                .from('transactions')
                .update({ transfer_transaction_id: pairedTx.id })
                .eq('id', transaction.id)
            await supabase
                .from('transactions')
                .update({ transfer_transaction_id: transaction.id })
                .eq('id', pairedTx.id)
        }

        return NextResponse.json({ transaction }, { status: 201 })
    } catch (error) {
        if (error instanceof Error && error.message === 'Unauthorized') {
            return createErrorResponse('Unauthorized', 401)
        }
        return createErrorResponse('Internal server error', 500)
    }
}
