import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedSupabaseClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import { BudgetingEngine } from '@/lib/budgeting'

export async function GET(request: NextRequest) {
    try {
        const user = await requireAuth(request)
        const { searchParams } = new URL(request.url)
        const month = parseInt(searchParams.get('month') || '0')
        const year = parseInt(searchParams.get('year') || '0')

        if (!month || !year) {
            return NextResponse.json({ error: 'month and year are required' }, { status: 400 })
        }

        const supabase = createAuthenticatedSupabaseClient(user.accessToken)

        const startDate = `${year}-${String(month).padStart(2, '0')}-01`
        const endDate = new Date(year, month, 0).toISOString().split('T')[0]

        // Fetch budget allocations with group name via join
        const { data: budgetData } = await supabase
            .from('budgets')
            .select(`
                id, month, year,
                category_allocations(
                    budgeted_amount,
                    categories!inner(
                        name,
                        category_groups!inner(name)
                    )
                )
            `)
            .eq('user_id', user.id)
            .eq('month', month)
            .eq('year', year)
            .maybeSingle()

        // Fetch actual spending for the month (expenses only, no subtransactions)
        const { data: spendingData, error: spendingError } = await supabase
            .from('transactions')
            .select(`
                amount, category_id,
                categories(
                    name,
                    category_groups!inner(name)
                ),
                accounts!inner(user_id)
            `)
            .eq('accounts.user_id', user.id)
            .gte('date', startDate)
            .lte('date', endDate)
            .neq('type', 'income')
            .is('parent_transaction_id', null)

        if (spendingError) {
            return NextResponse.json({ error: 'Failed to fetch spending data' }, { status: 500 })
        }

        // Aggregate by category group
        const groupData: Record<string, { budgeted: number; actual: number }> = {}

        // Seed with budget data
        const allocations = (budgetData as any)?.category_allocations ?? []
        for (const alloc of allocations) {
            const groupName = alloc.categories?.category_groups?.name ?? 'Uncategorized'
            if (!groupData[groupName]) groupData[groupName] = { budgeted: 0, actual: 0 }
            groupData[groupName].budgeted += alloc.budgeted_amount ?? 0
        }

        // Add actual spending
        for (const t of spendingData ?? []) {
            const cat = t.categories as any
            const groupName = cat?.category_groups?.name ?? 'Uncategorized'
            if (!groupData[groupName]) groupData[groupName] = { budgeted: 0, actual: 0 }
            groupData[groupName].actual += Math.abs(t.amount)
        }

        const budgetVsActual = Object.entries(groupData).map(([name, data]) => ({
            name,
            budgeted: data.budgeted,
            actual: data.actual,
        }))

        return NextResponse.json({ budgetVsActual, month, year })
    } catch (error) {
        if (error instanceof Error && error.message === 'Unauthorized') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
