import { createServerSupabaseClient } from './supabase'
import Decimal from 'decimal.js'

export interface BudgetCategoryRow {
    id: string
    name: string
    group_name: string
    budgeted_amount: number
    activity_amount: number
    available_amount: number
}

export interface BudgetSummary {
    id: string
    month: number
    year: number
    to_be_budgeted: number
    categories: BudgetCategoryRow[]
}

export class BudgetingEngine {
    /**
     * Compute the total activity (sum of transaction amounts) for a category in a given month.
     * Excludes subtransactions (parent_transaction_id IS NOT NULL) to avoid double-counting splits.
     */
    async computeActivity(categoryId: string, month: number, year: number): Promise<number> {
        const supabase = await createServerSupabaseClient()

        const startDate = `${year}-${String(month).padStart(2, '0')}-01`
        const endDate = new Date(year, month, 0).toISOString().split('T')[0]

        const { data, error } = await supabase
            .from('transactions')
            .select('amount')
            .eq('category_id', categoryId)
            .gte('date', startDate)
            .lte('date', endDate)
            .is('parent_transaction_id', null)

        if (error || !data) return 0

        return data.reduce((sum, t) => new Decimal(sum).plus(t.amount).toNumber(), 0)
    }

    /**
     * Compute the available amount for a category in a given month.
     * available(M) = budgeted(M) + activity(M) + max(0, available(M-1))
     *
     * Walks back up to 24 months to find the running available balance.
     */
    async computeAvailable(
        categoryId: string,
        month: number,
        year: number,
        userId: string
    ): Promise<number> {
        // Build a list of up to 24 months going back from the target month (inclusive), oldest first
        const months: { month: number; year: number }[] = []
        let m = month
        let y = year
        for (let i = 0; i < 24; i++) {
            months.unshift({ month: m, year: y })
            m--
            if (m === 0) { m = 12; y-- }
        }

        const supabase = await createServerSupabaseClient()

        // Fetch all budget rows for this user in the range
        const { data: budgets } = await supabase
            .from('budgets')
            .select('id, month, year')
            .eq('user_id', userId)
            .or(
                months.map(({ month: mo, year: yr }) =>
                    `and(month.eq.${mo},year.eq.${yr})`
                ).join(',')
            )

        if (!budgets || budgets.length === 0) return 0

        const budgetMap = new Map(budgets.map(b => [`${b.year}-${b.month}`, b.id]))

        // Fetch all allocations for this category across those budgets
        const budgetIds = budgets.map(b => b.id)
        const { data: allocations } = await supabase
            .from('category_allocations')
            .select('budget_id, budgeted_amount')
            .eq('category_id', categoryId)
            .in('budget_id', budgetIds)

        const allocationMap = new Map(
            (allocations ?? []).map(a => [a.budget_id, a.budgeted_amount])
        )

        // Walk forward month by month accumulating available
        let available = new Decimal(0)
        for (const { month: mo, year: yr } of months) {
            const budgetId = budgetMap.get(`${yr}-${mo}`)
            if (!budgetId) {
                // No budget this month — carry forward positive balance only
                if (available.isNegative()) available = new Decimal(0)
                continue
            }

            const budgeted = new Decimal(allocationMap.get(budgetId) ?? 0)
            const activity = new Decimal(await this.computeActivity(categoryId, mo, yr))
            const rollover = available.isPositive() ? available : new Decimal(0)
            available = rollover.plus(budgeted).plus(activity)
        }

        return available.toNumber()
    }

