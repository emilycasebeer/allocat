import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createAuthenticatedSupabaseClient } from '@/lib/supabase'

const createErrorResponse = (message: string, status: number) =>
    NextResponse.json({ error: message }, { status })

export async function GET(request: NextRequest) {
    try {
        const user = await requireAuth(request)
        const supabase = createAuthenticatedSupabaseClient(user.accessToken)

        const { data: categories, error } = await supabase
            .from('categories')
            .select(`
                id, name, group_id, is_hidden, is_system, sort_order, note,
                category_groups!inner(id, name, sort_order)
            `)
            .eq('user_id', user.id)
            .eq('is_hidden', false)
            .order('sort_order')
            .order('name')

        if (error) {
            return createErrorResponse(error.message, 500)
        }

        // Return flat list with group_name denormalized for UI compatibility
        const flat = (categories ?? []).map((cat) => {
            const group = cat.category_groups as any
            return {
                id: cat.id,
                name: cat.name,
                group_id: cat.group_id,
                group_name: group.name as string,
                is_system: cat.is_system,
                sort_order: cat.sort_order,
            }
        })

        // Also return grouped for convenience
        const grouped = flat.reduce((acc, cat) => {
            if (!acc[cat.group_name]) acc[cat.group_name] = []
            acc[cat.group_name].push(cat)
            return acc
        }, {} as Record<string, typeof flat>)

        return NextResponse.json({ categories: grouped, flat })
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

        const { name, group_name } = body

        if (!name || !group_name) {
            return createErrorResponse('name and group_name are required', 400)
        }

        // Find or create the category group
        let groupId: string
        const { data: existingGroup } = await supabase
            .from('category_groups')
            .select('id')
            .eq('user_id', user.id)
            .eq('name', group_name)
            .maybeSingle()

        if (existingGroup) {
            groupId = existingGroup.id
        } else {
            const { data: newGroup, error: groupError } = await supabase
                .from('category_groups')
                .insert({
                    user_id: user.id,
                    name: group_name,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                })
                .select('id')
                .single()

            if (groupError || !newGroup) {
                return createErrorResponse('Failed to create category group', 500)
            }
            groupId = newGroup.id
        }

        // Create the category
        const { data: category, error: categoryError } = await supabase
            .from('categories')
            .insert({
                user_id: user.id,
                group_id: groupId,
                name,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            })
            .select('id, name, group_id')
            .single()

        if (categoryError || !category) {
            return createErrorResponse(categoryError?.message ?? 'Failed to create category', 500)
        }

        // Backfill a $0 allocation for every existing budget month so getBudgetSummary
        // (which inner-joins category_allocations) can see the new category immediately.
        const { data: existingBudgets } = await supabase
            .from('budgets')
            .select('id')
            .eq('user_id', user.id)

        if (existingBudgets && existingBudgets.length > 0) {
            await supabase
                .from('category_allocations')
                .insert(
                    existingBudgets.map(b => ({
                        budget_id: b.id,
                        category_id: category.id,
                        budgeted_amount: 0,
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                    }))
                )
            // Ignore error — category was created; allocations are best-effort backfill
        }

        return NextResponse.json({
            category: {
                id: category.id,
                name: category.name,
                group_id: category.group_id,
                group_name,
            }
        }, { status: 201 })
    } catch (error) {
        if (error instanceof Error && error.message === 'Unauthorized') {
            return createErrorResponse('Unauthorized', 401)
        }
        return createErrorResponse('Internal server error', 500)
    }
}
