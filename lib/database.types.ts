export type Json =
    | string
    | number
    | boolean
    | null
    | { [key: string]: Json | undefined }
    | Json[]

export interface Database {
    public: {
        Tables: {
            profiles: {
                Row: {
                    id: string
                    display_name: string | null
                    currency: string
                    first_day_of_week: number
                    created_at: string
                    updated_at: string
                }
                Insert: {
                    id: string
                    display_name?: string | null
                    currency?: string
                    first_day_of_week?: number
                    created_at?: string
                    updated_at?: string
                }
                Update: {
                    id?: string
                    display_name?: string | null
                    currency?: string
                    first_day_of_week?: number
                    created_at?: string
                    updated_at?: string
                }
            }
            account_types: {
                Row: {
                    id: string
                    name: string
                    is_liability: boolean
                    is_budget_account: boolean
                    created_at: string
                    updated_at: string
                }
                Insert: {
                    id?: string
                    name: string
                    is_liability: boolean
                    is_budget_account: boolean
                    created_at?: string
                    updated_at?: string
                }
                Update: {
                    id?: string
                    name?: string
                    is_liability?: boolean
                    is_budget_account?: boolean
                    created_at?: string
                    updated_at?: string
                }
            }
            accounts: {
                Row: {
                    id: string
                    user_id: string
                    name: string
                    type_id: string
                    on_budget: boolean | null
                    is_closed: boolean
                    note: string | null
                    sort_order: number
                    payment_category_id: string | null
                    created_at: string
                    updated_at: string
                }
                Insert: {
                    id?: string
                    user_id: string
                    name: string
                    type_id: string
                    on_budget?: boolean | null
                    is_closed?: boolean
                    note?: string | null
                    sort_order?: number
                    payment_category_id?: string | null
                    created_at?: string
                    updated_at?: string
                }
                Update: {
                    id?: string
                    user_id?: string
                    name?: string
                    type_id?: string
                    on_budget?: boolean | null
                    is_closed?: boolean
                    note?: string | null
                    sort_order?: number
                    payment_category_id?: string | null
                    created_at?: string
                    updated_at?: string
                }
            }
            category_groups: {
                Row: {
                    id: string
                    user_id: string
                    name: string
                    is_hidden: boolean
                    sort_order: number
                    created_at: string
                    updated_at: string
                }
                Insert: {
                    id?: string
                    user_id: string
                    name: string
                    is_hidden?: boolean
                    sort_order?: number
                    created_at?: string
                    updated_at?: string
                }
                Update: {
                    id?: string
                    user_id?: string
                    name?: string
                    is_hidden?: boolean
                    sort_order?: number
                    created_at?: string
                    updated_at?: string
                }
            }
            categories: {
                Row: {
                    id: string
                    user_id: string
                    group_id: string
                    name: string
                    is_hidden: boolean
                    is_system: boolean
                    sort_order: number
                    note: string | null
                    created_at: string
                    updated_at: string
                }
                Insert: {
                    id?: string
                    user_id: string
                    group_id: string
                    name: string
                    is_hidden?: boolean
                    is_system?: boolean
                    sort_order?: number
                    note?: string | null
                    created_at?: string
                    updated_at?: string
                }
                Update: {
                    id?: string
                    user_id?: string
                    group_id?: string
                    name?: string
                    is_hidden?: boolean
                    is_system?: boolean
                    sort_order?: number
                    note?: string | null
                    created_at?: string
                    updated_at?: string
                }
            }
            budgets: {
                Row: {
                    id: string
                    user_id: string
                    month: number
                    year: number
                    created_at: string
                    updated_at: string
                }
                Insert: {
                    id?: string
                    user_id: string
                    month: number
                    year: number
                    created_at?: string
                    updated_at?: string
                }
                Update: {
                    id?: string
                    user_id?: string
                    month?: number
                    year?: number
                    created_at?: string
                    updated_at?: string
                }
            }
            category_allocations: {
                Row: {
                    id: string
                    budget_id: string
                    category_id: string
                    budgeted_amount: number
                    created_at: string
                    updated_at: string
                }
                Insert: {
                    id?: string
                    budget_id: string
                    category_id: string
                    budgeted_amount?: number
                    created_at?: string
                    updated_at?: string
                }
                Update: {
                    id?: string
                    budget_id?: string
                    category_id?: string
                    budgeted_amount?: number
                    created_at?: string
                    updated_at?: string
                }
            }
            transactions: {
                Row: {
                    id: string
                    account_id: string
                    payee_id: string | null
                    category_id: string | null
                    scheduled_transaction_id: string | null
                    transfer_transaction_id: string | null
                    parent_transaction_id: string | null
                    amount: number
                    date: string
                    memo: string | null
                    type: 'income' | 'expense' | 'transfer'
                    cleared: 'uncleared' | 'cleared' | 'reconciled'
                    approved: boolean
                    flag_color: 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple' | null
                    import_id: string | null
                    is_split: boolean
                    created_at: string
                    updated_at: string
                }
                Insert: {
                    id?: string
                    account_id: string
                    payee_id?: string | null
                    category_id?: string | null
                    scheduled_transaction_id?: string | null
                    transfer_transaction_id?: string | null
                    parent_transaction_id?: string | null
                    amount: number
                    date: string
                    memo?: string | null
                    type: 'income' | 'expense' | 'transfer'
                    cleared?: 'uncleared' | 'cleared' | 'reconciled'
                    approved?: boolean
                    flag_color?: 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple' | null
                    import_id?: string | null
                    is_split?: boolean
                    created_at?: string
                    updated_at?: string
                }
                Update: {
                    id?: string
                    account_id?: string
                    payee_id?: string | null
                    category_id?: string | null
                    scheduled_transaction_id?: string | null
                    transfer_transaction_id?: string | null
                    parent_transaction_id?: string | null
                    amount?: number
                    date?: string
                    memo?: string | null
                    type?: 'income' | 'expense' | 'transfer'
                    cleared?: 'uncleared' | 'cleared' | 'reconciled'
                    approved?: boolean
                    flag_color?: 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple' | null
                    import_id?: string | null
                    is_split?: boolean
                    created_at?: string
                    updated_at?: string
                }
            }
            payees: {
                Row: {
                    id: string
                    user_id: string
                    name: string
                    default_category_id: string | null
                    transfer_account_id: string | null
                    created_at: string
                    updated_at: string
                }
                Insert: {
                    id?: string
                    user_id: string
                    name: string
                    default_category_id?: string | null
                    transfer_account_id?: string | null
                    created_at?: string
                    updated_at?: string
                }
                Update: {
                    id?: string
                    user_id?: string
                    name?: string
                    default_category_id?: string | null
                    transfer_account_id?: string | null
                    created_at?: string
                    updated_at?: string
                }
            }
            scheduled_transactions: {
                Row: {
                    id: string
                    user_id: string
                    account_id: string
                    payee_id: string | null
                    category_id: string | null
                    amount: number
                    memo: string | null
                    flag_color: 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple' | null
                    frequency: 'once' | 'daily' | 'weekly' | 'every_other_week' | 'twice_a_month' | 'every_4_weeks' | 'monthly' | 'every_other_month' | 'twice_a_year' | 'yearly'
                    next_date: string
                    end_date: string | null
                    created_at: string
                    updated_at: string
                }
                Insert: {
                    id?: string
                    user_id: string
                    account_id: string
                    payee_id?: string | null
                    category_id?: string | null
                    amount: number
                    memo?: string | null
                    flag_color?: 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple' | null
                    frequency: 'once' | 'daily' | 'weekly' | 'every_other_week' | 'twice_a_month' | 'every_4_weeks' | 'monthly' | 'every_other_month' | 'twice_a_year' | 'yearly'
                    next_date: string
                    end_date?: string | null
                    created_at?: string
                    updated_at?: string
                }
                Update: {
                    id?: string
                    user_id?: string
                    account_id?: string
                    payee_id?: string | null
                    category_id?: string | null
                    amount?: number
                    memo?: string | null
                    flag_color?: 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple' | null
                    frequency?: 'once' | 'daily' | 'weekly' | 'every_other_week' | 'twice_a_month' | 'every_4_weeks' | 'monthly' | 'every_other_month' | 'twice_a_year' | 'yearly'
                    next_date?: string
                    end_date?: string | null
                    created_at?: string
                    updated_at?: string
                }
            }
            category_goals: {
                Row: {
                    id: string
                    category_id: string
                    goal_type: 'target_balance' | 'target_balance_by_date' | 'monthly_savings' | 'monthly_spending' | 'debt_payoff'
                    target_amount: number | null
                    target_date: string | null
                    monthly_amount: number | null
                    created_at: string
                    updated_at: string
                }
                Insert: {
                    id?: string
                    category_id: string
                    goal_type: 'target_balance' | 'target_balance_by_date' | 'monthly_savings' | 'monthly_spending' | 'debt_payoff'
                    target_amount?: number | null
                    target_date?: string | null
                    monthly_amount?: number | null
                    created_at?: string
                    updated_at?: string
                }
                Update: {
                    id?: string
                    category_id?: string
                    goal_type?: 'target_balance' | 'target_balance_by_date' | 'monthly_savings' | 'monthly_spending' | 'debt_payoff'
                    target_amount?: number | null
                    target_date?: string | null
                    monthly_amount?: number | null
                    created_at?: string
                    updated_at?: string
                }
            }
        }
        Views: {
            [_ in never]: never
        }
        Functions: {
            [_ in never]: never
        }
        Enums: {
            [_ in never]: never
        }
    }
}
