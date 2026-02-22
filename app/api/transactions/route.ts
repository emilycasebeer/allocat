import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createServerSupabaseClient } from '@/lib/supabase'

const createErrorResponse = (message: string, status: number) =>
    NextResponse.json({ error: message }, { status })

export async function GET(request: NextRequest) {
    try {
        const user = await requireAuth(request)
        const supabase = await createServerSupabaseClient()
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
                )
            `)
            .eq('accounts.user_id', user.id)
            .is('parent_transaction_id', null) // exclude subtransactions from top-level list

        if (accountId) query = query.eq('account_id', accountId)
        if (categoryId) query = query.eq('category_id', categoryId)
        if (startDate) query = query.gte('date', startDate)
        if (endDate) query = query.lte('date', endDate)

        const { data: transactions, error } = await query.order('date', { ascending: false })

        if (error) {
            return createErrorResponse(error.message, 500)
        }

        // Flatten category group name for UI compatibility
        const result = (transactions ?? []).map((t) => {
            const cat = t.categories as any
            return {
                ...t,
                category_name: cat?.name ?? null,
                group_name: cat?.category_groups?.name ?? null,
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
        const supabase = await createServerSupabaseClient()
        const body = await request.json()

        const { account_id, category_id, amount, date, memo, type } = body

        if (!account_id || amount === undefined || !date || !type) {
            return createErrorResponse('account_id, amount, date, and type are required', 400)
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

        // Verify category belongs to user (if provided)
        if (category_id) {
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

        const { data: transaction, error } = await supabase
            .from('transactions')
            .insert({
                account_id,
                category_id: category_id ?? null,
                amount: parseFloat(amount),
                date,
                memo: memo ?? null,
                type,
                cleared: 'uncleared',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            })
            .select()
            .single()

        if (error) {
            return createErrorResponse(error.message, 500)
        }

        return NextResponse.json({ transaction }, { status: 201 })
    } catch (error) {
        if (error instanceof Error && error.message === 'Unauthorized') {
            return createErrorResponse('Unauthorized', 401)
        }
        return createErrorResponse('Internal server error', 500)
    }
}
