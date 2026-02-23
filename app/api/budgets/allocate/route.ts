import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createAuthenticatedSupabaseClient } from '@/lib/supabase'
import { BudgetingEngine } from '@/lib/budgeting'

const createErrorResponse = (message: string, status: number) =>
    NextResponse.json({ error: message }, { status })

export async function POST(request: NextRequest) {
    try {
        const user = await requireAuth(request)
        const supabase = createAuthenticatedSupabaseClient(user.accessToken)
        const body = await request.json()

        const { budget_id, category_id, amount } = body

        if (!budget_id || !category_id || amount === undefined) {
            return createErrorResponse('budget_id, category_id, and amount are required', 400)
        }

        // Verify the budget belongs to the user
        const { data: budget, error: budgetError } = await supabase
            .from('budgets')
            .select('id, month, year')
            .eq('id', budget_id)
            .eq('user_id', user.id)
            .single()

        if (budgetError || !budget) {
            return createErrorResponse('Budget not found', 404)
        }

        // Verify the category belongs to the user
        const { data: category, error: categoryError } = await supabase
            .from('categories')
            .select('id')
            .eq('id', category_id)
            .eq('user_id', user.id)
            .single()

        if (categoryError || !category) {
            return createErrorResponse('Category not found', 404)
        }

        const newAmount = parseFloat(amount)
        if (isNaN(newAmount)) {
            return createErrorResponse('amount must be a number', 400)
        }

        // Upsert the allocation with the new budgeted_amount
        const { error: upsertError } = await supabase
            .from('category_allocations')
            .upsert(
                {
                    budget_id,
                    category_id,
                    budgeted_amount: newAmount,
                    updated_at: new Date().toISOString(),
                },
                { onConflict: 'budget_id,category_id' }
            )

        if (upsertError) {
            return createErrorResponse(upsertError.message, 500)
        }

        // Return the full recomputed budget summary
        const engine = new BudgetingEngine(supabase)
        const budgetSummary = await engine.getBudgetSummary(user.id, budget.month, budget.year)

        return NextResponse.json({ budget: budgetSummary })
    } catch (error) {
        if (error instanceof Error && error.message === 'Unauthorized') {
            return createErrorResponse('Unauthorized', 401)
        }
        return createErrorResponse('Internal server error', 500)
    }
}
