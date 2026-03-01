import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createAuthenticatedSupabaseClient } from '@/lib/supabase'

const createErrorResponse = (message: string, status: number) =>
    NextResponse.json({ error: message }, { status })

export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const user = await requireAuth(request)
        const supabase = createAuthenticatedSupabaseClient(user.accessToken)
        const body = await request.json()
        const { id } = await params

        const { name, type_name, is_closed, note } = body

        if (name !== undefined && !name.trim()) {
            return createErrorResponse('name cannot be empty', 400)
        }

        // Verify account ownership and fetch payment_category_id for CC close/reopen handling
        const { data: existing, error: fetchError } = await supabase
            .from('accounts')
            .select('id, payment_category_id')
            .eq('id', id)
            .eq('user_id', user.id)
            .single()

        if (fetchError || !existing) {
            return createErrorResponse('Account not found', 404)
        }

        // Build update payload
        const updatePayload: Record<string, unknown> = {
            updated_at: new Date().toISOString(),
        }

        if (name !== undefined) updatePayload.name = name.trim()
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

        // When closing/reopening a CC account: hide or unhide its payment category
        // so it disappears from / reappears in the budget view accordingly.
        if (is_closed !== undefined && existing.payment_category_id) {
            await supabase
                .from('categories')
                .update({ is_hidden: is_closed, updated_at: new Date().toISOString() })
                .eq('id', existing.payment_category_id)
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
        const supabase = createAuthenticatedSupabaseClient(user.accessToken)
        const { id } = await params

        // Verify account ownership and fetch payment_category_id for CC cleanup
        const { data: existing, error: fetchError } = await supabase
            .from('accounts')
            .select('id, payment_category_id')
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
                'Cannot delete an account with transactions. Close the account instead.',
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

        // Clean up the auto-created CC payment category (and group if now empty).
        // Must happen after account deletion since the account FK uses ON DELETE SET NULL.
        if (existing.payment_category_id) {
            // Capture group_id before deleting the category
            const { data: cat } = await supabase
                .from('categories')
                .select('group_id')
                .eq('id', existing.payment_category_id)
                .single()

            // Delete payment category — cascades to category_allocations automatically
            await supabase
                .from('categories')
                .delete()
                .eq('id', existing.payment_category_id)

            // Delete the "Credit Card Payments" group if it has no remaining categories
            if (cat?.group_id) {
                const { count } = await supabase
                    .from('categories')
                    .select('id', { count: 'exact', head: true })
                    .eq('group_id', cat.group_id)

                if (count === 0) {
                    await supabase
                        .from('category_groups')
                        .delete()
                        .eq('id', cat.group_id)
                }
            }
        }

        return NextResponse.json({ message: 'Account deleted successfully' })
    } catch (error) {
        if (error instanceof Error && error.message === 'Unauthorized') {
            return createErrorResponse('Unauthorized', 401)
        }
        return createErrorResponse('Internal server error', 500)
    }
}
