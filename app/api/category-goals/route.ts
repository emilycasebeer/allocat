import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createServerSupabaseClient } from '@/lib/supabase'

const createErrorResponse = (message: string, status: number) =>
    NextResponse.json({ error: message }, { status })

export async function POST(request: NextRequest) {
    try {
        const user = await requireAuth(request)
        const supabase = await createServerSupabaseClient()
        const body = await request.json()

        const { category_id, goal_type, target_amount, target_date, monthly_amount } = body

        if (!category_id || !goal_type) {
            return createErrorResponse('category_id and goal_type are required', 400)
        }

        const validGoalTypes = [
            'target_balance', 'target_balance_by_date',
            'monthly_savings', 'monthly_spending', 'debt_payoff',
        ]
        if (!validGoalTypes.includes(goal_type)) {
            return createErrorResponse(`Invalid goal_type: ${goal_type}`, 400)
        }

        // Verify category belongs to user
        const { data: category, error: catError } = await supabase
            .from('categories')
            .select('id')
            .eq('id', category_id)
            .eq('user_id', user.id)
            .single()

        if (catError || !category) {
            return createErrorResponse('Category not found', 404)
        }

        const { data: goal, error } = await supabase
            .from('category_goals')
            .upsert(
                {
                    category_id,
                    goal_type,
                    target_amount: target_amount ?? null,
                    target_date: target_date ?? null,
                    monthly_amount: monthly_amount ?? null,
                    updated_at: new Date().toISOString(),
                },
                { onConflict: 'category_id' }
            )
            .select()
            .single()

        if (error) {
            return createErrorResponse(error.message, 500)
        }

        return NextResponse.json({ goal }, { status: 201 })
    } catch (error) {
        if (error instanceof Error && error.message === 'Unauthorized') {
            return createErrorResponse('Unauthorized', 401)
        }
        return createErrorResponse('Internal server error', 500)
    }
}
