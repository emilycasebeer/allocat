'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Plus, Wallet, CreditCard, PiggyBank, TrendingUp, Coins } from 'lucide-react'
import { AddAccountModal } from '@/app/dashboard/add-account-modal'
import type { Account } from '@/app/dashboard/dashboard'
import Decimal from 'decimal.js'

interface SidebarProps {
    accounts: Account[]
    selectedAccount: Account | null
    onAccountSelect: (account: Account) => void
    onAccountAdded: () => void
}

const getAccountIcon = (typeName: string) => {
    const t = typeName.toLowerCase()
    if (t.includes('checking')) return <Wallet className="h-4 w-4" />
    if (t.includes('savings')) return <PiggyBank className="h-4 w-4" />
    if (t.includes('credit') || t.includes('line of credit')) return <CreditCard className="h-4 w-4" />
    if (t.includes('investment')) return <TrendingUp className="h-4 w-4" />
    if (t.includes('cash')) return <Coins className="h-4 w-4" />
    return <Wallet className="h-4 w-4" />
}

const getAccountTypeColor = (typeName: string) => {
    const t = typeName.toLowerCase()
    if (t.includes('checking')) return 'text-blue-600'
    if (t.includes('savings')) return 'text-green-600'
    if (t.includes('credit') || t.includes('line of credit')) return 'text-red-600'
    if (t.includes('investment')) return 'text-purple-600'
    if (t.includes('cash')) return 'text-yellow-600'
    return 'text-gray-600'
}

export function Sidebar({ accounts, selectedAccount, onAccountSelect, onAccountAdded }: SidebarProps) {
    const [showAddAccount, setShowAddAccount] = useState(false)

    // Net worth: sum assets, subtract liabilities
    const totalBalance = accounts.reduce((sum, account) => {
        return account.is_liability
            ? new Decimal(sum).minus(Math.abs(account.balance)).toNumber()
            : new Decimal(sum).plus(account.balance).toNumber()
    }, 0)

    return (
        <div className="w-80 bg-white border-r border-gray-200 p-6">
            <div className="mb-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-2">Accounts</h2>
                <Button onClick={() => setShowAddAccount(true)} size="sm" className="w-full">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Account
                </Button>
            </div>

            <div className="space-y-2">
                {accounts.map((account) => (
                    <div
                        key={account.id}
                        className={`sidebar-account ${selectedAccount?.id === account.id ? 'active' : ''}`}
                        onClick={() => onAccountSelect(account)}
                    >
                        <div className="flex items-center space-x-3">
                            <div className={getAccountTypeColor(account.type_name)}>
                                {getAccountIcon(account.type_name)}
                            </div>
                            <div>
                                <div className="font-medium text-gray-900">{account.name}</div>
                                <div className="text-sm text-gray-500">{account.type_name}</div>
                            </div>
                        </div>
                        <div className={`font-semibold ${account.is_liability ? 'text-red-600' : 'text-green-600'}`}>
                            {account.is_liability ? '-' : ''}${Math.abs(account.balance).toLocaleString()}
                        </div>
                    </div>
                ))}
            </div>

            {accounts.length > 0 && (
                <div className="mt-6 pt-6 border-t border-gray-200">
                    <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-700">Total Balance</span>
                        <span className={`text-lg font-bold ${totalBalance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            ${totalBalance.toLocaleString()}
                        </span>
                    </div>
                </div>
            )}

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
