'use client'

import { useState, useRef } from 'react'
import { useAuth } from '../providers'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { CheckCircle, Plus, Trash2, ArrowRight } from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────────────────────

interface AddedAccount {
    id: string
    name: string
    type_name: string
    balance: number
}

interface CategoryRow {
    key: string          // stable local key
    group: string
    name: string
    checked: boolean
}

// ── Constants ─────────────────────────────────────────────────────────────────

const ACCOUNT_TYPES = [
    'Checking',
    'Savings',
    'Cash',
    'Credit Card',
    'Line of Credit',
    'Mortgage',
    'Auto Loan',
    'Student Loan',
    'Medical Debt',
    'Investment',
]

const DEFAULT_CATEGORIES: Array<{ group: string; name: string }> = [
    { group: 'Housing', name: 'Rent / Mortgage' },
    { group: 'Housing', name: 'Electricity' },
    { group: 'Housing', name: 'Internet' },
    { group: 'Housing', name: 'Renters Insurance' },
    { group: 'Transportation', name: 'Gas' },
    { group: 'Transportation', name: 'Car Insurance' },
    { group: 'Transportation', name: 'Parking & Tolls' },
    { group: 'Transportation', name: 'Public Transit' },
    { group: 'Food', name: 'Groceries' },
    { group: 'Food', name: 'Restaurants' },
    { group: 'Personal', name: 'Medical' },
    { group: 'Personal', name: 'Personal Care' },
    { group: 'Personal', name: 'Clothing' },
    { group: 'Fun', name: 'Entertainment' },
    { group: 'Fun', name: 'Hobbies' },
    { group: 'Fun', name: 'Subscriptions' },
    { group: 'Financial', name: 'Emergency Fund' },
    { group: 'Financial', name: 'Savings' },
    { group: 'Giving', name: 'Charity' },
]

// ── Step indicator ─────────────────────────────────────────────────────────────

function StepDots({ current, total }: { current: number; total: number }) {
    return (
        <div className="flex items-center gap-2">
            {Array.from({ length: total }).map((_, i) => (
                <div
                    key={i}
                    className={`h-2 rounded-full transition-all ${i === current
                        ? 'w-6 bg-primary'
                        : i < current
                            ? 'w-2 bg-primary/70'
                            : 'w-2 bg-muted'
                        }`}
                />
            ))}
        </div>
    )
}

// ── Main wizard ────────────────────────────────────────────────────────────────

interface SetupWizardProps {
    onComplete: () => void
    onSkip: () => void
}

