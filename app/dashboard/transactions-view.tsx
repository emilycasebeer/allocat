'use client'

import { useState, useEffect } from 'react'
import { supabase } from '../providers'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import {
    Plus, TrendingUp, TrendingDown, ArrowLeftRight,
    Pencil, Trash2, Scale, ChevronDown, ChevronRight, Search, X, Lock,
} from 'lucide-react'
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
    transfer_transaction_id: string | null
    to_account_id: string | null
}

interface TransactionsViewProps {
    account: Account | null
    accounts: Account[]
    categories: Category[]
    onTransactionAdded: () => void
    currentMonth?: number
    currentYear?: number
}

function ClearedDot({ cleared, onClick }: { cleared: Transaction['cleared']; onClick?: () => void }) {
    if (cleared === 'reconciled') {
        return (
            <div title="Reconciled" className="flex items-center justify-center h-5 w-5">
                <Lock className="h-3 w-3 text-accent" />
            </div>
        )
    }
    if (cleared === 'cleared') {
        return (
            <button
                onClick={onClick}
                title="Cleared — click to unmark"
                className="h-5 w-5 flex items-center justify-center"
            >
                <div className="h-2.5 w-2.5 rounded-full bg-primary" />
            </button>
        )
    }
    return (
        <button
            onClick={onClick}
            title="Uncleared — click to mark cleared"
            className="h-5 w-5 flex items-center justify-center group"
        >
            <div className="h-2.5 w-2.5 rounded-full border border-muted-foreground/40 group-hover:border-primary transition-colors" />
        </button>
    )
}

