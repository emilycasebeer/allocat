'use client'

import { useState, useEffect } from 'react'
import { supabase } from '../providers'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Plus } from 'lucide-react'
import { AddScheduledTransactionModal } from '@/app/dashboard/add-scheduled-transaction-modal'
import type { Account, Category } from '@/app/dashboard/dashboard'

interface ScheduledTransaction {
    id: string
    account_id: string
    account_name: string | null
    payee_name: string | null
    category_name: string | null
    group_name: string | null
    amount: number
    memo: string | null
    frequency: string
    next_date: string
    end_date: string | null
    flag_color: string | null
}

interface ScheduledTransactionsViewProps {
    accounts: Account[]
    categories: Category[]
    onTransactionAdded: () => void
}

const FREQUENCY_LABELS: Record<string, string> = {
    once: 'Once',
    daily: 'Daily',
    weekly: 'Weekly',
    every_other_week: 'Every 2 Weeks',
    twice_a_month: 'Twice a Month',
    every_4_weeks: 'Every 4 Weeks',
    monthly: 'Monthly',
    every_other_month: 'Every 2 Months',
    twice_a_year: 'Twice a Year',
    yearly: 'Yearly',
}

export function ScheduledTransactionsView({
    accounts,
    categories,
    onTransactionAdded,
}: ScheduledTransactionsViewProps) {
    const [due, setDue] = useState<ScheduledTransaction[]>([])
    const [upcoming, setUpcoming] = useState<ScheduledTransaction[]>([])
    const [loading, setLoading] = useState(true)
    const [showAddModal, setShowAddModal] = useState(false)
    const [editingItem, setEditingItem] = useState<ScheduledTransaction | null>(null)
    const [enteringId, setEnteringId] = useState<string | null>(null)

    useEffect(() => {
        fetchScheduled()
    }, [])

    const fetchScheduled = async () => {
        setLoading(true)
        try {
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) return

            const response = await fetch('/api/scheduled-transactions', {
                headers: { 'Authorization': `Bearer ${session.access_token}` },
            })

            if (response.ok) {
                const data = await response.json()
                setDue(data.due ?? [])
                setUpcoming(data.upcoming ?? [])
            }
        } catch (error) {
            console.error('Error fetching scheduled transactions:', error)
        } finally {
            setLoading(false)
        }
    }

    const handleEnter = async (item: ScheduledTransaction) => {
        setEnteringId(item.id)
        try {
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) return

            const response = await fetch(`/api/scheduled-transactions/${item.id}/enter`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${session.access_token}` },
            })

            if (response.ok) {
                onTransactionAdded()
                fetchScheduled()
            } else {
                const err = await response.json()
                alert(`Error: ${err.error}`)
            }
        } catch (error) {
            console.error('Error entering scheduled transaction:', error)
        } finally {
            setEnteringId(null)
        }
    }

    const handleDelete = async (id: string) => {
        if (!confirm('Delete this scheduled transaction?')) return
        try {
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) return

            const response = await fetch(`/api/scheduled-transactions/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${session.access_token}` },
            })

            if (response.ok) fetchScheduled()
        } catch (error) {
            console.error('Error deleting scheduled transaction:', error)
        }
    }

    const formatDate = (dateStr: string) =>
        new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric',
        })

    const formatAmount = (amount: number) =>
        `${amount < 0 ? '-' : '+'}$${Math.abs(amount).toLocaleString(undefined, {
            minimumFractionDigits: 2, maximumFractionDigits: 2,
        })}`

    const renderTable = (items: ScheduledTransaction[], isDue: boolean) => (
        <div className="overflow-x-auto">
            <table className="w-full">
                <thead>
                    <tr className="border-b border-gray-200">
                        <th className="text-left py-3 px-4 font-medium text-gray-700">Account</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-700">Payee</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-700">Category</th>
                        <th className="text-right py-3 px-4 font-medium text-gray-700">Amount</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-700">Frequency</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-700">Next Date</th>
                        <th className="text-center py-3 px-4 font-medium text-gray-700">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {items.map((item) => (
                        <tr key={item.id} className={`border-b border-gray-100 hover:bg-gray-50 ${isDue ? 'bg-amber-50' : ''}`}>
                            <td className="py-3 px-4 text-sm text-gray-900">{item.account_name ?? '—'}</td>
                            <td className="py-3 px-4 text-sm text-gray-900">
                                {item.payee_name ?? <span className="text-gray-400 italic">—</span>}
                            </td>
                            <td className="py-3 px-4 text-sm text-gray-600">
                                {item.category_name
                                    ? `${item.group_name} — ${item.category_name}`
                                    : <span className="text-gray-400 italic">—</span>}
                            </td>
                            <td className={`py-3 px-4 text-sm font-medium text-right ${item.amount >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                                {formatAmount(item.amount)}
                            </td>
                            <td className="py-3 px-4 text-sm text-gray-600">
                                {FREQUENCY_LABELS[item.frequency] ?? item.frequency}
                            </td>
                            <td className="py-3 px-4 text-sm text-gray-900">{formatDate(item.next_date)}</td>
                            <td className="py-3 px-4 text-center">
                                <div className="flex items-center justify-center gap-2">
                                    {isDue && (
                                        <Button
                                            size="sm"
                                            onClick={() => handleEnter(item)}
                                            disabled={enteringId === item.id}
                                        >
                                            {enteringId === item.id ? 'Entering...' : 'Enter'}
                                        </Button>
                                    )}
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => { setEditingItem(item); setShowAddModal(true) }}
                                    >
                                        Edit
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="text-red-600 hover:text-red-700"
                                        onClick={() => handleDelete(item.id)}
                                    >
                                        Delete
                                    </Button>
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <div className="flex justify-end">
                <Button onClick={() => { setEditingItem(null); setShowAddModal(true) }} size="sm">
                    <Plus className="h-4 w-4 mr-2" />
                    New Scheduled Transaction
                </Button>
            </div>

            {due.length > 0 && (
                <Card className="border-amber-200 bg-amber-50">
                    <CardHeader>
                        <CardTitle className="text-amber-900">Due Now ({due.length})</CardTitle>
                    </CardHeader>
                    <CardContent>{renderTable(due, true)}</CardContent>
                </Card>
            )}

            <Card>
                <CardHeader>
                    <CardTitle>Upcoming</CardTitle>
                </CardHeader>
                <CardContent>
                    {upcoming.length === 0 && due.length === 0 ? (
                        <div className="text-center py-8 text-gray-500">
                            <p>No scheduled transactions yet.</p>
                            <p className="text-sm mt-2">Create one to automate recurring payments.</p>
                        </div>
                    ) : upcoming.length === 0 ? (
                        <p className="text-center py-8 text-gray-400 text-sm">No upcoming transactions.</p>
                    ) : (
                        renderTable(upcoming, false)
                    )}
                </CardContent>
            </Card>

            <AddScheduledTransactionModal
                open={showAddModal}
                onOpenChange={(open) => {
                    setShowAddModal(open)
                    if (!open) setEditingItem(null)
                }}
                accounts={accounts}
                categories={categories}
                editing={editingItem}
                onSaved={fetchScheduled}
            />
        </div>
    )
}
