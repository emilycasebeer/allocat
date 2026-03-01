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
    is_system: boolean
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
     *
     * NOTE: This method is kept for standalone use. getBudgetSummary uses bulk computation
     * internally and does not call this method.
     */
    async computeActivity(
        categoryId: string,
        month: number,
        year: number,
        excludeAccountId?: string
    ): Promise<number> {
        const startDate = `${year}-${String(month).padStart(2, '0')}-01`
        const endDate = new Date(year, month, 0).toISOString().split('T')[0]

        let query = this.supabase
            .from('transactions')
            .select('amount')
            .eq('category_id', categoryId)
            .gte('date', startDate)
            .lte('date', endDate)

        if (excludeAccountId) {
            query = query.neq('account_id', excludeAccountId)
        }

        const { data, error } = await query

        if (error || !data) return 0

        return data.reduce((sum, t) => new Decimal(sum).plus(t.amount).toNumber(), 0)
    }

    /**
     * Compute the available amount for a category in a given month.
     * available(M) = budgeted(M) + activity(M) + max(0, available(M-1))
     *
     * Walks back up to 24 months to find the running available balance.
     *
     * NOTE: This method is kept for standalone use. getBudgetSummary uses bulk computation
     * internally and does not call this method.
     */
    async computeAvailable(
        categoryId: string,
        month: number,
        year: number,
        userId: string,
        carryNegative = false,
        excludeAccountId?: string
    ): Promise<number> {
        const months: { month: number; year: number }[] = []
        let m = month
        let y = year
        for (let i = 0; i < 24; i++) {
            months.unshift({ month: m, year: y })
            m--
            if (m === 0) { m = 12; y-- }
        }

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

        const budgetIds = budgets.map(b => b.id)
        const { data: allocations } = await this.supabase
            .from('category_allocations')
            .select('budget_id, budgeted_amount')
            .eq('category_id', categoryId)
            .in('budget_id', budgetIds)

        const allocationMap = new Map(
            (allocations ?? []).map(a => [a.budget_id, a.budgeted_amount])
        )

        let available = new Decimal(0)
        for (const { month: mo, year: yr } of months) {
            const budgetId = budgetMap.get(`${yr}-${mo}`)
            if (!budgetId) {
                if (available.isNegative()) available = new Decimal(0)
                continue
            }

            const budgeted = new Decimal(allocationMap.get(budgetId) ?? 0)
            const activity = new Decimal(await this.computeActivity(categoryId, mo, yr, excludeAccountId))
            const rollover = (carryNegative || available.isPositive()) ? available : new Decimal(0)
            available = rollover.plus(budgeted).plus(activity)
        }

        return available.toNumber()
    }

    /**
     * Returns the IDs of all on-budget accounts for a user.
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
     *
     * NOTE: This method is kept for standalone use. getBudgetSummary uses bulk computation
     * internally and does not call this method.
     */
    async computeTBB(userId: string, month: number, year: number): Promise<number> {
        const endDate = new Date(year, month, 0).toISOString().split('T')[0]

        const budgetAccountIds = await this.getBudgetAccountIds(userId)

        let totalIncome = 0
        if (budgetAccountIds.length > 0) {
            const { data: incomeData } = await this.supabase
                .from('transactions')
                .select('amount')
                .in('account_id', budgetAccountIds)
                .eq('type', 'income')
                .lte('date', endDate)
                .is('parent_transaction_id', null)

            totalIncome = (incomeData ?? []).reduce(
                (sum, t) => new Decimal(sum).plus(t.amount).toNumber(), 0
            )
        }

        const { data: allBudgets } = await this.supabase
            .from('budgets')
            .select('id, month, year')
            .eq('user_id', userId)

        const relevantBudgetIds = (allBudgets ?? [])
            .filter(b => b.year < year || (b.year === year && b.month <= month))
            .map(b => b.id)

        let totalBudgeted = 0
        if (relevantBudgetIds.length > 0) {
            const { data: allocations } = await this.supabase
                .from('category_allocations')
                .select('budgeted_amount')
                .in('budget_id', relevantBudgetIds)

            totalBudgeted = (allocations ?? []).reduce(
                (sum, a) => new Decimal(sum).plus(a.budgeted_amount).toNumber(), 0
            )
        }

        return new Decimal(totalIncome).minus(totalBudgeted).toNumber()
    }

    /**
     * Compute the net CC activity for a payment category: charges - payments.
     *
     * NOTE: This method is kept for standalone use. getBudgetSummary uses bulk computation
     * internally and does not call this method.
     */
    private async computeCCActivity(
        accountId: string,
        month: number,
        year: number,
        paymentCategoryId?: string
    ): Promise<number> {
        const startDate = `${year}-${String(month).padStart(2, '0')}-01`
        const endDate = new Date(year, month, 0).toISOString().split('T')[0]

        let topLevelQuery = this.supabase
            .from('transactions')
            .select('amount')
            .eq('account_id', accountId)
            .eq('type', 'expense')
            .not('category_id', 'is', null)
            .gte('date', startDate)
            .lte('date', endDate)
            .is('parent_transaction_id', null)
        if (paymentCategoryId) {
            topLevelQuery = topLevelQuery.neq('category_id', paymentCategoryId)
        }
        const { data: topLevel } = await topLevelQuery

        let splitQuery = this.supabase
            .from('transactions')
            .select('amount')
            .eq('account_id', accountId)
            .eq('type', 'expense')
            .not('category_id', 'is', null)
            .not('parent_transaction_id', 'is', null)
            .gte('date', startDate)
            .lte('date', endDate)
        if (paymentCategoryId) {
            splitQuery = splitQuery.neq('category_id', paymentCategoryId)
        }
        const { data: splitChildren } = await splitQuery

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
     *
     * Optimized: uses 6 queries in 2 parallel rounds instead of 500+ sequential queries.
     *
     * Round 1 (2 parallel): all user accounts, all user budgets
     * Round 2 (4 parallel): current allocations+goals, all historical allocations,
     *                        all transactions in 24-month window, all-time income for TBB
     *
     * All per-category computation (activity, available, CC activity, TBB) runs in
     * JavaScript from pre-fetched in-memory maps — no async in the category loop.
     */
    async getBudgetSummary(userId: string, month: number, year: number): Promise<BudgetSummary> {
        const endOfCurrentMonth = new Date(year, month, 0).toISOString().split('T')[0]

        // Build 24-month lookback range, oldest first (same cap as computeAvailable)
        const months: { month: number; year: number }[] = []
        let m = month, y = year
        for (let i = 0; i < 24; i++) {
            months.unshift({ month: m, year: y })
            m--
            if (m === 0) { m = 12; y-- }
        }
        const startOfRange = `${months[0].year}-${String(months[0].month).padStart(2, '0')}-01`

        // ── Round 1: accounts + all budgets (2 parallel queries) ─────────────────
        const [accountsResult, allBudgetsResult] = await Promise.all([
            this.supabase
                .from('accounts')
                .select('id, on_budget, payment_category_id, account_types!inner(is_budget_account)')
                .eq('user_id', userId),
            this.supabase
                .from('budgets')
                .select('id, month, year')
                .eq('user_id', userId),
        ])

        const allAccounts = accountsResult.data ?? []
        const allBudgets = allBudgetsResult.data ?? []

        // Derive account sets from Round 1
        const budgetAccountIds = allAccounts
            .filter(a => {
                const type = a.account_types as any
                return a.on_budget ?? type?.is_budget_account ?? true
            })
            .map(a => a.id)

        const ccPaymentMap = new Map<string, string>() // payment_category_id → account_id
        for (const acc of allAccounts) {
            if (acc.payment_category_id) ccPaymentMap.set(acc.payment_category_id, acc.id)
        }

        const allAccountIds = allAccounts.map(a => a.id)

        const currentBudget = allBudgets.find(b => b.month === month && b.year === year)
        if (!currentBudget) throw new Error('Budget not found for specified month')

        // Budget lookup maps
        const monthYearToBudgetId = new Map(allBudgets.map(b => [`${b.year}-${b.month}`, b.id]))
        const budgetIdToMonthYear = new Map(allBudgets.map(b => [b.id, { month: b.month, year: b.year }]))

        const allBudgetIds = allBudgets.map(b => b.id)

        // ── Round 2: allocations + transactions (4 parallel queries) ─────────────
        const [currentAllocResult, allAllocResult, transactionsResult, tbbIncomeResult] = await Promise.all([
            // Current month allocations with full category metadata
            this.supabase
                .from('category_allocations')
                .select(`
                    budget_id,
                    category_id,
                    budgeted_amount,
                    categories!inner(
                        name,
                        is_system,
                        is_hidden,
                        category_groups!inner(name, sort_order),
                        category_goals(
                            id, goal_type, target_amount, target_date, monthly_amount
                        )
                    )
                `)
                .eq('budget_id', currentBudget.id),

            // All allocations across all user budgets
            // Used for: computeAvailable (24-month history) and TBB (all-time budgeted sum)
            allBudgetIds.length > 0
                ? this.supabase
                    .from('category_allocations')
                    .select('budget_id, category_id, budgeted_amount')
                    .in('budget_id', allBudgetIds)
                : Promise.resolve({ data: [] as { budget_id: string; category_id: string; budgeted_amount: number }[], error: null }),

            // All transactions for all user accounts in the 24-month window
            // Used for: per-category activity, computeAvailable, CC activity
            allAccountIds.length > 0
                ? this.supabase
                    .from('transactions')
                    .select('account_id, category_id, amount, date, type, parent_transaction_id, is_split')
                    .in('account_id', allAccountIds)
                    .gte('date', startOfRange)
                    .lte('date', endOfCurrentMonth)
                : Promise.resolve({ data: [] as { account_id: string; category_id: string | null; amount: number; date: string; type: string; parent_transaction_id: string | null; is_split: boolean }[], error: null }),

            // All-time income from budget accounts (unbounded — required for correct TBB)
            budgetAccountIds.length > 0
                ? this.supabase
                    .from('transactions')
                    .select('amount')
                    .in('account_id', budgetAccountIds)
                    .eq('type', 'income')
                    .lte('date', endOfCurrentMonth)
                    .is('parent_transaction_id', null)
                : Promise.resolve({ data: [] as { amount: number }[], error: null }),
        ])

        const currentAllocations = currentAllocResult.data ?? []
        const allAllocations = allAllocResult.data ?? []
        const transactions = transactionsResult.data ?? []
        const incomeTransactions = tbbIncomeResult.data ?? []

        // ── Build lookup structures from bulk data ────────────────────────────────

        // allAllocMap: Map<categoryId, Map<budgetId, budgetedAmount>>
        // Used by computeAvailable to look up what was budgeted in each historical month
        const allAllocMap = new Map<string, Map<string, number>>()
        for (const alloc of allAllocations) {
            if (!allAllocMap.has(alloc.category_id)) {
                allAllocMap.set(alloc.category_id, new Map())
            }
            allAllocMap.get(alloc.category_id)!.set(alloc.budget_id, Number(alloc.budgeted_amount))
        }

        // activityByCatMonth: Map<`${categoryId}|${yr}|${mo}`, Map<accountId, amount>>
        // Keyed by account so we can exclude specific accounts (e.g. CC payment categories)
        const activityByCatMonth = new Map<string, Map<string, number>>()

        // txByAccount: Map<accountId, tx[]>
        // Used by CC activity computation to iterate only the relevant account's transactions
        type TxRow = { category_id: string | null; amount: number; date: string; type: string; parent_transaction_id: string | null; is_split: boolean }
        const txByAccount = new Map<string, TxRow[]>()

        for (const tx of transactions) {
            // Index by account_id for CC lookups
            if (!txByAccount.has(tx.account_id)) txByAccount.set(tx.account_id, [])
            txByAccount.get(tx.account_id)!.push(tx)

            // Index by category+month for activity lookups
            if (!tx.category_id) continue
            const yr = Number(tx.date.substring(0, 4))
            const mo = Number(tx.date.substring(5, 7))
            const key = `${tx.category_id}|${yr}|${mo}`
            if (!activityByCatMonth.has(key)) activityByCatMonth.set(key, new Map())
            const acctMap = activityByCatMonth.get(key)!
            acctMap.set(
                tx.account_id,
                new Decimal(acctMap.get(tx.account_id) ?? 0).plus(tx.amount).toNumber()
            )
        }

        // ── Pure-JS computation helpers (no async, no queries) ───────────────────

        // Sum activity for a category in a given month, optionally excluding one account
        const getActivity = (categoryId: string, mo: number, yr: number, excludeAccountId?: string): number => {
            const acctMap = activityByCatMonth.get(`${categoryId}|${yr}|${mo}`)
            if (!acctMap) return 0
            let total = new Decimal(0)
            for (const [accId, amount] of acctMap) {
                if (excludeAccountId && accId === excludeAccountId) continue
                total = total.plus(amount)
            }
            return total.toNumber()
        }

        // Walk 24 months forward to compute rolling available balance.
        // For CC payment categories, pass ccAccountId to fold per-month CC activity
        // (charges, payments, starting balance) directly into the historical walk so that
        // uncovered charges from prior months carry forward correctly.
        const computeAvailableFn = (
            categoryId: string,
            carryNegative: boolean,
            excludeAccountId?: string,
            ccAccountId?: string
        ): number => {
            const catBudgets = allAllocMap.get(categoryId)
            let available = new Decimal(0)

            for (const { month: mo, year: yr } of months) {
                const budgetId = monthYearToBudgetId.get(`${yr}-${mo}`)
                if (!budgetId) {
                    if (available.isNegative()) available = new Decimal(0)
                    continue
                }

                const budgeted = new Decimal(catBudgets?.get(budgetId) ?? 0)
                const activity = new Decimal(getActivity(categoryId, mo, yr, excludeAccountId))
                const ccActivity = ccAccountId
                    ? new Decimal(getCCActivityForMonth(ccAccountId, categoryId, mo, yr))
                    : new Decimal(0)
                const rollover = (carryNegative || available.isPositive()) ? available : new Decimal(0)
                available = rollover.plus(budgeted).plus(activity).plus(ccActivity)
            }

            return available.toNumber()
        }

        // Net CC activity for a payment category for a specific month.
        //
        // The return value is added to the CC payment category's available amount:
        //   positive return → available goes UP (money moved into the CC payment pot)
        //   negative return → available goes DOWN (unfunded debt or money paid out)
        //
        // Categorized expense (charge): money "moved" from spending category to CC payment pot → positive
        // Uncategorized non-split expense (e.g. starting balance debt): unfunded debt → negative
        // Uncategorized income on CC (e.g. starting balance credit): card owes you money → positive
        // Transfer into CC (payment): money left the CC payment pot → negative
        const getCCActivityForMonth = (accountId: string, paymentCategoryId: string | undefined, mo: number, yr: number): number => {
            const accountTxs = txByAccount.get(accountId) ?? []
            const moStr = String(mo).padStart(2, '0')
            const yrStr = String(yr)

            let charges = new Decimal(0)
            let payments = new Decimal(0)

            for (const tx of accountTxs) {
                if (tx.date.substring(0, 4) !== yrStr || tx.date.substring(5, 7) !== moStr) continue

                if (tx.type === 'expense') {
                    if (tx.category_id && tx.category_id !== paymentCategoryId) {
                        // Categorized charge: money "moves" from spending category to CC payment pot
                        // Expenses stored as negative; negate to get positive charge amount
                        charges = charges.minus(tx.amount)
                    } else if (!tx.category_id && !tx.is_split && !tx.parent_transaction_id) {
                        // Uncategorized non-split expense (e.g. starting balance debt): unfunded debt
                        // Treat as negative payment: reduces available (you owe this, nothing covers it)
                        payments = payments.minus(tx.amount) // amount is negative; minus negative = adds to payments
                    }
                    // Split parents (category_id=null, is_split=true) are intentionally skipped —
                    // their split children carry the category and are counted above
                } else if (tx.type === 'income' && !tx.category_id && !tx.parent_transaction_id) {
                    // Uncategorized income on CC (e.g. starting balance credit: card owes you money)
                    // Positive income amount adds directly to charges → increases available
                    charges = charges.plus(tx.amount)
                } else if (tx.type === 'transfer' && Number(tx.amount) > 0 && !tx.parent_transaction_id) {
                    // Transfer into CC (a payment): money leaves the CC payment pot
                    payments = payments.plus(tx.amount)
                }
            }

            return charges.minus(payments).toNumber()
        }

        // ── TBB: total all-time income minus total all-time budgeted ─────────────

        const totalIncome = incomeTransactions.reduce(
            (sum, t) => new Decimal(sum).plus(t.amount).toNumber(), 0
        )

        const relevantBudgetIdSet = new Set(
            allBudgets
                .filter(b => b.year < year || (b.year === year && b.month <= month))
                .map(b => b.id)
        )
        const totalBudgeted = allAllocations
            .filter(a => relevantBudgetIdSet.has(a.budget_id))
            .reduce((sum, a) => new Decimal(sum).plus(a.budgeted_amount).toNumber(), 0)

        const tbb = new Decimal(totalIncome).minus(totalBudgeted).toNumber()

        // ── Build category rows (synchronous — no DB calls) ───────────────────────

        const categories: BudgetCategoryRow[] = []
        const groupSortOrder = new Map<string, number>()

        for (const alloc of currentAllocations) {
            const cat = alloc.categories as any
            // Skip hidden categories (e.g. payment categories for closed CC accounts)
            if (cat.is_hidden) continue
            const ccAccountId = ccPaymentMap.get(alloc.category_id)
            const carryNegative = ccAccountId !== undefined

            const activity = getActivity(alloc.category_id, month, year, ccAccountId)
            // For CC payment categories, ccAccountId is passed so getCCActivityForMonth is
            // called per-month inside the walk — no separate post-walk adjustment needed
            const available = computeAvailableFn(alloc.category_id, carryNegative, ccAccountId, ccAccountId)

            const goalRow = Array.isArray(cat.category_goals) ? cat.category_goals[0] : cat.category_goals

            const groupName: string = cat.category_groups.name
            if (!groupSortOrder.has(groupName)) {
                groupSortOrder.set(groupName, cat.category_groups.sort_order ?? 0)
            }

            categories.push({
                id: alloc.category_id,
                name: cat.name,
                group_name: groupName,
                is_system: cat.is_system ?? false,
                budgeted_amount: alloc.budgeted_amount,
                activity_amount: activity,
                available_amount: available,
                goal: goalRow ?? null,
            })
        }

        // Sort by group sort_order so CC Payments (sort_order=9999) sinks to the bottom
        categories.sort((a, b) => {
            const sortA = groupSortOrder.get(a.group_name) ?? 0
            const sortB = groupSortOrder.get(b.group_name) ?? 0
            if (sortA !== sortB) return sortA - sortB
            return a.group_name.localeCompare(b.group_name)
        })

        return {
            id: currentBudget.id,
            month,
            year,
            to_be_budgeted: tbb,
            categories,
        }
    }
}
