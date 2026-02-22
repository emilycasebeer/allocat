import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createServerSupabaseClient } from '@/lib/supabase'

const createErrorResponse = (message: string, status: number) =>
    NextResponse.json({ error: message }, { status })

export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const user = await requireAuth(request)
        const supabase = await createServerSupabaseClient()
        const body = await request.json()
        const { id } = await params

        const { name, type_name, is_closed, note } = body

        if (!name) {
            return createErrorResponse('name is required', 400)
        }

        // Verify account ownership
        const { data: existing, error: fetchError } = await supabase
            .from('accounts')
            .select('id')
            .eq('id', id)
            .eq('user_id', user.id)
            .single()

        if (fetchError || !existing) {
            return createErrorResponse('Account not found', 404)
        }

        // Build update payload
        const updatePayload: Record<string, unknown> = {
            name,
            updated_at: new Date().toISOString(),
        }

        if (is_closed !== undefined) updatePayload.is_closed = is_closed
        if (note !== undefined) updatePayload.note = note

        // If type_name is provided, look up the type_id
        if (type_name) {
            const { data: accountType, error: typeError } = await supabase
                .from('account_types')
                .select('id')
                .eq('name', type_name)
                .single()

            if (typeError || !accountType) {
                return createErrorResponse(`Unknown account type: ${type_name}`, 400)
            }
            updatePayload.type_id = accountType.id
        }

        const { data: account, error } = await supabase
            .from('accounts')
            .update(updatePayload)
            .eq('id', id)
            .eq('user_id', user.id)
            .select(`
                id, name, on_budget, is_closed, note,
                account_types!inner(name, is_liability, is_budget_account)
            `)
            .single()

        if (error) {
            return createErrorResponse(error.message, 500)
        }

        const at = (account as any).account_types
        return NextResponse.json({
            account: {
                id: account.id,
                name: account.name,
                type_name: at.name,
                is_liability: at.is_liability,
                is_budget_account: account.on_budget ?? at.is_budget_account,
                is_closed: account.is_closed,
                note: account.note,
            }
        })
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

        // Verify account ownership
        const { data: existing, error: fetchError } = await supabase
            .from('accounts')
            .select('id')
            .eq('id', id)
            .eq('user_id', user.id)
            .single()

        if (fetchError || !existing) {
            return createErrorResponse('Account not found', 404)
        }

        // Block delete if transactions exist — close instead
        const { data: transactions } = await supabase
            .from('transactions')
            .select('id')
            .eq('account_id', id)
            .limit(1)

        if (transactions && transactions.length > 0) {
            return createErrorResponse(
                'Cannot delete an account with transactions. Close it instead.',
                400
            )
        }

        const { error } = await supabase
            .from('accounts')
            .delete()
            .eq('id', id)
            .eq('user_id', user.id)

        if (error) {
            return createErrorResponse(error.message, 500)
        }

        return NextResponse.json({ message: 'Account deleted successfully' })
    } catch (error) {
        if (error instanceof Error && error.message === 'Unauthorized') {
            return createErrorResponse('Unauthorized', 401)
        }
        return createErrorResponse('Internal server error', 500)
    }
}
