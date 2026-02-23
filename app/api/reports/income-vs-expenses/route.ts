import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedSupabaseClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import type { Database } from '@/lib/database.types'

type Transaction = Database['public']['Tables']['transactions']['Row']
type Account = Database['public']['Tables']['accounts']['Row']

export async function GET(request: NextRequest) {
    try {
        const user = await requireAuth(request)
        const { searchParams } = new URL(request.url)
        const months = Number(searchParams.get('months') || 3)

        const supabase = createAuthenticatedSupabaseClient(user.accessToken)

        const endDate = new Date()
        const startDate = new Date()
        startDate.setMonth(startDate.getMonth() - months)

        const { data: transactions, error } = await supabase
            .from('transactions')
            .select(`
                *,
                accounts:account_id (
                    id,
                    user_id
                )
            `)
            .eq('accounts.user_id', user.id)
            .gte('date', startDate.toISOString().split('T')[0])
            .lte('date', endDate.toISOString().split('T')[0])
            .order('date', { ascending: true })

        if (error) {
            console.error('Error fetching transactions:', error)
            return NextResponse.json({ error: 'Failed to fetch transactions' }, { status: 500 })
        }

        // Cast transactions to proper type
        const typedTransactions = transactions as (Transaction & { accounts: Account })[] | null

        // Group transactions by month
        const monthlyData = (typedTransactions || []).reduce<
            Record<string, { income: number; expenses: number }>
        >((acc, tx) => {
            const date = new Date(tx.date)
            const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`

            if (!acc[monthKey]) acc[monthKey] = { income: 0, expenses: 0 }

            if (tx.type === 'income') acc[monthKey].income += Math.abs(tx.amount)
            else if (tx.type === 'expense') acc[monthKey].expenses += Math.abs(tx.amount)

            return acc
        }, {})

        const incomeVsExpenses = Object.entries(monthlyData)
            .map(([month, data]) => ({ month, ...data }))
            .sort((a, b) => a.month.localeCompare(b.month))

        const formattedData = incomeVsExpenses.map(item => ({
            ...item,
            month: new Date(item.month + '-01').toLocaleDateString('en-US', {
                month: 'short',
                year: '2-digit'
            })
        }))

        return NextResponse.json({
            incomeVsExpenses: formattedData,
            months,
            startDate: startDate.toISOString().split('T')[0],
            endDate: endDate.toISOString().split('T')[0]
        })
    } catch (err) {
        console.error('Error generating income vs expenses report:', err)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