export function SetupWizard({ onComplete, onSkip }: SetupWizardProps) {
    const { accessToken } = useAuth()
    const accessTokenRef = useRef<string | null>(null)
    accessTokenRef.current = accessToken

    const [step, setStep] = useState(0)
    const [addedAccounts, setAddedAccounts] = useState<AddedAccount[]>([])
    const [createdCategoryCount, setCreatedCategoryCount] = useState(0)

    // Step 1 form state
    const [accountName, setAccountName] = useState('')
    const [accountType, setAccountType] = useState('')
    const [startingBalance, setStartingBalance] = useState('')
    const [accountError, setAccountError] = useState('')
    const [addingAccount, setAddingAccount] = useState(false)

    // Step 2 category state
    const [categories, setCategories] = useState<CategoryRow[]>(() =>
        DEFAULT_CATEGORIES.map((c, i) => ({
            key: `default-${i}`,
            group: c.group,
            name: c.name,
            checked: true,
        }))
    )
    const [newCatGroup, setNewCatGroup] = useState('')
    const [newCatName, setNewCatName] = useState('')
    const [creatingCategories, setCreatingCategories] = useState(false)

    // ── Helpers ────────────────────────────────────────────────────────────────

    const getToken = () => accessTokenRef.current

    // ── Step 1 actions ─────────────────────────────────────────────────────────

    const handleAddAccount = async () => {
        if (!accountName.trim() || !accountType) {
            setAccountError('Account name and type are required.')
            return
        }
        setAccountError('')
        setAddingAccount(true)
        try {
            const token = await getToken()
            const res = await fetch('/api/accounts', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    name: accountName.trim(),
                    type_name: accountType,
                    starting_balance: startingBalance !== '' ? parseFloat(startingBalance) : 0,
                }),
            })
            if (!res.ok) {
                const { error } = await res.json()
                setAccountError(error ?? 'Failed to add account.')
                return
            }
            const { account } = await res.json()
            setAddedAccounts(prev => [...prev, account])
            setAccountName('')
            setAccountType('')
            setStartingBalance('')
        } catch {
            setAccountError('Network error. Please try again.')
        } finally {
            setAddingAccount(false)
        }
    }

    const handleContinueFromAccounts = async () => {
        // Auto-submit if the user filled in the form but forgot to click "Add Account"
        if (accountName.trim() && accountType) {
            await handleAddAccount()
        }
        setStep(2)
    }

    const handleRemoveAccount = async (id: string) => {
        try {
            const token = await getToken()
            await fetch(`/api/accounts/${id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` },
            })
        } catch {
            // best-effort; remove from UI regardless
        }
        setAddedAccounts(prev => prev.filter(a => a.id !== id))
    }

    // ── Step 2 actions ─────────────────────────────────────────────────────────

    const toggleCategory = (key: string) => {
        setCategories(prev =>
            prev.map(c => c.key === key ? { ...c, checked: !c.checked } : c)
        )
    }

    const removeCategory = (key: string) => {
        setCategories(prev => prev.filter(c => c.key !== key))
    }

    const addCustomCategory = () => {
        if (!newCatGroup.trim() || !newCatName.trim()) return
        const key = `custom-${Date.now()}`
        setCategories(prev => [...prev, {
            key,
            group: newCatGroup.trim(),
            name: newCatName.trim(),
            checked: true,
        }])
        setNewCatGroup('')
        setNewCatName('')
    }

    const handleCreateCategories = async () => {
        const selected = categories.filter(c => c.checked)
        if (selected.length === 0) {
            setStep(3)
            return
        }
        setCreatingCategories(true)
        try {
            const token = await getToken()
            let count = 0
            for (const cat of selected) {
                const res = await fetch('/api/categories', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({ name: cat.name, group_name: cat.group }),
                })
                if (res.ok) count++
            }
            setCreatedCategoryCount(count)
            setStep(3)
        } catch {
            // proceed anyway
            setStep(3)
        } finally {
            setCreatingCategories(false)
        }
    }

    // ── Grouped categories for display ─────────────────────────────────────────

    const groupedCategories = categories.reduce((acc, cat) => {
        if (!acc[cat.group]) acc[cat.group] = []
        acc[cat.group].push(cat)
        return acc
    }, {} as Record<string, CategoryRow[]>)

    // ── Render ─────────────────────────────────────────────────────────────────

    return (
        <div className="fixed inset-0 z-50 bg-background flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-8 py-4 border-b border-border bg-card">
                <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 border border-primary/25">
                        <span className="text-sm leading-none">🐱</span>
                    </div>
                    <span className="font-display text-lg font-bold tracking-tight text-foreground">
                        allo<span className="text-primary">cat</span>
                    </span>
                </div>
                <button
                    onClick={onSkip}
                    className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-2"
                >
                    Skip setup
                </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto flex flex-col items-center justify-start px-4 py-12">
                <div className="w-full max-w-lg">

                    {/* ── Step 0: Welcome ── */}
                    {step === 0 && (
                        <div className="text-center space-y-6">
                            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-card border border-border mb-2">
                                <CheckCircle className="w-8 h-8 text-primary" />
                            </div>
                            <div>
                                <h1 className="text-3xl font-bold text-foreground">Welcome to Allocat</h1>
                                <p className="mt-3 text-muted-foreground text-base">
                                    Take a few minutes to connect your accounts and set up spending categories.
                                    You'll be ready to start budgeting right away.
                                </p>
                            </div>
                            <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
                                <Button size="lg" onClick={() => setStep(1)} className="gap-2">
                                    Get Started <ArrowRight className="w-4 h-4" />
                                </Button>
                                <Button size="lg" variant="outline" onClick={onSkip}>
                                    Skip setup
                                </Button>
                            </div>
                        </div>
                    )}

                    {/* ── Step 1: Add Accounts ── */}
                    {step === 1 && (
                        <div className="space-y-6">
                            <div>
                                <StepDots current={0} total={3} />
                                <h2 className="mt-4 text-2xl font-bold text-foreground">Add your accounts</h2>
                                <p className="mt-1 text-muted-foreground text-sm">
                                    Add your checking, savings, or credit card accounts to get started.
                                </p>
                            </div>

                            {/* Form */}
                            <div className="bg-card rounded-lg border border-border p-5 space-y-4">
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="col-span-2 space-y-1">
                                        <Label htmlFor="acct-name">Account name</Label>
                                        <Input
                                            id="acct-name"
                                            placeholder="e.g. Chase Checking"
                                            value={accountName}
                                            onChange={e => setAccountName(e.target.value)}
                                            onKeyDown={e => e.key === 'Enter' && handleAddAccount()}
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <Label>Account type</Label>
                                        <Select value={accountType} onValueChange={setAccountType}>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Select type…" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {ACCOUNT_TYPES.map(t => (
                                                    <SelectItem key={t} value={t}>{t}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-1">
                                        <Label htmlFor="acct-balance">Starting balance</Label>
                                        <Input
                                            id="acct-balance"
                                            type="number"
                                            step="0.01"
                                            placeholder="0.00"
                                            value={startingBalance}
                                            onChange={e => setStartingBalance(e.target.value)}
                                        />
                                    </div>
                                </div>
                                {accountError && (
                                    <p className="text-sm text-destructive">{accountError}</p>
                                )}
                                <Button
                                    onClick={handleAddAccount}
                                    disabled={addingAccount}
                                    className="w-full gap-2"
                                    variant="outline"
                                >
                                    <Plus className="w-4 h-4" />
                                    {addingAccount ? 'Adding…' : 'Add Account'}
                                </Button>
                            </div>

                            {/* Added accounts list */}
                            {addedAccounts.length > 0 && (
                                <div className="space-y-2">
                                    <p className="text-sm font-medium text-foreground">Added accounts</p>
                                    {addedAccounts.map(a => (
                                        <div
                                            key={a.id}
                                            className="flex items-center justify-between bg-card border border-border rounded-lg px-4 py-3"
                                        >
                                            <div>
                                                <span className="font-medium text-foreground">{a.name}</span>
                                                <span className="ml-2 text-xs text-muted-foreground">{a.type_name}</span>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <span className="text-sm text-foreground">
                                                    ${a.balance.toFixed(2)}
                                                </span>
                                                <button
                                                    onClick={() => handleRemoveAccount(a.id)}
                                                    className="text-muted-foreground hover:text-destructive"
                                                    aria-label="Remove account"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Navigation */}
                            <div className="flex items-center justify-between pt-2">
                                <button
                                    onClick={() => setStep(2)}
                                    className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-2"
                                >
                                    Skip this step
                                </button>
                                <Button onClick={handleContinueFromAccounts} disabled={addingAccount} className="gap-2">
                                    {addingAccount ? 'Adding…' : 'Continue'} <ArrowRight className="w-4 h-4" />
                                </Button>
                            </div>
                        </div>
                    )}

                    {/* ── Step 2: Choose Categories ── */}
                    {step === 2 && (
                        <div className="space-y-6">
                            <div>
                                <StepDots current={1} total={3} />
                                <h2 className="mt-4 text-2xl font-bold text-foreground">Choose your categories</h2>
                                <p className="mt-1 text-muted-foreground text-sm">
                                    These are common spending categories. Uncheck any you don't need, or add your own.
                                </p>
                            </div>

                            {/* Category list grouped */}
                            <div className="bg-card rounded-lg border border-border divide-y divide-border max-h-96 overflow-y-auto">
                                {Object.entries(groupedCategories).map(([group, cats]) => (
                                    <div key={group} className="px-4 py-3">
                                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                                            {group}
                                        </p>
                                        <div className="space-y-1">
                                            {cats.map(cat => (
                                                <div key={cat.key} className="flex items-center justify-between py-1">
                                                    <label className="flex items-center gap-2 cursor-pointer flex-1">
                                                        <input
                                                            type="checkbox"
                                                            checked={cat.checked}
                                                            onChange={() => toggleCategory(cat.key)}
                                                            className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                                                        />
                                                        <span className={`text-sm ${cat.checked ? 'text-foreground' : 'text-muted-foreground line-through'}`}>
                                                            {cat.name}
                                                        </span>
                                                    </label>
                                                    <button
                                                        onClick={() => removeCategory(cat.key)}
                                                        className="text-muted-foreground hover:text-destructive ml-2"
                                                        aria-label="Remove category"
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Add custom category */}
                            <div className="bg-card rounded-lg border border-border p-4 space-y-3">
                                <p className="text-sm font-medium text-foreground">Add a custom category</p>
                                <div className="flex gap-2">
                                    <Input
                                        placeholder="Group"
                                        value={newCatGroup}
                                        onChange={e => setNewCatGroup(e.target.value)}
                                        className="flex-1"
                                    />
                                    <Input
                                        placeholder="Category name"
                                        value={newCatName}
                                        onChange={e => setNewCatName(e.target.value)}
                                        onKeyDown={e => e.key === 'Enter' && addCustomCategory()}
                                        className="flex-1"
                                    />
                                    <Button
                                        variant="outline"
                                        size="icon"
                                        onClick={addCustomCategory}
                                        aria-label="Add custom category"
                                    >
                                        <Plus className="w-4 h-4" />
                                    </Button>
                                </div>
                            </div>

                            {/* Navigation */}
                            <div className="flex items-center justify-between pt-2">
                                <button
                                    onClick={() => setStep(3)}
                                    className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-2"
                                >
                                    Skip this step
                                </button>
                                <Button
                                    onClick={handleCreateCategories}
                                    disabled={creatingCategories}
                                    className="gap-2"
                                >
                                    {creatingCategories
                                        ? 'Setting up…'
                                        : `Set Up My Budget`}
                                    {!creatingCategories && <ArrowRight className="w-4 h-4" />}
                                </Button>
                            </div>
                        </div>
                    )}

                    {/* ── Step 3: All Done ── */}
                    {step === 3 && (
                        <div className="text-center space-y-6">
                            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-card border border-border mb-2">
                                <CheckCircle className="w-8 h-8 text-primary" />
                            </div>
                            <div>
                                <h2 className="text-3xl font-bold text-foreground">You're all set!</h2>
                                <p className="mt-3 text-muted-foreground text-base">
                                    Your budget is ready to go.
                                </p>
                            </div>

                            {/* Summary */}
                            <div className="bg-card rounded-lg border border-border p-5 text-left space-y-3">
                                <div className="flex items-center gap-3">
                                    <CheckCircle className="w-5 h-5 text-primary shrink-0" />
                                    <span className="text-sm text-foreground">
                                        {addedAccounts.length === 0
                                            ? 'No accounts added'
                                            : `${addedAccounts.length} account${addedAccounts.length !== 1 ? 's' : ''} added`}
                                    </span>
                                </div>
                                <div className="flex items-center gap-3">
                                    <CheckCircle className="w-5 h-5 text-primary shrink-0" />
                                    <span className="text-sm text-foreground">
                                        {createdCategoryCount === 0
                                            ? 'No categories created'
                                            : `${createdCategoryCount} categor${createdCategoryCount !== 1 ? 'ies' : 'y'} created`}
                                    </span>
                                </div>
                            </div>

                            <Button size="lg" onClick={onComplete} className="gap-2 w-full">
                                Go to my budget <ArrowRight className="w-4 h-4" />
                            </Button>
                        </div>
                    )}

                </div>
            </div>
        </div >
    )
}
