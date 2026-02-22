'use client'

import React, { useState } from 'react'
import { supabase } from '../providers'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'

export function LoginPage() {
    const [isLogin, setIsLogin] = useState(true)
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
                const { error } = await supabase.auth.signInWithPassword({
                    email,
                    password,
                })
                if (error) throw error
            } else {
                const { error } = await supabase.auth.signUp({
                    email,
                    password,
                })
                if (error) throw error
                setMessage({ type: 'success', text: 'Check your email for the confirmation link!' })
            }
        } catch (error: any) {
            setMessage({ type: 'error', text: error.message })
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-md w-full space-y-8">
                <div className="text-center">
                    <h1 className="text-4xl font-bold text-blue-600 mb-2">Allocat</h1>
                    <p className="text-gray-600">YNAB-Style Budgeting App</p>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-center">
                            {isLogin ? 'Sign in to your account' : 'Create a new account'}
                        </CardTitle>
                        <CardDescription className="text-center">
                            {isLogin ? 'Welcome back! Please sign in to continue.' : 'Get started with your budgeting journey.'}
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Tabs value={isLogin ? 'login' : 'signup'} onValueChange={(value) => setIsLogin(value === 'login')}>
                            <TabsList className="grid w-full grid-cols-2">
                                <TabsTrigger value="login">Sign In</TabsTrigger>
                                <TabsTrigger value="signup">Sign Up</TabsTrigger>
                            </TabsList>

                            <TabsContent value="login" className="space-y-4">
                                <form onSubmit={handleAuth} className="space-y-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="email">Email</Label>
                                        <Input
                                            id="email"
                                            type="email"
                                            placeholder="Enter your email"
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            required
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="password">Password</Label>
                                        <Input
                                            id="password"
                                            type="password"
                                            placeholder="Enter your password"
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            required
                                        />
                                    </div>
                                    <Button type="submit" className="w-full" disabled={loading}>
                                        {loading ? 'Signing in...' : 'Sign In'}
                                    </Button>
                                </form>
                            </TabsContent>

                            <TabsContent value="signup" className="space-y-4">
                                <form onSubmit={handleAuth} className="space-y-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="signup-email">Email</Label>
                                        <Input
                                            id="signup-email"
                                            type="email"
                                            placeholder="Enter your email"
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            required
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="signup-password">Password</Label>
                                        <Input
                                            id="signup-password"
                                            type="password"
                                            placeholder="Create a password"
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            required
                                        />
                                    </div>
                                    <Button type="submit" className="w-full" disabled={loading}>
                                        {loading ? 'Creating account...' : 'Create Account'}
                                    </Button>
                                </form>
                            </TabsContent>
                        </Tabs>

                        {message && (
                            <Alert className={message.type === 'error' ? 'border-red-200 bg-red-50' : 'border-green-200 bg-green-50'}>
                                <AlertDescription className={message.type === 'error' ? 'text-red-800' : 'text-green-800'}>
                                    {message.text}
                                </AlertDescription>
                            </Alert>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
