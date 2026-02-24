'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../providers'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Plus, Target, Pencil, Trash2, ArrowLeftRight, Copy, ChevronDown, ChevronRight } from 'lucide-react'
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
    refreshKey?: number
}

function GoalProgress({ goal, available }: { goal: CategoryGoal; available: number }) {
    let target: number | null = null

    if (goal.goal_type === 'monthly_savings' || goal.goal_type === 'monthly_spending') {
        target = goal.monthly_amount
    } else if (goal.goal_type === 'target_balance' || goal.goal_type === 'debt_payoff') {
        target = goal.target_amount
    } else if (goal.goal_type === 'target_balance_by_date') {
        target = goal.target_amount
    }

    if (!target || target <= 0) return null

    const pct = Math.min(100, Math.max(0, (available / target) * 100))
    const isComplete = pct >= 100

    return (
        <div className="mt-1.5">
            <div
                className="h-1 w-full rounded-full overflow-hidden"
                style={{ backgroundColor: 'hsl(var(--muted))' }}
            >
                <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                        width: `${pct}%`,
                        backgroundColor: isComplete
                            ? 'hsl(160 72% 40%)'
                            : 'hsl(38 90% 50%)',
                    }}
                />
            </div>
        </div>
    )
}

const formatCurrency = (amount: number) => {
    const abs = Math.abs(amount).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })
    return amount < 0 ? `-$${abs}` : `$${abs}`
}

