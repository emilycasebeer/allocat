import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedSupabaseClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'

export async function GET(request: NextRequest) {
    try {
        const user = await requireAuth(request)
        const { searchParams } = new URL(request.url)
        const month = parseInt(searchParams.get('month') || '0')
        const year = parseInt(searchParams.get('year') || '0')

        if (!month || !year) {
            return NextResponse.json(
                { error: 'Month and year are required' },
                { status: 400 }
            )
        }

        const supabase = createAuthenticatedSupabaseClient(user.accessToken)

        // Get the start and end dates for the month
        const startDate = new Date(year, month - 1, 1)
        const endDate = new Date(year, month, 0)

        // Get all transactions for the user in the specified month
        const { data: transactions, error: transactionsError } = await supabase
            .from('transactions')
            .select(`
                id,
                amount,
                date,
                type,
                account_id,
                accounts!inner(user_id)
            `)
            .eq('accounts.user_id', user.id)
            .gte('date', startDate.toISOString().split('T')[0])
            .lte('date', endDate.toISOString().split('T')[0])
            .order('date', { ascending: true })

        if (transactionsError) {
            console.error('Error fetching transactions:', transactionsError)
            return NextResponse.json(
                { error: 'Failed to fetch transactions' },
                { status: 500 }
            )
        }

        // Calculate Age of Money
        // This is a simplified calculation that estimates the average time
        // between when money was earned and when it was spent
        let totalIncome = 0
        let totalExpenses = 0
        let weightedSpendingDays = 0

        transactions?.forEach(transaction => {
            if (transaction.type === 'income') {
                totalIncome += Math.abs(transaction.amount)
            } else {
                const expense = Math.abs(transaction.amount)
                totalExpenses += expense

                // Calculate days from start of month
                const transactionDate = new Date(transaction.date)
                const daysFromStart = Math.floor((transactionDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
                weightedSpendingDays += expense * daysFromStart
            }
        })

        let ageOfMoney = 30 // Default to 30 days

        if (totalExpenses > 0 && totalIncome > 0) {
            // Calculate average spending day weighted by amount
            const averageSpendingDay = weightedSpendingDays / totalExpenses

            // Estimate age of money based on spending patterns
            // If spending happens early in the month, age of money is lower
            // If spending happens late in the month, age of money is higher
            const monthLength = endDate.getDate()
            const spendingRatio = averageSpendingDay / monthLength

            // Adjust age of money based on spending pattern
            if (spendingRatio < 0.3) {
                ageOfMoney = Math.max(15, 30 - (0.3 - spendingRatio) * 50)
            } else if (spendingRatio > 0.7) {
                ageOfMoney = Math.min(60, 30 + (spendingRatio - 0.7) * 50)
            } else {
                ageOfMoney = 30 + (spendingRatio - 0.5) * 20
            }

            // Ensure age of money is within reasonable bounds
            ageOfMoney = Math.max(7, Math.min(90, ageOfMoney))
        }

        return NextResponse.json({
            ageOfMoney: Math.round(ageOfMoney),
            totalIncome,
            totalExpenses,
            month,
            year
        })

    } catch (error) {
        console.error('Error calculating age of money:', error)
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
}
