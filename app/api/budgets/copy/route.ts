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

        const { to_budget_id } = body
        if (!to_budget_id) {
            return createErrorResponse('to_budget_id is required', 400)
        }

        // Verify target budget belongs to user
        const { data: toBudget, error: toBudgetError } = await supabase
            .from('budgets')
            .select('id, month, year')
            .eq('id', to_budget_id)
            .eq('user_id', user.id)
            .single()

        if (toBudgetError || !toBudget) {
            return createErrorResponse('Budget not found', 404)
        }

        // Find the immediately preceding month's budget
        const prevMonth = toBudget.month === 1 ? 12 : toBudget.month - 1
        const prevYear = toBudget.month === 1 ? toBudget.year - 1 : toBudget.year

        const { data: fromBudget } = await supabase
            .from('budgets')
            .select('id')
            .eq('user_id', user.id)
            .eq('month', prevMonth)
            .eq('year', prevYear)
            .maybeSingle()

        if (!fromBudget) {
            return createErrorResponse('No budget found for the previous month', 404)
        }

        // Fetch prior month's allocations
        const { data: allocations, error: allocError } = await supabase
            .from('category_allocations')
            .select('category_id, budgeted_amount')
            .eq('budget_id', fromBudget.id)

        if (allocError) {
            return createErrorResponse(allocError.message, 500)
        }

        if (!allocations || allocations.length === 0) {
            // Nothing to copy — return current summary as-is
            const engine = new BudgetingEngine(supabase)
            const budgetSummary = await engine.getBudgetSummary(user.id, toBudget.month, toBudget.year)
            return NextResponse.json({ budget: budgetSummary })
        }

        // Bulk upsert into target budget
        const rows = allocations.map(a => ({
            budget_id: to_budget_id,
            category_id: a.category_id,
            budgeted_amount: a.budgeted_amount,
            updated_at: new Date().toISOString(),
        }))

        const { error: upsertError } = await supabase
            .from('category_allocations')
            .upsert(rows, { onConflict: 'budget_id,category_id' })

        if (upsertError) {
            return createErrorResponse(upsertError.message, 500)
        }

        const engine = new BudgetingEngine(supabase)
        const budgetSummary = await engine.getBudgetSummary(user.id, toBudget.month, toBudget.year)

        return NextResponse.json({ budget: budgetSummary })
    } catch (error) {
        if (error instanceof Error && error.message === 'Unauthorized') {
            return createErrorResponse('Unauthorized', 401)
        }
        return createErrorResponse('Internal server error', 500)
    }
}
