'use client'

import { useState, useRef, useEffect } from 'react'
import { useAuth } from '../providers'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectLabel,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import type { BudgetSummary } from '@/app/dashboard/budget-view'

interface MoveMoneyCategoryPopoverProps {
    budgetSummary: BudgetSummary
    sourceCategoryId: string
    initialAmount: number
    onMoved: (updatedSummary: BudgetSummary) => void
    onClose: () => void
}

// Minimal Decimal helper — avoids importing decimal.js on the client
class Decimal {
    private val: number
    constructor(val: number | string) { this.val = parseFloat(String(val)) }
    plus(n: number | string) { return new Decimal(this.val + parseFloat(String(n))) }
    minus(n: number | string) { return new Decimal(this.val - parseFloat(String(n))) }
    toNumber() { return Math.round(this.val * 100) / 100 }
}

const formatCurrency = (n: number) => {
    const abs = Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    return n < 0 ? `-$${abs}` : `$${abs}`
}

export function MoveMoneyCategoryPopover({
    budgetSummary,
    sourceCategoryId,
    initialAmount,
    onMoved,
    onClose,
}: MoveMoneyCategoryPopoverProps) {
    const { accessToken } = useAuth()
    const accessTokenRef = useRef<string | null>(null)
    accessTokenRef.current = accessToken

    const [toId, setToId] = useState('')
    const [amount, setAmount] = useState(String(Math.abs(initialAmount)))
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const categories = budgetSummary.categories
    const sourceCategory = categories.find(c => c.id === sourceCategoryId)!
    const moveAmount = parseFloat(amount) || 0

    // Group categories (excluding source) by group_name
    const grouped = categories
        .filter(c => c.id !== sourceCategoryId)
        .reduce((acc, cat) => {
            if (!acc[cat.group_name]) acc[cat.group_name] = []
            acc[cat.group_name].push(cat)
            return acc
        }, {} as Record<string, typeof categories>)

    // Re-sync amount if the source changes externally
    useEffect(() => {
        setAmount(String(Math.abs(initialAmount)))
        setToId('')
        setError(null)
    }, [sourceCategoryId, initialAmount])

    const handleMove = async () => {
        if (!toId || moveAmount <= 0) return
        const toCategory = categories.find(c => c.id === toId)
        if (!toCategory) return

        setLoading(true)
        setError(null)
        try {
            const token = accessTokenRef.current
            if (!token) return

            const fromNew = new Decimal(sourceCategory.budgeted_amount).minus(moveAmount).toNumber()
            const toNew = new Decimal(toCategory.budgeted_amount).plus(moveAmount).toNumber()

            const headers = {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
            }

            const [res1, res2] = await Promise.all([
                fetch('/api/budgets/allocate', {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({ budget_id: budgetSummary.id, category_id: sourceCategoryId, amount: fromNew }),
                }),
                fetch('/api/budgets/allocate', {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({ budget_id: budgetSummary.id, category_id: toId, amount: toNew }),
                }),
            ])

            if (!res1.ok || !res2.ok) {
                const errRes = !res1.ok ? res1 : res2
                const err = await errRes.json()
                setError(err.error ?? 'Failed to move money')
                return
            }

            // Use the response from the second call (both return full budget summary)
            const { budget } = await res2.json()
            onMoved(budget)
            onClose()
        } catch (e) {
            console.error('Error moving money:', e)
            setError('An unexpected error occurred')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
                Move money from <span className="font-medium text-foreground">{sourceCategory.name}</span> to another category.
            </p>

            <div className="space-y-1.5">
                <label className="text-sm font-medium">Move</label>
                <Input
                    type="text"
                    inputMode="decimal"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    onFocus={e => e.target.select()}
                    className="h-9 text-sm"
                    autoFocus
                />
            </div>

            <div className="space-y-1.5">
                <label className="text-sm font-medium">To</label>
                <Select value={toId} onValueChange={setToId}>
                    <SelectTrigger className="h-9 text-sm">
                        <SelectValue placeholder="Select a target" />
                    </SelectTrigger>
                    <SelectContent className="max-h-72">
                        {Object.entries(grouped).map(([groupName, cats]) => (
                            <SelectGroup key={groupName}>
                                <SelectLabel>{groupName}</SelectLabel>
                                {cats.map(cat => (
                                    <SelectItem key={cat.id} value={cat.id}>
                                        <span className="flex items-center justify-between w-full gap-4">
                                            <span>{cat.name}</span>
                                            <span className={cat.available_amount < 0 ? 'text-destructive/80' : 'text-primary/80'}>
                                                {formatCurrency(cat.available_amount)}
                                            </span>
                                        </span>
                                    </SelectItem>
                                ))}
                            </SelectGroup>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {error && (
                <p className="text-xs text-destructive">{error}</p>
            )}

            <Button
                className="w-full h-9"
                onClick={handleMove}
                disabled={loading || !toId || moveAmount <= 0}
            >
                {loading ? 'Moving…' : 'Move'}
            </Button>
        </div>
    )
}
