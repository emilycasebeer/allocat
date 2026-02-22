'use client'

import React, { useState, useEffect } from 'react'
import { supabase } from '../providers'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Plus } from 'lucide-react'
import { AddCategoryModal } from '@/app/dashboard/add-category-modal'
import type { Category } from '@/app/dashboard/dashboard'

interface BudgetCategory {
    id: string
    name: string
    group_name: string
    budgeted_amount: number
    activity_amount: number
    available_amount: number
}

interface BudgetSummary {
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

export function BudgetView({ month, year, onCategoryAdded }: BudgetViewProps) {
    const [budgetSummary, setBudgetSummary] = useState<BudgetSummary | null>(null)
    const [loading, setLoading] = useState(true)
    const [editingCell, setEditingCell] = useState<string | null>(null)
    const [editingValue, setEditingValue] = useState('')
    const [showAddCategory, setShowAddCategory] = useState(false)

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
                // No budget for this month yet — create one
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
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`
                },
                body: JSON.stringify({
                    budget_id: budgetSummary.id,
                    category_id: categoryId,
                    amount: newAmount
                })
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

    const handleKeyDown = (e: React.KeyboardEvent, categoryId: string) => {
        if (e.key === 'Enter') handleBudgetSave(categoryId)
        else if (e.key === 'Escape') { setEditingCell(null); setEditingValue('') }
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

    // Group categories by group_name
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
                        ${budgetSummary.to_be_budgeted.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                </CardContent>
            </Card>

            {/* Budget Table */}
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <CardTitle>Budget Categories</CardTitle>
                        <Button onClick={() => setShowAddCategory(true)} size="sm">
                            <Plus className="h-4 w-4 mr-2" />
                            Add Category
                        </Button>
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
                                </tr>
                            </thead>
                            <tbody>
                                {Object.entries(grouped).map(([groupName, groupCategories]) => (
                                    <React.Fragment key={groupName}>
                                        <tr className="category-group">
                                            <td colSpan={4} className="font-semibold">{groupName}</td>
                                        </tr>
                                        {groupCategories.map((category) => (
                                            <tr key={category.id}>
                                                <td className="category-name">{category.name}</td>
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
                                                            ${category.budgeted_amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                        </span>
                                                    )}
                                                </td>
                                                <td className={`text-right ${category.activity_amount < 0 ? 'amount-negative' : 'amount-positive'}`}>
                                                    ${category.activity_amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </td>
                                                <td className={`text-right ${getAvailableClass(category.available_amount)}`}>
                                                    ${category.available_amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </td>
                                            </tr>
                                        ))}
                                    </React.Fragment>
                                ))}
                                <tr className="bg-gray-50 font-semibold">
                                    <td>Total</td>
                                    <td className="text-right">${totalBudgeted.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                    <td className={`text-right ${totalActivity < 0 ? 'amount-negative' : 'amount-positive'}`}>
                                        ${totalActivity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </td>
                                    <td className={`text-right ${getAvailableClass(totalAvailable)}`}>
                                        ${totalAvailable.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </td>
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
        </div>
    )
}
