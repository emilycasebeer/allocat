'use client'

import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../providers'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { Plus, Trash2, Split } from 'lucide-react'
import type { Account, Category } from '@/app/dashboard/dashboard'
import { PayeeCombobox } from '@/app/dashboard/payee-combobox'
import type { PayeeMeta } from '@/app/dashboard/payee-combobox'

/**
 * Passed to onTransactionAdded so callers can update balances locally
 * without refetching the full account list from the server.
 */
export interface TransactionMutationInfo {
    /** Signed amount as stored in DB (negative for expenses / transfer source) */
    amount: number
    type: 'income' | 'expense' | 'transfer'
    /** Destination account ID for transfers, null otherwise */
    to_account_id: string | null
    /** Original amount before editing — used to compute delta for edits */
    oldAmount?: number
}

export interface EditingTransaction {
    id: string
    account_id: string
    category_id: string | null
    payee_name: string | null
    amount: number
    date: string
    memo: string | null
    type: 'income' | 'expense' | 'transfer'
    cleared: 'uncleared' | 'cleared' | 'reconciled'
    is_split?: boolean
    splits?: { id: string; category_id: string | null; amount: number; memo: string | null }[]
    transfer_transaction_id?: string | null
    to_account_id?: string | null
}

interface SplitRow {
    category_id: string
    amount: string
    memo: string
}

interface AddTransactionModalProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    account: Account
    accounts: Account[]
    categories: Category[]
    onTransactionAdded: (info: TransactionMutationInfo) => void
    editing?: EditingTransaction | null
    currentMonth?: number
    currentYear?: number
}

