'use client'

import { useAuth } from '../providers'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { LogOut, User } from 'lucide-react'

export function TopNav() {
    const { user, signOut } = useAuth()

    const getUserInitials = (email: string) => {
        return email.substring(0, 2).toUpperCase()
    }

    return (
        <nav className="bg-card border-b border-border px-6 py-3.5 sticky top-0 z-40">
            <div className="flex items-center justify-between">
                {/* Brand */}
                <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 border border-primary/25">
                        <span className="text-sm leading-none">🐱</span>
                    </div>
                    <span className="font-display text-lg font-bold tracking-tight text-foreground">
                        alloc<span className="text-primary">at</span>
                    </span>
                </div>

                {/* User menu */}
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button
                            variant="ghost"
                            className="relative h-8 w-8 rounded-full ring-1 ring-border hover:ring-primary/50 transition-all p-0"
                        >
                            <Avatar className="h-8 w-8">
                                <AvatarFallback className="bg-primary/15 text-primary text-xs font-semibold font-display">
                                    {user?.email ? getUserInitials(user.email) : 'U'}
                                </AvatarFallback>
                            </Avatar>
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-56" align="end" forceMount>
                        <DropdownMenuLabel className="font-normal">
                            <div className="flex flex-col space-y-1">
                                <p className="text-sm font-medium leading-none truncate">
                                    {user?.email || 'User'}
                                </p>
                                <p className="text-xs leading-none text-muted-foreground">
                                    Budget Manager
                                </p>
                            </div>
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem>
                            <User className="mr-2 h-4 w-4" />
                            <span>Profile</span>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                            onClick={signOut}
                            className="text-destructive focus:text-destructive focus:bg-destructive/10"
                        >
                            <LogOut className="mr-2 h-4 w-4" />
                            <span>Log out</span>
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </nav>
    )
}
