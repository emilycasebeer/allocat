import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createAuthenticatedSupabaseClient } from '@/lib/supabase'

export async function GET(request: NextRequest) {
    try {
        const user = await requireAuth(request)
        const supabase = createAuthenticatedSupabaseClient(user.accessToken)
        const { searchParams } = new URL(request.url)
        const months = parseInt(searchParams.get('months') || '12')

        // Fetch accounts with type info
        const { data: accounts, error: accountsError } = await supabase
            .from('accounts')
            .select(`
                id, name, is_closed,
                account_types!inner(name, is_liability)
            `)
            .eq('user_id', user.id)

        if (accountsError) {
            return NextResponse.json({ error: accountsError.message }, { status: 500 })
        }

        if (!accounts || accounts.length === 0) {
            return NextResponse.json({
                net_worth: 0,
                netWorth: [],
                as_of_date: new Date().toISOString().split('T')[0],
                accounts: [],
                monthly_changes: [],
                summary: { total_assets: 0, total_liabilities: 0, account_count: 0 },
            })
        }

        const accountIds = accounts.map(a => a.id)

        // Compute balance per account from cleared/reconciled transactions
        const { data: balanceRows, error: balanceError } = await supabase
            .from('transactions')
            .select('account_id, amount')
            .in('account_id', accountIds)
            .in('cleared', ['cleared', 'reconciled'])
            .is('parent_transaction_id', null)

        if (balanceError) {
            return NextResponse.json({ error: balanceError.message }, { status: 500 })
        }

        const balanceByAccount: Record<string, number> = {}
        for (const row of balanceRows ?? []) {
            balanceByAccount[row.account_id] = (balanceByAccount[row.account_id] ?? 0) + row.amount
        }

        const accountsWithBalance = accounts.map(a => {
            const at = (a as any).account_types
            const balance = balanceByAccount[a.id] ?? 0
            return {
                id: a.id,
                name: a.name,
                is_closed: a.is_closed,
                type_name: at.name as string,
                is_liability: at.is_liability as boolean,
                balance,
            }
        })

        // Net worth = sum of all balances (liabilities carry negative balances naturally)
        const totalNetWorth = accountsWithBalance.reduce((sum, a) => sum + a.balance, 0)
        const totalAssets = accountsWithBalance
            .filter(a => !a.is_liability)
            .reduce((sum, a) => sum + a.balance, 0)
        const totalLiabilities = accountsWithBalance
            .filter(a => a.is_liability)
            .reduce((sum, a) => sum + Math.abs(a.balance), 0)

        // Historical net worth: transactions in the last N months
        const historyStart = new Date()
        historyStart.setMonth(historyStart.getMonth() - months)

        const { data: historyTxns, error: historyError } = await supabase
            .from('transactions')
            .select('account_id, amount, date')
            .in('account_id', accountIds)
            .in('cleared', ['cleared', 'reconciled'])
            .is('parent_transaction_id', null)
            .gte('date', historyStart.toISOString().split('T')[0])
            .order('date')

        if (historyError) {
            return NextResponse.json({ error: historyError.message }, { status: 500 })
        }

        // Build monthly change buckets
        const now = new Date()
        const monthlyChanges: Record<string, number> = {}
        for (let i = 0; i <= months; i++) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
            monthlyChanges[key] = 0
        }
        for (const t of historyTxns ?? []) {
            const d = new Date(t.date + 'T00:00:00')
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
            if (key in monthlyChanges) monthlyChanges[key] += t.amount
        }

        // Walk backwards from current net worth to reconstruct monthly snapshots
        const sortedMonths = Object.keys(monthlyChanges).sort()
        let runningNetWorth = totalNetWorth
        const netWorthData: { month: string; netWorth: number }[] = []
        for (let i = sortedMonths.length - 1; i >= 0; i--) {
            const key = sortedMonths[i]
            netWorthData.unshift({
                month: new Date(key + '-01').toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
                netWorth: runningNetWorth,
            })
            runningNetWorth -= monthlyChanges[key]
        }

        return NextResponse.json({
            net_worth: totalNetWorth,
            netWorth: netWorthData,
            as_of_date: now.toISOString().split('T')[0],
            accounts: accountsWithBalance,
            monthly_changes: netWorthData,
            summary: {
                total_assets: totalAssets,
                total_liabilities: totalLiabilities,
                account_count: accounts.length,
            },
        })
    } catch (error) {
        if (error instanceof Error && error.message === 'Unauthorized') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
