'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { X } from 'lucide-react'
import type { Account } from '@/app/dashboard/dashboard'

export interface PayeeMeta {
    isTransfer: boolean
    accountId?: string
    defaultCategoryId?: string | null
}

interface Payee {
    id: string
    name: string
    default_category_id: string | null
}

interface PayeeComboboxProps {
    payees: Payee[]
    accounts: Account[]
    currentAccountId?: string
    value: string
    onChange: (value: string, meta: PayeeMeta) => void
}

interface DropdownItem {
    type: 'transfer' | 'payee' | 'create'
    label: string
    accountId?: string
    defaultCategoryId?: string | null
}

export function PayeeCombobox({
    payees,
    accounts,
    currentAccountId,
    value,
    onChange,
}: PayeeComboboxProps) {
    const [open, setOpen] = useState(false)
    const [activeIndex, setActiveIndex] = useState(-1)
    const inputRef = useRef<HTMLInputElement>(null)
    const listRef = useRef<HTMLUListElement>(null)
    const containerRef = useRef<HTMLDivElement>(null)

    const transferAccounts = accounts.filter(a => a.id !== currentAccountId)

    const buildItems = useCallback((): DropdownItem[] => {
        const q = value.trim().toLowerCase()
        const items: DropdownItem[] = []

        // Transfer payees at the top, filtered by query
        for (const acct of transferAccounts) {
            const label = `Transfer: ${acct.name}`
            if (!q || label.toLowerCase().includes(q)) {
                items.push({ type: 'transfer', label, accountId: acct.id })
            }
        }

        // Matching regular payees
        for (const p of payees) {
            if (!q || p.name.toLowerCase().includes(q)) {
                items.push({ type: 'payee', label: p.name, defaultCategoryId: p.default_category_id })
            }
        }

        // "Create" option when typed text doesn't exactly match any payee
        if (q) {
            const exactMatch = payees.some(p => p.name.toLowerCase() === q)
            const transferMatch = transferAccounts.some(a => `transfer: ${a.name.toLowerCase()}` === q)
            if (!exactMatch && !transferMatch) {
                items.push({ type: 'create', label: `Create "${value.trim()}"` })
            }
        }

        return items
    }, [value, payees, transferAccounts])

    const items = buildItems()

    // Reset activeIndex when items change
    useEffect(() => {
        setActiveIndex(-1)
    }, [value])

    // Scroll active item into view
    useEffect(() => {
        if (activeIndex >= 0 && listRef.current) {
            const el = listRef.current.children[activeIndex] as HTMLElement
            el?.scrollIntoView({ block: 'nearest' })
        }
    }, [activeIndex])

    // Close on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setOpen(false)
            }
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [])

    const selectItem = (item: DropdownItem) => {
        if (item.type === 'transfer') {
            onChange(item.label, { isTransfer: true, accountId: item.accountId })
        } else if (item.type === 'payee') {
            onChange(item.label, { isTransfer: false, defaultCategoryId: item.defaultCategoryId })
        } else {
            // create
            onChange(value.trim(), { isTransfer: false, defaultCategoryId: null })
        }
        setOpen(false)
    }

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (!open) {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                setOpen(true)
                return
            }
        }

        if (e.key === 'ArrowDown') {
            e.preventDefault()
            setActiveIndex(i => Math.min(i + 1, items.length - 1))
        } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setActiveIndex(i => Math.max(i - 1, 0))
        } else if (e.key === 'Enter') {
            if (activeIndex >= 0 && items[activeIndex]) {
                e.preventDefault()
                selectItem(items[activeIndex])
            }
        } else if (e.key === 'Escape') {
            setOpen(false)
            setActiveIndex(-1)
        }
    }

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        onChange(e.target.value, { isTransfer: false })
        setOpen(true)
    }

    const handleClear = () => {
        onChange('', { isTransfer: false })
        inputRef.current?.focus()
        setOpen(false)
    }

    return (
        <div ref={containerRef} className="relative">
            <div className="relative flex items-center">
                <input
                    ref={inputRef}
                    type="text"
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring pr-7"
                    placeholder="e.g., Amazon, Whole Foods"
                    value={value}
                    onChange={handleChange}
                    onFocus={() => setOpen(true)}
                    onKeyDown={handleKeyDown}
                    autoComplete="off"
                    role="combobox"
                    aria-expanded={open}
                    aria-autocomplete="list"
                    aria-haspopup="listbox"
                />
                {value && (
                    <button
                        type="button"
                        tabIndex={-1}
                        onClick={handleClear}
                        className="absolute right-2 text-muted-foreground hover:text-foreground"
                        aria-label="Clear payee"
                    >
                        <X className="h-3.5 w-3.5" />
                    </button>
                )}
            </div>

            {open && items.length > 0 && (
                <ul
                    ref={listRef}
                    role="listbox"
                    className="absolute z-50 mt-1 max-h-56 w-full overflow-auto rounded-md border bg-popover text-popover-foreground shadow-md text-sm"
                >
                    {items.map((item, i) => (
                        <li
                            key={`${item.type}-${item.label}`}
                            role="option"
                            aria-selected={i === activeIndex}
                            onMouseDown={(e) => {
                                e.preventDefault()
                                selectItem(item)
                            }}
                            onMouseEnter={() => setActiveIndex(i)}
                            className={`cursor-pointer px-3 py-2 ${
                                i === activeIndex ? 'bg-accent text-accent-foreground' : ''
                            } ${item.type === 'transfer' ? 'text-blue-600' : ''} ${
                                item.type === 'create' ? 'italic text-muted-foreground' : ''
                            }`}
                        >
                            {item.label}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    )
}
