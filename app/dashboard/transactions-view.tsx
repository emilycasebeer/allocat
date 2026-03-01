'use client'

import { useState, useEffect, useRef, useCallback, useMemo, Fragment } from 'react'
import { useAuth } from '../providers'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import {
    Plus, Pencil, Trash2, Scale, ChevronDown, ChevronRight, Search, X, Lock,
} from 'lucide-react'
import { AddTransactionModal } from '@/app/dashboard/add-transaction-modal'
import type { EditingTransaction, TransactionMutationInfo } from '@/app/dashboard/add-transaction-modal'
import { ReconcileModal } from '@/app/dashboard/reconcile-modal'
import { EditAccountModal } from '@/app/dashboard/edit-account-modal'
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

interface BalanceDelta {
    accountId: string
    delta: number
}

interface TransactionsViewProps {
    account: Account | null
    accounts: Account[]
    categories: Category[]
    /** Called after any mutation so Dashboard can update balances without a server round-trip */
    onBalanceDelta: (deltas: BalanceDelta[]) => void
    onAccountMutated?: () => void
    onAccountDeleted?: (id: string) => void
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
    const mm = String(date.getMonth() + 1).padStart(2, '0')
    const dd = String(date.getDate()).padStart(2, '0')
    return `${mm}/${dd}/${date.getFullYear()}`
}

