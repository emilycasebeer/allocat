'use client'

import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../providers'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
    Dialog,
    DialogContent,
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
import { Trash2 } from 'lucide-react'
import type { Category } from '@/app/dashboard/dashboard'

interface Payee {
    id: string
    name: string
    default_category_id: string | null
}

interface ManagePayeesModalProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    categories: Category[]
}

export function ManagePayeesModal({ open, onOpenChange, categories }: ManagePayeesModalProps) {
    const { accessToken } = useAuth()
    const accessTokenRef = useRef<string | null>(null)
    accessTokenRef.current = accessToken

    const [payees, setPayees] = useState<Payee[]>([])
    const [loading, setLoading] = useState(true)
    const [renamingId, setRenamingId] = useState<string | null>(null)
    const [renamingValue, setRenamingValue] = useState('')

    const selectableCategories = categories.filter((c) => !c.is_system)

    useEffect(() => {
        if (open) fetchPayees()
    }, [open])

    const fetchPayees = async () => {
        setLoading(true)
        try {
            const token = accessTokenRef.current
            if (!token) return
            const res = await fetch('/api/payees', {
                headers: { 'Authorization': `Bearer ${token}` }
            })
            if (res.ok) {
                const { payees } = await res.json()
                setPayees(payees)
            }
        } catch (error) {
            console.error('Error fetching payees:', error)
        } finally {
            setLoading(false)
        }
    }

    const handleRenameSave = async (payeeId: string) => {
        const trimmed = renamingValue.trim()
        if (!trimmed) { setRenamingId(null); return }
        try {
            const token = accessTokenRef.current
            if (!token) return
            const res = await fetch(`/api/payees/${payeeId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ name: trimmed })
            })
            if (res.ok) {
                const { payee } = await res.json()
                setPayees(prev => prev.map(p => p.id === payeeId ? { ...p, name: payee.name } : p))
            } else {
                const err = await res.json()
                alert(`Error: ${err.error}`)
            }
        } catch (error) {
            console.error('Error renaming payee:', error)
        } finally {
            setRenamingId(null)
        }
    }

    const handleDefaultCategoryChange = async (payeeId: string, categoryId: string) => {
        try {
            const token = accessTokenRef.current
            if (!token) return
            const newCategoryId = categoryId === '__none__' ? null : categoryId
            const res = await fetch(`/api/payees/${payeeId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ default_category_id: newCategoryId })
            })
            if (res.ok) {
                setPayees(prev => prev.map(p => p.id === payeeId ? { ...p, default_category_id: newCategoryId } : p))
            } else {
                const err = await res.json()
                alert(`Error: ${err.error}`)
            }
        } catch (error) {
            console.error('Error updating default category:', error)
        }
    }

    const handleDelete = async (payee: Payee) => {
        if (!confirm(`Delete payee "${payee.name}"? This will not delete transactions.`)) return
        try {
            const token = accessTokenRef.current
            if (!token) return
            const res = await fetch(`/api/payees/${payee.id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            })
            if (res.ok) {
                setPayees(prev => prev.filter(p => p.id !== payee.id))
            } else {
                const err = await res.json()
                alert(`Error: ${err.error}`)
            }
        } catch (error) {
            console.error('Error deleting payee:', error)
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Manage Payees</DialogTitle>
                </DialogHeader>

                {loading ? (
                    <div className="flex items-center justify-center h-32">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
                    </div>
                ) : payees.length === 0 ? (
                    <p className="text-sm text-gray-500 py-8 text-center">No payees yet. They are created automatically when you record transactions.</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b text-left text-gray-500">
                                    <th className="pb-2 font-medium w-1/3">Payee</th>
                                    <th className="pb-2 font-medium">Default Category</th>
                                    <th className="pb-2 w-8"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {payees.map((payee) => (
                                    <tr key={payee.id} className="group">
                                        <td className="py-2 pr-3">
                                            {renamingId === payee.id ? (
                                                <Input
                                                    value={renamingValue}
                                                    onChange={(e) => setRenamingValue(e.target.value)}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') handleRenameSave(payee.id)
                                                        if (e.key === 'Escape') setRenamingId(null)
                                                    }}
                                                    onBlur={() => handleRenameSave(payee.id)}
                                                    className="h-7 text-sm py-0"
                                                    autoFocus
                                                />
                                            ) : (
                                                <span
                                                    className="cursor-pointer hover:text-blue-600"
                                                    onClick={() => { setRenamingId(payee.id); setRenamingValue(payee.name) }}
                                                >
                                                    {payee.name}
                                                </span>
                                            )}
                                        </td>
                                        <td className="py-2 pr-3">
                                            <Select
                                                value={payee.default_category_id ?? '__none__'}
                                                onValueChange={(v) => handleDefaultCategoryChange(payee.id, v)}
                                            >
                                                <SelectTrigger className="h-8 text-xs">
                                                    <SelectValue placeholder="None" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="__none__">None</SelectItem>
                                                    {selectableCategories.map((c) => (
                                                        <SelectItem key={c.id} value={c.id}>
                                                            {c.group_name} — {c.name}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </td>
                                        <td className="py-2">
                                            <button
                                                onClick={() => handleDelete(payee)}
                                                className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                                title="Delete payee"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    )
}
