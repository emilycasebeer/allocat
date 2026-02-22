import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createServerSupabaseClient } from '@/lib/supabase'

export async function GET(request: NextRequest) {
    try {
        const user = await requireAuth(request)
        const supabase = await createServerSupabaseClient()
        const { searchParams } = new URL(request.url)

        const startDate = searchParams.get('start_date')
        const endDate = searchParams.get('end_date')
        const groupBy = searchParams.get('group_by') || 'category'

        if (!startDate || !endDate) {
            return NextResponse.json({ error: 'start_date and end_date are required' }, { status: 400 })
        }

        const { data: transactions, error } = await supabase
            .from('transactions')
            .select(`
                id, amount, date, memo,
                accounts!inner(user_id, name),
                categories(
                    name,
                    category_groups(name)
                )
            `)
            .eq('accounts.user_id', user.id)
            .eq('type', 'expense')
            .gte('date', startDate)
            .lte('date', endDate)
            .is('parent_transaction_id', null)
            .order('date')

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        if (!transactions) {
            return NextResponse.json({ spending: [], summary: { total_spending: 0, transaction_count: 0 } })
        }

        // Helper to extract nested names from the join
        const getCategoryName = (t: any) => t.categories?.name ?? 'Uncategorized'
        const getGroupName = (t: any) => t.categories?.category_groups?.name ?? 'Uncategorized'
        const getAccountName = (t: any) => (t.accounts as any).name

        let spendingReport: any[]

        if (groupBy === 'category') {
            const byCategory = transactions.reduce((acc, t) => {
                const key = getCategoryName(t)
                const group = getGroupName(t)
                if (!acc[key]) acc[key] = { category: key, group, total: 0, count: 0, transactions: [] }
                acc[key].total += Math.abs(t.amount)
                acc[key].count++
                acc[key].transactions.push({ id: t.id, amount: t.amount, date: t.date, memo: t.memo, account: getAccountName(t) })
                return acc
            }, {} as Record<string, any>)
            spendingReport = Object.values(byCategory).sort((a, b) => b.total - a.total)

        } else if (groupBy === 'month') {
            const byMonth = transactions.reduce((acc, t) => {
                const d = new Date(t.date)
                const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
                if (!acc[key]) acc[key] = { month: key, total: 0, count: 0, categories: {} }
                acc[key].total += Math.abs(t.amount)
                acc[key].count++
                const cat = getCategoryName(t)
                acc[key].categories[cat] = (acc[key].categories[cat] ?? 0) + Math.abs(t.amount)
                return acc
            }, {} as Record<string, any>)
            spendingReport = Object.values(byMonth).sort((a, b) => a.month.localeCompare(b.month))

        } else {
            // group by account
            const byAccount = transactions.reduce((acc, t) => {
                const key = getAccountName(t)
                if (!acc[key]) acc[key] = { account: key, total: 0, count: 0, categories: {} }
                acc[key].total += Math.abs(t.amount)
                acc[key].count++
                const cat = getCategoryName(t)
                acc[key].categories[cat] = (acc[key].categories[cat] ?? 0) + Math.abs(t.amount)
                return acc
            }, {} as Record<string, any>)
            spendingReport = Object.values(byAccount).sort((a, b) => b.total - a.total)
        }

        const totalSpending = transactions.reduce((sum, t) => sum + Math.abs(t.amount), 0)

        return NextResponse.json({
            spending: spendingReport,
            summary: {
                total_spending: totalSpending,
                transaction_count: transactions.length,
                average_transaction: transactions.length ? totalSpending / transactions.length : 0,
                date_range: { start: startDate, end: endDate },
                top_categories: spendingReport.slice(0, 5),
            }
        })
    } catch (error) {
        if (error instanceof Error && error.message === 'Unauthorized') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
