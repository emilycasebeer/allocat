'use client'

import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../providers'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
    Dialog,
    DialogContent,
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
    initialClearedBalance: number
}

const fmtMoney = (n: number) => {
    const abs = `$${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    return n < 0 ? `-${abs}` : abs
}

const formatDate = (dateString: string) => {
    const d = new Date(dateString + 'T00:00:00')
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function ReconcileModal({ open, onOpenChange, account, onReconciled, initialClearedBalance }: ReconcileModalProps) {
    const { accessToken } = useAuth()
    const accessTokenRef = useRef<string | null>(null)
    accessTokenRef.current = accessToken

    // step 1 = balance confirmation, 2 = enter actual balance, 3 = transaction review
    const [step, setStep] = useState<1 | 2 | 3>(1)
    const [bankBalanceInput, setBankBalanceInput] = useState('')
    // The confirmed statement balance (set when advancing to step 3)
    const [bankBalance, setBankBalance] = useState(0)
    // Whether the user arrived at step 3 via "Yes" (already balanced)
    const [fromYes, setFromYes] = useState(false)

    const [transactions, setTransactions] = useState<UnclearedTransaction[]>([])
    const [liveClearedBalance, setLiveClearedBalance] = useState(initialClearedBalance)
    const [loading, setLoading] = useState(false)
    const [finishing, setFinishing] = useState(false)

    // Reset all state whenever the modal opens
    useEffect(() => {
        if (open) {
            setStep(1)
            setBankBalanceInput('')
            setBankBalance(0)
            setFromYes(false)
            setTransactions([])
            setLiveClearedBalance(initialClearedBalance)
            setLoading(false)
            setFinishing(false)
        }
    }, [open, initialClearedBalance])

    // Fetch all transactions, compute fresh cleared balance, extract uncleared list
    const fetchStep3Data = async () => {
        setLoading(true)
        try {
            const token = accessTokenRef.current
            if (!token) return
            const response = await fetch(`/api/transactions?account_id=${account.id}`, {
                headers: { 'Authorization': `Bearer ${token}` },
            })
            if (!response.ok) return
            const { transactions: all } = await response.json()
            const cleared = (all as UnclearedTransaction[])
                .filter(t => t.cleared === 'cleared' || t.cleared === 'reconciled')
                .reduce((sum, t) => sum + t.amount, 0)
            setLiveClearedBalance(cleared)
            setTransactions((all as UnclearedTransaction[]).filter(t => t.cleared === 'uncleared'))
        } catch (error) {
            console.error('Error fetching transactions:', error)
        } finally {
            setLoading(false)
        }
    }

    const handleYes = () => {
        setBankBalance(initialClearedBalance)
        setFromYes(true)
        setStep(3)
        fetchStep3Data()
    }

    const handleNo = () => setStep(2)

    const handleNext = () => {
        const parsed = parseFloat(bankBalanceInput)
        if (isNaN(parsed)) return
        setBankBalance(parsed)
        setStep(3)
        fetchStep3Data()
    }

    const handleBackFromStep3 = () => {
        if (fromYes) {
            setStep(1)
        } else {
            setStep(2)
        }
    }

    const handleToggleCleared = async (tx: UnclearedTransaction) => {
        const newCleared = tx.cleared === 'uncleared' ? 'cleared' : 'uncleared'
        try {
            const token = accessTokenRef.current
            if (!token) return
            const response = await fetch(`/api/transactions/${tx.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ cleared: newCleared }),
            })
            if (response.ok) {
                const delta = newCleared === 'cleared' ? tx.amount : -tx.amount
                setLiveClearedBalance(prev => prev + delta)
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
            const token = accessTokenRef.current
            if (!token) return
            const response = await fetch(`/api/accounts/${account.id}/reconcile`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ balance: bankBalance, create_adjustment: createAdjustment }),
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

    const parsedBankBalanceInput = parseFloat(bankBalanceInput)
    const step2Difference = !isNaN(parsedBankBalanceInput) ? parsedBankBalanceInput - initialClearedBalance : null
    const difference = bankBalance - liveClearedBalance
    const isBalanced = Math.abs(difference) < 0.005

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[640px] max-h-[90vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>Reconcile — {account.name}</DialogTitle>
                </DialogHeader>

                {/* ── Step 1: Balance Confirmation ───────────────────────── */}
                {step === 1 && (
                    <div className="flex-1 flex flex-col items-center justify-center gap-6 py-10">
                        <p className="text-sm text-muted-foreground">Is your current cleared balance</p>
                        <div className={`font-display text-4xl font-bold tabular-nums ${initialClearedBalance < 0 ? 'text-destructive' : 'text-foreground'}`}>
                            {fmtMoney(initialClearedBalance)}
                        </div>
                        <div className="flex flex-col gap-3 w-full max-w-xs pt-2">
                            <Button onClick={handleYes} className="w-full">
                                Yes
                            </Button>
                            <Button variant="outline" onClick={handleNo} className="w-full">
                                No
                            </Button>
                        </div>
                    </div>
                )}

                {/* ── Step 2: Enter Actual Balance ────────────────────────── */}
                {step === 2 && (
                    <div className="flex-1 flex flex-col gap-5 py-2">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-foreground">Statement Ending Balance</label>
                            <Input
                                type="number"
                                step="0.01"
                                placeholder="0.00"
                                value={bankBalanceInput}
                                onChange={(e) => setBankBalanceInput(e.target.value)}
                                autoFocus
                                className="text-center text-lg h-11"
                            />
                        </div>

                        {step2Difference !== null && (
                            <div className="text-center py-2">
                                <p className="text-xs text-muted-foreground mb-1">Difference</p>
                                <p className={`font-display text-2xl font-bold tabular-nums ${Math.abs(step2Difference) < 0.005 ? 'text-primary' : 'text-destructive'}`}>
                                    {fmtMoney(step2Difference)}
                                </p>
                            </div>
                        )}

                        <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground space-y-2">
                            <p>The balance recorded in allocat doesn't match the balance at your financial institution.</p>
                            <p>
                                <span className="font-medium text-foreground">To correct this</span>, compare each uncleared
                                transaction against your account to make sure they match. allocat will keep track of the
                                current difference at the top of your register.
                            </p>
                            <p>If you can't find the difference, that's okay! We'll make an adjustment transaction and you can move on.</p>
                        </div>

                        <DialogFooter className="pt-2 border-t mt-auto">
                            <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
                            <Button
                                onClick={handleNext}
                                disabled={!bankBalanceInput || isNaN(parseFloat(bankBalanceInput))}
                            >
                                Next
                            </Button>
                        </DialogFooter>
                    </div>
                )}

                {/* ── Step 3: Transaction Review ───────────────────────────── */}
                {step === 3 && (
                    <>
                        {/* Balance summary row */}
                        <div className="grid grid-cols-3 gap-4 py-3 text-center border-b">
                            <div>
                                <div className="text-xs text-muted-foreground mb-1">Cleared Balance</div>
                                <div className={`text-lg font-semibold tabular-nums ${liveClearedBalance < 0 ? 'text-destructive' : 'text-foreground'}`}>
                                    {fmtMoney(liveClearedBalance)}
                                </div>
                            </div>
                            <div>
                                <div className="text-xs text-muted-foreground mb-1">Statement Balance</div>
                                <div className="text-lg font-semibold tabular-nums">
                                    {fmtMoney(bankBalance)}
                                </div>
                            </div>
                            <div>
                                <div className="text-xs text-muted-foreground mb-1">Difference</div>
                                <div className={`text-lg font-semibold tabular-nums ${isBalanced ? 'text-primary' : 'text-destructive'}`}>
                                    {fmtMoney(difference)}
                                </div>
                            </div>
                        </div>

                        {/* Uncleared transaction list */}
                        <div className="flex-1 overflow-y-auto min-h-0">
                            {loading ? (
                                <div className="flex items-center justify-center py-10">
                                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
                                </div>
                            ) : transactions.length === 0 ? (
                                <div className="text-center py-10 text-muted-foreground text-sm">
                                    No uncleared transactions.
                                </div>
                            ) : (
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b" style={{ borderColor: 'hsl(var(--border))' }}>
                                            <th className="text-left py-2 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground w-8">✓</th>
                                            <th className="text-left py-2 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Date</th>
                                            <th className="text-left py-2 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Payee / Memo</th>
                                            <th className="text-right py-2 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Amount</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {transactions.map((tx) => (
                                            <tr
                                                key={tx.id}
                                                className={`border-b cursor-pointer transition-colors ${
                                                    tx.cleared === 'cleared'
                                                        ? 'bg-primary/5 hover:bg-primary/10'
                                                        : 'hover:bg-muted/40'
                                                }`}
                                                style={{ borderColor: 'hsl(var(--border) / 0.5)' }}
                                                onClick={() => handleToggleCleared(tx)}
                                            >
                                                <td className="py-2 px-3 text-center">
                                                    {tx.cleared === 'cleared' && (
                                                        <span className="text-primary font-bold text-base">✓</span>
                                                    )}
                                                </td>
                                                <td className="py-2 px-3 text-muted-foreground whitespace-nowrap">
                                                    {formatDate(tx.date)}
                                                </td>
                                                <td className="py-2 px-3 text-foreground/80">
                                                    {tx.payee_name || tx.memo || (
                                                        <span className="text-muted-foreground/40 italic">—</span>
                                                    )}
                                                </td>
                                                <td className={`py-2 px-3 text-right font-semibold tabular-nums ${tx.amount >= 0 ? 'text-primary/90' : 'text-destructive/90'}`}>
                                                    {tx.amount >= 0 ? '+' : '-'}${Math.abs(tx.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>

                        <DialogFooter className="flex items-center gap-2 pt-2 border-t">
                            <Button variant="outline" onClick={handleBackFromStep3} disabled={finishing}>
                                Back
                            </Button>
                            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={finishing}>
                                Cancel
                            </Button>
                            {isBalanced ? (
                                <Button onClick={() => handleFinish(false)} disabled={finishing}>
                                    {finishing ? 'Finishing…' : 'Finish Reconciling'}
                                </Button>
                            ) : (
                                <Button
                                    onClick={() => handleFinish(true)}
                                    disabled={finishing}
                                    className="bg-amber-600 hover:bg-amber-700 text-white"
                                >
                                    {finishing ? 'Finishing…' : 'Create Adjustment & Finish'}
                                </Button>
                            )}
                        </DialogFooter>
                    </>
                )}
            </DialogContent>
        </Dialog>
    )
}
