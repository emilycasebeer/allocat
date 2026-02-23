'use client'

import React, { useState, useEffect } from 'react'
import { supabase } from '../providers'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Plus, Target, Pencil, Trash2, ArrowLeftRight, Copy } from 'lucide-react'
import { AddCategoryModal } from '@/app/dashboard/add-category-modal'
import { SetGoalModal } from '@/app/dashboard/set-goal-modal'
import { MoveMoneyModal } from '@/app/dashboard/move-money-modal'
import type { Category } from '@/app/dashboard/dashboard'
import type { CategoryGoal } from '@/lib/budgeting'

interface BudgetCategory {
    id: string
    name: string
    group_name: string
    budgeted_amount: number
    activity_amount: number
    available_amount: number
    goal: CategoryGoal | null
}

export interface BudgetSummary {
    id: string
    month: number
    year: number
    to_be_budgeted: number
    categories: BudgetCategory[]
}

interface BudgetViewProps {
    month: number
    year: number
    categories: Category[]
    onCategoryAdded: () => void
}

function GoalProgress({ goal, available }: { goal: CategoryGoal; available: number }) {
    let target: number | null = null
    let label = ''

    if (goal.goal_type === 'monthly_savings' || goal.goal_type === 'monthly_spending') {
        target = goal.monthly_amount
        label = goal.goal_type === 'monthly_savings' ? 'Monthly Savings' : 'Monthly Budget'
    } else if (goal.goal_type === 'target_balance' || goal.goal_type === 'debt_payoff') {
        target = goal.target_amount
        label = goal.goal_type === 'debt_payoff' ? 'Debt Payoff' : 'Target Balance'
    } else if (goal.goal_type === 'target_balance_by_date') {
        target = goal.target_amount
        label = goal.target_date ? `Goal by ${goal.target_date}` : 'Target Balance'
    }

    if (!target || target <= 0) return null

    const pct = Math.min(100, Math.max(0, (available / target) * 100))
    const isComplete = pct >= 100

    return (
        <div className="mt-1">
            <div className="flex items-center justify-between text-xs text-gray-500 mb-0.5">
                <span>{label}</span>
                <span>{Math.round(pct)}%</span>
            </div>
            <div className="h-1 w-full bg-gray-200 rounded-full overflow-hidden">
                <div
                    className={`h-full rounded-full transition-all ${isComplete ? 'bg-green-500' : 'bg-blue-400'}`}
                    style={{ width: `${pct}%` }}
                />
            </div>
        </div>
    )
}

