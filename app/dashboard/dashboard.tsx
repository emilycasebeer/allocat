'use client'

import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { supabase } from '../providers'
import { TopNav } from '@/app/dashboard/top-nav'
import { Sidebar } from '@/app/dashboard/sidebar'
import { BudgetView } from '@/app/dashboard/budget-view'
import { ManagePayeesModal } from '@/app/dashboard/manage-payees-modal'

const TransactionsView = dynamic(() => import('@/app/dashboard/transactions-view').then(m => ({ default: m.TransactionsView })))
const ScheduledTransactionsView = dynamic(() => import('@/app/dashboard/scheduled-transactions-view').then(m => ({ default: m.ScheduledTransactionsView })))
const ReportsView = dynamic(() => import('@/app/dashboard/reports-view').then(m => ({ default: m.ReportsView })))
import { SetupWizard } from '@/app/dashboard/setup-wizard'
import { ChevronLeft, ChevronRight, Users } from 'lucide-react'

export interface Account {
    id: string
    name: string
    type_name: string
    is_liability: boolean
    is_budget_account: boolean
    is_closed: boolean
    balance: number
    payment_category_id: string | null
}

export interface Category {
    id: string
    name: string
    group_id: string
    group_name: string
    is_system: boolean
}

export type ViewType = 'budget' | 'transactions' | 'scheduled' | 'reports'

const VIEW_LABELS: Record<ViewType, string> = {
    budget: 'Budget',
    transactions: 'Transactions',
    scheduled: 'Scheduled',
    reports: 'Reports',
}

