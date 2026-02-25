'use client'

import React, { useState, useEffect, useRef } from 'react'
import { useAuth } from '../providers'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from 'recharts'

interface SpendingByCategory {
    name: string
    value: number
    color: string
}

interface BudgetVsActual {
    name: string
    budgeted: number
    actual: number
}

interface NetWorthData {
    month: string
    netWorth: number
}

interface IncomeVsExpenses {
    month: string
    income: number
    expenses: number
}

interface ReportsViewProps {
    month: number
    year: number
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D', '#FFC0CB', '#DDA0DD', '#98D8C8', '#F7DC6F']

export function ReportsView({ month, year }: ReportsViewProps) {
    const { accessToken } = useAuth()
    const accessTokenRef = useRef<string | null>(null)
    accessTokenRef.current = accessToken

    const [spendingByCategory, setSpendingByCategory] = useState<SpendingByCategory[]>([])
    const [budgetVsActual, setBudgetVsActual] = useState<BudgetVsActual[]>([])
    const [netWorthData, setNetWorthData] = useState<NetWorthData[]>([])
    const [incomeVsExpenses, setIncomeVsExpenses] = useState<IncomeVsExpenses[]>([])
    const [loading, setLoading] = useState(true)
    const [selectedPeriod, setSelectedPeriod] = useState('3') // 3 months default

    useEffect(() => {
        fetchReportsData()
    }, [month, year, selectedPeriod])

    const fetchReportsData = async () => {
        try {
            const token = accessTokenRef.current
            if (!token) return

            setLoading(true)

            // Fetch all reports data
            await Promise.all([
                fetchSpendingByCategory(),
                fetchBudgetVsActual(),
                fetchNetWorth(),
                fetchIncomeVsExpenses()
            ])
        } catch (error) {
            console.error('Error fetching reports data:', error)
        } finally {
            setLoading(false)
        }
    }

    const fetchSpendingByCategory = async () => {
        try {
            const token = accessTokenRef.current
            if (!token) return

            const response = await fetch(`/api/reports/spending?month=${month}&year=${year}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            })

            if (response.ok) {
                const { spending } = await response.json()
                const chartData = spending.map((item: any, index: number) => ({
                    name: item.category_name,
                    value: Math.abs(item.total_amount),
                    color: COLORS[index % COLORS.length]
                }))
                setSpendingByCategory(chartData)
            }
        } catch (error) {
            console.error('Error fetching spending by category:', error)
        }
    }

    const fetchBudgetVsActual = async () => {
        try {
            const token = accessTokenRef.current
            if (!token) return

            const response = await fetch(`/api/reports/budget-vs-actual?month=${month}&year=${year}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            })

            if (response.ok) {
                const { budgetVsActual: data } = await response.json()
                setBudgetVsActual(data)
            }
        } catch (error) {
            console.error('Error fetching budget vs actual:', error)
        }
    }

    const fetchNetWorth = async () => {
        try {
            const token = accessTokenRef.current
            if (!token) return

            const response = await fetch(`/api/reports/net-worth?months=${selectedPeriod}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            })

            if (response.ok) {
                const { netWorth } = await response.json()
                setNetWorthData(netWorth)
            }
        } catch (error) {
            console.error('Error fetching net worth:', error)
        }
    }

    const fetchIncomeVsExpenses = async () => {
        try {
            const token = accessTokenRef.current
            if (!token) return

            const response = await fetch(`/api/reports/income-vs-expenses?months=${selectedPeriod}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            })

            if (response.ok) {
                const { incomeVsExpenses: data } = await response.json()
                setIncomeVsExpenses(data)
            }
        } catch (error) {
            console.error('Error fetching income vs expenses:', error)
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {/* Period Selector */}
            <Card>
                <CardHeader>
                    <CardTitle>Reports Period</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center gap-4">
                        <span className="text-sm text-gray-600">Show data for:</span>
                        <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
                            <SelectTrigger className="w-32">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="3">3 months</SelectItem>
                                <SelectItem value="6">6 months</SelectItem>
                                <SelectItem value="12">12 months</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </CardContent>
            </Card>

            {/* Charts Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Spending by Category - Pie Chart */}
                <Card>
                    <CardHeader>
                        <CardTitle>Spending by Category</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ResponsiveContainer width="100%" height={300}>
                            <PieChart>
                                <Pie
                                    data={spendingByCategory}
                                    cx="50%"
                                    cy="50%"
                                    labelLine={false}
                                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                                    outerRadius={80}
                                    fill="#8884d8"
                                    dataKey="value"
                                >
                                    {spendingByCategory.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                    ))}
                                </Pie>
                                <Tooltip formatter={(value: number) => `$${value.toLocaleString()}`} />
                            </PieChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>

                {/* Budget vs Actual - Bar Chart */}
                <Card>
                    <CardHeader>
                        <CardTitle>Budget vs Actual</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ResponsiveContainer width="100%" height={300}>
                            <BarChart data={budgetVsActual}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="name" />
                                <YAxis />
                                <Tooltip formatter={(value: number) => `$${value.toLocaleString()}`} />
                                <Legend />
                                <Bar dataKey="budgeted" fill="#8884d8" name="Budgeted" />
                                <Bar dataKey="actual" fill="#82ca9d" name="Actual" />
                            </BarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>

                {/* Net Worth - Line Chart */}
                <Card>
                    <CardHeader>
                        <CardTitle>Net Worth Over Time</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ResponsiveContainer width="100%" height={300}>
                            <LineChart data={netWorthData}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="month" />
                                <YAxis />
                                <Tooltip formatter={(value: number) => `$${value.toLocaleString()}`} />
                                <Line type="monotone" dataKey="netWorth" stroke="#8884d8" strokeWidth={2} />
                            </LineChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>

                {/* Income vs Expenses - Bar Chart */}
                <Card>
                    <CardHeader>
                        <CardTitle>Income vs Expenses</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ResponsiveContainer width="100%" height={300}>
                            <BarChart data={incomeVsExpenses}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="month" />
                                <YAxis />
                                <Tooltip formatter={(value: number) => `$${value.toLocaleString()}`} />
                                <Legend />
                                <Bar dataKey="income" fill="#82ca9d" name="Income" />
                                <Bar dataKey="expenses" fill="#ff8042" name="Expenses" />
                            </BarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm text-gray-600">Total Spending</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            ${spendingByCategory.reduce((sum, item) => sum + item.value, 0).toLocaleString()}
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm text-gray-600">Average Net Worth</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            ${netWorthData.length > 0
                                ? (netWorthData.reduce((sum, item) => sum + item.netWorth, 0) / netWorthData.length).toLocaleString(undefined, { maximumFractionDigits: 0 })
                                : '0'
                            }
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm text-gray-600">Net Cash Flow</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            ${incomeVsExpenses.length > 0
                                ? incomeVsExpenses.reduce((sum, item) => sum + (item.income - item.expenses), 0).toLocaleString()
                                : '0'
                            }
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
