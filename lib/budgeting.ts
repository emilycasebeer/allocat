import Decimal from 'decimal.js'
import type { SupabaseClient } from '@supabase/supabase-js'

export interface CategoryGoal {
    id: string
    goal_type: 'target_balance' | 'target_balance_by_date' | 'monthly_savings' | 'monthly_spending' | 'debt_payoff'
    target_amount: number | null
    target_date: string | null
    monthly_amount: number | null
}

export interface BudgetCategoryRow {
    id: string
    name: string
    group_name: string
    budgeted_amount: number
    activity_amount: number
    available_amount: number
    goal: CategoryGoal | null
}

export interface BudgetSummary {
    id: string
    month: number
    year: number
    to_be_budgeted: number
    categories: BudgetCategoryRow[]
}

export class BudgetingEngine {
    constructor(private supabase: SupabaseClient) {}

    /**
     * Compute the total activity (sum of transaction amounts) for a category in a given month.
     * Includes both top-level and split-child transactions that carry this category_id.
     */
    async computeActivity(categoryId: string, month: number, year: number): Promise<number> {
        const startDate = `${year}-${String(month).padStart(2, '0')}-01`
        const endDate = new Date(year, month, 0).toISOString().split('T')[0]

        const { data, error } = await this.supabase
            .from('transactions')
            .select('amount')
            .eq('category_id', categoryId)
            .gte('date', startDate)
            .lte('date', endDate)

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

        // Fetch all budget rows for this user in the range
        const { data: budgets } = await this.supabase
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
        const { data: allocations } = await this.supabase
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
     * Returns the IDs of all on-budget accounts for a user.
     * Uses two queries to avoid complex nested joins: accounts → account_types.
     */
    private async getBudgetAccountIds(userId: string): Promise<string[]> {
        const { data: accounts } = await this.supabase
            .from('accounts')
            .select('id, on_budget, account_types(is_budget_account)')
            .eq('user_id', userId)

        return (accounts ?? [])
            .filter(a => {
                const type = a.account_types as any
                return a.on_budget ?? type?.is_budget_account ?? true
            })
            .map(a => a.id)
    }

    /**
     * Compute To Be Budgeted for a given month.
     * TBB = max(0, TBB_last_month) + income_this_month - total_budgeted_this_month
     */
    async computeTBB(userId: string, month: number, year: number): Promise<number> {
        const startDate = `${year}-${String(month).padStart(2, '0')}-01`
        const endDate = new Date(year, month, 0).toISOString().split('T')[0]

        // Only count income from on-budget accounts
        const budgetAccountIds = await this.getBudgetAccountIds(userId)

        let totalIncome = 0
        if (budgetAccountIds.length > 0) {
            const { data: incomeData } = await this.supabase
                .from('transactions')
                .select('amount')
                .in('account_id', budgetAccountIds)
                .eq('type', 'income')
                .gte('date', startDate)
                .lte('date', endDate)
                .is('parent_transaction_id', null)

            totalIncome = (incomeData ?? []).reduce(
                (sum, t) => new Decimal(sum).plus(t.amount).toNumber(), 0
            )
        }

        // Total budgeted across all categories this month
        const { data: budget } = await this.supabase
            .from('budgets')
            .select('id')
            .eq('user_id', userId)
            .eq('month', month)
            .eq('year', year)
            .maybeSingle()

        let totalBudgeted = 0
        if (budget) {
            const { data: allocations } = await this.supabase
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
        const startDate = `${year}-${String(month).padStart(2, '0')}-01`
        const endDate = new Date(year, month, 0).toISOString().split('T')[0]

        const budgetAccountIds = await this.getBudgetAccountIds(userId)

        let totalIncome = 0
        if (budgetAccountIds.length > 0) {
            const { data: incomeData } = await this.supabase
                .from('transactions')
                .select('amount')
                .in('account_id', budgetAccountIds)
                .eq('type', 'income')
                .gte('date', startDate)
                .lte('date', endDate)
                .is('parent_transaction_id', null)

            totalIncome = (incomeData ?? []).reduce(
                (sum, t) => new Decimal(sum).plus(t.amount).toNumber(), 0
            )
        }

        const { data: budget } = await this.supabase
            .from('budgets')
            .select('id')
            .eq('user_id', userId)
            .eq('month', month)
            .eq('year', year)
            .maybeSingle()

        if (!budget) return totalIncome

        const { data: allocations } = await this.supabase
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
     * Compute the net CC activity for a payment category: charges - payments.
     * Charges = categorized expenses on the CC account (top-level + split children).
     * Payments = transfers TO the CC account (positive amounts on the CC side).
     */
    private async computeCCActivity(accountId: string, month: number, year: number): Promise<number> {
        const startDate = `${year}-${String(month).padStart(2, '0')}-01`
        const endDate = new Date(year, month, 0).toISOString().split('T')[0]

        // Top-level categorized expenses (excludes split parents whose category_id is null)
        const { data: topLevel } = await this.supabase
            .from('transactions')
            .select('amount')
            .eq('account_id', accountId)
            .eq('type', 'expense')
            .not('category_id', 'is', null)
            .gte('date', startDate)
            .lte('date', endDate)
            .is('parent_transaction_id', null)

        // Split children on this CC account (parent_transaction_id IS NOT NULL, have category_id)
        const { data: splitChildren } = await this.supabase
            .from('transactions')
            .select('amount')
            .eq('account_id', accountId)
            .eq('type', 'expense')
            .not('category_id', 'is', null)
            .not('parent_transaction_id', 'is', null)
            .gte('date', startDate)
            .lte('date', endDate)

        // Transfers TO the CC (positive amount on CC side = payment from checking)
        const { data: payments } = await this.supabase
            .from('transactions')
            .select('amount')
            .eq('account_id', accountId)
            .eq('type', 'transfer')
            .gt('amount', 0)
            .gte('date', startDate)
            .lte('date', endDate)
            .is('parent_transaction_id', null)

        const charges = [...(topLevel ?? []), ...(splitChildren ?? [])]
            .reduce((sum, t) => new Decimal(sum).minus(t.amount).toNumber(), 0)

        const totalPayments = (payments ?? [])
            .reduce((sum, t) => new Decimal(sum).plus(t.amount).toNumber(), 0)

        return new Decimal(charges).minus(totalPayments).toNumber()
    }

    /**
     * Get a full budget summary for a month with all values computed from transactions.
     */
    async getBudgetSummary(userId: string, month: number, year: number): Promise<BudgetSummary> {
        const { data: budget, error } = await this.supabase
            .from('budgets')
            .select('id, month, year')
            .eq('user_id', userId)
            .eq('month', month)
            .eq('year', year)
            .single()

        if (error || !budget) {
            throw new Error('Budget not found for specified month')
        }

        // Build a map of payment_category_id → account_id for all CC accounts
        const { data: ccAccounts } = await this.supabase
            .from('accounts')
            .select('id, payment_category_id')
            .eq('user_id', userId)
            .not('payment_category_id', 'is', null)

        const ccPaymentMap = new Map<string, string>() // category_id → account_id
        for (const acc of ccAccounts ?? []) {
            if (acc.payment_category_id) {
                ccPaymentMap.set(acc.payment_category_id, acc.id)
            }
        }

        const { data: allocations } = await this.supabase
            .from('category_allocations')
            .select(`
                budget_id,
                category_id,
                budgeted_amount,
                categories!inner(
                    name,
                    category_groups!inner(name),
                    category_goals(
                        id, goal_type, target_amount, target_date, monthly_amount
                    )
                )
            `)
            .eq('budget_id', budget.id)

        const categories: BudgetCategoryRow[] = []

        for (const alloc of allocations ?? []) {
            const cat = alloc.categories as any
            const activity = await this.computeActivity(alloc.category_id, month, year)
            let available = await this.computeAvailable(alloc.category_id, month, year, userId)

            // Auto-credit CC payment categories with the sum of categorized CC charges this month
            const ccAccountId = ccPaymentMap.get(alloc.category_id)
            if (ccAccountId) {
                const ccActivity = await this.computeCCActivity(ccAccountId, month, year)
                available = new Decimal(available).plus(ccActivity).toNumber()
            }

            const goalRow = Array.isArray(cat.category_goals) ? cat.category_goals[0] : cat.category_goals

            categories.push({
                id: alloc.category_id,
                name: cat.name,
                group_name: cat.category_groups.name,
                budgeted_amount: alloc.budgeted_amount,
                activity_amount: activity,
                available_amount: available,
                goal: goalRow ?? null,
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
