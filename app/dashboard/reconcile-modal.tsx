'use client'

import { useState, useEffect } from 'react'
import { supabase } from '../providers'
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
import type { Account } from '@/app/dashboard/dashboard'

interface UnclearedTransaction {
    id: string
    date: string
    payee_name: string | null
    memo: string | null
    amount: number
    cleared: 'uncleared' | 'cleared' | 'reconciled'
}

interface ReconcileModalProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    account: Account
    onReconciled: () => void
}

export function ReconcileModal({ open, onOpenChange, account, onReconciled }: ReconcileModalProps) {
    const [transactions, setTransactions] = useState<UnclearedTransaction[]>([])
    const [clearedBalance, setClearedBalance] = useState(0)
    const [bankBalance, setBankBalance] = useState('')
    const [loading, setLoading] = useState(true)
    const [finishing, setFinishing] = useState(false)

    useEffect(() => {
        if (!open) return
        fetchTransactions()
    }, [open])

    const fetchTransactions = async () => {
        setLoading(true)
        try {
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) return

            // Fetch all transactions for this account (both cleared/reconciled for balance, uncleared to show)
            const response = await fetch(`/api/transactions?account_id=${account.id}`, {
                headers: { 'Authorization': `Bearer ${session.access_token}` }
            })

            if (!response.ok) return
            const { transactions: all } = await response.json()

            const cleared = (all as UnclearedTransaction[])
                .filter(t => t.cleared === 'cleared' || t.cleared === 'reconciled')
                .reduce((sum, t) => sum + t.amount, 0)
            setClearedBalance(cleared)

            // Show only uncleared transactions for the user to check off
            setTransactions((all as UnclearedTransaction[]).filter(t => t.cleared === 'uncleared'))
        } catch (error) {
            console.error('Error fetching transactions:', error)
        } finally {
            setLoading(false)
        }
    }

    const handleToggleCleared = async (tx: UnclearedTransaction) => {
        const newCleared = tx.cleared === 'uncleared' ? 'cleared' : 'uncleared'
        try {
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) return
            const response = await fetch(`/api/transactions/${tx.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
                body: JSON.stringify({ cleared: newCleared })
            })
            if (response.ok) {
                const amountDelta = newCleared === 'cleared' ? tx.amount : -tx.amount
                setClearedBalance(prev => prev + amountDelta)
                setTransactions(prev => prev.map(t =>
                    t.id === tx.id ? { ...t, cleared: newCleared } : t
                ))
            }
        } catch (error) {
            console.error('Error toggling cleared:', error)
        }
    }

    const handleFinish = async (createAdjustment: boolean) => {
        setFinishing(true)
        try {
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) return

            const response = await fetch(`/api/accounts/${account.id}/reconcile`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
                body: JSON.stringify({ balance: parseFloat(bankBalance), create_adjustment: createAdjustment })
            })

            if (response.ok) {
                onReconciled()
                onOpenChange(false)
            } else {
                const err = await response.json()
                alert(`Error: ${err.error}`)
            }
        } catch (error) {
            console.error('Error finishing reconciliation:', error)
        } finally {
            setFinishing(false)
        }
    }

    const parsedBankBalance = parseFloat(bankBalance) || 0
    const difference = parsedBankBalance - clearedBalance
    const isBalanced = Math.abs(difference) < 0.005

    const formatDate = (dateString: string) => {
        const d = new Date(dateString + 'T00:00:00')
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[600px] max-h-[90vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>Reconcile — {account.name}</DialogTitle>
                    <DialogDescription>
                        Check off transactions that appear on your bank statement, then enter your statement ending balance.
                    </DialogDescription>
                </DialogHeader>

                <div className="grid grid-cols-3 gap-4 py-2 text-center border-b">
                    <div>
                        <div className="text-xs text-gray-500 mb-1">Cleared Balance</div>
                        <div className={`text-lg font-semibold ${clearedBalance < 0 ? 'text-red-700' : 'text-gray-900'}`}>
                            ${clearedBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                    </div>
                    <div>
                        <div className="text-xs text-gray-500 mb-1">Bank Balance</div>
                        <Input
                            type="number"
                            step="0.01"
                            placeholder="0.00"
                            value={bankBalance}
                            onChange={(e) => setBankBalance(e.target.value)}
                            className="text-center h-8"
                        />
                    </div>
                    <div>
                        <div className="text-xs text-gray-500 mb-1">Difference</div>
                        <div className={`text-lg font-semibold ${isBalanced ? 'text-green-600' : 'text-red-600'}`}>
                            ${Math.abs(difference).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            {!isBalanced && (difference > 0 ? ' over' : ' under')}
                        </div>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto min-h-0">
                    {loading ? (
                        <div className="flex items-center justify-center py-8">
                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                        </div>
                    ) : transactions.length === 0 ? (
                        <div className="text-center py-8 text-gray-500 text-sm">
                            No uncleared transactions.
                        </div>
                    ) : (
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-gray-200">
                                    <th className="text-left py-2 px-3 font-medium text-gray-600 w-8">✓</th>
                                    <th className="text-left py-2 px-3 font-medium text-gray-600">Date</th>
                                    <th className="text-left py-2 px-3 font-medium text-gray-600">Payee / Memo</th>
                                    <th className="text-right py-2 px-3 font-medium text-gray-600">Amount</th>
                                </tr>
                            </thead>
                            <tbody>
                                {transactions.map((tx) => (
                                    <tr
                                        key={tx.id}
                                        className={`border-b border-gray-100 cursor-pointer hover:bg-gray-50 ${tx.cleared === 'cleared' ? 'bg-green-50' : ''}`}
                                        onClick={() => handleToggleCleared(tx)}
                                    >
                                        <td className="py-2 px-3 text-center text-green-600 font-bold">
                                            {tx.cleared === 'cleared' ? '✓' : ''}
                                        </td>
                                        <td className="py-2 px-3 text-gray-700">{formatDate(tx.date)}</td>
                                        <td className="py-2 px-3 text-gray-700">
                                            {tx.payee_name || tx.memo || <span className="text-gray-400 italic">—</span>}
                                        </td>
                                        <td className={`py-2 px-3 text-right font-medium ${tx.amount >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                                            {tx.amount >= 0 ? '+' : '-'}${Math.abs(tx.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>

                <DialogFooter className="flex items-center gap-2 pt-2 border-t">
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={finishing}>
                        Cancel
                    </Button>
                    {!isBalanced && bankBalance ? (
                        <Button
                            onClick={() => handleFinish(true)}
                            disabled={finishing}
                            className="bg-amber-600 hover:bg-amber-700"
                        >
                            {finishing ? 'Finishing...' : `Finish with $${Math.abs(difference).toFixed(2)} Adjustment`}
                        </Button>
                    ) : (
                        <Button
                            onClick={() => handleFinish(false)}
                            disabled={!isBalanced || !bankBalance || finishing}
                        >
                            {finishing ? 'Finishing...' : 'Finish Reconciling'}
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