const formatDate = (dateString: string) => {
    const date = new Date(dateString + 'T00:00:00')
    const now = new Date()
    if (date.toDateString() === now.toDateString()) return 'Today'
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const formatAmount = (amount: number) =>
    `$${Math.abs(amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const getTypeIcon = (type: string) => {
    if (type === 'income') return <TrendingUp className="h-3.5 w-3.5 text-primary" />
    if (type === 'expense') return <TrendingDown className="h-3.5 w-3.5 text-destructive" />
    return <ArrowLeftRight className="h-3.5 w-3.5 text-accent" />
}

export function TransactionsView({
    account, accounts, categories, onTransactionAdded, currentMonth, currentYear
}: TransactionsViewProps) {
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
                headers: { 'Authorization': `Bearer ${session.access_token}` },
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
        if (!confirm('Delete this transaction? This cannot be undone.')) return
        try {
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) return
            const response = await fetch(`/api/transactions/${transaction.id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${session.access_token}` },
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
                body: JSON.stringify({ cleared: newCleared }),
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
            <div className="flex items-center justify-center h-64">
                <p className="text-muted-foreground text-sm">Select an account from the sidebar to view transactions.</p>
            </div>
        )
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="flex flex-col items-center gap-3">
                    <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                    <span className="text-sm text-muted-foreground">Loading transactions…</span>
                </div>
            </div>
        )
    }

    const balanceDisplay = `${account.is_liability ? '-' : ''}$${Math.abs(account.balance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

    return (
        <div className="space-y-4">
            {/* ── Account Header ───────────────────────────────────────── */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="font-display text-xl font-bold text-foreground">{account.name}</h2>
                    <p className="text-sm text-muted-foreground mt-0.5">{account.type_name}</p>
                </div>
                <div className="text-right">
                    <div className={`font-display text-2xl font-bold financial-figure ${account.is_liability ? 'text-destructive' : 'text-foreground'}`}>
                        {balanceDisplay}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">Cleared Balance</p>
                </div>
            </div>

            {/* ── Filter Bar ───────────────────────────────────────────── */}
            <Card>
                <CardHeader className="py-3 px-4">
                    <div className="flex flex-wrap items-center gap-2">
                        {/* Type filter pills */}
                        <div className="flex items-center gap-1 bg-secondary rounded-lg p-0.5">
                            {(['all', 'income', 'expense', 'transfer'] as const).map((type) => (
                                <button
                                    key={type}
                                    onClick={() => setFilterType(type)}
                                    className={`px-3 py-1 rounded-md text-xs font-medium transition-all capitalize ${
                                        filterType === type
                                            ? 'bg-card text-foreground shadow-sm'
                                            : 'text-muted-foreground hover:text-foreground'
                                    }`}
                                >
                                    {type}
                                </button>
                            ))}
                        </div>

                        {/* Search */}
                        <div className="relative flex-1 min-w-[160px]">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60" />
                            <Input
                                placeholder="Search payee or memo…"
                                value={searchText}
                                onChange={(e) => setSearchText(e.target.value)}
                                className="pl-8 h-8 text-xs bg-secondary border-transparent focus:border-border"
                            />
                        </div>

                        {/* Cleared filter pills */}
                        <div className="flex items-center gap-1">
                            {(['all', 'uncleared', 'cleared', 'reconciled'] as const).map((s) => (
                                <button
                                    key={s}
                                    onClick={() => setClearedFilter(s)}
                                    className={`h-7 px-2.5 rounded-md text-xs font-medium transition-all capitalize ${
                                        clearedFilter === s
                                            ? 'bg-primary/20 text-primary'
                                            : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                                    }`}
                                >
                                    {s}
                                </button>
                            ))}
                        </div>

                        {/* Date range */}
                        <div className="flex items-center gap-1.5">
                            <span className="text-xs text-muted-foreground">From</span>
                            <Input
                                type="date"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                className="h-7 text-xs w-32 bg-secondary border-transparent"
                            />
                            <span className="text-xs text-muted-foreground">To</span>
                            <Input
                                type="date"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                className="h-7 text-xs w-32 bg-secondary border-transparent"
                            />
                        </div>

                        {hasActiveFilters && (
                            <button
                                onClick={clearFilters}
                                className="h-7 px-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground rounded-md hover:bg-muted transition-colors"
                            >
                                <X className="h-3 w-3" />
                                Clear
                            </button>
                        )}

                        {/* Actions */}
                        <div className="ml-auto flex items-center gap-2">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setShowReconcile(true)}
                                className="h-8 px-3 text-xs text-muted-foreground hover:text-foreground"
                            >
                                <Scale className="h-3.5 w-3.5 mr-1.5" />
                                Reconcile
                            </Button>
                            <Button
                                size="sm"
                                onClick={() => setShowAddTransaction(true)}
                                className="h-8 px-3 text-xs"
                            >
                                <Plus className="h-3.5 w-3.5 mr-1.5" />
                                Add Transaction
                            </Button>
                        </div>
                    </div>
                </CardHeader>
            </Card>

            {/* ── Transaction Table ────────────────────────────────────── */}
            <Card>
                <CardContent className="p-0">
                    {filteredTransactions.length === 0 ? (
                        <div className="text-center py-12 text-muted-foreground">
                            <p className="text-sm">No transactions found.</p>
                            <p className="text-xs mt-1 text-muted-foreground/60">Try adjusting your filters or add a new transaction.</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr style={{ backgroundColor: 'hsl(var(--secondary))' }}>
                                        <th className="w-8 py-3 px-3"></th>
                                        <th className="text-left py-3 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Date</th>
                                        <th className="text-left py-3 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Payee</th>
                                        <th className="text-left py-3 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Category</th>
                                        <th className="text-left py-3 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Memo</th>
                                        <th className="text-right py-3 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Amount</th>
                                        <th className="text-center py-3 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground w-20">Type</th>
                                        <th className="w-16"></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredTransactions.map((transaction) => {
                                        const isExpanded = expandedSplits.has(transaction.id)
                                        const amountClass = transaction.amount >= 0 ? 'text-primary' : 'text-destructive'

                                        return (
                                            <>
                                                <tr
                                                    key={transaction.id}
                                                    className="group border-t hover:bg-muted/30 transition-colors"
                                                    style={{ borderColor: 'hsl(var(--border) / 0.5)' }}
                                                >
                                                    {/* Cleared indicator */}
                                                    <td className="py-3 px-3 text-center">
                                                        <ClearedDot
                                                            cleared={transaction.cleared}
                                                            onClick={() => handleClearedToggle(transaction)}
                                                        />
                                                    </td>

                                                    {/* Date */}
                                                    <td className="py-3 px-3 text-sm text-muted-foreground whitespace-nowrap">
                                                        {formatDate(transaction.date)}
                                                    </td>

                                                    {/* Payee */}
                                                    <td className="py-3 px-3 text-sm text-foreground/90 font-medium">
                                                        {transaction.payee_name || (
                                                            <span className="text-muted-foreground/40 italic font-normal">—</span>
                                                        )}
                                                    </td>

                                                    {/* Category */}
                                                    <td className="py-3 px-3 text-sm">
                                                        {transaction.is_split ? (
                                                            <button
                                                                className="flex items-center gap-1 text-accent hover:text-accent/80 transition-colors text-xs font-medium"
                                                                onClick={() => toggleSplitExpand(transaction.id)}
                                                            >
                                                                {isExpanded
                                                                    ? <ChevronDown className="h-3.5 w-3.5" />
                                                                    : <ChevronRight className="h-3.5 w-3.5" />
                                                                }
                                                                Split ({transaction.splits.length})
                                                            </button>
                                                        ) : transaction.type === 'transfer' ? (
                                                            <span className="text-accent text-xs font-medium">
                                                                → {accounts.find(a => a.id === transaction.to_account_id)?.name ?? 'Other Account'}
                                                            </span>
                                                        ) : transaction.category_name ? (
                                                            <span className="text-muted-foreground text-xs">
                                                                {transaction.group_name} · {transaction.category_name}
                                                            </span>
                                                        ) : (
                                                            <span className="text-muted-foreground/40 italic text-xs">Uncategorized</span>
                                                        )}
                                                    </td>

                                                    {/* Memo */}
                                                    <td className="py-3 px-3 text-xs text-muted-foreground/70 max-w-[160px] truncate">
                                                        {transaction.memo || <span className="text-muted-foreground/30">—</span>}
                                                    </td>

                                                    {/* Amount */}
                                                    <td className={`py-3 px-3 text-sm font-semibold text-right financial-figure ${amountClass}`}>
                                                        {formatAmount(transaction.amount)}
                                                    </td>

                                                    {/* Type */}
                                                    <td className="py-3 px-3 text-center">
                                                        <div className="flex items-center justify-center gap-1">
                                                            {getTypeIcon(transaction.type)}
                                                        </div>
                                                    </td>

                                                    {/* Actions */}
                                                    <td className="py-3 px-2">
                                                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                            <button
                                                                title="Edit"
                                                                className="p-1 rounded hover:bg-muted text-muted-foreground/60 hover:text-foreground transition-colors"
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
                                                                    transfer_transaction_id: transaction.transfer_transaction_id,
                                                                    to_account_id: transaction.to_account_id,
                                                                })}
                                                            >
                                                                <Pencil className="h-3.5 w-3.5" />
                                                            </button>
                                                            <button
                                                                title="Delete"
                                                                className="p-1 rounded hover:bg-destructive/10 text-muted-foreground/60 hover:text-destructive transition-colors"
                                                                onClick={() => handleDelete(transaction)}
                                                            >
                                                                <Trash2 className="h-3.5 w-3.5" />
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>

                                                {/* Split rows */}
                                                {transaction.is_split && isExpanded && transaction.splits.map((split) => (
                                                    <tr
                                                        key={split.id}
                                                        className="border-t"
                                                        style={{
                                                            backgroundColor: 'hsl(var(--primary) / 0.04)',
                                                            borderColor: 'hsl(var(--border) / 0.3)',
                                                        }}
                                                    >
                                                        <td></td>
                                                        <td></td>
                                                        <td></td>
                                                        <td className="py-1.5 px-3 pl-10 text-xs text-muted-foreground">
                                                            {split.category_name
                                                                ? `${split.group_name} · ${split.category_name}`
                                                                : <span className="italic text-muted-foreground/40">Uncategorized</span>
                                                            }
                                                        </td>
                                                        <td className="py-1.5 px-3 text-xs text-muted-foreground/60 italic">
                                                            {split.memo || '—'}
                                                        </td>
                                                        <td className={`py-1.5 px-3 text-xs font-semibold text-right financial-figure ${split.amount >= 0 ? 'text-primary/70' : 'text-destructive/70'}`}>
                                                            {formatAmount(split.amount)}
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
                accounts={accounts}
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
