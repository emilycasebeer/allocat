'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '../providers'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import type { Account } from '@/app/dashboard/dashboard'

function fmt(amount: number) {
    const abs = Math.abs(amount).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })
    return amount < 0 ? `-$${abs}` : `$${abs}`
}

interface EditAccountModalProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    account: Account
    onAccountMutated: () => void
    onAccountDeleted: (id: string) => void
}

export function EditAccountModal({
    open,
    onOpenChange,
    account,
    onAccountMutated,
    onAccountDeleted,
}: EditAccountModalProps) {
    const { accessToken } = useAuth()
    const [name, setName] = useState(account.name)
    const [note, setNote] = useState(account.note ?? '')
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [confirmAction, setConfirmAction] = useState<'close' | 'delete' | null>(null)

    // Sync form state when the modal opens or the account changes
    useEffect(() => {
        if (open) {
            setName(account.name)
            setNote(account.note ?? '')
            setError(null)
            setConfirmAction(null)
        }
    }, [open, account.id])

    const handleClose = () => {
        if (!saving) {
            setConfirmAction(null)
            onOpenChange(false)
        }
    }

    const handleSave = async () => {
        if (!name.trim()) return
        setSaving(true)
        setError(null)
        try {
            const res = await fetch(`/api/accounts/${account.id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${accessToken}`,
                },
                body: JSON.stringify({ name: name.trim(), note: note || null }),
            })
            if (!res.ok) {
                const body = await res.json()
                setError(body.error ?? 'Failed to save.')
                return
            }
            onAccountMutated()
            onOpenChange(false)
        } catch {
            setError('Network error. Please try again.')
        } finally {
            setSaving(false)
        }
    }

    const handleReopen = async () => {
        setSaving(true)
        setError(null)
        try {
            const res = await fetch(`/api/accounts/${account.id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${accessToken}`,
                },
                body: JSON.stringify({ is_closed: false }),
            })
            if (!res.ok) {
                const body = await res.json()
                setError(body.error ?? 'Failed to reopen account.')
                return
            }
            onAccountMutated()
            onOpenChange(false)
        } catch {
            setError('Network error. Please try again.')
        } finally {
            setSaving(false)
        }
    }

    const handleConfirmAction = async () => {
        if (!confirmAction) return
        setSaving(true)
        setError(null)
        try {
            if (confirmAction === 'delete') {
                const res = await fetch(`/api/accounts/${account.id}`, {
                    method: 'DELETE',
                    headers: { Authorization: `Bearer ${accessToken}` },
                })
                if (!res.ok) {
                    const body = await res.json()
                    setError(body.error ?? 'Failed to delete account.')
                    return
                }
                onAccountDeleted(account.id)
                onOpenChange(false)
            } else {
                // close
                const res = await fetch(`/api/accounts/${account.id}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${accessToken}`,
                    },
                    body: JSON.stringify({ is_closed: true }),
                })
                if (!res.ok) {
                    const body = await res.json()
                    setError(body.error ?? 'Failed to close account.')
                    return
                }
                onAccountMutated()
                onOpenChange(false)
            }
        } catch {
            setError('Network error. Please try again.')
        } finally {
            setSaving(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={(o) => { if (!saving) { setConfirmAction(null); onOpenChange(o) } }}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Edit Account</DialogTitle>
                </DialogHeader>

                {confirmAction ? (
                    /* ── Confirmation state ── */
                    <div className="space-y-4">
                        <p className="text-sm text-muted-foreground">
                            {confirmAction === 'delete' ? (
                                <>
                                    Permanently delete{' '}
                                    <strong className="text-foreground">{account.name}</strong>?
                                    {' '}This cannot be undone. Accounts with transactions cannot be deleted.
                                </>
                            ) : (
                                <>
                                    Close{' '}
                                    <strong className="text-foreground">{account.name}</strong>?
                                    {' '}All transactions are preserved and the account will move to the
                                    Closed section.
                                    {account.balance !== 0 && (
                                        <span className="block mt-2 text-amber-400">
                                            Note: this account has a {fmt(account.balance)} balance.
                                        </span>
                                    )}
                                </>
                            )}
                        </p>
                        {error && <p className="text-sm text-destructive">{error}</p>}
                        <DialogFooter>
                            <Button
                                variant="outline"
                                onClick={() => { setConfirmAction(null); setError(null) }}
                                disabled={saving}
                            >
                                Cancel
                            </Button>
                            <Button
                                variant="destructive"
                                onClick={handleConfirmAction}
                                disabled={saving}
                            >
                                {saving
                                    ? 'Working…'
                                    : confirmAction === 'delete' ? 'Delete' : 'Close Account'}
                            </Button>
                        </DialogFooter>
                    </div>
                ) : (
                    /* ── Edit state ── */
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="edit-account-name">Account Nickname</Label>
                            <Input
                                id="edit-account-name"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Account name"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="edit-account-note">Account Notes</Label>
                            <textarea
                                id="edit-account-note"
                                value={note}
                                onChange={(e) => setNote(e.target.value)}
                                placeholder="Optional notes about this account"
                                rows={3}
                                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
                            />
                        </div>
                        {error && <p className="text-sm text-destructive">{error}</p>}

                        {/* Footer: destructive actions left, cancel+save right */}
                        <div className="flex items-center gap-2 pt-1">
                            <div className="flex items-center gap-2 flex-1">
                                {account.is_closed ? (
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={handleReopen}
                                        disabled={saving}
                                    >
                                        Reopen Account
                                    </Button>
                                ) : (
                                    <Button
                                        type="button"
                                        variant="destructive"
                                        size="sm"
                                        onClick={() => setConfirmAction('close')}
                                        disabled={saving}
                                    >
                                        Close Account
                                    </Button>
                                )}
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                    onClick={() => setConfirmAction('delete')}
                                    disabled={saving}
                                >
                                    Delete
                                </Button>
                            </div>
                            <Button variant="outline" onClick={handleClose} disabled={saving}>
                                Cancel
                            </Button>
                            <Button onClick={handleSave} disabled={saving || !name.trim()}>
                                {saving ? 'Saving…' : 'Save'}
                            </Button>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    )
}
