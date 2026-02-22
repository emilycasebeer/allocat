'use client'

import { useState, useEffect } from 'react'
import { supabase } from '../providers'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Plus, TrendingUp, TrendingDown, ArrowLeftRight } from 'lucide-react'
import { AddTransactionModal } from '@/app/dashboard/add-transaction-modal'
import type { Account, Category } from '@/app/dashboard/dashboard'

interface Transaction {
    id: string
    account_id: string
    category_id: string | null
    amount: number
    date: string
    memo: string | null
    type: 'income' | 'expense' | 'transfer'
    cleared: 'uncleared' | 'cleared' | 'reconciled'
    category_name: string | null
    group_name: string | null
}

interface TransactionsViewProps {
    account: Account | null
    categories: Category[]
    onTransactionAdded: () => void
    currentMonth?: number
    currentYear?: number
}

export function TransactionsView({ account, categories, onTransactionAdded, currentMonth, currentYear }: TransactionsViewProps) {
    const [transactions, setTransactions] = useState<Transaction[]>([])
    const [loading, setLoading] = useState(true)
    const [showAddTransaction, setShowAddTransaction] = useState(false)
    const [filterType, setFilterType] = useState<'all' | 'income' | 'expense' | 'transfer'>('all')

    useEffect(() => {
        if (account) fetchTransactions()
    }, [account])

    const fetchTransactions = async () => {
        if (!account) return
        setLoading(true)
        try {
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) return

            const response = await fetch(`/api/transactions?account_id=${account.id}`, {
                headers: { 'Authorization': `Bearer ${session.access_token}` }
            })

            if (response.ok) {
                const { transactions } = await response.json()
                setTransactions(transactions)
            }
        } catch (error) {
            console.error('Error fetching transactions:', error)
        } finally {
            setLoading(false)
        }
    }

    const handleTransactionAdded = () => {
        fetchTransactions()
        onTransactionAdded()
    }

    const formatDate = (dateString: string) => {
        const date = new Date(dateString + 'T00:00:00') // prevent UTC shift
        const now = new Date()
        const isToday = date.toDateString() === now.toDateString()
        if (isToday) return 'Today'
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    }

    const getAmountClass = (amount: number) => amount >= 0 ? 'amount-positive' : 'amount-negative'

    const getTransactionTypeIcon = (type: string) => {
        switch (type) {
            case 'income':   return <TrendingUp className="h-4 w-4 text-green-600" />
            case 'expense':  return <TrendingDown className="h-4 w-4 text-red-600" />
            case 'transfer': return <ArrowLeftRight className="h-4 w-4 text-blue-600" />
            default:         return null
        }
    }

    const getClearedLabel = (cleared: string) => {
        if (cleared === 'cleared') return '✓'
        if (cleared === 'reconciled') return '🔒'
        return ''
    }

    const filteredTransactions = transactions.filter(t =>
        filterType === 'all' || t.type === filterType
    )

    if (!account) {
        return (
            <div className="text-center py-12">
                <p className="text-gray-500">Select an account to view transactions.</p>
            </div>
        )
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {/* Account Header */}
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle className="text-xl">{account.name}</CardTitle>
                            <p className="text-sm text-gray-500">{account.type_name}</p>
                        </div>
                        <div className="text-right">
                            <div className={`text-2xl font-bold ${account.is_liability ? 'text-red-700' : 'text-gray-900'}`}>
                                {account.is_liability ? '-' : ''}${Math.abs(account.balance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                            <div className="text-sm text-gray-500">Cleared Balance</div>
                        </div>
                    </div>
                </CardHeader>
            </Card>

            {/* Filters + Add */}
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                            <span className="text-sm text-gray-600">Type:</span>
                            <div className="flex space-x-1">
                                {(['all', 'income', 'expense', 'transfer'] as const).map((type) => (
                                    <Button
                                        key={type}
                                        variant={filterType === type ? 'default' : 'outline'}
                                        size="sm"
                                        onClick={() => setFilterType(type)}
                                        className="capitalize"
                                    >
                                        {type}
                                    </Button>
                                ))}
                            </div>
                        </div>
                        <Button onClick={() => setShowAddTransaction(true)} size="sm">
                            <Plus className="h-4 w-4 mr-2" />
                            Add Transaction
                        </Button>
                    </div>
                </CardHeader>
            </Card>

            {/* Transaction List */}
            <Card>
                <CardHeader>
                    <CardTitle>Transactions</CardTitle>
                </CardHeader>
                <CardContent>
                    {filteredTransactions.length === 0 ? (
                        <div className="text-center py-8 text-gray-500">
                            <p>No transactions found.</p>
                            <p className="text-sm mt-2">Try adjusting your filters or add a new transaction.</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b border-gray-200">
                                        <th className="text-left py-3 px-4 font-medium text-gray-700 w-6"></th>
                                        <th className="text-left py-3 px-4 font-medium text-gray-700">Date</th>
                                        <th className="text-left py-3 px-4 font-medium text-gray-700">Memo</th>
                                        <th className="text-left py-3 px-4 font-medium text-gray-700">Category</th>
                                        <th className="text-right py-3 px-4 font-medium text-gray-700">Amount</th>
                                        <th className="text-center py-3 px-4 font-medium text-gray-700">Type</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredTransactions.map((transaction) => (
                                        <tr key={transaction.id} className="border-b border-gray-100 hover:bg-gray-50">
                                            <td className="py-3 px-4 text-sm text-gray-400 text-center">
                                                {getClearedLabel(transaction.cleared)}
                                            </td>
                                            <td className="py-3 px-4 text-sm text-gray-900">
                                                {formatDate(transaction.date)}
                                            </td>
                                            <td className="py-3 px-4 text-sm text-gray-900">
                                                {transaction.memo || <span className="text-gray-400 italic">No memo</span>}
                                            </td>
                                            <td className="py-3 px-4 text-sm text-gray-600">
                                                {transaction.category_name
                                                    ? `${transaction.group_name} — ${transaction.category_name}`
                                                    : <span className="text-gray-400 italic">Uncategorized</span>}
                                            </td>
                                            <td className={`py-3 px-4 text-sm font-medium text-right ${getAmountClass(transaction.amount)}`}>
                                                ${Math.abs(transaction.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </td>
                                            <td className="py-3 px-4 text-center">
                                                <div className="flex items-center justify-center space-x-1">
                                                    {getTransactionTypeIcon(transaction.type)}
                                                    <span className="text-xs text-gray-600 capitalize">{transaction.type}</span>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>

            <AddTransactionModal
                open={showAddTransaction}
                onOpenChange={setShowAddTransaction}
                account={account}
                categories={categories}
                onTransactionAdded={handleTransactionAdded}
                currentMonth={currentMonth}
                currentYear={currentYear}
            />
        </div>
    )
}
