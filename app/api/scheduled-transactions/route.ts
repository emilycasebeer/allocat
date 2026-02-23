import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createAuthenticatedSupabaseClient } from '@/lib/supabase'

const createErrorResponse = (message: string, status: number) =>
    NextResponse.json({ error: message }, { status })

export async function GET(request: NextRequest) {
    try {
        const user = await requireAuth(request)
        const supabase = createAuthenticatedSupabaseClient(user.accessToken)

        const today = new Date().toISOString().split('T')[0]

        const { data: scheduled, error } = await supabase
            .from('scheduled_transactions')
            .select(`
                id, amount, memo, frequency, next_date, end_date, flag_color,
                account_id,
                accounts!inner(name, user_id),
                payees(name),
                categories(
                    name,
                    category_groups(name)
                )
            `)
            .eq('accounts.user_id', user.id)
            .order('next_date')

        if (error) {
            return createErrorResponse(error.message, 500)
        }

        const items = (scheduled ?? []).map((s) => {
            const payee = s.payees as any
            const cat = s.categories as any
            const acct = s.accounts as any
            return {
                id: s.id,
                account_id: s.account_id,
                account_name: acct?.name ?? null,
                payee_name: payee?.name ?? null,
                category_name: cat?.name ?? null,
                group_name: cat?.category_groups?.name ?? null,
                amount: s.amount,
                memo: s.memo,
                frequency: s.frequency,
                next_date: s.next_date,
                end_date: s.end_date,
                flag_color: s.flag_color,
            }
        })

        const due = items.filter((s) => s.next_date <= today)
        const upcoming = items.filter((s) => s.next_date > today)

        return NextResponse.json({ scheduled: items, due, upcoming })
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

        const {
            account_id, category_id, amount, memo,
            frequency, next_date, end_date, flag_color,
            payee_name,
        } = body

        if (!account_id || amount === undefined || !frequency || !next_date) {
            return createErrorResponse('account_id, amount, frequency, and next_date are required', 400)
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

        // Resolve payee find-or-create
        let payee_id: string | null = null
        if (payee_name && payee_name.trim()) {
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

        const { data: scheduled, error } = await supabase
            .from('scheduled_transactions')
            .insert({
                user_id: user.id,
                account_id,
                payee_id,
                category_id: category_id ?? null,
                amount: parseFloat(amount),
                memo: memo ?? null,
                frequency,
                next_date,
                end_date: end_date ?? null,
                flag_color: flag_color ?? null,
            })
            .select()
            .single()

        if (error) {
            return createErrorResponse(error.message, 500)
        }

        return NextResponse.json({ scheduled }, { status: 201 })
    } catch (error) {
        if (error instanceof Error && error.message === 'Unauthorized') {
            return createErrorResponse('Unauthorized', 401)
        }
        return createErrorResponse('Internal server error', 500)
    }
}