    /**
     * Compute To Be Budgeted for a given month.
     * TBB = max(0, TBB_last_month) + income_this_month - total_budgeted_this_month
     */
    async computeTBB(userId: string, month: number, year: number): Promise<number> {
        const supabase = await createServerSupabaseClient()

        // Income transactions for this user this month
        const startDate = `${year}-${String(month).padStart(2, '0')}-01`
        const endDate = new Date(year, month, 0).toISOString().split('T')[0]

        const { data: incomeData } = await supabase
            .from('transactions')
            .select('amount, accounts!inner(user_id)')
            .eq('accounts.user_id', userId)
            .eq('type', 'income')
            .gte('date', startDate)
            .lte('date', endDate)
            .is('parent_transaction_id', null)

        const totalIncome = (incomeData ?? []).reduce(
            (sum, t) => new Decimal(sum).plus(t.amount).toNumber(),
            0
        )

        // Total budgeted across all categories this month
        const { data: budget } = await supabase
            .from('budgets')
            .select('id')
            .eq('user_id', userId)
            .eq('month', month)
            .eq('year', year)
            .maybeSingle()

        let totalBudgeted = 0
        if (budget) {
            const { data: allocations } = await supabase
                .from('category_allocations')
                .select('budgeted_amount')
                .eq('budget_id', budget.id)

            totalBudgeted = (allocations ?? []).reduce(
                (sum, a) => new Decimal(sum).plus(a.budgeted_amount).toNumber(),
                0
            )
        }

        // Rollover from last month (positive TBB only)
        const prevMonth = month === 1 ? 12 : month - 1
        const prevYear = month === 1 ? year - 1 : year
        const prevTBB = await this.computeTBBRaw(userId, prevMonth, prevYear)
        const rollover = prevTBB > 0 ? prevTBB : 0

        return new Decimal(rollover).plus(totalIncome).minus(totalBudgeted).toNumber()
    }

    /**
     * Compute TBB for a month without rollover. Used only to get the prior month's
     * TBB for the rollover calculation, avoiding infinite recursion.
     */
    private async computeTBBRaw(userId: string, month: number, year: number): Promise<number> {
        const supabase = await createServerSupabaseClient()

        const startDate = `${year}-${String(month).padStart(2, '0')}-01`
        const endDate = new Date(year, month, 0).toISOString().split('T')[0]

        const { data: incomeData } = await supabase
            .from('transactions')
            .select('amount, accounts!inner(user_id)')
            .eq('accounts.user_id', userId)
            .eq('type', 'income')
            .gte('date', startDate)
            .lte('date', endDate)
            .is('parent_transaction_id', null)

        const totalIncome = (incomeData ?? []).reduce(
            (sum, t) => new Decimal(sum).plus(t.amount).toNumber(),
            0
        )

        const { data: budget } = await supabase
            .from('budgets')
            .select('id')
            .eq('user_id', userId)
            .eq('month', month)
            .eq('year', year)
            .maybeSingle()

        if (!budget) return totalIncome

        const { data: allocations } = await supabase
            .from('category_allocations')
            .select('budgeted_amount')
            .eq('budget_id', budget.id)

        const totalBudgeted = (allocations ?? []).reduce(
            (sum, a) => new Decimal(sum).plus(a.budgeted_amount).toNumber(),
            0
        )

        return new Decimal(totalIncome).minus(totalBudgeted).toNumber()
    }

    /**
     * Get a full budget summary for a month with all values computed from transactions.
     */
    async getBudgetSummary(userId: string, month: number, year: number): Promise<BudgetSummary> {
        const supabase = await createServerSupabaseClient()

        const { data: budget, error } = await supabase
            .from('budgets')
            .select('id, month, year')
            .eq('user_id', userId)
            .eq('month', month)
            .eq('year', year)
            .single()

        if (error || !budget) {
            throw new Error('Budget not found for specified month')
        }

        const { data: allocations } = await supabase
            .from('category_allocations')
            .select(`
                budget_id,
                category_id,
                budgeted_amount,
                categories!inner(
                    name,
                    category_groups!inner(name)
                )
            `)
            .eq('budget_id', budget.id)

        const categories: BudgetCategoryRow[] = []

        for (const alloc of allocations ?? []) {
            const cat = alloc.categories as any
            const activity = await this.computeActivity(alloc.category_id, month, year)
            const available = await this.computeAvailable(alloc.category_id, month, year, userId)

            categories.push({
                id: alloc.category_id,
                name: cat.name,
                group_name: cat.category_groups.name,
                budgeted_amount: alloc.budgeted_amount,
                activity_amount: activity,
                available_amount: available,
            })
        }

        const tbb = await this.computeTBB(userId, month, year)

        return {
            id: budget.id,
            month,
            year,
            to_be_budgeted: tbb,
            categories,
        }
    }
}
