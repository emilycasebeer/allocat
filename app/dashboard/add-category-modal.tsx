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

interface AddCategoryModalProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    onCategoryAdded: () => void
}

export function AddCategoryModal({ open, onOpenChange, onCategoryAdded }: AddCategoryModalProps) {
    const [name, setName] = useState('')
    const [groupName, setGroupName] = useState('')
    const [loading, setLoading] = useState(false)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!name || !groupName) return

        setLoading(true)
        try {
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) return

            const response = await fetch('/api/categories', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`
                },
                body: JSON.stringify({ name, group_name: groupName })
            })

            if (response.ok) {
                setName('')
                setGroupName('')
                onCategoryAdded()
                onOpenChange(false)
            } else {
                const error = await response.json()
                alert(`Error: ${error.error}`)
            }
        } catch (error) {
            console.error('Error creating category:', error)
            alert('Error creating category')
        } finally {
            setLoading(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Add New Category</DialogTitle>
                    <DialogDescription>
                        Create a new budget category. The group will be created if it doesn't exist yet.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="group">Category Group</Label>
                        <Input
                            id="group"
                            placeholder="e.g., Housing, Food, Transportation"
                            value={groupName}
                            onChange={(e) => setGroupName(e.target.value)}
                            required
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="name">Category Name</Label>
                        <Input
                            id="name"
                            placeholder="e.g., Rent, Groceries, Gas"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            required
                        />
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={loading}>
                            {loading ? 'Creating...' : 'Create Category'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