export function AddTransactionModal({
    open,
    onOpenChange,
    account,
    accounts,
    categories,
    onTransactionAdded,
    editing,
    currentMonth,
    currentYear,
}: AddTransactionModalProps) {
    const { accessToken } = useAuth()
    const accessTokenRef = useRef<string | null>(null)
    accessTokenRef.current = accessToken

    const [memo, setMemo] = useState('')
    const [amount, setAmount] = useState('')
    const [date, setDate] = useState(new Date().toISOString().split('T')[0])
    const [categoryId, setCategoryId] = useState<string>('')
    const [type, setType] = useState<'income' | 'expense' | 'transfer'>('expense')
    const [payeeName, setPayeeName] = useState('')
    const [toAccountId, setToAccountId] = useState<string>('')
    const [payees, setPayees] = useState<{ id: string; name: string; default_category_id: string | null }[]>([])
    const [loading, setLoading] = useState(false)
    const [splitMode, setSplitMode] = useState(false)
    const [splitRows, setSplitRows] = useState<SplitRow[]>([
        { category_id: '', amount: '', memo: '' },
        { category_id: '', amount: '', memo: '' },
    ])

    const getDefaultDate = () => {
        const now = new Date()
        if (!currentMonth || !currentYear) return now.toISOString().split('T')[0]
        const isCurrentMonth = currentMonth === now.getMonth() + 1 && currentYear === now.getFullYear()
        if (isCurrentMonth) return now.toISOString().split('T')[0]
        return `${currentYear}-${String(currentMonth).padStart(2, '0')}-01`
    }

    // Pre-fill form when editing an existing transaction
    useEffect(() => {
        if (!open) return
        if (editing) {
            setType(editing.type)
            setAmount(Math.abs(editing.amount).toString())
            setDate(editing.date)
            setMemo(editing.memo ?? '')
            setPayeeName(editing.payee_name ?? '')
            setToAccountId(editing.to_account_id ?? '')
            if (editing.is_split && editing.splits && editing.splits.length > 0) {
                setSplitMode(true)
                setSplitRows(editing.splits.map(s => ({
                    category_id: s.category_id ?? '',
                    amount: Math.abs(s.amount).toString(),
                    memo: s.memo ?? '',
                })))
                setCategoryId('')
            } else {
                setSplitMode(false)
                setCategoryId(editing.category_id ?? '')
                setSplitRows([{ category_id: '', amount: '', memo: '' }, { category_id: '', amount: '', memo: '' }])
            }
        } else {
            setMemo('')
            setAmount('')
            setDate(getDefaultDate())
            setCategoryId('')
            setType('expense')
            setPayeeName('')
            setToAccountId('')
            setSplitMode(false)
            setSplitRows([{ category_id: '', amount: '', memo: '' }, { category_id: '', amount: '', memo: '' }])
        }
    }, [open, editing])

    useEffect(() => {
        if (!open) return
        const token = accessTokenRef.current
        if (token) {
            fetch('/api/payees', { headers: { 'Authorization': `Bearer ${token}` } })
                .then(r => r.ok ? r.json() : null)
                .then(data => { if (data?.payees) setPayees(data.payees) })
                .catch(() => {})
        }
    }, [open])

    // Only show non-system categories in the picker
    const selectableCategories = categories.filter((c) => !c.is_system)

    const splitTotal = splitRows.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0)
    const totalAmount = parseFloat(amount) || 0
    const splitDiff = totalAmount - splitTotal

    const handleSplitRowChange = (index: number, field: keyof SplitRow, value: string) => {
        setSplitRows(prev => prev.map((row, i) => i === index ? { ...row, [field]: value } : row))
    }

    const handleAddSplitRow = () => {
        setSplitRows(prev => [...prev, { category_id: '', amount: '', memo: '' }])
    }

    const handleRemoveSplitRow = (index: number) => {
        setSplitRows(prev => prev.filter((_, i) => i !== index))
    }

    const handleEnterSplitMode = () => {
        setSplitMode(true)
        setCategoryId('')
    }

    const handleExitSplitMode = () => {
        setSplitMode(false)
        setSplitRows([{ category_id: '', amount: '', memo: '' }, { category_id: '', amount: '', memo: '' }])
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!amount || !date) return

        if (splitMode) {
            const validSplits = splitRows.filter(r => r.amount && parseFloat(r.amount) !== 0)
            if (validSplits.length < 2) {
                alert('A split transaction requires at least 2 split lines.')
                return
            }
            if (Math.abs(splitDiff) > 0.005) {
                alert(`Split amounts must add up to the total. Difference: $${Math.abs(splitDiff).toFixed(2)}`)
                return
            }
        }

        // For new transfers, require a destination account
        if (type === 'transfer' && !editing && !toAccountId) {
            alert('Please select a destination account for the transfer.')
            return
        }

        setLoading(true)
        try {
            const token = accessTokenRef.current
            if (!token) return

            let transactionAmount = parseFloat(amount)
            if (type === 'expense') {
                transactionAmount = -Math.abs(transactionAmount)
            } else if (type === 'income') {
                transactionAmount = Math.abs(transactionAmount)
            } else if (type === 'transfer') {
                // Source account loses money; paired leg (destination) will get the positive amount
                transactionAmount = -Math.abs(transactionAmount)
            }

            let splits: { category_id: string | null; amount: number; memo: string | null }[] | undefined = undefined
            if (splitMode) {
                splits = splitRows
                    .filter(r => r.amount && parseFloat(r.amount) !== 0)
                    .map(r => ({
                        category_id: r.category_id || null,
                        amount: type === 'expense' ? -Math.abs(parseFloat(r.amount)) : Math.abs(parseFloat(r.amount)),
                        memo: r.memo || null,
                    }))
            }

            const body: Record<string, unknown> = {
                category_id: splitMode ? null : (categoryId || null),
                amount: transactionAmount,
                date,
                memo: memo || null,
                type,
                payee_name: payeeName.trim() || null,
            }

            if (splits !== undefined) {
                body.splits = splits
            } else if (editing && editing.is_split && !splitMode) {
                // Switching from split to non-split: signal backend to clear children
                body.splits = []
            }

            // For new transfers, include the destination account
            if (type === 'transfer' && !editing) {
                body.to_account_id = toAccountId
            }

            const url = editing ? `/api/transactions/${editing.id}` : '/api/transactions'
            const method = editing ? 'PATCH' : 'POST'

            const response = await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(editing ? body : { ...body, account_id: account.id })
            })

            if (response.ok) {
                if (!editing) {
                    setMemo('')
                    setAmount('')
                    setDate(getDefaultDate())
                    setCategoryId('')
                    setType('expense')
                    setPayeeName('')
                    setToAccountId('')
                    setSplitMode(false)
                    setSplitRows([{ category_id: '', amount: '', memo: '' }, { category_id: '', amount: '', memo: '' }])
                }
                onTransactionAdded({
                    amount: transactionAmount,
                    type,
                    // For existing transfer edits, the destination account comes from the editing prop
                    to_account_id: (editing?.to_account_id ?? toAccountId) || null,
                    // For edits, pass the original amount so callers can compute the delta
                    oldAmount: editing?.amount,
                })
                onOpenChange(false)
            } else {
                const err = await response.json()
                alert(`Error: ${err.error}`)
            }
        } catch (error) {
            console.error('Error saving transaction:', error)
            alert('Error saving transaction')
        } finally {
            setLoading(false)
        }
    }

    const handleTypeChange = (newType: 'income' | 'expense' | 'transfer') => {
        setType(newType)
        if (newType === 'transfer') {
            setCategoryId('')
            setSplitMode(false)
        } else {
            setToAccountId('')
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[540px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{editing ? 'Edit Transaction' : 'Add New Transaction'}</DialogTitle>
                    <DialogDescription>
                        {editing ? 'Update this transaction.' : `Record a new transaction for ${account.name}.`}
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="type">Transaction Type</Label>
                            <Select value={type} onValueChange={handleTypeChange} required>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select type" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="expense">Expense</SelectItem>
                                    <SelectItem value="income">Income</SelectItem>
                                    <SelectItem value="transfer">Transfer</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="amount">Amount</Label>
                            <Input
                                id="amount"
                                type="number"
                                step="0.01"
                                placeholder="0.00"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                required
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="payee">Payee</Label>
                        <PayeeCombobox
                            payees={payees}
                            accounts={accounts}
                            currentAccountId={account.id}
                            value={payeeName}
                            onChange={(val, meta: PayeeMeta) => {
                                if (meta.isTransfer && meta.accountId) {
                                    setPayeeName(val)
                                    setType('transfer')
                                    setToAccountId(meta.accountId)
                                    setCategoryId('')
                                    setSplitMode(false)
                                } else if (val === '') {
                                    setPayeeName('')
                                } else {
                                    setPayeeName(val)
                                    if (meta.defaultCategoryId !== undefined) {
                                        setCategoryId(meta.defaultCategoryId ?? '')
                                    }
                                }
                            }}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="memo">Memo</Label>
                        <Input
                            id="memo"
                            placeholder="Optional note"
                            value={memo}
                            onChange={(e) => setMemo(e.target.value)}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="date">Date</Label>
                        <Input
                            id="date"
                            type="date"
                            value={date}
                            onChange={(e) => setDate(e.target.value)}
                            required
                        />
                    </div>

                    {/* Category / Split section */}
                    {type !== 'transfer' && (
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <Label>Category</Label>
                                {!splitMode ? (
                                    <button
                                        type="button"
                                        className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                                        onClick={handleEnterSplitMode}
                                    >
                                        <Split className="h-3 w-3" />
                                        Split
                                    </button>
                                ) : (
                                    <button
                                        type="button"
                                        className="text-xs text-gray-500 hover:underline"
                                        onClick={handleExitSplitMode}
                                    >
                                        Cancel Split
                                    </button>
                                )}
                            </div>

                            {!splitMode ? (
                                <Select value={categoryId} onValueChange={setCategoryId}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select a category" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {selectableCategories.map((category) => (
                                            <SelectItem key={category.id} value={category.id}>
                                                {category.group_name} — {category.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            ) : (
                                <div className="border rounded-md p-3 space-y-2 bg-gray-50">
                                    <div className="grid grid-cols-[1fr_100px_1fr_24px] gap-1 text-xs font-medium text-gray-500 px-1">
                                        <span>Category</span>
                                        <span>Amount</span>
                                        <span>Memo</span>
                                        <span></span>
                                    </div>
                                    {splitRows.map((row, i) => (
                                        <div key={i} className="grid grid-cols-[1fr_100px_1fr_24px] gap-1 items-center">
                                            <Select value={row.category_id} onValueChange={(v) => handleSplitRowChange(i, 'category_id', v)}>
                                                <SelectTrigger className="h-8 text-xs">
                                                    <SelectValue placeholder="Category" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {selectableCategories.map((c) => (
                                                        <SelectItem key={c.id} value={c.id}>
                                                            {c.group_name} — {c.name}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            <Input
                                                type="number"
                                                step="0.01"
                                                placeholder="0.00"
                                                value={row.amount}
                                                onChange={(e) => handleSplitRowChange(i, 'amount', e.target.value)}
                                                className="h-8 text-xs"
                                            />
                                            <Input
                                                placeholder="Memo"
                                                value={row.memo}
                                                onChange={(e) => handleSplitRowChange(i, 'memo', e.target.value)}
                                                className="h-8 text-xs"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => handleRemoveSplitRow(i)}
                                                disabled={splitRows.length <= 2}
                                                className="text-gray-400 hover:text-red-500 disabled:opacity-30"
                                            >
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </button>
                                        </div>
                                    ))}
                                    <div className="flex items-center justify-between pt-1">
                                        <button
                                            type="button"
                                            onClick={handleAddSplitRow}
                                            className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                                        >
                                            <Plus className="h-3 w-3" />
                                            Add row
                                        </button>
                                        <span className={`text-xs font-medium ${Math.abs(splitDiff) < 0.005 ? 'text-green-600' : 'text-red-600'}`}>
                                            {Math.abs(splitDiff) < 0.005
                                                ? '✓ Balanced'
                                                : `$${Math.abs(splitDiff).toFixed(2)} ${splitDiff > 0 ? 'remaining' : 'over'}`}
                                        </span>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {type === 'transfer' && (
                        <div className="space-y-2">
                            <Label>To Account</Label>
                            {editing?.transfer_transaction_id ? (
                                <div className="text-sm text-gray-600 py-2 px-3 bg-gray-50 rounded-md">
                                    {accounts.find(a => a.id === editing.to_account_id)?.name ?? 'Linked account'}
                                    <span className="ml-1 text-xs text-gray-400">(edit amount/date to update both sides)</span>
                                </div>
                            ) : (
                                <Select value={toAccountId} onValueChange={setToAccountId}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select destination account" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {accounts
                                            .filter(a => a.id !== account.id)
                                            .map(a => (
                                                <SelectItem key={a.id} value={a.id}>
                                                    {a.name}
                                                </SelectItem>
                                            ))}
                                    </SelectContent>
                                </Select>
                            )}
                        </div>
                    )}

                    <div className="text-xs space-y-1">
                        {type === 'income' && (
                            <p className="text-green-700">↑ Income increases your To Be Budgeted amount</p>
                        )}
                        {type === 'expense' && (
                            <p className="text-red-700">↓ Expenses reduce your category Available amounts</p>
                        )}
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={loading}>
                            {loading ? (editing ? 'Saving...' : 'Creating...') : (editing ? 'Update Transaction' : 'Create Transaction')}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
