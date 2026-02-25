'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth, supabase, useTheme } from '../providers'
import { Sun, Moon, User, Lock, SlidersHorizontal, Settings } from 'lucide-react'

type Tab = 'profile' | 'security' | 'preferences'

const CURRENCIES = [
    { code: 'USD', label: 'USD — US Dollar ($)' },
    { code: 'EUR', label: 'EUR — Euro (€)' },
    { code: 'GBP', label: 'GBP — British Pound (£)' },
    { code: 'CAD', label: 'CAD — Canadian Dollar (CA$)' },
    { code: 'AUD', label: 'AUD — Australian Dollar (A$)' },
    { code: 'JPY', label: 'JPY — Japanese Yen (¥)' },
    { code: 'CHF', label: 'CHF — Swiss Franc (Fr)' },
    { code: 'INR', label: 'INR — Indian Rupee (₹)' },
    { code: 'BRL', label: 'BRL — Brazilian Real (R$)' },
    { code: 'MXN', label: 'MXN — Mexican Peso (MX$)' },
]

interface SettingsModalProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    onNameChange: (name: string) => void
}

type Message = { type: 'success' | 'error'; text: string } | null

function StatusMessage({ msg }: { msg: Message }) {
    if (!msg) return null
    return (
        <div className={`text-xs px-3 py-2 rounded-lg ${
            msg.type === 'error'
                ? 'bg-destructive/10 text-destructive border border-destructive/20'
                : 'bg-primary/10 text-primary border border-primary/20'
        }`}>
            {msg.text}
        </div>
    )
}

function SaveButton({ loading, label, disabled }: { loading: boolean; label: string; disabled?: boolean }) {
    return (
        <button
            type="submit"
            disabled={loading || disabled}
            className="w-full h-9 rounded-lg bg-primary/90 hover:bg-primary text-primary-foreground text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
            {loading ? 'Saving…' : label}
        </button>
    )
}

