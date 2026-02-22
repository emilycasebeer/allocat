'use client'

import { useState } from 'react'
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
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import type { Account, Category } from '@/app/dashboard/dashboard'

interface AddTransactionModalProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    account: Account
    categories: Category[]
    onTransactionAdded: () => void
    currentMonth?: number
    currentYear?: number
}

export function AddTransactionModal({
    open,
    onOpenChange,
    account,
    categories,
    onTransactionAdded,
}: AddTransactionModalProps) {
    const [memo, setMemo] = useState('')
    const [amount, setAmount] = useState('')
    const [date, setDate] = useState(new Date().toISOString().split('T')[0])
    const [categoryId, setCategoryId] = useState<string>('')
    const [type, setType] = useState<'income' | 'expense' | 'transfer'>('expense')
    const [loading, setLoading] = useState(false)

    // Only show non-system categories in the picker
    const selectableCategories = categories.filter((c) => !c.is_system)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!amount || !date) return

        setLoading(true)
        try {
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) return

            let transactionAmount = parseFloat(amount)
            if (type === 'expense') {
                transactionAmount = -Math.abs(transactionAmount)
            } else if (type === 'income') {
                transactionAmount = Math.abs(transactionAmount)
            }

            const response = await fetch('/api/transactions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`
                },
                body: JSON.stringify({
                    account_id: account.id,
                    category_id: categoryId || null,
                    amount: transactionAmount,
                    date,
                    memo: memo || null,
                    type,
                })
            })

            if (response.ok) {
                setMemo('')
                setAmount('')
                setDate(new Date().toISOString().split('T')[0])
                setCategoryId('')
                setType('expense')
                onTransactionAdded()
                onOpenChange(false)
            } else {
                const error = await response.json()
                alert(`Error: ${error.error}`)
            }
        } catch (error) {
            console.error('Error creating transaction:', error)
            alert('Error creating transaction')
        } finally {
            setLoading(false)
        }
    }

    const handleTypeChange = (newType: 'income' | 'expense' | 'transfer') => {
        setType(newType)
        if (newType === 'transfer') setCategoryId('')
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>Add New Transaction</DialogTitle>
                    <DialogDescription>
                        Record a new transaction for {account.name}.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="type">Transaction Type</Label>
                            <Select value={type} onValueChange={handleTypeChange} required>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select type" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="expense">Expense</SelectItem>
                                    <SelectItem value="income">Income</SelectItem>
                                    <SelectItem value="transfer">Transfer</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="amount">Amount</Label>
                            <Input
                                id="amount"
                                type="number"
                                step="0.01"
                                placeholder="0.00"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                required
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="memo">Memo</Label>
                        <Input
                            id="memo"
                            placeholder="e.g., Grocery shopping, Salary"
                            value={memo}
                            onChange={(e) => setMemo(e.target.value)}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="date">Date</Label>
                            <Input
                                id="date"
                                type="date"
                                value={date}
                                onChange={(e) => setDate(e.target.value)}
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="category">Category</Label>
                            {type !== 'transfer' ? (
                                <Select value={categoryId} onValueChange={setCategoryId}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select a category" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {selectableCategories.map((category) => (
                                            <SelectItem key={category.id} value={category.id}>
                                                {category.group_name} — {category.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            ) : (
                                <div className="text-sm text-gray-500 py-2 px-3 bg-gray-50 rounded-md">
                                    Transfers don't use categories
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="text-xs space-y-1">
                        {type === 'income' && (
                            <p className="text-green-700">↑ Income increases your To Be Budgeted amount</p>
                        )}
                        {type === 'expense' && (
                            <p className="text-red-700">↓ Expenses reduce your category Available amounts</p>
                        )}
                        {type === 'transfer' && (
                            <p className="text-blue-700">↔ Transfers move money between accounts</p>
                        )}
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={loading}>
                            {loading ? 'Creating...' : 'Create Transaction'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