export function Dashboard() {
    const [accounts, setAccounts] = useState<Account[]>([])
    const [categories, setCategories] = useState<Category[]>([])
    const [selectedAccount, setSelectedAccount] = useState<Account | null>(null)
    const [currentView, setCurrentView] = useState<ViewType>('budget')
    const [showManagePayees, setShowManagePayees] = useState(false)
    const [showWizard, setShowWizard] = useState(false)
    const [wizardChecked, setWizardChecked] = useState(false)
    const [budgetRefreshKey, setBudgetRefreshKey] = useState(0)
    const [currentMonth, setCurrentMonth] = useState(() => {
        const now = new Date()
        return { month: now.getMonth() + 1, year: now.getFullYear() }
    })

    useEffect(() => {
        Promise.all([fetchAccounts(), fetchCategories()]).then(([accts, cats]) => {
            if (
                accts.length === 0 &&
                cats.length === 0 &&
                !localStorage.getItem('allocat_wizard_dismissed')
            ) {
                setShowWizard(true)
            }
            setWizardChecked(true)
        })
    }, [])

    const fetchAccounts = async (): Promise<Account[]> => {
        try {
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) return []
            const response = await fetch('/api/accounts', {
                headers: { 'Authorization': `Bearer ${session.access_token}` }
            })
            if (response.ok) {
                const { accounts } = await response.json()
                setAccounts(accounts)
                if (accounts.length > 0 && !selectedAccount) {
                    setSelectedAccount(accounts[0])
                }
                return accounts
            }
        } catch (error) {
            console.error('Error fetching accounts:', error)
        }
        return []
    }

    const fetchCategories = async (): Promise<Category[]> => {
        try {
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) return []
            const response = await fetch('/api/categories', {
                headers: { 'Authorization': `Bearer ${session.access_token}` }
            })
            if (response.ok) {
                const { flat } = await response.json()
                const cats = flat ?? []
                setCategories(cats)
                return cats
            }
        } catch (error) {
            console.error('Error fetching categories:', error)
        }
        return []
    }

    const handleAccountSelect = (account: Account) => {
        setSelectedAccount(account)
        setCurrentView('transactions')
    }

    const handleMonthChange = (direction: 'prev' | 'next') => {
        setCurrentMonth(prev => {
            if (direction === 'prev') {
                return prev.month === 1
                    ? { month: 12, year: prev.year - 1 }
                    : { month: prev.month - 1, year: prev.year }
            } else {
                return prev.month === 12
                    ? { month: 1, year: prev.year + 1 }
                    : { month: prev.month + 1, year: prev.year }
            }
        })
    }

    const handleWizardComplete = async () => {
        localStorage.setItem('allocat_wizard_dismissed', 'true')
        setShowWizard(false)
        await Promise.all([fetchAccounts(), fetchCategories()])
    }

    const handleWizardSkip = () => {
        localStorage.setItem('allocat_wizard_dismissed', 'true')
        setShowWizard(false)
    }

    if (!wizardChecked || showWizard) {
        if (showWizard) {
            return <SetupWizard onComplete={handleWizardComplete} onSkip={handleWizardSkip} />
        }
        return (
            <div className="min-h-screen bg-background flex items-center justify-center">
                <div className="flex flex-col items-center gap-6">
                    {/* Logo mark */}
                    <div className="relative">
                        <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/15 border border-primary/25 shadow-lg shadow-primary/10">
                            <span className="text-4xl leading-none select-none">🐱</span>
                        </div>
                        {/* Spinner ring around logo */}
                        <div className="absolute inset-0 rounded-2xl border-2 border-transparent border-t-primary/60 animate-spin" />
                    </div>

                    {/* Brand name */}
                    <div className="text-center">
                        <div className="font-display text-3xl font-bold tracking-tight text-foreground">
                            alloc<span className="text-primary">at</span>
                        </div>
                        <p className="mt-1.5 text-sm text-muted-foreground">Loading your budget…</p>
                    </div>
                </div>
            </div>
        )
    }

    const monthLabel = new Date(currentMonth.year, currentMonth.month - 1).toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric',
    })

    return (
        <div className="min-h-screen bg-background flex flex-col">
            <TopNav />

            <div className="flex flex-1 overflow-hidden">
                <Sidebar
                    accounts={accounts}
                    selectedAccount={selectedAccount}
                    onAccountSelect={handleAccountSelect}
                    onAccountAdded={() => {
                        fetchAccounts()
                        setBudgetRefreshKey(k => k + 1)
                    }}
                    currentView={currentView}
                    onViewChange={(view) => setCurrentView(view as ViewType)}
                />

                <div className="flex-1 flex flex-col min-w-0">
                    {/* Sub-header: month nav + view tabs */}
                    <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-card/40 backdrop-blur-sm">
                        {/* Month navigator */}
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => handleMonthChange('prev')}
                                className="h-8 w-8 flex items-center justify-center rounded-lg border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                                aria-label="Previous month"
                            >
                                <ChevronLeft className="h-4 w-4" />
                            </button>
                            <span className="font-display text-base font-bold text-foreground min-w-[152px] text-center select-none">
                                {monthLabel}
                            </span>
                            <button
                                onClick={() => handleMonthChange('next')}
                                className="h-8 w-8 flex items-center justify-center rounded-lg border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                                aria-label="Next month"
                            >
                                <ChevronRight className="h-4 w-4" />
                            </button>
                        </div>

                        {/* View tabs + utilities */}
                        <div className="flex items-center gap-2">
                            <div className="flex items-center gap-0.5 bg-secondary rounded-lg p-1">
                                {(Object.keys(VIEW_LABELS) as ViewType[]).map((view) => (
                                    <button
                                        key={view}
                                        onClick={() => setCurrentView(view)}
                                        className={`px-3.5 py-1.5 rounded-md text-sm font-medium transition-all duration-150 ${
                                            currentView === view
                                                ? 'bg-card text-foreground shadow-sm'
                                                : 'text-muted-foreground hover:text-foreground'
                                        }`}
                                    >
                                        {VIEW_LABELS[view]}
                                    </button>
                                ))}
                            </div>

                            <button
                                onClick={() => setShowManagePayees(true)}
                                title="Manage Payees"
                                className="h-8 w-8 flex items-center justify-center rounded-lg border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                            >
                                <Users className="h-4 w-4" />
                            </button>
                        </div>
                    </div>

                    {/* View content */}
                    <div className="flex-1 pt-8 px-6 pb-6 overflow-auto">
                        {currentView === 'budget' ? (
                            <BudgetView
                                month={currentMonth.month}
                                year={currentMonth.year}
                                categories={categories}
                                onCategoryAdded={fetchCategories}
                                refreshKey={budgetRefreshKey}
                            />
                        ) : currentView === 'transactions' ? (
                            <TransactionsView
                                account={selectedAccount}
                                accounts={accounts}
                                categories={categories}
                                onTransactionAdded={fetchAccounts}
                                currentMonth={currentMonth.month}
                                currentYear={currentMonth.year}
                            />
                        ) : currentView === 'scheduled' ? (
                            <ScheduledTransactionsView
                                accounts={accounts}
                                categories={categories}
                                onTransactionAdded={fetchAccounts}
                            />
                        ) : (
                            <ReportsView
                                month={currentMonth.month}
                                year={currentMonth.year}
                            />
                        )}
                    </div>
                </div>
            </div>

            <ManagePayeesModal
                open={showManagePayees}
                onOpenChange={setShowManagePayees}
                categories={categories}
            />
        </div>
    )
}