export function BudgetView({ month, year, onCategoryAdded, refreshKey }: BudgetViewProps) {
    const [budgetSummary, setBudgetSummary] = useState<BudgetSummary | null>(null)
    const [loading, setLoading] = useState(true)
    const [editingCell, setEditingCell] = useState<string | null>(null)
    const [editingValue, setEditingValue] = useState('')
    const [showAddCategory, setShowAddCategory] = useState(false)
    const [goalModal, setGoalModal] = useState<{ categoryId: string; categoryName: string; goal: CategoryGoal | null } | null>(null)
    const [renamingCategory, setRenamingCategory] = useState<{ id: string; name: string } | null>(null)
    const [showMoveMoney, setShowMoveMoney] = useState(false)
    const [copyingLastMonth, setCopyingLastMonth] = useState(false)
    const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())

    // Cache: key = "YYYY-M", value = BudgetSummary
    const cache = useRef<Map<string, BudgetSummary>>(new Map())
    // Track which month is currently "wanted" so stale background fetches don't clobber UI
    const activeKey = useRef(`${year}-${month}`)
    const prevRefreshKey = useRef(refreshKey)

    const cacheKey = (m: number, y: number) => `${y}-${m}`

    const fetchMonth = useCallback(async (m: number, y: number, background: boolean) => {
        const key = cacheKey(m, y)
        try {
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) return
            const headers = { 'Authorization': `Bearer ${session.access_token}` }
            let response = await fetch(`/api/budgets?month=${m}&year=${y}`, { headers })
            if (response.status === 404) {
                response = await fetch('/api/budgets', {
                    method: 'POST',
                    headers: { ...headers, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ month: m, year: y }),
                })
            }
            if (response.ok) {
                const { budget } = await response.json()
                cache.current.set(key, budget)
                // Only update UI if this is still the active month
                if (key === activeKey.current) {
                    setBudgetSummary(budget)
                    if (!background) setLoading(false)
                }
            }
        } catch (error) {
            if (!background) console.error('Error fetching budget:', error)
        } finally {
            if (!background && key === activeKey.current) setLoading(false)
        }
    }, [])

    const prefetchAdjacent = useCallback((m: number, y: number) => {
        const pairs: [number, number][] = [
            m === 1  ? [12, y - 1] : [m - 1, y],
            m === 12 ? [1,  y + 1] : [m + 1, y],
        ]
        for (const [am, ay] of pairs) {
            if (!cache.current.has(cacheKey(am, ay))) {
                fetchMonth(am, ay, true)
            }
        }
    }, [fetchMonth])

    // Fetch or show from cache when month/year/refreshKey changes
    useEffect(() => {
        const key = cacheKey(month, year)
        activeKey.current = key

        // If refreshKey changed, drop all cached data (balances may have changed)
        if (refreshKey !== prevRefreshKey.current) {
            cache.current.clear()
            prevRefreshKey.current = refreshKey
        }

        const cached = cache.current.get(key)
        if (cached) {
            // Instant display from cache
            setBudgetSummary(cached)
            setLoading(false)
            // Silent background refresh to stay current
            fetchMonth(month, year, true)
        } else {
            setLoading(true)
            fetchMonth(month, year, false)
        }

        prefetchAdjacent(month, year)
    }, [month, year, refreshKey, fetchMonth, prefetchAdjacent])

    // Keep fetchBudgetSummary for internal use (rename/delete/copy-last-month flows)
    const fetchBudgetSummary = useCallback(() => {
        cache.current.delete(cacheKey(month, year))
        setLoading(true)
        fetchMonth(month, year, false)
    }, [month, year, fetchMonth])

    const handleBudgetEdit = (categoryId: string, currentValue: number) => {
        setEditingCell(categoryId)
        setEditingValue(currentValue.toString())
    }

    const handleBudgetSave = async (categoryId: string) => {
        if (!budgetSummary) return
        const newAmount = parseFloat(editingValue) || 0
        const cat = budgetSummary.categories.find(c => c.id === categoryId)
        if (!cat) return
        const diff = newAmount - cat.budgeted_amount
        const prevSummary = budgetSummary

        // Optimistic update — instant UI
        setBudgetSummary(prev => {
            if (!prev) return prev
            return {
                ...prev,
                to_be_budgeted: prev.to_be_budgeted - diff,
                categories: prev.categories.map(c =>
                    c.id === categoryId
                        ? { ...c, budgeted_amount: newAmount, available_amount: c.available_amount + diff }
                        : c
                ),
            }
        })
        setEditingCell(null)
        setEditingValue('')

        // Background sync
        try {
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) return
            const response = await fetch('/api/budgets/allocate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`,
                },
                body: JSON.stringify({ budget_id: budgetSummary.id, category_id: categoryId, amount: newAmount }),
            })
            if (response.ok) {
                const { budget } = await response.json()
                cache.current.set(cacheKey(month, year), budget)
                setBudgetSummary(budget)
            } else {
                setBudgetSummary(prevSummary)
            }
        } catch (error) {
            console.error('Error updating budget:', error)
            setBudgetSummary(prevSummary)
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
                body: JSON.stringify({ to_budget_id: budgetSummary.id }),
            })
            if (response.ok) {
                const { budget } = await response.json()
                cache.current.set(cacheKey(month, year), budget)
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
                body: JSON.stringify({ name: trimmed }),
            })
            if (response.ok) {
                onCategoryAdded()
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
                headers: { 'Authorization': `Bearer ${session.access_token}` },
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

    const toggleGroup = (groupName: string) => {
        setCollapsedGroups(prev => {
            const next = new Set(prev)
            if (next.has(groupName)) next.delete(groupName)
            else next.add(groupName)
            return next
        })
    }

    const getAvailableClass = (available: number) => {
        if (available > 0) return 'available-positive'
        if (available === 0) return 'available-zero'
        return 'available-negative'
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="flex flex-col items-center gap-3">
                    <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                    <span className="text-sm text-muted-foreground">Loading budget…</span>
                </div>
            </div>
        )
    }

    if (!budgetSummary) {
        return (
            <div className="text-center py-12">
                <p className="text-muted-foreground">No budget found for this month.</p>
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

    const tbbPositive = budgetSummary.to_be_budgeted >= 0

    return (
        <div className="space-y-5">
            {/* ── To Be Budgeted Hero ──────────────────────────────────── */}
            <div className="grid grid-cols-4 gap-3">
                {/* Ready to Assign — main card */}
                <div
                    className="rounded-xl border p-5"
                    style={{
                        borderColor: tbbPositive ? 'hsl(38 90% 50% / 0.3)' : 'hsl(350 80% 60% / 0.3)',
                        background: tbbPositive
                            ? 'linear-gradient(135deg, hsl(222 20% 11%), hsl(38 90% 50% / 0.06))'
                            : 'linear-gradient(135deg, hsl(222 20% 11%), hsl(350 80% 60% / 0.06))',
                    }}
                >
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">
                        Ready to Assign
                    </p>
                    <div
                        className="font-display text-4xl font-bold financial-figure leading-none"
                        style={{ color: tbbPositive ? 'hsl(38 90% 58%)' : 'hsl(350 80% 65%)' }}
                    >
                        {formatCurrency(budgetSummary.to_be_budgeted)}
                    </div>
                </div>

                {/* Budgeted */}
                <div className="rounded-xl border p-5 bg-card/40">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">Budgeted</p>
                    <div className="font-display text-2xl font-bold financial-figure text-foreground/80 leading-none">
                        {formatCurrency(totalBudgeted)}
                    </div>
                </div>

                {/* Activity */}
                <div className="rounded-xl border p-5 bg-card/40">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">Activity</p>
                    <div className={`font-display text-2xl font-bold financial-figure leading-none ${totalActivity < 0 ? 'text-destructive/80' : 'text-primary/80'}`}>
                        {formatCurrency(totalActivity)}
                    </div>
                </div>

                {/* Available */}
                <div className="rounded-xl border p-5 bg-card/40">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">Available</p>
                    <div className={`font-display text-2xl font-bold financial-figure leading-none ${totalAvailable > 0 ? 'text-primary/80' : totalAvailable < 0 ? 'text-destructive/80' : 'text-muted-foreground'}`}>
                        {formatCurrency(totalAvailable)}
                    </div>
                </div>
            </div>

            {/* ── Budget Table ─────────────────────────────────────────── */}
            <Card>
                <CardHeader className="pb-0">
                    <div className="flex items-center justify-between">
                        <CardTitle className="text-base font-semibold">Categories</CardTitle>
                        <div className="flex items-center gap-2">
                            <Button variant="ghost" size="sm" onClick={() => setShowMoveMoney(true)} className="text-muted-foreground hover:text-foreground h-8 px-3">
                                <ArrowLeftRight className="h-3.5 w-3.5 mr-1.5" />
                                Move Money
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={handleCopyLastMonth}
                                disabled={copyingLastMonth}
                                className="text-muted-foreground hover:text-foreground h-8 px-3"
                            >
                                <Copy className="h-3.5 w-3.5 mr-1.5" />
                                {copyingLastMonth ? 'Copying…' : 'Copy Last Month'}
                            </Button>
                            <Button
                                size="sm"
                                onClick={() => setShowAddCategory(true)}
                                className="h-8 px-3"
                            >
                                <Plus className="h-3.5 w-3.5 mr-1.5" />
                                Add Category
                            </Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="p-0 mt-4">
                    <div className="overflow-x-auto">
                        <table className="budget-table">
                            <thead>
                                <tr>
                                    <th className="w-2/5 pl-4">Category</th>
                                    <th className="w-1/5 text-right">Budgeted</th>
                                    <th className="w-1/5 text-right">Activity</th>
                                    <th className="w-1/5 text-right pr-4">Available</th>
                                    <th className="w-20"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {Object.entries(grouped).map(([groupName, groupCategories]) => {
                                    const isCollapsed = collapsedGroups.has(groupName)
                                    const groupBudgeted = groupCategories.reduce((s, c) => s + c.budgeted_amount, 0)
                                    const groupActivity = groupCategories.reduce((s, c) => s + c.activity_amount, 0)
                                    const groupAvailable = groupCategories.reduce((s, c) => s + c.available_amount, 0)

                                    return (
                                        <React.Fragment key={groupName}>
                                            {/* Group header row */}
                                            <tr
                                                className="category-group cursor-pointer select-none"
                                                onClick={() => toggleGroup(groupName)}
                                            >
                                                <td className="pl-4">
                                                    <div className="flex items-center gap-2">
                                                        {isCollapsed
                                                            ? <ChevronRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                                                            : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                                                        }
                                                        <span>{groupName}</span>
                                                    </div>
                                                </td>
                                                <td className="text-right financial-figure text-muted-foreground text-xs">
                                                    {formatCurrency(groupBudgeted)}
                                                </td>
                                                <td className={`text-right financial-figure text-xs ${groupActivity < 0 ? 'text-destructive/70' : 'text-primary/70'}`}>
                                                    {formatCurrency(groupActivity)}
                                                </td>
                                                <td className="text-right pr-4 financial-figure text-xs">
                                                    <span className={getAvailableClass(groupAvailable)}>
                                                        {formatCurrency(groupAvailable)}
                                                    </span>
                                                </td>
                                                <td></td>
                                            </tr>

                                            {/* Category rows */}
                                            {!isCollapsed && groupCategories.map((category) => (
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
                                                                className="h-7 text-sm py-0 bg-muted border-border"
                                                                autoFocus
                                                            />
                                                        ) : (
                                                            <div>
                                                                <span className="text-sm text-foreground/90">{category.name}</span>
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
                                                                type="text"
                                                                inputMode="decimal"
                                                                value={editingValue}
                                                                onChange={(e) => setEditingValue(e.target.value)}
                                                                onKeyDown={(e) => handleKeyDown(e, category.id)}
                                                                onBlur={() => handleBudgetSave(category.id)}
                                                                onFocus={(e) => e.target.select()}
                                                                className="budgeted-input"
                                                                autoFocus
                                                            />
                                                        ) : (
                                                            <span
                                                                className="cursor-pointer hover:bg-muted/60 py-1 rounded text-sm financial-figure text-foreground/80 inline-block"
                                                                onClick={() => handleBudgetEdit(category.id, category.budgeted_amount)}
                                                            >
                                                                {formatCurrency(category.budgeted_amount)}
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className={`text-right text-sm financial-figure ${category.activity_amount < 0 ? 'amount-negative' : 'amount-positive'}`}>
                                                        {formatCurrency(category.activity_amount)}
                                                    </td>
                                                    <td className="text-right pr-4">
                                                        <span className={getAvailableClass(category.available_amount)}>
                                                            {formatCurrency(category.available_amount)}
                                                        </span>
                                                    </td>
                                                    <td className="text-center">
                                                        <div className="flex items-center justify-center gap-0.5">
                                                            <button
                                                                title="Set Goal"
                                                                className={`p-1 rounded hover:bg-muted transition-colors ${category.goal ? 'text-primary' : 'text-muted-foreground/30 hover:text-muted-foreground'}`}
                                                                onClick={() => setGoalModal({ categoryId: category.id, categoryName: category.name, goal: category.goal })}
                                                            >
                                                                <Target className="h-3.5 w-3.5" />
                                                            </button>
                                                            <button
                                                                title="Rename"
                                                                className="p-1 rounded hover:bg-muted text-muted-foreground/30 hover:text-muted-foreground opacity-0 group-hover:opacity-100 transition-all"
                                                                onClick={() => setRenamingCategory({ id: category.id, name: category.name })}
                                                            >
                                                                <Pencil className="h-3.5 w-3.5" />
                                                            </button>
                                                            <button
                                                                title="Delete"
                                                                className="p-1 rounded hover:bg-destructive/10 text-muted-foreground/30 hover:text-destructive opacity-0 group-hover:opacity-100 transition-all"
                                                                onClick={() => handleDeleteCategory(category)}
                                                            >
                                                                <Trash2 className="h-3.5 w-3.5" />
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </React.Fragment>
                                    )
                                })}

                                {/* Totals row */}
                                <tr style={{ backgroundColor: 'hsl(var(--secondary))' }}>
                                    <td className="pl-4 text-sm font-semibold text-foreground/70">Total</td>
                                    <td className="text-right text-sm financial-figure font-semibold text-foreground/70">
                                        {formatCurrency(totalBudgeted)}
                                    </td>
                                    <td className={`text-right text-sm financial-figure font-semibold ${totalActivity < 0 ? 'text-destructive/80' : 'text-primary/80'}`}>
                                        {formatCurrency(totalActivity)}
                                    </td>
                                    <td className="text-right pr-4">
                                        <span className={getAvailableClass(totalAvailable)}>
                                            {formatCurrency(totalAvailable)}
                                        </span>
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
