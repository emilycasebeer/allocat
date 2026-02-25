import type { Metadata } from 'next'
import { Syne, DM_Sans, DM_Mono } from 'next/font/google'
import './globals.css'
import { Providers } from '@/app/providers'

const syne = Syne({
    subsets: ['latin'],
    variable: '--font-syne',
    display: 'swap',
})

const dmSans = DM_Sans({
    subsets: ['latin'],
    variable: '--font-dm-sans',
    display: 'swap',
})

const dmMono = DM_Mono({
    subsets: ['latin'],
    weight: ['400', '500'],
    variable: '--font-dm-mono',
    display: 'swap',
})

export const metadata: Metadata = {
    title: 'Allocat — Budget with clarity',
    description: 'A modern YNAB-style budgeting app built with Next.js and Supabase',
}

export default function RootLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <html
            lang="en"
            className={`${syne.variable} ${dmSans.variable} ${dmMono.variable}`}
            suppressHydrationWarning
        >
            <head>
                {/* Runs synchronously before CSS to prevent flash of wrong theme */}
                <script dangerouslySetInnerHTML={{ __html: `(function(){var t=localStorage.getItem('allocat-theme');var isDark=t!=='light';document.documentElement.classList.toggle('dark',isDark);document.documentElement.classList.toggle('light',!isDark);})()` }} />
            </head>
            <body>
                <Providers>
                    {children}
                </Providers>
            </body>
        </html>
    )
}
