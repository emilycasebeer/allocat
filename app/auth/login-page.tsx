'use client'

import React, { useState } from 'react'
import { supabase } from '../providers'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function LoginPage() {
    const [isLogin, setIsLogin] = useState(true)
    const [name, setName] = useState('')
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [loading, setLoading] = useState(false)
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

    const handleAuth = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setMessage(null)

        try {
            if (isLogin) {
                const { error } = await supabase.auth.signInWithPassword({ email, password })
                if (error) throw error
            } else {
                const { data, error } = await supabase.auth.signUp({ email, password })
                if (error) throw error
                if (data.user) {
                    await supabase
                        .from('profiles')
                        .update({ display_name: name.trim() })
                        .eq('id', data.user.id)
                }
                setMessage({ type: 'success', text: 'Check your email for the confirmation link!' })
            }
        } catch (error: any) {
            setMessage({ type: 'error', text: error.message })
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="min-h-screen bg-background flex items-center justify-center px-4">
            <div className="w-full max-w-sm space-y-8">

                {/* Brand */}
                <div className="flex flex-col items-center gap-2">
                    <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/15 border border-primary/25">
                            <span className="text-xl leading-none">🐱</span>
                        </div>
                        <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">
                            allo<span className="text-primary">cat</span>
                        </h1>
                    </div>
                    <p className="text-sm text-muted-foreground">Your personal budget, under control.</p>
                </div>

                {/* Card */}
                <div className="bg-card border border-border rounded-xl overflow-hidden">

                    {/* Tab switcher */}
                    <div className="grid grid-cols-2 border-b border-border">
                        <button
                            type="button"
                            onClick={() => { setIsLogin(true); setMessage(null) }}
                            className={`py-3 text-sm font-medium transition-colors ${
                                isLogin
                                    ? 'text-foreground border-b-2 border-primary bg-muted/30'
                                    : 'text-muted-foreground hover:text-foreground'
                            }`}
                        >
                            Sign In
                        </button>
                        <button
                            type="button"
                            onClick={() => { setIsLogin(false); setMessage(null) }}
                            className={`py-3 text-sm font-medium transition-colors ${
                                !isLogin
                                    ? 'text-foreground border-b-2 border-primary bg-muted/30'
                                    : 'text-muted-foreground hover:text-foreground'
                            }`}
                        >
                            Create Account
                        </button>
                    </div>

                    {/* Form */}
                    <form onSubmit={handleAuth} className="p-6 space-y-5">
                        {!isLogin && (
                            <div className="space-y-1.5">
                                <Label htmlFor="name" className="text-sm text-muted-foreground">
                                    Name
                                </Label>
                                <Input
                                    id="name"
                                    type="text"
                                    placeholder="Your name"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    required
                                    className="bg-input border-border"
                                />
                            </div>
                        )}
                        <div className="space-y-1.5">
                            <Label htmlFor="email" className="text-sm text-muted-foreground">
                                Email
                            </Label>
                            <Input
                                id="email"
                                type="email"
                                placeholder="you@example.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                className="bg-input border-border"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="password" className="text-sm text-muted-foreground">
                                Password
                            </Label>
                            <Input
                                id="password"
                                type="password"
                                placeholder="••••••••"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                className="bg-input border-border"
                            />
                        </div>

                        {message && (
                            <div className={`text-xs px-3 py-2 rounded-lg ${
                                message.type === 'error'
                                    ? 'bg-destructive/10 text-destructive border border-destructive/20'
                                    : 'bg-primary/10 text-primary border border-primary/20'
                            }`}>
                                {message.text}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full h-10 rounded-lg bg-primary/90 hover:bg-primary text-primary-foreground text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {loading
                                ? (isLogin ? 'Signing in…' : 'Creating account…')
                                : (isLogin ? 'Sign In' : 'Create Account')
                            }
                        </button>
                    </form>
                </div>
            </div>
        </div>
    )
}
