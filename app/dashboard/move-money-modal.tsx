'use client'

import { useState } from 'react'
import { supabase } from '../providers'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
    Dialog,
    DialogContent,
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
import type { BudgetSummary } from '@/app/dashboard/budget-view'

interface MoveMoneModalProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    budgetSummary: BudgetSummary
    onMoved: () => void
}

export function MoveMoneyModal({ open, onOpenChange, budgetSummary, onMoved }: MoveMoneModalProps) {
    const [fromId, setFromId] = useState('')
    const [toId, setToId] = useState('')
    const [amount, setAmount] = useState('')
    const [loading, setLoading] = useState(false)

    const categories = budgetSummary.categories

    const fromCategory = categories.find(c => c.id === fromId)
    const toCategory = categories.find(c => c.id === toId)
    const moveAmount = parseFloat(amount) || 0

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!fromId || !toId || fromId === toId || moveAmount <= 0) return

        setLoading(true)
        try {
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) return

            const headers = {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`,
            }

            const fromNew = new Decimal(fromCategory!.budgeted_amount).minus(moveAmount).toNumber()
            const toNew = new Decimal(toCategory!.budgeted_amount).plus(moveAmount).toNumber()

            const [res1, res2] = await Promise.all([
                fetch('/api/budgets/allocate', {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({ budget_id: budgetSummary.id, category_id: fromId, amount: fromNew }),
                }),
                fetch('/api/budgets/allocate', {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({ budget_id: budgetSummary.id, category_id: toId, amount: toNew }),
                }),
            ])

            if (!res1.ok || !res2.ok) {
                const err = await (!res1.ok ? res1 : res2).json()
                alert(`Error: ${err.error}`)
                return
            }

            setFromId('')
            setToId('')
            setAmount('')
            onMoved()
            onOpenChange(false)
        } catch (error) {
            console.error('Error moving money:', error)
            alert('Error moving money')
        } finally {
            setLoading(false)
        }
    }

    const formatAmount = (n: number) =>
        n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[400px]">
                <DialogHeader>
                    <DialogTitle>Move Money</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <Label>From</Label>
                        <Select value={fromId} onValueChange={setFromId} required>
                            <SelectTrigger>
                                <SelectValue placeholder="Select category" />
                            </SelectTrigger>
                            <SelectContent>
                                {categories.map((c) => (
                                    <SelectItem key={c.id} value={c.id} disabled={c.id === toId}>
                                        {c.name} (${formatAmount(c.available_amount)} available)
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <Label>Amount</Label>
                        <Input
                            type="number"
                            step="0.01"
                            min="0.01"
                            placeholder="0.00"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            required
                        />
                        {fromCategory && moveAmount > 0 && (
                            <p className={`text-xs ${moveAmount > fromCategory.budgeted_amount ? 'text-amber-600' : 'text-gray-500'}`}>
                                Budgeted: ${formatAmount(fromCategory.budgeted_amount)}
                                {moveAmount > fromCategory.budgeted_amount && ' — amount exceeds budgeted'}
                            </p>
                        )}
                    </div>

                    <div className="space-y-2">
                        <Label>To</Label>
                        <Select value={toId} onValueChange={setToId} required>
                            <SelectTrigger>
                                <SelectValue placeholder="Select category" />
                            </SelectTrigger>
                            <SelectContent>
                                {categories.map((c) => (
                                    <SelectItem key={c.id} value={c.id} disabled={c.id === fromId}>
                                        {c.name} (${formatAmount(c.budgeted_amount)} budgeted)
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            disabled={loading || !fromId || !toId || fromId === toId || moveAmount <= 0}
                        >
                            {loading ? 'Moving...' : 'Move Money'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}

// Minimal Decimal helper to avoid importing decimal.js on the client
class Decimal {
    private val: number
    constructor(val: number | string) { this.val = parseFloat(String(val)) }
    plus(n: number | string) { return new Decimal(this.val + parseFloat(String(n))) }
    minus(n: number | string) { return new Decimal(this.val - parseFloat(String(n))) }
    toNumber() { return Math.round(this.val * 100) / 100 }
}