export function SettingsModal({ open, onOpenChange, onNameChange }: SettingsModalProps) {
    const { user } = useAuth()
    const { theme, setTheme } = useTheme()
    const [tab, setTab] = useState<Tab>('profile')

    // Profile & preferences state
    const [displayName, setDisplayName] = useState('')
    const [currency, setCurrency] = useState('USD')
    const [firstDayOfWeek, setFirstDayOfWeek] = useState(0)
    const [profileLoading, setProfileLoading] = useState(false)
    const [profileMsg, setProfileMsg] = useState<Message>(null)

    // Security state
    const [newPassword, setNewPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [passwordLoading, setPasswordLoading] = useState(false)
    const [passwordMsg, setPasswordMsg] = useState<Message>(null)

    useEffect(() => {
        if (!open || !user) return
        supabase
            .from('profiles')
            .select('display_name, currency, first_day_of_week')
            .eq('id', user.id)
            .single()
            .then(({ data }) => {
                if (data) {
                    setDisplayName(data.display_name ?? '')
                    setCurrency(data.currency ?? 'USD')
                    setFirstDayOfWeek(data.first_day_of_week ?? 0)
                }
            })
    }, [open, user?.id])

    const handleProfileSave = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!user) return
        setProfileLoading(true)
        setProfileMsg(null)
        const { error } = await supabase
            .from('profiles')
            .update({ display_name: displayName.trim(), currency, first_day_of_week: firstDayOfWeek })
            .eq('id', user.id)
        setProfileLoading(false)
        if (error) {
            setProfileMsg({ type: 'error', text: error.message })
        } else {
            setProfileMsg({ type: 'success', text: 'Profile saved.' })
            onNameChange(displayName.trim())
            setTimeout(() => setProfileMsg(null), 2500)
        }
    }

    const handlePasswordChange = async (e: React.FormEvent) => {
        e.preventDefault()
        if (newPassword !== confirmPassword) {
            setPasswordMsg({ type: 'error', text: 'Passwords do not match.' })
            return
        }
        if (newPassword.length < 6) {
            setPasswordMsg({ type: 'error', text: 'Password must be at least 6 characters.' })
            return
        }
        setPasswordLoading(true)
        setPasswordMsg(null)
        const { error } = await supabase.auth.updateUser({ password: newPassword })
        setPasswordLoading(false)
        if (error) {
            setPasswordMsg({ type: 'error', text: error.message })
        } else {
            setPasswordMsg({ type: 'success', text: 'Password updated successfully.' })
            setNewPassword('')
            setConfirmPassword('')
            setTimeout(() => setPasswordMsg(null), 2500)
        }
    }

    const tabs: { id: Tab; label: string; Icon: React.ElementType }[] = [
        { id: 'profile',     label: 'Profile',     Icon: User              },
        { id: 'security',    label: 'Security',    Icon: Lock              },
        { id: 'preferences', label: 'Preferences', Icon: SlidersHorizontal },
    ]

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[460px] p-0 overflow-hidden gap-0">
                <DialogHeader className="px-6 pt-5 pb-4 border-b border-border">
                    <DialogTitle className="flex items-center gap-2 text-base">
                        <Settings className="h-4 w-4 text-primary" />
                        Settings
                    </DialogTitle>
                </DialogHeader>

                {/* Tab bar */}
                <div className="flex border-b border-border">
                    {tabs.map(({ id, label, Icon }) => (
                        <button
                            key={id}
                            type="button"
                            onClick={() => setTab(id)}
                            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors ${
                                tab === id
                                    ? 'text-primary border-b-2 border-primary bg-primary/5'
                                    : 'text-muted-foreground hover:text-foreground'
                            }`}
                        >
                            <Icon className="h-3.5 w-3.5" />
                            {label}
                        </button>
                    ))}
                </div>

                <div className="p-6">
                    {/* ── Profile ── */}
                    {tab === 'profile' && (
                        <form onSubmit={handleProfileSave} className="space-y-4">
                            <div className="space-y-1.5">
                                <Label className="text-sm text-muted-foreground">Name</Label>
                                <Input
                                    value={displayName}
                                    onChange={e => setDisplayName(e.target.value)}
                                    placeholder="Your name"
                                    className="bg-input border-border"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-sm text-muted-foreground">Email</Label>
                                <Input
                                    value={user?.email ?? ''}
                                    disabled
                                    className="bg-input border-border opacity-60 cursor-not-allowed"
                                />
                                <p className="text-[11px] text-muted-foreground/60">Email cannot be changed here.</p>
                            </div>
                            <StatusMessage msg={profileMsg} />
                            <SaveButton loading={profileLoading} label="Save Profile" />
                        </form>
                    )}

                    {/* ── Security ── */}
                    {tab === 'security' && (
                        <form onSubmit={handlePasswordChange} className="space-y-4">
                            <div className="space-y-1.5">
                                <Label className="text-sm text-muted-foreground">New Password</Label>
                                <Input
                                    type="password"
                                    value={newPassword}
                                    onChange={e => setNewPassword(e.target.value)}
                                    placeholder="••••••••"
                                    className="bg-input border-border"
                                    autoComplete="new-password"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-sm text-muted-foreground">Confirm Password</Label>
                                <Input
                                    type="password"
                                    value={confirmPassword}
                                    onChange={e => setConfirmPassword(e.target.value)}
                                    placeholder="••••••••"
                                    className="bg-input border-border"
                                    autoComplete="new-password"
                                />
                            </div>
                            <StatusMessage msg={passwordMsg} />
                            <SaveButton loading={passwordLoading} label="Update Password" disabled={!newPassword} />
                        </form>
                    )}

                    {/* ── Preferences ── */}
                    {tab === 'preferences' && (
                        <form onSubmit={handleProfileSave} className="space-y-5">
                            {/* Appearance */}
                            <div className="space-y-2">
                                <Label className="text-sm text-muted-foreground">Appearance</Label>
                                <div className="grid grid-cols-2 gap-2">
                                    {([['dark', Moon, 'Dark'], ['light', Sun, 'Light']] as const).map(([t, Icon, label]) => (
                                        <button
                                            key={t}
                                            type="button"
                                            onClick={() => setTheme(t)}
                                            className={`flex items-center justify-center gap-2 h-10 rounded-lg border text-sm font-medium transition-colors ${
                                                theme === t
                                                    ? 'bg-primary/15 border-primary text-primary'
                                                    : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted/40'
                                            }`}
                                        >
                                            <Icon className="h-4 w-4" />
                                            {label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Currency */}
                            <div className="space-y-1.5">
                                <Label className="text-sm text-muted-foreground">Currency</Label>
                                <select
                                    value={currency}
                                    onChange={e => setCurrency(e.target.value)}
                                    className="w-full h-9 rounded-md border border-border bg-input px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                                >
                                    {CURRENCIES.map(c => (
                                        <option key={c.code} value={c.code}>{c.label}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Week start */}
                            <div className="space-y-2">
                                <Label className="text-sm text-muted-foreground">Week starts on</Label>
                                <div className="grid grid-cols-2 gap-2">
                                    {([0, 1] as const).map(day => (
                                        <button
                                            key={day}
                                            type="button"
                                            onClick={() => setFirstDayOfWeek(day)}
                                            className={`h-9 rounded-lg border text-sm font-medium transition-colors ${
                                                firstDayOfWeek === day
                                                    ? 'bg-primary/15 border-primary text-primary'
                                                    : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted/40'
                                            }`}
                                        >
                                            {day === 0 ? 'Sunday' : 'Monday'}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <StatusMessage msg={profileMsg} />
                            <SaveButton loading={profileLoading} label="Save Preferences" />
                        </form>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    )
}
