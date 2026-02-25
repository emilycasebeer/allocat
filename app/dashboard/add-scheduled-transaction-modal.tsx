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
import type { Account, Category } from '@/app/dashboard/dashboard'

const FREQUENCIES = [
    { value: 'once', label: 'Once' },
    { value: 'daily', label: 'Daily' },
    { value: 'weekly', label: 'Weekly' },
    { value: 'every_other_week', label: 'Every Other Week' },
    { value: 'twice_a_month', label: 'Twice a Month' },
    { value: 'every_4_weeks', label: 'Every 4 Weeks' },
    { value: 'monthly', label: 'Monthly' },
    { value: 'every_other_month', label: 'Every Other Month' },
    { value: 'twice_a_year', label: 'Twice a Year' },
    { value: 'yearly', label: 'Yearly' },
]

interface ScheduledTransaction {
    id: string
    account_id: string
    payee_name: string | null
    category_name: string | null
    amount: number
    memo: string | null
    frequency: string
    next_date: string
    end_date: string | null
}

interface AddScheduledTransactionModalProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    accounts: Account[]
    categories: Category[]
    editing?: ScheduledTransaction | null
    onSaved: () => void
}

export function AddScheduledTransactionModal({
    open,
    onOpenChange,
    accounts,
    categories,
    editing,
    onSaved,
}: AddScheduledTransactionModalProps) {
    const { accessToken } = useAuth()
    const accessTokenRef = useRef<string | null>(null)
    accessTokenRef.current = accessToken

    const [accountId, setAccountId] = useState('')
    const [payeeName, setPayeeName] = useState('')
    const [categoryId, setCategoryId] = useState('')
    const [amount, setAmount] = useState('')
    const [memo, setMemo] = useState('')
    const [frequency, setFrequency] = useState('monthly')
    const [nextDate, setNextDate] = useState(new Date().toISOString().split('T')[0])
    const [endDate, setEndDate] = useState('')
    const [payeeNames, setPayeeNames] = useState<string[]>([])
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        if (!open) return

        // Prefill from editing object if provided
        if (editing) {
            setAccountId(editing.account_id)
            setPayeeName(editing.payee_name ?? '')
            setAmount(Math.abs(editing.amount).toString())
            setMemo(editing.memo ?? '')
            setFrequency(editing.frequency)
            setNextDate(editing.next_date)
            setEndDate(editing.end_date ?? '')
        } else {
            setAccountId(accounts[0]?.id ?? '')
            setPayeeName('')
            setCategoryId('')
            setAmount('')
            setMemo('')
            setFrequency('monthly')
            setNextDate(new Date().toISOString().split('T')[0])
            setEndDate('')
        }

        const token = accessTokenRef.current
        if (token) {
            fetch('/api/payees', { headers: { 'Authorization': `Bearer ${token}` } })
                .then(r => r.ok ? r.json() : null)
                .then(data => { if (data?.payees) setPayeeNames(data.payees.map((p: any) => p.name)) })
                .catch(() => {})
        }
    }, [open, editing])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!accountId || !amount || !frequency || !nextDate) return

        setLoading(true)
        try {
            const token = accessTokenRef.current
            if (!token) return

            const parsedAmount = parseFloat(amount)
            const body = {
                account_id: accountId,
                payee_name: payeeName.trim() || null,
                category_id: categoryId || null,
                amount: parsedAmount,
                memo: memo.trim() || null,
                frequency,
                next_date: nextDate,
                end_date: endDate || null,
            }

            const url = editing
                ? `/api/scheduled-transactions/${editing.id}`
                : '/api/scheduled-transactions'
            const method = editing ? 'PUT' : 'POST'

            const response = await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify(body),
            })

            if (response.ok) {
                onSaved()
                onOpenChange(false)
            } else {
                const err = await response.json()
                alert(`Error: ${err.error}`)
            }
        } catch (error) {
            console.error('Error saving scheduled transaction:', error)
        } finally {
            setLoading(false)
        }
    }

    const selectableCategories = categories.filter((c) => !c.is_system)

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[520px]">
                <DialogHeader>
                    <DialogTitle>{editing ? 'Edit' : 'New'} Scheduled Transaction</DialogTitle>
                    <DialogDescription>
                        Set up a recurring transaction to enter automatically on a schedule.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Account</Label>
                            <Select value={accountId} onValueChange={setAccountId} required>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select account" />
                                </SelectTrigger>
                                <SelectContent>
                                    {accounts.map((a) => (
                                        <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="sched-amount">Amount</Label>
                            <Input
                                id="sched-amount"
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
                        <Label htmlFor="sched-payee">Payee</Label>
                        <Input
                            id="sched-payee"
                            list="sched-payee-suggestions"
                            placeholder="e.g., Netflix, Landlord"
                            value={payeeName}
                            onChange={(e) => setPayeeName(e.target.value)}
                        />
                        <datalist id="sched-payee-suggestions">
                            {payeeNames.map((name) => (
                                <option key={name} value={name} />
                            ))}
                        </datalist>
                    </div>

                    <div className="space-y-2">
                        <Label>Category</Label>
                        <Select value={categoryId} onValueChange={setCategoryId}>
                            <SelectTrigger>
                                <SelectValue placeholder="Select category (optional)" />
                            </SelectTrigger>
                            <SelectContent>
                                {selectableCategories.map((c) => (
                                    <SelectItem key={c.id} value={c.id}>
                                        {c.group_name} — {c.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="sched-memo">Memo</Label>
                        <Input
                            id="sched-memo"
                            placeholder="Optional note"
                            value={memo}
                            onChange={(e) => setMemo(e.target.value)}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Frequency</Label>
                            <Select value={frequency} onValueChange={setFrequency} required>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {FREQUENCIES.map((f) => (
                                        <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="sched-next-date">Next Date</Label>
                            <Input
                                id="sched-next-date"
                                type="date"
                                value={nextDate}
                                onChange={(e) => setNextDate(e.target.value)}
                                required
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="sched-end-date">End Date (optional)</Label>
                        <Input
                            id="sched-end-date"
                            type="date"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                        />
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={loading}>
                            {loading ? 'Saving...' : editing ? 'Save Changes' : 'Create'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
