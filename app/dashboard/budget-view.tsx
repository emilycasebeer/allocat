'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '../providers'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, Target, Pencil, Trash2, ArrowLeftRight, ChevronDown, ChevronRight } from 'lucide-react'
import { SetGoalModal } from '@/app/dashboard/set-goal-modal'
import { MoveMoneyModal } from '@/app/dashboard/move-money-modal'
import { MoveMoneyCategoryPopover } from '@/app/dashboard/move-money-popover'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { Category } from '@/app/dashboard/dashboard'
import type { CategoryGoal } from '@/lib/budgeting'

interface BudgetCategory {
    id: string
    name: string
    group_name: string
    is_system: boolean
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
    onTbbChange?: (tbb: number | null) => void
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

export function BudgetView({ month, year, onCategoryAdded, refreshKey, onTbbChange }: BudgetViewProps) {
    const { accessToken } = useAuth()
    // Stable ref so fetchMonth (useCallback with [] deps) always reads the current token
    const accessTokenRef = useRef(accessToken)
    accessTokenRef.current = accessToken

    const [budgetSummary, setBudgetSummary] = useState<BudgetSummary | null>(null)
    const [loading, setLoading] = useState(true)
    const [editingCell, setEditingCell] = useState<string | null>(null)
    const [editingValue, setEditingValue] = useState('')
    const [showAddGroupPopover, setShowAddGroupPopover] = useState(false)
    const [newGroupName, setNewGroupName] = useState('')
    const [addingGroupLoading, setAddingGroupLoading] = useState(false)
    const [emptyGroups, setEmptyGroups] = useState<Set<string>>(new Set())
    const [addingCategoryToGroup, setAddingCategoryToGroup] = useState<string | null>(null)
    const [newCategoryName, setNewCategoryName] = useState('')
    const [addingCategoryLoading, setAddingCategoryLoading] = useState(false)
    const [goalModal, setGoalModal] = useState<{ categoryId: string; categoryName: string; goal: CategoryGoal | null } | null>(null)
    const [renamingCategory, setRenamingCategory] = useState<{ id: string; name: string } | null>(null)
    const [showMoveMoney, setShowMoveMoney] = useState(false)
    const [openPopoverCategoryId, setOpenPopoverCategoryId] = useState<string | null>(null)
    const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())

    // Cache: key = "YYYY-M", value = BudgetSummary
    const cache = useRef<Map<string, BudgetSummary>>(new Map())
    // Track which month is currently "wanted" so stale background fetches don't clobber UI
    const activeKey = useRef(`${year}-${month}`)
    const prevRefreshKey = useRef(refreshKey)

    const cacheKey = (m: number, y: number) => `${y}-${m}`

