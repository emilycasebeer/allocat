'use client'

import { useState, useEffect } from 'react'
import { supabase } from '../providers'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Plus, TrendingUp, TrendingDown, ArrowLeftRight, Pencil, Trash2, Scale, ChevronDown, ChevronRight, Search, X } from 'lucide-react'
import { AddTransactionModal } from '@/app/dashboard/add-transaction-modal'
import type { EditingTransaction } from '@/app/dashboard/add-transaction-modal'
import { ReconcileModal } from '@/app/dashboard/reconcile-modal'
import type { Account, Category } from '@/app/dashboard/dashboard'

interface SplitRow {
    id: string
    amount: number
    memo: string | null
    category_id: string | null
    category_name: string | null
    group_name: string | null
}

interface Transaction {
    id: string
    account_id: string
    category_id: string | null
    payee_name: string | null
    amount: number
    date: string
    memo: string | null
    type: 'income' | 'expense' | 'transfer'
    cleared: 'uncleared' | 'cleared' | 'reconciled'
    category_name: string | null
    group_name: string | null
    is_split: boolean
    splits: SplitRow[]
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
    const [editing, setEditing] = useState<EditingTransaction | null>(null)
    const [showReconcile, setShowReconcile] = useState(false)
    const [expandedSplits, setExpandedSplits] = useState<Set<string>>(new Set())
    const [filterType, setFilterType] = useState<'all' | 'income' | 'expense' | 'transfer'>('all')
    const [searchText, setSearchText] = useState('')
    const [clearedFilter, setClearedFilter] = useState<'all' | 'uncleared' | 'cleared' | 'reconciled'>('all')
    const [startDate, setStartDate] = useState('')
    const [endDate, setEndDate] = useState('')

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