const formatCurrency = (amount: number) => {
    const abs = Math.abs(amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    return amount < 0 ? `-$${abs}` : `$${abs}`
}

export function BudgetView({ month, year, onCategoryAdded }: BudgetViewProps) {
    const [budgetSummary, setBudgetSummary] = useState<BudgetSummary | null>(null)
    const [loading, setLoading] = useState(true)
    const [editingCell, setEditingCell] = useState<string | null>(null)
    const [editingValue, setEditingValue] = useState('')
    const [showAddCategory, setShowAddCategory] = useState(false)
    const [goalModal, setGoalModal] = useState<{ categoryId: string; categoryName: string; goal: CategoryGoal | null } | null>(null)
    const [renamingCategory, setRenamingCategory] = useState<{ id: string; name: string } | null>(null)
    const [showMoveMoney, setShowMoveMoney] = useState(false)
    const [copyingLastMonth, setCopyingLastMonth] = useState(false)

    useEffect(() => {
        fetchBudgetSummary()
    }, [month, year])

    const fetchBudgetSummary = async () => {
        setLoading(true)
        try {
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) return

            const headers = { 'Authorization': `Bearer ${session.access_token}` }
            const response = await fetch(`/api/budgets?month=${month}&year=${year}`, { headers })

            if (response.ok) {
                const { budget } = await response.json()
                setBudgetSummary(budget)
            } else if (response.status === 404) {
                const createResponse = await fetch('/api/budgets', {
                    method: 'POST',
                    headers: { ...headers, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ month, year })
                })
                if (createResponse.ok) {
                    const { budget } = await createResponse.json()
                    setBudgetSummary(budget)
                }
            }
        } catch (error) {
            console.error('Error fetching budget:', error)
        } finally {
            setLoading(false)
        }
    }

    const handleBudgetEdit = (categoryId: string, currentValue: number) => {
        setEditingCell(categoryId)
        setEditingValue(currentValue.toString())
    }

    const handleBudgetSave = async (categoryId: string) => {
        if (!budgetSummary) return
        try {
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) return

            const newAmount = parseFloat(editingValue) || 0
            const response = await fetch('/api/budgets/allocate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
                body: JSON.stringify({ budget_id: budgetSummary.id, category_id: categoryId, amount: newAmount })
            })
            if (response.ok) {
                const { budget } = await response.json()
                setBudgetSummary(budget)
            }
        } catch (error) {
            console.error('Error updating budget:', error)
        } finally {
            setEditingCell(null)
            setEditingValue('')
        }
    }

    const handleCopyLastMonth = async () => {
        if (!budgetSummary) return
        setCopyingLastMonth(true)
        try {
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) return
            const response = await fetch('/api/budgets/copy', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
                body: JSON.stringify({ to_budget_id: budgetSummary.id })
            })
            if (response.ok) {
                const { budget } = await response.json()
                setBudgetSummary(budget)
            } else {
                const err = await response.json()
                alert(`Error: ${err.error}`)
            }
        } catch (error) {
            console.error('Error copying last month:', error)
        } finally {
            setCopyingLastMonth(false)
        }
    }

    const handleKeyDown = (e: React.KeyboardEvent, categoryId: string) => {
        if (e.key === 'Enter') handleBudgetSave(categoryId)
        else if (e.key === 'Escape') { setEditingCell(null); setEditingValue('') }
    }

    const handleRenameSave = async (categoryId: string, newName: string) => {
        const trimmed = newName.trim()
        if (!trimmed) { setRenamingCategory(null); return }
        try {
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) return
            const response = await fetch(`/api/categories/${categoryId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
                body: JSON.stringify({ name: trimmed })
            })
            if (response.ok) {
                onCategoryAdded() // refresh dashboard categories
                fetchBudgetSummary()
            } else {
                const err = await response.json()
                alert(`Error: ${err.error}`)
            }
        } catch (error) {
            console.error('Error renaming category:', error)
        } finally {
            setRenamingCategory(null)
        }
    }

    const handleDeleteCategory = async (category: BudgetCategory) => {
        if (!confirm(`Delete "${category.name}"? This cannot be undone. Existing transactions will become uncategorized.`)) return
        try {
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) return
            const response = await fetch(`/api/categories/${category.id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${session.access_token}` }
            })
            if (response.ok) {
                onCategoryAdded()
                fetchBudgetSummary()
            } else {
                const err = await response.json()
                alert(`Error: ${err.error}`)
            }
        } catch (error) {
            console.error('Error deleting category:', error)
        }
    }

    const getAvailableClass = (available: number) => {
        if (available > 0) return 'available-positive'
        if (available === 0) return 'available-zero'
        return 'available-negative'
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
        )
    }

    if (!budgetSummary) {
        return (
            <div className="text-center py-12">
                <p className="text-gray-500">No budget found for this month.</p>
                <Button onClick={fetchBudgetSummary} className="mt-4">Retry</Button>
            </div>
        )
    }

    const totalBudgeted = budgetSummary.categories.reduce((sum, cat) => sum + cat.budgeted_amount, 0)
    const totalActivity = budgetSummary.categories.reduce((sum, cat) => sum + cat.activity_amount, 0)
    const totalAvailable = budgetSummary.categories.reduce((sum, cat) => sum + cat.available_amount, 0)

    const grouped = budgetSummary.categories.reduce((groups, cat) => {
        if (!groups[cat.group_name]) groups[cat.group_name] = []
        groups[cat.group_name].push(cat)
        return groups
    }, {} as Record<string, BudgetCategory[]>)

    return (
        <div className="space-y-6">
            {/* To Be Budgeted */}
            <Card className="bg-gradient-to-r from-blue-50 to-blue-100 border-blue-200">
                <CardHeader>
                    <CardTitle className="text-blue-900">To Be Budgeted</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className={`text-4xl font-bold ${budgetSummary.to_be_budgeted >= 0 ? 'text-blue-900' : 'text-red-700'}`}>
                        {formatCurrency(budgetSummary.to_be_budgeted)}
                    </div>
                </CardContent>
            </Card>

            {/* Budget Table */}
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <CardTitle>Budget Categories</CardTitle>
                        <div className="flex items-center gap-2">
                            <Button variant="outline" size="sm" onClick={() => setShowMoveMoney(true)}>
                                <ArrowLeftRight className="h-4 w-4 mr-1" />
                                Move Money
                            </Button>
                            <Button variant="outline" size="sm" onClick={handleCopyLastMonth} disabled={copyingLastMonth}>
                                <Copy className="h-4 w-4 mr-1" />
                                {copyingLastMonth ? 'Copying...' : 'Copy Last Month'}
                            </Button>
                            <Button onClick={() => setShowAddCategory(true)} size="sm">
                                <Plus className="h-4 w-4 mr-2" />
                                Add Category
                            </Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="overflow-x-auto">
                        <table className="budget-table">
                            <thead>
                                <tr>
                                    <th className="w-1/3">Category</th>
                                    <th className="w-1/6 text-right">Budgeted</th>
                                    <th className="w-1/6 text-right">Activity</th>
                                    <th className="w-1/6 text-right">Available</th>
                                    <th className="w-20"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {Object.entries(grouped).map(([groupName, groupCategories]) => (
                                    <React.Fragment key={groupName}>
                                        <tr className="category-group">
                                            <td colSpan={5} className="font-semibold">{groupName}</td>
                                        </tr>
                                        {groupCategories.map((category) => (
                                            <tr key={category.id} className="group">
                                                <td className="category-name">
                                                    {renamingCategory?.id === category.id ? (
                                                        <Input
                                                            value={renamingCategory.name}
                                                            onChange={(e) => setRenamingCategory({ id: category.id, name: e.target.value })}
                                                            onKeyDown={(e) => {
                                                                if (e.key === 'Enter') handleRenameSave(category.id, renamingCategory.name)
                                                                if (e.key === 'Escape') setRenamingCategory(null)
                                                            }}
                                                            onBlur={() => handleRenameSave(category.id, renamingCategory.name)}
                                                            className="h-7 text-sm py-0"
                                                            autoFocus
                                                        />
                                                    ) : (
                                                        <div>
                                                            {category.name}
                                                            {category.goal && (
                                                                <GoalProgress
                                                                    goal={category.goal}
                                                                    available={category.available_amount}
                                                                />
                                                            )}
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="text-right">
                                                    {editingCell === category.id ? (
                                                        <Input
                                                            type="number"
                                                            value={editingValue}
                                                            onChange={(e) => setEditingValue(e.target.value)}
                                                            onKeyDown={(e) => handleKeyDown(e, category.id)}
                                                            onBlur={() => handleBudgetSave(category.id)}
                                                            className="budgeted-input"
                                                            autoFocus
                                                        />
                                                    ) : (
                                                        <span
                                                            className="cursor-pointer hover:bg-gray-100 px-2 py-1 rounded"
                                                            onClick={() => handleBudgetEdit(category.id, category.budgeted_amount)}
                                                        >
                                                            {formatCurrency(category.budgeted_amount)}
                                                        </span>
                                                    )}
                                                </td>
                                                <td className={`text-right ${category.activity_amount < 0 ? 'amount-negative' : 'amount-positive'}`}>
                                                    {formatCurrency(category.activity_amount)}
                                                </td>
                                                <td className={`text-right ${getAvailableClass(category.available_amount)}`}>
                                                    {formatCurrency(category.available_amount)}
                                                </td>
                                                <td className="text-center">
                                                    <div className="flex items-center justify-center gap-1">
                                                        <button
                                                            title="Set Goal"
                                                            className={`p-1 rounded hover:bg-gray-100 ${category.goal ? 'text-blue-500' : 'text-gray-300'}`}
                                                            onClick={() => setGoalModal({ categoryId: category.id, categoryName: category.name, goal: category.goal })}
                                                        >
                                                            <Target className="h-4 w-4" />
                                                        </button>
                                                        <button
                                                            title="Rename"
                                                            className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700 opacity-0 group-hover:opacity-100 transition-opacity"
                                                            onClick={() => setRenamingCategory({ id: category.id, name: category.name })}
                                                        >
                                                            <Pencil className="h-3.5 w-3.5" />
                                                        </button>
                                                        <button
                                                            title="Delete"
                                                            className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                                                            onClick={() => handleDeleteCategory(category)}
                                                        >
                                                            <Trash2 className="h-3.5 w-3.5" />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </React.Fragment>
                                ))}
                                <tr className="bg-gray-50 font-semibold">
                                    <td>Total</td>
                                    <td className="text-right">{formatCurrency(totalBudgeted)}</td>
                                    <td className={`text-right ${totalActivity < 0 ? 'amount-negative' : 'amount-positive'}`}>
                                        {formatCurrency(totalActivity)}
                                    </td>
                                    <td className={`text-right ${getAvailableClass(totalAvailable)}`}>
                                        {formatCurrency(totalAvailable)}
                                    </td>
                                    <td></td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>

            <AddCategoryModal
                open={showAddCategory}
                onOpenChange={setShowAddCategory}
                onCategoryAdded={() => {
                    setShowAddCategory(false)
                    onCategoryAdded()
                    fetchBudgetSummary()
                }}
            />

            {showMoveMoney && budgetSummary && (
                <MoveMoneyModal
                    open={showMoveMoney}
                    onOpenChange={setShowMoveMoney}
                    budgetSummary={budgetSummary}
                    onMoved={fetchBudgetSummary}
                />
            )}

            {goalModal && (
                <SetGoalModal
                    open={!!goalModal}
                    onOpenChange={(open) => { if (!open) setGoalModal(null) }}
                    categoryId={goalModal.categoryId}
                    categoryName={goalModal.categoryName}
                    existingGoal={goalModal.goal}
                    onSaved={() => {
                        setGoalModal(null)
                        fetchBudgetSummary()
                    }}
                />
            )}
        </div>
    )
}
