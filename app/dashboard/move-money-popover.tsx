'use client'

import { useState, useRef, useEffect } from 'react'
import Decimal from 'decimal.js'
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

const formatCurrency = (n: number) => {
    const abs = Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    return n < 0 ? `-$${abs}` : `$${abs}`
}

export function MoveMoneyCategoryPopover({
    budgetSummary,
    sourceCategoryId,
    initialAmount,
    onMoved,
}: MoveMoneyCategoryPopoverProps) {
    const { accessToken } = useAuth()
    const accessTokenRef = useRef<string | null>(null)
    accessTokenRef.current = accessToken

    const isOverdraft = initialAmount < 0
    const absAmount = Math.abs(initialAmount)

    const [selectedId, setSelectedId] = useState('')
    const [amount, setAmount] = useState(String(absAmount))
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const categories = budgetSummary.categories
    const thisCategory = categories.find(c => c.id === sourceCategoryId)
    const moveAmount = parseFloat(amount) || 0

    // Group categories (excluding this one) by group_name
    const grouped = categories
        .filter(c => c.id !== sourceCategoryId)
        .reduce((acc, cat) => {
            if (!acc[cat.group_name]) acc[cat.group_name] = []
            acc[cat.group_name].push(cat)
            return acc
        }, {} as Record<string, typeof categories>)

    useEffect(() => {
        setAmount(String(Math.abs(initialAmount)))
        setSelectedId('')
        setError(null)
    }, [sourceCategoryId, initialAmount])

    if (!thisCategory) return null

    const handleSubmit = async () => {
        if (!selectedId || moveAmount <= 0) return
        const otherCategory = categories.find(c => c.id === selectedId)
        if (!otherCategory) return

        // Overdraft mode: move FROM selected → TO this (overdrafted) category
        // Normal mode:   move FROM this → TO selected category
        const fromCatId = isOverdraft ? selectedId : sourceCategoryId
        const toCatId   = isOverdraft ? sourceCategoryId : selectedId
        const fromCat   = isOverdraft ? otherCategory : thisCategory
        const toCat     = isOverdraft ? thisCategory : otherCategory

        const fromNew = new Decimal(fromCat.budgeted_amount).minus(moveAmount).toNumber()
        const toNew   = new Decimal(toCat.budgeted_amount).plus(moveAmount).toNumber()

        setLoading(true)
        setError(null)
        try {
            const token = accessTokenRef.current
            if (!token) return

            const headers = {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
            }

            // Sequential so the second response reflects both writes
            const res1 = await fetch('/api/budgets/allocate', {
                method: 'POST',
                headers,
                body: JSON.stringify({ budget_id: budgetSummary.id, category_id: fromCatId, amount: fromNew }),
            })
            if (!res1.ok) {
                const err = await res1.json()
                setError(err.error ?? 'Failed to move money')
                return
            }
            await res1.json() // drain stream

            const res2 = await fetch('/api/budgets/allocate', {
                method: 'POST',
                headers,
                body: JSON.stringify({ budget_id: budgetSummary.id, category_id: toCatId, amount: toNew }),
            })
            if (!res2.ok) {
                const err = await res2.json()
                setError(err.error ?? 'Failed to move money')
                return
            }

            const { budget } = await res2.json()
            onMoved(budget)
        } catch (e) {
            console.error('Error moving money:', e)
            setError('An unexpected error occurred')
        } finally {
            setLoading(false)
        }
    }

    if (isOverdraft) {
        return (
            <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                    You have an overdraft of {formatCurrency(absAmount)}. Cover this amount with another bucket or credit card.
                </p>

                <div className="space-y-1.5">
                    <label className="text-sm font-medium">Move Money From</label>
                    <Select value={selectedId} onValueChange={setSelectedId}>
                        <SelectTrigger className="h-9 text-sm">
                            <SelectValue placeholder="Select a source" />
                        </SelectTrigger>
                        <SelectContent className="max-h-72">
                            {Object.entries(grouped).map(([groupName, cats]) => (
                                <SelectGroup key={groupName}>
                                    <SelectLabel>{groupName}</SelectLabel>
                                    {cats.map(cat => (
                                        <SelectItem key={cat.id} value={cat.id}>
                                            {cat.name}
                                            <span className="text-xs tabular-nums text-muted-foreground ml-2">
                                                {formatCurrency(cat.available_amount)}
                                            </span>
                                        </SelectItem>
                                    ))}
                                </SelectGroup>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                {error && <p className="text-xs text-destructive">{error}</p>}

                <Button
                    className="w-full h-9"
                    onClick={handleSubmit}
                    disabled={loading || !selectedId}
                >
                    {loading ? 'Covering…' : 'Cover'}
                </Button>
            </div>
        )
    }

    return (
        <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
                Move money from <span className="font-medium text-foreground">{thisCategory.name}</span> to another category.
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
                <Select value={selectedId} onValueChange={setSelectedId}>
                    <SelectTrigger className="h-9 text-sm">
                        <SelectValue placeholder="Select a target" />
                    </SelectTrigger>
                    <SelectContent className="max-h-72">
                        {Object.entries(grouped).map(([groupName, cats]) => (
                            <SelectGroup key={groupName}>
                                <SelectLabel>{groupName}</SelectLabel>
                                {cats.map(cat => (
                                    <SelectItem key={cat.id} value={cat.id}>
                                        {cat.name}
                                        <span className="text-xs tabular-nums text-muted-foreground ml-2">
                                            {formatCurrency(cat.available_amount)}
                                        </span>
                                    </SelectItem>
                                ))}
                            </SelectGroup>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {error && <p className="text-xs text-destructive">{error}</p>}

            <Button
                className="w-full h-9"
                onClick={handleSubmit}
                disabled={loading || !selectedId || moveAmount <= 0}
            >
                {loading ? 'Moving…' : 'Move'}
            </Button>
        </div>
    )
}