    const handleDelete = async (transaction: Transaction) => {
        if (!confirm(`Delete this transaction? This cannot be undone.`)) return
        try {
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) return
            const response = await fetch(`/api/transactions/${transaction.id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${session.access_token}` }
            })
            if (response.ok) {
                fetchTransactions()
                onTransactionAdded()
            } else {
                const err = await response.json()
                alert(`Error: ${err.error}`)
            }
        } catch (error) {
            console.error('Error deleting transaction:', error)
        }
    }

    const handleClearedToggle = async (transaction: Transaction) => {
        if (transaction.cleared === 'reconciled') return
        const newCleared = transaction.cleared === 'uncleared' ? 'cleared' : 'uncleared'
        try {
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) return
            const response = await fetch(`/api/transactions/${transaction.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
                body: JSON.stringify({ cleared: newCleared })
            })
            if (response.ok) {
                setTransactions(prev => prev.map(t =>
                    t.id === transaction.id ? { ...t, cleared: newCleared } : t
                ))
                onTransactionAdded()
            }
        } catch (error) {
            console.error('Error toggling cleared:', error)
        }
    }

    const toggleSplitExpand = (id: string) => {
        setExpandedSplits(prev => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }

    const formatDate = (dateString: string) => {
        const date = new Date(dateString + 'T00:00:00')
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

    const hasActiveFilters = searchText || clearedFilter !== 'all' || startDate || endDate

    const filteredTransactions = transactions.filter(t => {
        if (filterType !== 'all' && t.type !== filterType) return false
        if (clearedFilter !== 'all' && t.cleared !== clearedFilter) return false
        if (startDate && t.date < startDate) return false
        if (endDate && t.date > endDate) return false
        if (searchText) {
            const q = searchText.toLowerCase()
            const inPayee = t.payee_name?.toLowerCase().includes(q) ?? false
            const inMemo = t.memo?.toLowerCase().includes(q) ?? false
            if (!inPayee && !inMemo) return false
        }
        return true
    })

    const clearFilters = () => {
        setSearchText('')
        setClearedFilter('all')
        setStartDate('')
        setEndDate('')
    }

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
                <CardHeader className="pb-3">
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
                        <div className="flex gap-2">
                            <Button variant="outline" onClick={() => setShowReconcile(true)} size="sm">
                                <Scale className="h-4 w-4 mr-2" />
                                Reconcile
                            </Button>
                            <Button onClick={() => setShowAddTransaction(true)} size="sm">
                                <Plus className="h-4 w-4 mr-2" />
                                Add Transaction
                            </Button>
                        </div>
                    </div>
                    {/* Search + additional filters */}
                    <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-gray-100 mt-3">
                        <div className="relative flex-1 min-w-[180px]">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                            <Input
                                placeholder="Search payee or memo..."
                                value={searchText}
                                onChange={(e) => setSearchText(e.target.value)}
                                className="pl-8 h-8 text-sm"
                            />
                        </div>
                        <div className="flex items-center gap-1">
                            <span className="text-xs text-gray-500">Cleared:</span>
                            {(['all', 'uncleared', 'cleared', 'reconciled'] as const).map((s) => (
                                <Button
                                    key={s}
                                    variant={clearedFilter === s ? 'default' : 'outline'}
                                    size="sm"
                                    className="h-8 text-xs capitalize"
                                    onClick={() => setClearedFilter(s)}
                                >
                                    {s}
                                </Button>
                            ))}
                        </div>
                        <div className="flex items-center gap-1">
                            <span className="text-xs text-gray-500">From:</span>
                            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-8 text-xs w-36" />
                            <span className="text-xs text-gray-500">To:</span>
                            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="h-8 text-xs w-36" />
                        </div>
                        {hasActiveFilters && (
                            <Button variant="ghost" size="sm" className="h-8 text-xs text-gray-500" onClick={clearFilters}>
                                <X className="h-3 w-3 mr-1" />
                                Clear
                            </Button>
                        )}
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
                                        <th className="text-left py-3 px-2 font-medium text-gray-700 w-6"></th>
                                        <th className="text-left py-3 px-4 font-medium text-gray-700">Date</th>
                                        <th className="text-left py-3 px-4 font-medium text-gray-700">Payee</th>
                                        <th className="text-left py-3 px-4 font-medium text-gray-700">Memo</th>
                                        <th className="text-left py-3 px-4 font-medium text-gray-700">Category</th>
                                        <th className="text-right py-3 px-4 font-medium text-gray-700">Amount</th>
                                        <th className="text-center py-3 px-4 font-medium text-gray-700">Type</th>
                                        <th className="w-16"></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredTransactions.map((transaction) => {
                                        const isExpanded = expandedSplits.has(transaction.id)
                                        return (
                                            <>
                                                <tr key={transaction.id} className="border-b border-gray-100 hover:bg-gray-50 group">
                                                    <td className="py-3 px-2 text-center">
                                                        <button
                                                            onClick={() => handleClearedToggle(transaction)}
                                                            title={transaction.cleared === 'reconciled' ? 'Reconciled' : transaction.cleared === 'cleared' ? 'Cleared (click to unmark)' : 'Uncleared (click to clear)'}
                                                            className={`text-sm w-5 h-5 rounded-full flex items-center justify-center
                                                                ${transaction.cleared === 'reconciled' ? 'cursor-default' : 'cursor-pointer hover:bg-gray-200'}
                                                                ${transaction.cleared === 'cleared' ? 'text-green-600 font-bold' : 'text-gray-400'}`}
                                                        >
                                                            {getClearedLabel(transaction.cleared)}
                                                        </button>
                                                    </td>
                                                    <td className="py-3 px-4 text-sm text-gray-900">
                                                        {formatDate(transaction.date)}
                                                    </td>
                                                    <td className="py-3 px-4 text-sm text-gray-900">
                                                        {transaction.payee_name || <span className="text-gray-400 italic">—</span>}
                                                    </td>
                                                    <td className="py-3 px-4 text-sm text-gray-900">
                                                        {transaction.memo || <span className="text-gray-400 italic">—</span>}
                                                    </td>
                                                    <td className="py-3 px-4 text-sm text-gray-600">
                                                        {transaction.is_split ? (
                                                            <button
                                                                className="flex items-center gap-1 text-blue-600 hover:underline"
                                                                onClick={() => toggleSplitExpand(transaction.id)}
                                                            >
                                                                {isExpanded
                                                                    ? <ChevronDown className="h-3.5 w-3.5" />
                                                                    : <ChevronRight className="h-3.5 w-3.5" />}
                                                                Split ({transaction.splits.length})
                                                            </button>
                                                        ) : transaction.category_name
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
                                                    <td className="py-3 px-2">
                                                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                            <button
                                                                title="Edit"
                                                                className="p-1 rounded hover:bg-gray-200 text-gray-500 hover:text-gray-800"
                                                                onClick={() => setEditing({
                                                                    id: transaction.id,
                                                                    account_id: transaction.account_id,
                                                                    category_id: transaction.category_id,
                                                                    payee_name: transaction.payee_name,
                                                                    amount: transaction.amount,
                                                                    date: transaction.date,
                                                                    memo: transaction.memo,
                                                                    type: transaction.type,
                                                                    cleared: transaction.cleared,
                                                                    is_split: transaction.is_split,
                                                                    splits: transaction.splits,
                                                                })}
                                                            >
                                                                <Pencil className="h-3.5 w-3.5" />
                                                            </button>
                                                            <button
                                                                title="Delete"
                                                                className="p-1 rounded hover:bg-red-100 text-gray-500 hover:text-red-600"
                                                                onClick={() => handleDelete(transaction)}
                                                            >
                                                                <Trash2 className="h-3.5 w-3.5" />
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                                {transaction.is_split && isExpanded && transaction.splits.map((split) => (
                                                    <tr key={split.id} className="bg-blue-50/50 border-b border-blue-100">
                                                        <td></td>
                                                        <td></td>
                                                        <td></td>
                                                        <td className="py-1.5 px-4 text-xs text-gray-500 pl-8 italic">
                                                            {split.memo || '—'}
                                                        </td>
                                                        <td className="py-1.5 px-4 text-xs text-gray-600 pl-8">
                                                            {split.category_name
                                                                ? `${split.group_name} — ${split.category_name}`
                                                                : <span className="text-gray-400 italic">Uncategorized</span>}
                                                        </td>
                                                        <td className={`py-1.5 px-4 text-xs font-medium text-right ${getAmountClass(split.amount)}`}>
                                                            ${Math.abs(split.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                        </td>
                                                        <td colSpan={2}></td>
                                                    </tr>
                                                ))}
                                            </>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>

            <AddTransactionModal
                open={showAddTransaction || !!editing}
                onOpenChange={(open) => {
                    if (!open) {
                        setShowAddTransaction(false)
                        setEditing(null)
                    }
                }}
                account={account}
                categories={categories}
                onTransactionAdded={handleTransactionAdded}
                editing={editing}
                currentMonth={currentMonth}
                currentYear={currentYear}
            />

            {showReconcile && (
                <ReconcileModal
                    open={showReconcile}
                    onOpenChange={setShowReconcile}
                    account={account}
                    onReconciled={() => {
                        fetchTransactions()
                        onTransactionAdded()
                    }}
                />
            )}
        </div>
    )
}
