'use client'

import { useState, useEffect } from 'react'
import { Plus, LayoutList, BarChart3, Landmark, ChevronDown, ChevronRight, CalendarClock, Users, LogOut, User } from 'lucide-react'
import { AddAccountModal } from '@/app/dashboard/add-account-modal'
import { SettingsModal } from '@/app/dashboard/settings-modal'
import type { Account } from '@/app/dashboard/dashboard'
import Decimal from 'decimal.js'
import { useAuth, supabase } from '../providers'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

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
    //const value = account.is_liability ? -Math.abs(account.balance) : account.balance
    const value = account.balance
    const isNeg = value < 0
    return (
        <span
            className="text-xs financial-figure font-medium flex-shrink-0"
            style={{ color: isNeg ? 'hsl(350 80% 65%)' : undefined }}
        >
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
                className="w-full flex items-center justify-between px-2 py-1.5 rounded-md hover:bg-muted/30 transition-colors"
                onClick={() => setCollapsed(c => !c)}
            >
                <div className="flex items-center gap-1.5">
                    {collapsed
                        ? <ChevronRight className="h-3 w-3 text-muted-foreground/40 flex-shrink-0" />
                        : <ChevronDown className="h-3 w-3 text-muted-foreground/40 flex-shrink-0" />
                    }
                    <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/50">
                        {label}
                    </span>
                </div>
                <span className={`text-xs financial-figure font-medium ${total < 0 ? 'text-destructive/70' : 'text-muted-foreground/70'}`}>
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
                                className={`w-full flex items-center justify-between gap-2 pl-6 pr-2 py-1.5 rounded-md transition-colors ${isActive
                                        ? 'bg-primary/15 text-primary'
                                        : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                                    }`}
                                onClick={() => onAccountSelect(account)}
                            >
                                <span className="text-sm truncate text-left">{account.name}</span>
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
    const [showSettings, setShowSettings] = useState(false)
    const { user, signOut } = useAuth()
    const [displayName, setDisplayName] = useState<string | null>(null)

    useEffect(() => {
        if (!user) return
        supabase
            .from('profiles')
            .select('display_name')
            .eq('id', user.id)
            .single()
            .then(({ data }) => setDisplayName(data?.display_name ?? null))
    }, [user?.id])

    const { cash, credit, tracking, closed } = groupAccounts(accounts)

    const topNav = [
        { id: 'budget', label: 'Budget', Icon: LayoutList },
        { id: 'reports', label: 'Reports', Icon: BarChart3 },
        { id: 'scheduled', label: 'Scheduled', Icon: CalendarClock },
    ] as const

    const isAllAccounts = currentView === 'transactions' && selectedAccount === null

    const getUserInitials = (email: string) => email.substring(0, 2).toUpperCase()

    return (
        <div className="w-60 bg-card border-r border-border flex flex-col h-screen sticky top-0 flex-shrink-0">
            {/* Brand */}
            <div className="flex items-center gap-2.5 px-4 py-4 border-b border-border">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 border border-primary/25">
                    <span className="text-sm leading-none">🐱</span>
                </div>
                <span className="font-display text-lg font-bold tracking-tight text-foreground">
                    allo<span className="text-primary">cat</span>
                </span>
            </div>

            <div className="flex-1 overflow-y-auto px-2 py-3">
                {/* Top navigation */}
                <div className="space-y-px mb-3">
                    {topNav.map(({ id, label, Icon }) => (
                        <button
                            key={id}
                            onClick={() => onViewChange(id)}
                            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all ${currentView === id
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
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all ${isAllAccounts
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

                {/* Add Account */}
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

            {/* User menu — bottom of sidebar */}
            <div className="border-t border-border p-2">
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <button className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted/40 hover:text-foreground transition-all">
                            <Avatar className="h-6 w-6 flex-shrink-0">
                                <AvatarFallback className="bg-primary/15 text-primary text-[10px] font-semibold font-display">
                                    {displayName ? displayName.substring(0, 2).toUpperCase() : user?.email ? getUserInitials(user.email) : 'U'}
                                </AvatarFallback>
                            </Avatar>
                            <span className="truncate">{displayName ?? user?.email ?? 'Account'}</span>
                        </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-56" align="end" side="top" forceMount>
                        <DropdownMenuLabel className="font-normal">
                            <div className="flex flex-col space-y-1">
                                <p className="text-sm font-medium leading-none truncate">
                                    {user?.email || 'User'}
                                </p>
                                <p className="text-xs leading-none text-muted-foreground">
                                    Budget Manager
                                </p>
                            </div>
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                            className="focus:bg-primary focus:text-primary-foreground"
                            onClick={() => setShowSettings(true)}
                        >
                            <User className="mr-2 h-4 w-4" />
                            <span>Settings</span>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                            onClick={signOut}
                            className="text-destructive focus:text-destructive focus:bg-destructive/10"
                        >
                            <LogOut className="mr-2 h-4 w-4" />
                            <span>Log out</span>
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>

            <AddAccountModal
                open={showAddAccount}
                onOpenChange={setShowAddAccount}
                onAccountAdded={() => {
                    setShowAddAccount(false)
                    onAccountAdded()
                }}
            />

            <SettingsModal
                open={showSettings}
                onOpenChange={setShowSettings}
                onNameChange={(name) => setDisplayName(name || null)}
            />
        </div>
    )
}