const formatAmount = (amount: number) =>
    `$${Math.abs(amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const formatBalance = (amount: number) => {
    const abs = `$${Math.abs(amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    return amount < 0 ? `-${abs}` : abs
}

export function TransactionsView({
    account, accounts, categories, onBalanceDelta, onAccountMutated, onAccountDeleted, currentMonth, currentYear
}: TransactionsViewProps) {
    const [transactions, setTransactions] = useState<Transaction[]>([])
    const [loading, setLoading] = useState(false)
    const [showAddTransaction, setShowAddTransaction] = useState(false)
    const [editing, setEditing] = useState<EditingTransaction | null>(null)
    const [showReconcile, setShowReconcile] = useState(false)
    const [showEditAccount, setShowEditAccount] = useState(false)
    const [expandedSplits, setExpandedSplits] = useState<Set<string>>(new Set())
    const [filterType, setFilterType] = useState<'all' | 'income' | 'expense' | 'transfer'>('all')
    const [searchText, setSearchText] = useState('')
    const [clearedFilter, setClearedFilter] = useState<'all' | 'uncleared' | 'cleared' | 'reconciled'>('all')
    const [startDate, setStartDate] = useState('')
    const [endDate, setEndDate] = useState('')

    const { accessToken } = useAuth()
    const accessTokenRef = useRef<string | null>(null)
    accessTokenRef.current = accessToken

    // Account-keyed transaction cache — persists across account switches while this
    // component remains mounted (Dashboard always renders it, hidden when not active).
    const cache = useRef<Map<string, Transaction[]>>(new Map())
    // Guards against stale background fetches overwriting the active account's data
    const activeAccountId = useRef<string | null>(null)
    // Stable ref to account so fetchTransactions doesn't need it as a dependency
    const accountRef = useRef(account)
    accountRef.current = account

    // Fetch transactions for the current account.
    // background=true: silent refresh, no loading spinner, only updates state if still active.
    const fetchTransactions = useCallback(async (background = false) => {
        const acc = accountRef.current
        if (!acc) return
        const accountId = acc.id
        if (!background) setLoading(true)
        try {
            const token = accessTokenRef.current
            if (!token) { if (!background) setLoading(false); return }
            const response = await fetch(`/api/transactions?account_id=${accountId}`, {
                headers: { 'Authorization': `Bearer ${token}` },
            })
            if (response.ok) {
                const { transactions: data } = await response.json()
                // Discard result if the user has already switched to a different account
                if (activeAccountId.current === accountId) {
                    cache.current.set(accountId, data)
                    setTransactions(data)
                }
            }
        } catch (error) {
            console.error('Error fetching transactions:', error)
        } finally {
            if (!background && activeAccountId.current === accountId) setLoading(false)
        }
    }, []) // stable — reads account via ref

    // On account switch: serve cache instantly, background-refresh to stay current.
    // Keyed on account?.id so balance updates (same ID, new object) don't re-trigger.
    useEffect(() => {
        if (!account) return
        activeAccountId.current = account.id
        const cached = cache.current.get(account.id)
        if (cached) {
            setTransactions(cached)
            setLoading(false)
            fetchTransactions(true)
        } else {
            setLoading(true)
            fetchTransactions(false)
        }
    }, [account?.id, fetchTransactions])

    // After add or edit: background-refresh the list and update account balance locally.
    const handleTransactionAdded = (info: TransactionMutationInfo) => {
        fetchTransactions(true)

        const deltas: BalanceDelta[] = [{ accountId: account!.id, delta: info.oldAmount !== undefined ? info.amount - info.oldAmount : info.amount }]
        // For transfers also update the paired account's balance
        if (info.type === 'transfer' && info.to_account_id) {
            // Source leg is negative (info.amount); destination leg is the opposite sign.
            // Delta for the destination = -info.amount for adds, -(info.amount - info.oldAmount) for edits.
            const destDelta = info.oldAmount !== undefined ? -(info.amount - info.oldAmount) : -info.amount
            deltas.push({ accountId: info.to_account_id, delta: destDelta })
        }
        onBalanceDelta(deltas)
    }

    // Optimistic delete: remove immediately, restore on failure.
    const handleDelete = async (transaction: Transaction) => {
        if (!confirm('Delete this transaction? This cannot be undone.')) return

        // Optimistic remove
        const prev = transactions
        const next = transactions.filter(t => t.id !== transaction.id)
        setTransactions(next)
        cache.current.set(account!.id, next)

        const deltas: BalanceDelta[] = [{ accountId: account!.id, delta: -transaction.amount }]
        if (transaction.type === 'transfer' && transaction.to_account_id) {
            // Paired leg has the opposite amount; deleting it removes that too
            deltas.push({ accountId: transaction.to_account_id, delta: transaction.amount })
        }
        onBalanceDelta(deltas)

        try {
            const token = accessTokenRef.current
            if (!token) return
            const response = await fetch(`/api/transactions/${transaction.id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` },
            })
            if (!response.ok) {
                // Revert optimistic changes
                setTransactions(prev)
                cache.current.set(account!.id, prev)
                // Reverse the balance deltas
                onBalanceDelta(deltas.map(d => ({ ...d, delta: -d.delta })))
                const err = await response.json()
                alert(`Error: ${err.error}`)
            }
        } catch (error) {
            setTransactions(prev)
            cache.current.set(account!.id, prev)
            onBalanceDelta(deltas.map(d => ({ ...d, delta: -d.delta })))
            console.error('Error deleting transaction:', error)
        }
    }

    // Cleared toggle: optimistic local update only — cleared status does not affect
    // account balance (balance = SUM of all amounts regardless of cleared state).
    const handleClearedToggle = async (transaction: Transaction) => {
        if (transaction.cleared === 'reconciled') return
        const newCleared = transaction.cleared === 'uncleared' ? 'cleared' : 'uncleared'
        // Optimistic local update
        setTransactions(prev => prev.map(t =>
            t.id === transaction.id ? { ...t, cleared: newCleared } : t
        ))
        try {
            const token = accessTokenRef.current
            if (!token) return
            await fetch(`/api/transactions/${transaction.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ cleared: newCleared }),
            })
            // No balance delta needed — cleared status doesn't change the account balance
        } catch (error) {
            // Revert on failure
            setTransactions(prev => prev.map(t =>
                t.id === transaction.id ? { ...t, cleared: transaction.cleared } : t
            ))
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

    const filteredTransactions = transactions
        .filter(t => {
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
        .sort((a, b) => b.date.localeCompare(a.date))

    const clearFilters = () => {
        setSearchText('')
        setClearedFilter('all')
        setStartDate('')
        setEndDate('')
    }

    const clearedBalance = useMemo(() =>
        transactions
            .filter(t => t.cleared === 'cleared' || t.cleared === 'reconciled')
            .reduce((sum, t) => sum + t.amount, 0),
        [transactions])

    const unclearedBalance = useMemo(() =>
        transactions
            .filter(t => t.cleared === 'uncleared')
            .reduce((sum, t) => sum + t.amount, 0),
        [transactions])

    if (!account) {
        return (
            <div className="flex items-center justify-center h-64">
                <p className="text-muted-foreground text-sm">Select an account from the sidebar to view transactions.</p>
            </div>
        )
    }

    if (loading) {
        return (
            <div className="space-y-4">
                {/* Account header skeleton */}
                <div className="space-y-3 animate-pulse">
                    <div className="flex items-center justify-between">
                        <div>
                            <div className="h-6 w-36 bg-muted rounded" />
                            <div className="h-3 w-20 bg-muted rounded mt-2" />
                        </div>
                        <div className="h-8 w-24 bg-muted rounded" />
                    </div>
                    <div className="flex items-center gap-6">
                        <div className="h-8 w-28 bg-muted rounded" />
                        <div className="h-8 w-28 bg-muted rounded" />
                        <div className="h-8 w-28 bg-muted rounded" />
                    </div>
                </div>
                {/* Filter bar skeleton */}
                <Card>
                    <CardHeader className="py-3 px-4">
                        <div className="flex items-center gap-2 animate-pulse">
                            <div className="h-8 w-52 bg-muted rounded-lg" />
                            <div className="h-8 flex-1 bg-muted rounded-lg" />
                            <div className="h-8 w-64 bg-muted rounded-lg" />
                            <div className="ml-auto">
                                <div className="h-8 w-32 bg-muted rounded" />
                            </div>
                        </div>
                    </CardHeader>
                </Card>
                {/* Transaction table skeleton */}
                <Card>
                    <CardContent className="p-0">
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr style={{ backgroundColor: 'hsl(var(--secondary))' }}>
                                        <th className="text-left py-3 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">Date</th>
                                        <th className="text-left py-3 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Payee</th>
                                        <th className="text-left py-3 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Category</th>
                                        <th className="text-left py-3 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Memo</th>
                                        <th className="text-right py-3 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground w-28">Outflow</th>
                                        <th className="text-right py-3 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground w-28">Inflow</th>
                                        <th className="w-16" />
                                        <th className="w-10" />
                                    </tr>
                                </thead>
                                <tbody>
                                    {[...Array(8)].map((_, i) => (
                                        <tr key={i} className="border-t animate-pulse" style={{ borderColor: 'hsl(var(--border) / 0.5)' }}>
                                            <td className="py-3 px-3">
                                                <div className="h-3 w-16 bg-muted rounded" />
                                            </td>
                                            <td className="py-3 px-3">
                                                <div className="h-3 bg-muted rounded" style={{ width: `${80 + (i * 17) % 60}px` }} />
                                            </td>
                                            <td className="py-3 px-3">
                                                <div className="h-3 bg-muted rounded" style={{ width: `${60 + (i * 11) % 50}px` }} />
                                            </td>
                                            <td className="py-3 px-3">
                                                <div className="h-3 w-20 bg-muted rounded" />
                                            </td>
                                            <td className="py-3 px-3 text-right">
                                                {i % 3 !== 0 && <div className="h-3 w-14 bg-muted rounded ml-auto" />}
                                            </td>
                                            <td className="py-3 px-3 text-right">
                                                {i % 3 === 0 && <div className="h-3 w-14 bg-muted rounded ml-auto" />}
                                            </td>
                                            <td />
                                            <td className="py-3 px-3">
                                                <div className="h-2.5 w-2.5 rounded-full bg-muted mx-auto" />
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </CardContent>
                </Card>
            </div>
        )
    }

    return (
        <div className="space-y-4">
            {/* ── Account Header ───────────────────────────────────────── */}
            <div className="space-y-3">
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="font-display text-xl font-bold text-foreground leading-normal">{account.name}</h2>
                        <p className="text-sm text-muted-foreground mt-0.5">{account.type_name}</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setShowEditAccount(true)}
                            className="h-8 w-8 p-0"
                            aria-label="Edit account"
                        >
                            <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                            size="sm"
                            onClick={() => setShowReconcile(true)}
                            className="h-8 px-3 text-xs"
                        >
                            <Scale className="h-3.5 w-3.5 mr-1.5" />
                            Reconcile
                        </Button>
                    </div>
                </div>
                {/* 3-part balance row */}
                <div className="flex items-center gap-6">
                    {/* Cleared Balance */}
                    <div className="flex items-center gap-2">
                        <div className="h-2.5 w-2.5 rounded-full bg-primary flex-shrink-0" />
                        <div>
                            <div className={`font-display text-lg font-bold financial-figure tabular-nums ${clearedBalance < 0 ? 'text-destructive' : 'text-foreground'}`}>
                                {formatBalance(clearedBalance)}
                            </div>
                            <p className="text-xs text-muted-foreground">Cleared Balance</p>
                        </div>
                    </div>
                    <span className="text-muted-foreground/40 text-base font-light select-none">+</span>
                    {/* Uncleared Balance */}
                    <div className="flex items-center gap-2">
                        <div className="h-2.5 w-2.5 rounded-full border border-muted-foreground/40 flex-shrink-0" />
                        <div>
                            <div className={`font-display text-lg font-bold financial-figure tabular-nums ${unclearedBalance < 0 ? 'text-destructive' : 'text-foreground'}`}>
                                {formatBalance(unclearedBalance)}
                            </div>
                            <p className="text-xs text-muted-foreground">Uncleared Balance</p>
                        </div>
                    </div>
                    <span className="text-muted-foreground/40 text-base font-light select-none">=</span>
                    {/* Working Balance */}
                    <div>
                        <div className={`font-display text-lg font-bold financial-figure tabular-nums ${account.balance < 0 ? 'text-destructive' : 'text-foreground'}`}>
                            {formatBalance(account.balance)}
                        </div>
                        <p className="text-xs text-muted-foreground">Working Balance</p>
                    </div>
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
                                        <th className="text-left py-3 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">Date</th>
                                        <th className="text-left py-3 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Payee</th>
                                        <th className="text-left py-3 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Category</th>
                                        <th className="text-left py-3 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Memo</th>
                                        <th className="text-right py-3 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground w-28">Outflow</th>
                                        <th className="text-right py-3 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground w-28">Inflow</th>
                                        <th className="w-16"></th>
                                        <th className="w-10"></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredTransactions.map((transaction) => {
                                        const isExpanded = expandedSplits.has(transaction.id)

                                        return (
                                            <Fragment key={transaction.id}>
                                                <tr
                                                    className="group border-t hover:bg-muted/30 transition-colors"
                                                    style={{ borderColor: 'hsl(var(--border) / 0.5)' }}
                                                >
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

                                                    {/* Outflow */}
                                                    <td className="py-3 px-3 text-sm font-semibold text-right financial-figure text-destructive/90 tabular-nums">
                                                        {transaction.amount < 0 ? formatAmount(transaction.amount) : ''}
                                                    </td>

                                                    {/* Inflow */}
                                                    <td className="py-3 px-3 text-sm font-semibold text-right financial-figure text-primary/90 tabular-nums">
                                                        {transaction.amount >= 0 ? formatAmount(transaction.amount) : ''}
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

                                                    {/* Cleared indicator (last column) */}
                                                    <td className="py-3 px-3 text-center">
                                                        <ClearedDot
                                                            cleared={transaction.cleared}
                                                            onClick={() => handleClearedToggle(transaction)}
                                                        />
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
                                                        <td className="py-1.5 px-3 pl-10 text-xs text-muted-foreground">
                                                            {split.category_name
                                                                ? `${split.group_name} · ${split.category_name}`
                                                                : <span className="italic text-muted-foreground/40">Uncategorized</span>
                                                            }
                                                        </td>
                                                        <td className="py-1.5 px-3 text-xs text-muted-foreground/60 italic">
                                                            {split.memo || '—'}
                                                        </td>
                                                        <td className="py-1.5 px-3 text-xs font-semibold text-right financial-figure text-destructive/70 tabular-nums">
                                                            {split.amount < 0 ? formatAmount(split.amount) : ''}
                                                        </td>
                                                        <td className="py-1.5 px-3 text-xs font-semibold text-right financial-figure text-primary/70 tabular-nums">
                                                            {split.amount >= 0 ? formatAmount(split.amount) : ''}
                                                        </td>
                                                        <td colSpan={2}></td>
                                                    </tr>
                                                ))}
                                            </Fragment>
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
                        // Reconciliation changes cleared status — refetch to update the list.
                        // Balances are unaffected by reconciliation so no delta needed.
                        fetchTransactions(false)
                    }}
                    initialClearedBalance={clearedBalance}
                />
            )}

            {account && showEditAccount && (
                <EditAccountModal
                    open={showEditAccount}
                    onOpenChange={setShowEditAccount}
                    account={account}
                    onAccountMutated={() => {
                        setShowEditAccount(false)
                        onAccountMutated?.()
                    }}
                    onAccountDeleted={(id) => {
                        setShowEditAccount(false)
                        onAccountDeleted?.(id)
                    }}
                />
            )}
        </div>
    )
}
