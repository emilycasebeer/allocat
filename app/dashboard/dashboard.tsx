'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '../providers'
import { supabase } from '../providers'
import { TopNav } from '@/app/dashboard/top-nav'
import { Sidebar } from '@/app/dashboard/sidebar'
import { BudgetView } from '@/app/dashboard/budget-view'
import { TransactionsView } from '@/app/dashboard/transactions-view'
import { ReportsView } from '@/app/dashboard/reports-view'
import { Button } from '@/components/ui/button'

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

export function Dashboard() {
    const { user } = useAuth()
    const [accounts, setAccounts] = useState<Account[]>([])
    const [categories, setCategories] = useState<Category[]>([])
    const [selectedAccount, setSelectedAccount] = useState<Account | null>(null)
    const [currentView, setCurrentView] = useState<'budget' | 'transactions' | 'reports'>('budget')
    const [currentMonth, setCurrentMonth] = useState(() => {
        const now = new Date()
        return { month: now.getMonth() + 1, year: now.getFullYear() }
    })

    useEffect(() => {
        fetchAccounts()
        fetchCategories()
    }, [])

    const fetchAccounts = async () => {
        try {
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) return

            const response = await fetch('/api/accounts', {
                headers: { 'Authorization': `Bearer ${session.access_token}` }
            })

            if (response.ok) {
                const { accounts } = await response.json()
                setAccounts(accounts)
                if (accounts.length > 0 && !selectedAccount) {
                    setSelectedAccount(accounts[0])
                }
            }
        } catch (error) {
            console.error('Error fetching accounts:', error)
        }
    }

    const fetchCategories = async () => {
        try {
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) return

            const response = await fetch('/api/categories', {
                headers: { 'Authorization': `Bearer ${session.access_token}` }
            })

            if (response.ok) {
                const { flat } = await response.json()
                setCategories(flat ?? [])
            }
        } catch (error) {
            console.error('Error fetching categories:', error)
        }
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

    return (
        <div className="min-h-screen bg-gray-50">
            <TopNav />

            <div className="flex">
                <Sidebar
                    accounts={accounts}
                    selectedAccount={selectedAccount}
                    onAccountSelect={handleAccountSelect}
                    onAccountAdded={fetchAccounts}
                />

                <div className="flex-1 p-6">
                    <div className="mb-6">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center space-x-4">
                                <Button variant="outline" size="sm" onClick={() => handleMonthChange('prev')}>
                                    ←
                                </Button>
                                <h2 className="text-2xl font-bold text-gray-900">
                                    {new Date(currentMonth.year, currentMonth.month - 1).toLocaleDateString('en-US', {
                                        month: 'long',
                                        year: 'numeric'
                                    })}
                                </h2>
                                <Button variant="outline" size="sm" onClick={() => handleMonthChange('next')}>
                                    →
                                </Button>
                            </div>

                            <div className="flex space-x-2">
                                <Button
                                    variant={currentView === 'budget' ? 'default' : 'outline'}
                                    onClick={() => setCurrentView('budget')}
                                >
                                    Budget
                                </Button>
                                <Button
                                    variant={currentView === 'transactions' ? 'default' : 'outline'}
                                    onClick={() => setCurrentView('transactions')}
                                >
                                    Transactions
                                </Button>
                                <Button
                                    variant={currentView === 'reports' ? 'default' : 'outline'}
                                    onClick={() => setCurrentView('reports')}
                                >
                                    Reports
                                </Button>
                            </div>
                        </div>
                    </div>

                    {currentView === 'budget' ? (
                        <BudgetView
                            month={currentMonth.month}
                            year={currentMonth.year}
                            categories={categories}
                            onCategoryAdded={fetchCategories}
                        />
                    ) : currentView === 'transactions' ? (
                        <TransactionsView
                            account={selectedAccount}
                            categories={categories}
                            onTransactionAdded={fetchAccounts}
                            currentMonth={currentMonth.month}
                            currentYear={currentMonth.year}
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
    )
}
