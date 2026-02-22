import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createServerSupabaseClient } from '@/lib/supabase'
import { BudgetingEngine } from '@/lib/budgeting'
import { z } from 'zod'

const createErrorResponse = (message: string, status: number) =>
    NextResponse.json({ error: message }, { status })

const postSchema = z.object({
    month: z.number().int().min(1).max(12),
    year: z.number().int().min(2000).max(2100),
})

export async function GET(request: NextRequest) {
    try {
        const user = await requireAuth(request)
        const { searchParams } = new URL(request.url)
        const month = parseInt(searchParams.get('month') ?? '')
        const year = parseInt(searchParams.get('year') ?? '')

        if (!month || !year || month < 1 || month > 12) {
            return createErrorResponse('Valid month and year are required', 400)
        }

        const engine = new BudgetingEngine()
        const budget = await engine.getBudgetSummary(user.id, month, year)
        return NextResponse.json({ budget })
    } catch (error) {
        if (error instanceof Error && error.message === 'Unauthorized') {
            return createErrorResponse('Unauthorized', 401)
        }
        if (error instanceof Error && error.message === 'Budget not found for specified month') {
            return createErrorResponse(error.message, 404)
        }
        return createErrorResponse('Internal server error', 500)
    }
}

export async function POST(request: NextRequest) {
    try {
        const user = await requireAuth(request)
        const supabase = await createServerSupabaseClient()
        const body = await request.json()

        const validation = postSchema.safeParse(body)
        if (!validation.success) {
            return createErrorResponse(validation.error.errors[0].message, 400)
        }

        const { month, year } = validation.data

        // Return existing budget if present
        const { data: existingBudget } = await supabase
            .from('budgets')
            .select('id')
            .eq('user_id', user.id)
            .eq('month', month)
            .eq('year', year)
            .maybeSingle()

        if (existingBudget) {
            const engine = new BudgetingEngine()
            const budget = await engine.getBudgetSummary(user.id, month, year)
            return NextResponse.json({ budget })
        }

        // Create new budget row
        const { data: budget, error: budgetError } = await supabase
            .from('budgets')
            .insert({
                user_id: user.id,
                month,
                year,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            })
            .select('id')
            .single()

        if (budgetError || !budget) {
            return createErrorResponse('Failed to create budget', 500)
        }

        // Create zero allocations for all user categories
        const { data: categories, error: categoriesError } = await supabase
            .from('categories')
            .select('id')
            .eq('user_id', user.id)
            .eq('is_hidden', false)

        if (categoriesError) {
            await supabase.from('budgets').delete().eq('id', budget.id)
            return createErrorResponse('Failed to fetch categories', 500)
        }

        if (categories && categories.length > 0) {
            const { error: allocError } = await supabase
                .from('category_allocations')
                .insert(
                    categories.map((cat) => ({
                        budget_id: budget.id,
                        category_id: cat.id,
                        budgeted_amount: 0,
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                    }))
                )

            if (allocError) {
                await supabase.from('budgets').delete().eq('id', budget.id)
                return createErrorResponse('Failed to create category allocations', 500)
            }
        }

        const engine = new BudgetingEngine()
        const summary = await engine.getBudgetSummary(user.id, month, year)
        return NextResponse.json({ budget: summary }, { status: 201 })
    } catch (error) {
        if (error instanceof Error && error.message === 'Unauthorized') {
            return createErrorResponse('Unauthorized', 401)
        }
        return createErrorResponse('Internal server error', 500)
    }
}
