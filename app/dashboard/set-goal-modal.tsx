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
import type { CategoryGoal } from '@/lib/budgeting'

interface SetGoalModalProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    categoryId: string
    categoryName: string
    existingGoal: CategoryGoal | null
    onSaved: () => void
}

const GOAL_TYPE_LABELS: Record<string, string> = {
    target_balance: 'Target Balance',
    target_balance_by_date: 'Target Balance by Date',
    monthly_savings: 'Monthly Savings',
    monthly_spending: 'Monthly Spending Budget',
    debt_payoff: 'Debt Payoff',
}

export function SetGoalModal({
    open,
    onOpenChange,
    categoryId,
    categoryName,
    existingGoal,
    onSaved,
}: SetGoalModalProps) {
    const { accessToken } = useAuth()
    const accessTokenRef = useRef<string | null>(null)
    accessTokenRef.current = accessToken

    const [goalType, setGoalType] = useState<string>('monthly_savings')
    const [targetAmount, setTargetAmount] = useState('')
    const [targetDate, setTargetDate] = useState('')
    const [monthlyAmount, setMonthlyAmount] = useState('')
    const [loading, setLoading] = useState(false)
    const [deleting, setDeleting] = useState(false)

    useEffect(() => {
        if (!open) return
        if (existingGoal) {
            setGoalType(existingGoal.goal_type)
            setTargetAmount(existingGoal.target_amount?.toString() ?? '')
            setTargetDate(existingGoal.target_date ?? '')
            setMonthlyAmount(existingGoal.monthly_amount?.toString() ?? '')
        } else {
            setGoalType('monthly_savings')
            setTargetAmount('')
            setTargetDate('')
            setMonthlyAmount('')
        }
    }, [open, existingGoal])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        try {
            const token = accessTokenRef.current
            if (!token) return

            const body: Record<string, unknown> = { category_id: categoryId, goal_type: goalType }

            if (['target_balance', 'target_balance_by_date', 'debt_payoff'].includes(goalType)) {
                body.target_amount = targetAmount ? parseFloat(targetAmount) : null
            }
            if (goalType === 'target_balance_by_date') {
                body.target_date = targetDate || null
            }
            if (['monthly_savings', 'monthly_spending'].includes(goalType)) {
                body.monthly_amount = monthlyAmount ? parseFloat(monthlyAmount) : null
            }

            const response = await fetch('/api/category-goals', {
                method: 'POST',
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
            console.error('Error saving goal:', error)
        } finally {
            setLoading(false)
        }
    }

    const handleDelete = async () => {
        if (!existingGoal) return
        if (!confirm('Remove this goal?')) return
        setDeleting(true)
        try {
            const token = accessTokenRef.current
            if (!token) return

            const response = await fetch(`/api/category-goals/${existingGoal.id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` },
            })

            if (response.ok) {
                onSaved()
                onOpenChange(false)
            }
        } catch (error) {
            console.error('Error deleting goal:', error)
        } finally {
            setDeleting(false)
        }
    }

    const needsTargetAmount = ['target_balance', 'target_balance_by_date', 'debt_payoff'].includes(goalType)
    const needsTargetDate = goalType === 'target_balance_by_date'
    const needsMonthlyAmount = ['monthly_savings', 'monthly_spending'].includes(goalType)

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[440px]">
                <DialogHeader>
                    <DialogTitle>Set Goal — {categoryName}</DialogTitle>
                    <DialogDescription>
                        Track progress toward a saving or spending target for this category.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <Label>Goal Type</Label>
                        <Select value={goalType} onValueChange={setGoalType} required>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {Object.entries(GOAL_TYPE_LABELS).map(([value, label]) => (
                                    <SelectItem key={value} value={value}>{label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {needsTargetAmount && (
                        <div className="space-y-2">
                            <Label htmlFor="target-amount">Target Amount</Label>
                            <Input
                                id="target-amount"
                                type="number"
                                step="0.01"
                                placeholder="0.00"
                                value={targetAmount}
                                onChange={(e) => setTargetAmount(e.target.value)}
                            />
                        </div>
                    )}

                    {needsTargetDate && (
                        <div className="space-y-2">
                            <Label htmlFor="target-date">Target Date</Label>
                            <Input
                                id="target-date"
                                type="date"
                                value={targetDate}
                                onChange={(e) => setTargetDate(e.target.value)}
                            />
                        </div>
                    )}

                    {needsMonthlyAmount && (
                        <div className="space-y-2">
                            <Label htmlFor="monthly-amount">Monthly Amount</Label>
                            <Input
                                id="monthly-amount"
                                type="number"
                                step="0.01"
                                placeholder="0.00"
                                value={monthlyAmount}
                                onChange={(e) => setMonthlyAmount(e.target.value)}
                            />
                        </div>
                    )}

                    <DialogFooter className="flex items-center justify-between">
                        {existingGoal && (
                            <Button
                                type="button"
                                variant="outline"
                                className="text-red-600 hover:text-red-700 mr-auto"
                                onClick={handleDelete}
                                disabled={deleting}
                            >
                                {deleting ? 'Removing...' : 'Clear Goal'}
                            </Button>
                        )}
                        <div className="flex gap-2">
                            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
                                Cancel
                            </Button>
                            <Button type="submit" disabled={loading}>
                                {loading ? 'Saving...' : existingGoal ? 'Update Goal' : 'Set Goal'}
                            </Button>
                        </div>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