    const fetchMonth = useCallback(async (m: number, y: number, background: boolean) => {
        const key = cacheKey(m, y)
        const token = accessTokenRef.current
        if (!token) return
        try {
            const headers = { 'Authorization': `Bearer ${token}` }
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

    // Fetch or show from cache when month/year/refreshKey/accessToken changes.
    // Gated on accessToken so we never call fetchMonth before auth is ready —
    // this prevents the infinite skeleton caused by getSession() deadlocking when
    // multiple components call it concurrently on the initial page load.
    useEffect(() => {
        if (!accessToken) return

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
    }, [month, year, refreshKey, accessToken, fetchMonth, prefetchAdjacent])

    // Notify parent of current TBB whenever it changes (used to render RTA in the header)
    useEffect(() => {
        onTbbChange?.(budgetSummary ? budgetSummary.to_be_budgeted : null)
    }, [budgetSummary, onTbbChange])

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
            const token = accessTokenRef.current
            if (!token) return
            const response = await fetch('/api/budgets/allocate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
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

    const handleKeyDown = (e: React.KeyboardEvent, categoryId: string) => {
        if (e.key === 'Enter') handleBudgetSave(categoryId)
        else if (e.key === 'Escape') { setEditingCell(null); setEditingValue('') }
    }

    const handleRenameSave = async (categoryId: string, newName: string) => {
        const trimmed = newName.trim()
        if (!trimmed) { setRenamingCategory(null); return }
        try {
            const token = accessTokenRef.current
            if (!token) return
            const response = await fetch(`/api/categories/${categoryId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
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
            const token = accessTokenRef.current
            if (!token) return
            const response = await fetch(`/api/categories/${category.id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` },
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

    const handlePopoverMoved = (updatedSummary: BudgetSummary) => {
        cache.current.set(cacheKey(month, year), updatedSummary)
        setBudgetSummary(updatedSummary)
        setOpenPopoverCategoryId(null)
    }

    const toggleGroup = (groupName: string) => {
        setCollapsedGroups(prev => {
            const next = new Set(prev)
            if (next.has(groupName)) next.delete(groupName)
            else next.add(groupName)
            return next
        })
    }

    const handleAddGroup = async () => {
        const trimmed = newGroupName.trim()
        if (!trimmed) return
        setAddingGroupLoading(true)
        try {
            const token = accessTokenRef.current
            if (!token) return
            const res = await fetch('/api/category-groups', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ name: trimmed }),
            })
            if (res.ok) {
                setShowAddGroupPopover(false)
                setEmptyGroups(prev => new Set([...prev, trimmed]))
                setNewGroupName('')
                onCategoryAdded()
            } else {
                const err = await res.json()
                alert(`Error: ${err.error}`)
            }
        } catch (e) {
            console.error('Error creating group:', e)
        } finally {
            setAddingGroupLoading(false)
        }
    }

    const handleAddCategoryToGroup = async (groupName: string) => {
        const trimmed = newCategoryName.trim()
        if (!trimmed) return
        setAddingCategoryLoading(true)
        try {
            const token = accessTokenRef.current
            if (!token) return
            const res = await fetch('/api/categories', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ name: trimmed, group_name: groupName }),
            })
            if (res.ok) {
                const { category } = await res.json()
                setAddingCategoryToGroup(null)
                setNewCategoryName('')
                onCategoryAdded()
                // Optimistic insert — new category appears instantly with $0 values
                setBudgetSummary(prev => {
                    if (!prev) return prev
                    const newCat: BudgetCategory = {
                        id: category.id,
                        name: category.name,
                        group_name: groupName,
                        is_system: false,
                        budgeted_amount: 0,
                        activity_amount: 0,
                        available_amount: 0,
                        goal: null,
                    }
                    const updated = { ...prev, categories: [...prev.categories, newCat] }
                    cache.current.set(cacheKey(month, year), updated)
                    return updated
                })
                // Silent background sync — no setLoading(true), no skeleton flash
                fetchMonth(month, year, true)
            } else {
                const err = await res.json()
                alert(`Error: ${err.error}`)
            }
        } catch (e) {
            console.error('Error creating category:', e)
        } finally {
            setAddingCategoryLoading(false)
        }
    }

    const getAvailableClass = (available: number) => {
        if (available > 0) return 'available-positive'
        if (available === 0) return 'available-zero'
        return 'available-negative'
    }

    if (loading) {
        return (
            <div className="space-y-4">
                {/* Category table skeleton */}
                <div>
                    <div className="overflow-x-auto">
                        <table className="budget-table">
                            <thead>
                                <tr>
                                    <th className="pl-8 text-left">
                                        <div className="flex gap-2 animate-pulse">
                                            <div className="h-5 w-28 bg-muted rounded" />
                                            <div className="h-5 w-24 bg-muted rounded" />
                                        </div>
                                    </th>
                                    <th className="w-36 text-right">Assigned</th>
                                    <th className="w-36 text-right">Outflow</th>
                                    <th className="w-36 text-right">Available</th>
                                    <th className="w-16"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {[0, 1].map((g) => (
                                    <React.Fragment key={g}>
                                        <tr className="animate-pulse">
                                            <td className="py-2.5 pl-4">
                                                <div className="h-2.5 w-32 bg-muted/70 rounded" />
                                            </td>
                                            <td /><td /><td /><td />
                                        </tr>
                                        {[...Array(4)].map((_, i) => (
                                            <tr key={i} className="animate-pulse">
                                                <td className="py-3 pl-8">
                                                    <div className="h-3 bg-muted rounded" style={{ width: `${55 + (i * 13) % 30}%` }} />
                                                </td>
                                                <td className="py-3 text-right pr-3">
                                                    <div className="h-3 w-14 bg-muted rounded ml-auto" />
                                                </td>
                                                <td className="py-3 text-right pr-3">
                                                    <div className="h-3 w-14 bg-muted rounded ml-auto" />
                                                </td>
                                                <td className="py-3 text-right pr-3">
                                                    <div className="h-3 w-14 bg-muted rounded ml-auto" />
                                                </td>
                                                <td />
                                            </tr>
                                        ))}
                                    </React.Fragment>
                                ))}
                            </tbody>
                        </table>
                    </div>
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

    // Merge in locally-tracked empty groups (newly created groups with no categories yet).
    // Once a background sync returns categories for a group it migrates into `grouped`
    // naturally, so we drop it from emptyGroups at that point.
    const groupsWithCategories = new Set(Object.keys(grouped))
    const allGroupEntries: [string, BudgetCategory[]][] = [
        ...Object.entries(grouped),
        ...[...emptyGroups]
            .filter(g => !groupsWithCategories.has(g))
            .map(g => [g, []] as [string, BudgetCategory[]]),
    ]

    return (
        <div className="space-y-4">
            {/* ── Budget Table ─────────────────────────────────────────── */}
            <div>
                <div className="overflow-x-auto">
                    <table className="budget-table">
                        <thead>
                            <tr>
                                <th className="pl-8 text-left">
                                    <div className="flex items-center gap-1">
                                        <Popover open={showAddGroupPopover} onOpenChange={(open) => { setShowAddGroupPopover(open); if (!open) setNewGroupName('') }}>
                                            <PopoverTrigger asChild>
                                                <Button variant="ghost" size="sm" className="text-primary/70 hover:text-primary hover:bg-primary/10 h-7 px-2 text-xs font-semibold uppercase tracking-wider">
                                                    <Plus className="h-3 w-3 mr-1" />
                                                    Category Group
                                                </Button>
                                            </PopoverTrigger>
                                            <PopoverContent side="bottom" align="start" className="w-64 p-3">
                                                <div className="space-y-2">
                                                    <Input
                                                        value={newGroupName}
                                                        onChange={(e) => setNewGroupName(e.target.value)}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter') handleAddGroup()
                                                            if (e.key === 'Escape') { setShowAddGroupPopover(false); setNewGroupName('') }
                                                        }}
                                                        placeholder="New Category Group"
                                                        className="h-8 text-sm"
                                                        autoFocus
                                                    />
                                                    <div className="flex gap-2 justify-end">
                                                        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setShowAddGroupPopover(false); setNewGroupName('') }} disabled={addingGroupLoading}>
                                                            Cancel
                                                        </Button>
                                                        <Button size="sm" className="h-7 text-xs" onClick={handleAddGroup} disabled={addingGroupLoading || !newGroupName.trim()}>
                                                            {addingGroupLoading ? '…' : 'OK'}
                                                        </Button>
                                                    </div>
                                                </div>
                                            </PopoverContent>
                                        </Popover>
                                        <Button variant="ghost" size="sm" onClick={() => setShowMoveMoney(true)} className="text-primary/70 hover:text-primary hover:bg-primary/10 h-7 px-2 text-xs font-semibold uppercase tracking-wider">
                                            <ArrowLeftRight className="h-3 w-3 mr-1" />
                                            Move Money
                                        </Button>
                                    </div>
                                </th>
                                <th className="w-36 text-right">Assigned</th>
                                <th className="w-36 text-right">Outflow</th>
                                <th className="w-36 text-right">Available</th>
                                <th className="w-16"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {allGroupEntries.map(([groupName, groupCategories]) => {
                                const isCollapsed = collapsedGroups.has(groupName)
                                const groupBudgeted = groupCategories.reduce((s, c) => s + c.budgeted_amount, 0)
                                const groupActivity = groupCategories.reduce((s, c) => s + c.activity_amount, 0)
                                const groupAvailable = groupCategories.reduce((s, c) => s + c.available_amount, 0)

                                return (
                                    <React.Fragment key={groupName}>
                                        {/* Group header row */}
                                        <tr
                                            className="category-group group/group cursor-pointer select-none"
                                            onClick={() => toggleGroup(groupName)}
                                        >
                                            <td>
                                                <div className="flex items-center gap-1.5">
                                                    {isCollapsed
                                                        ? <ChevronRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                                                        : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                                                    }
                                                    <span>{groupName}</span>
                                                    <Popover
                                                        open={addingCategoryToGroup === groupName}
                                                        onOpenChange={(open) => {
                                                            if (!open) { setAddingCategoryToGroup(null); setNewCategoryName('') }
                                                        }}
                                                    >
                                                        <PopoverTrigger asChild>
                                                            <button
                                                                className="h-4 w-4 rounded-full flex items-center justify-center flex-shrink-0 opacity-0 group-hover/group:opacity-100 bg-primary hover:bg-primary/80 text-primary-foreground transition-all"
                                                                title={`Add category to ${groupName}`}
                                                                onClick={(e) => { e.stopPropagation(); setAddingCategoryToGroup(groupName) }}
                                                            >
                                                                <Plus className="h-2.5 w-2.5" />
                                                            </button>
                                                        </PopoverTrigger>
                                                        <PopoverContent side="bottom" align="start" className="w-64 p-3" onClick={(e) => e.stopPropagation()}>
                                                            <div className="space-y-2">
                                                                <p className="text-xs font-medium text-muted-foreground">New Category in <span className="text-foreground">{groupName}</span></p>
                                                                <Input
                                                                    value={newCategoryName}
                                                                    onChange={(e) => setNewCategoryName(e.target.value)}
                                                                    onKeyDown={(e) => {
                                                                        if (e.key === 'Enter') handleAddCategoryToGroup(groupName)
                                                                        if (e.key === 'Escape') { setAddingCategoryToGroup(null); setNewCategoryName('') }
                                                                    }}
                                                                    placeholder="Category name"
                                                                    className="h-8 text-sm"
                                                                    autoFocus
                                                                />
                                                                <div className="flex gap-2 justify-end">
                                                                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={(e) => { e.stopPropagation(); setAddingCategoryToGroup(null); setNewCategoryName('') }} disabled={addingCategoryLoading}>
                                                                        Cancel
                                                                    </Button>
                                                                    <Button size="sm" className="h-7 text-xs" onClick={(e) => { e.stopPropagation(); handleAddCategoryToGroup(groupName) }} disabled={addingCategoryLoading || !newCategoryName.trim()}>
                                                                        {addingCategoryLoading ? '…' : 'OK'}
                                                                    </Button>
                                                                </div>
                                                            </div>
                                                        </PopoverContent>
                                                    </Popover>
                                                </div>
                                            </td>
                                            <td className="w-36 text-right financial-figure text-muted-foreground text-xs font-bold">
                                                {formatCurrency(groupBudgeted)}
                                            </td>
                                            <td className="w-36 text-right financial-figure text-xs text-muted-foreground font-bold">
                                                {formatCurrency(groupActivity)}
                                            </td>
                                            <td className={`w-36 text-right financial-figure text-xs font-bold ${groupAvailable < 0 ? 'text-destructive/80' : groupAvailable > 0 ? 'text-primary/80' : 'text-muted-foreground'}`}>
                                                {formatCurrency(groupAvailable)}
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
                                                <td className="w-36 text-right">
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
                                                <td className="w-36 text-right text-sm financial-figure text-muted-foreground">
                                                    {formatCurrency(category.activity_amount)}
                                                </td>
                                                <td className="w-36 text-right">
                                                    {category.available_amount !== 0 ? (
                                                        <Popover
                                                            open={openPopoverCategoryId === category.id}
                                                            onOpenChange={(open) => setOpenPopoverCategoryId(open ? category.id : null)}
                                                        >
                                                            <PopoverTrigger asChild>
                                                                <span
                                                                    className={`${getAvailableClass(category.available_amount)} cursor-pointer`}
                                                                    title="Click to move money"
                                                                >
                                                                    {formatCurrency(category.available_amount)}
                                                                </span>
                                                            </PopoverTrigger>
                                                            <PopoverContent side="left" align="center" className="w-80">
                                                                {openPopoverCategoryId === category.id && budgetSummary && (
                                                                    <MoveMoneyCategoryPopover
                                                                        budgetSummary={budgetSummary}
                                                                        sourceCategoryId={category.id}
                                                                        initialAmount={category.available_amount}
                                                                        onMoved={handlePopoverMoved}
                                                                        onClose={() => setOpenPopoverCategoryId(null)}
                                                                    />
                                                                )}
                                                            </PopoverContent>
                                                        </Popover>
                                                    ) : (
                                                        <span className={getAvailableClass(category.available_amount)}>
                                                            {formatCurrency(category.available_amount)}
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="w-16 text-center">
                                                    <div className="flex items-center justify-center gap-0.5">
                                                        {!category.is_system && (
                                                            <button
                                                                title="Set Goal"
                                                                className={`p-1 rounded hover:bg-muted transition-colors ${category.goal ? 'text-primary' : 'text-muted-foreground/30 hover:text-muted-foreground'}`}
                                                                onClick={() => setGoalModal({ categoryId: category.id, categoryName: category.name, goal: category.goal })}
                                                            >
                                                                <Target className="h-3.5 w-3.5" />
                                                            </button>
                                                        )}
                                                        {!category.is_system && (
                                                            <button
                                                                title="Rename"
                                                                className="p-1 rounded hover:bg-muted text-muted-foreground/30 hover:text-muted-foreground opacity-0 group-hover:opacity-100 transition-all"
                                                                onClick={() => setRenamingCategory({ id: category.id, name: category.name })}
                                                            >
                                                                <Pencil className="h-3.5 w-3.5" />
                                                            </button>
                                                        )}
                                                        {!category.is_system && (
                                                            <button
                                                                title="Delete"
                                                                className="p-1 rounded hover:bg-destructive/10 text-muted-foreground/30 hover:text-destructive opacity-0 group-hover:opacity-100 transition-all"
                                                                onClick={() => handleDeleteCategory(category)}
                                                            >
                                                                <Trash2 className="h-3.5 w-3.5" />
                                                            </button>
                                                        )}
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
                                <td className="w-36 text-right text-sm financial-figure font-semibold text-foreground/70">
                                    {formatCurrency(totalBudgeted)}
                                </td>
                                <td className="w-36 text-right text-sm financial-figure font-semibold text-muted-foreground">
                                    {formatCurrency(totalActivity)}
                                </td>
                                <td className="w-36 text-right">
                                    <span className={getAvailableClass(totalAvailable)}>
                                        {formatCurrency(totalAvailable)}
                                    </span>
                                </td>
                                <td></td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

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
