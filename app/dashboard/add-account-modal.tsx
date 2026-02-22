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

// Must match the seeded account_types names exactly
const ACCOUNT_TYPE_OPTIONS = [
    'Checking',
    'Savings',
    'Cash',
    'Credit Card',
    'Line of Credit',
    'Mortgage',
    'Auto Loan',
    'Student Loan',
    'Investment',
    'Other Asset',
    'Other Liability',
]

interface AddAccountModalProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    onAccountAdded: () => void
}

export function AddAccountModal({ open, onOpenChange, onAccountAdded }: AddAccountModalProps) {
    const [name, setName] = useState('')
    const [typeName, setTypeName] = useState<string>('')
    const [startingBalance, setStartingBalance] = useState('')
    const [loading, setLoading] = useState(false)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!name || !typeName) return

        setLoading(true)
        try {
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) return

            const response = await fetch('/api/accounts', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`
                },
                body: JSON.stringify({
                    name,
                    type_name: typeName,
                    starting_balance: startingBalance !== '' ? parseFloat(startingBalance) : 0
                })
            })

            if (response.ok) {
                setName('')
                setTypeName('')
                setStartingBalance('')
                onAccountAdded()
                onOpenChange(false)
            } else {
                const error = await response.json()
                alert(`Error: ${error.error}`)
            }
        } catch (error) {
            console.error('Error creating account:', error)
            alert('Error creating account')
        } finally {
            setLoading(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Add New Account</DialogTitle>
                    <DialogDescription>
                        Create a new account to track your finances.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="name">Account Name</Label>
                        <Input
                            id="name"
                            placeholder="e.g., Main Checking, Savings, Chase Visa"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            required
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="type">Account Type</Label>
                        <Select value={typeName} onValueChange={setTypeName} required>
                            <SelectTrigger>
                                <SelectValue placeholder="Select account type" />
                            </SelectTrigger>
                            <SelectContent>
                                {ACCOUNT_TYPE_OPTIONS.map((t) => (
                                    <SelectItem key={t} value={t}>{t}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="balance">Starting Balance</Label>
                        <Input
                            id="balance"
                            type="number"
                            step="0.01"
                            placeholder="0.00"
                            value={startingBalance}
                            onChange={(e) => setStartingBalance(e.target.value)}
                        />
                    </div>
                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                            disabled={loading}
                        >
                            Cancel
                        </Button>
                        <Button type="submit" disabled={loading}>
                            {loading ? 'Creating...' : 'Create Account'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
