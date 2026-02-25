'use client'

import { useState } from 'react'
import { Plus, LayoutList, BarChart3, Landmark, ChevronDown, ChevronRight, CalendarClock, Users } from 'lucide-react'
import { AddAccountModal } from '@/app/dashboard/add-account-modal'
import type { Account } from '@/app/dashboard/dashboard'
import Decimal from 'decimal.js'

interface SidebarProps {
    accounts: Account[]
    selectedAccount: Account | null
    onAccountSelect: (account: Account) => void
    onAccountAdded: () => void
    currentView: string
    onViewChange: (view: string) => void
    onManagePayees: () => void
}

function groupAccounts(accounts: Account[]) {
    const open = accounts.filter(a => !a.is_closed)
    const closed = accounts.filter(a => a.is_closed)
    const cash = open.filter(a => a.is_budget_account && !a.is_liability)
    const credit = open.filter(a => a.is_budget_account && a.is_liability)
    const tracking = open.filter(a => !a.is_budget_account)
    return { cash, credit, tracking, closed }
}

function sumGroup(accounts: Account[]) {
    return accounts.reduce((sum, a) => {
        return a.is_liability
            ? new Decimal(sum).minus(Math.abs(a.balance)).toNumber()
            : new Decimal(sum).plus(a.balance).toNumber()
    }, 0)
}

function fmt(amount: number) {
    const abs = Math.abs(amount).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })
    return amount < 0 ? `-$${abs}` : `$${abs}`
}

function AccountBalance({ account }: { account: Account }) {
    const value = account.is_liability ? -Math.abs(account.balance) : account.balance
    const isNeg = value < 0
    if (isNeg) {
        return (
            <span
                className="text-[11px] financial-figure font-medium px-2 py-0.5 rounded-full flex-shrink-0"
                style={{ background: 'hsl(350 80% 60% / 0.12)', color: 'hsl(350 80% 65%)' }}
            >
                {fmt(value)}
            </span>
        )
    }
    return (
        <span className="text-[11px] financial-figure text-muted-foreground/70 flex-shrink-0">
            {fmt(value)}
        </span>
    )
}

function AccountGroup({
    label,
    accounts,
    selectedAccount,
    onAccountSelect,
    defaultCollapsed = false,
}: {
    label: string
    accounts: Account[]
    selectedAccount: Account | null
    onAccountSelect: (a: Account) => void
    defaultCollapsed?: boolean
}) {
    const [collapsed, setCollapsed] = useState(defaultCollapsed)
    if (accounts.length === 0) return null

    const total = sumGroup(accounts)

    return (
        <div>
            <button
                className="w-full flex items-center justify-between px-2 py-1 rounded-md hover:bg-muted/30 transition-colors"
                onClick={() => setCollapsed(c => !c)}
            >
                <div className="flex items-center gap-1">
                    {collapsed
                        ? <ChevronRight className="h-3 w-3 text-muted-foreground/40 flex-shrink-0" />
                        : <ChevronDown className="h-3 w-3 text-muted-foreground/40 flex-shrink-0" />
                    }
                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">
                        {label}
                    </span>
                </div>
                <span className={`text-[11px] financial-figure font-medium ${total < 0 ? 'text-destructive/70' : 'text-muted-foreground/60'}`}>
                    {fmt(total)}
                </span>
            </button>

            {!collapsed && (
                <div className="mt-0.5 space-y-px">
                    {accounts.map(account => {
                        const isActive = selectedAccount?.id === account.id
                        return (
                            <button
                                key={account.id}
                                className={`w-full flex items-center justify-between gap-2 pl-5 pr-2 py-1.5 rounded-md transition-colors ${
                                    isActive
                                        ? 'bg-primary/12 text-foreground'
                                        : 'text-foreground/75 hover:bg-muted/40 hover:text-foreground'
                                }`}
                                onClick={() => onAccountSelect(account)}
                            >
                                <div className="flex items-center gap-2 min-w-0">
                                    <div className={`h-1.5 w-1.5 rounded-full flex-shrink-0 transition-colors ${
                                        isActive ? 'bg-primary' : 'bg-transparent'
                                    }`} />
                                    <span className="text-sm truncate text-left">{account.name}</span>
                                </div>
                                <AccountBalance account={account} />
                            </button>
                        )
                    })}
                </div>
            )}
        </div>
    )
}

export function Sidebar({ accounts, selectedAccount, onAccountSelect, onAccountAdded, currentView, onViewChange, onManagePayees }: SidebarProps) {
    const [showAddAccount, setShowAddAccount] = useState(false)

    const { cash, credit, tracking, closed } = groupAccounts(accounts)

    const topNav = [
        { id: 'budget',    label: 'Budget',     Icon: LayoutList   },
        { id: 'reports',   label: 'Reports',    Icon: BarChart3    },
        { id: 'scheduled', label: 'Scheduled',  Icon: CalendarClock },
    ] as const

    const isAllAccounts = currentView === 'transactions'

    return (
        <div
            className="w-60 bg-card border-r border-border flex flex-col flex-shrink-0"
            style={{ minHeight: 'calc(100vh - 57px)' }}
        >
            <div className="flex-1 overflow-y-auto px-2 py-3">
                {/* Top navigation */}
                <div className="space-y-px mb-3">
                    {topNav.map(({ id, label, Icon }) => (
                        <button
                            key={id}
                            onClick={() => onViewChange(id)}
                            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                                currentView === id
                                    ? 'bg-primary/15 text-primary'
                                    : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                            }`}
                        >
                            <Icon className="h-4 w-4 flex-shrink-0" />
                            {label}
                        </button>
                    ))}
                    <button
                        onClick={() => onViewChange('transactions')}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                            isAllAccounts
                                ? 'bg-primary/15 text-primary'
                                : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                        }`}
                    >
                        <Landmark className="h-4 w-4 flex-shrink-0" />
                        All Accounts
                    </button>
                    <button
                        onClick={onManagePayees}
                        className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                    >
                        <Users className="h-4 w-4 flex-shrink-0" />
                        Edit Payees
                    </button>
                </div>

                <div className="h-px bg-border/40 mb-3" />

                {/* Account groups */}
                {accounts.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center mt-8 px-2">
                        No accounts yet.
                    </p>
                ) : (
                    <div className="space-y-1">
                        <AccountGroup label="Cash" accounts={cash} selectedAccount={selectedAccount} onAccountSelect={onAccountSelect} />
                        <AccountGroup label="Credit Cards" accounts={credit} selectedAccount={selectedAccount} onAccountSelect={onAccountSelect} />
                        <AccountGroup label="Tracking" accounts={tracking} selectedAccount={selectedAccount} onAccountSelect={onAccountSelect} />
                        <AccountGroup label="Closed" accounts={closed} selectedAccount={selectedAccount} onAccountSelect={onAccountSelect} defaultCollapsed />
                    </div>
                )}

                {/* Add Account — sits just below the last account */}
                <div className="mt-3 px-1">
                    <button
                        onClick={() => setShowAddAccount(true)}
                        className="w-full flex items-center justify-center gap-2 h-9 rounded-lg bg-primary/90 hover:bg-primary text-primary-foreground text-sm font-semibold transition-colors"
                    >
                        <Plus className="h-4 w-4" />
                        Add Account
                    </button>
                </div>
            </div>

            <AddAccountModal
                open={showAddAccount}
                onOpenChange={setShowAddAccount}
                onAccountAdded={() => {
                    setShowAddAccount(false)
                    onAccountAdded()
                }}
            />
        </div>
    )
}
