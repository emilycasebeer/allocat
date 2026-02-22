-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- ============================================================
-- PROFILES (extends auth.users — replaces custom users table)
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    display_name TEXT,
    currency TEXT NOT NULL DEFAULT 'USD',
    first_day_of_week SMALLINT NOT NULL DEFAULT 0 CHECK (first_day_of_week IN (0, 1)), -- 0=Sun, 1=Mon
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Auto-create a profile row whenever a new auth user signs up
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id) VALUES (NEW.id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();


-- ============================================================
-- ACCOUNT TYPES (seeded lookup table, shared across all users)
-- ============================================================
CREATE TABLE IF NOT EXISTS account_types (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL UNIQUE,
    is_liability BOOLEAN NOT NULL DEFAULT false,
    is_budget_account BOOLEAN NOT NULL DEFAULT true, -- true = on-budget, false = tracking only
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO account_types (name, is_liability, is_budget_account) VALUES
    ('Checking',       false, true),
    ('Savings',        false, true),
    ('Cash',           false, true),
    ('Credit Card',    true,  true),
    ('Line of Credit', true,  true),
    ('Mortgage',       true,  false),
    ('Auto Loan',      true,  false),
    ('Student Loan',   true,  false),
    ('Medical Debt',   true,  false),
    ('Investment',     false, false),
    ('Other Asset',    false, false),
    ('Other Liability',true,  false);


-- ============================================================
-- ACCOUNTS
-- ============================================================
CREATE TABLE IF NOT EXISTS accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type_id UUID NOT NULL REFERENCES account_types(id),
    on_budget BOOLEAN,               -- NULL = inherit from account_type.is_budget_account
    is_closed BOOLEAN NOT NULL DEFAULT false,
    note TEXT,
    sort_order INT NOT NULL DEFAULT 0,
    payment_category_id UUID,        -- FK added after categories table; set for credit card/LOC accounts
    -- balance is computed from transactions; do not store here
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);


-- ============================================================
-- CATEGORY GROUPS  (e.g., "Housing", "Transportation")
-- ============================================================
CREATE TABLE IF NOT EXISTS category_groups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    is_hidden BOOLEAN NOT NULL DEFAULT false,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);


-- ============================================================
-- CATEGORIES  (envelopes)
-- ============================================================
CREATE TABLE IF NOT EXISTS categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    group_id UUID NOT NULL REFERENCES category_groups(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    is_hidden BOOLEAN NOT NULL DEFAULT false,
    is_system BOOLEAN NOT NULL DEFAULT false,  -- true for auto-created categories (e.g. credit card payments)
    sort_order INT NOT NULL DEFAULT 0,
    note TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, name, group_id)   -- fixed: was incorrectly group_name
);


-- Deferred FK: accounts.payment_category_id → categories (categories didn't exist when accounts was defined)
ALTER TABLE accounts
    ADD CONSTRAINT fk_accounts_payment_category
    FOREIGN KEY (payment_category_id) REFERENCES categories(id) ON DELETE SET NULL;


-- ============================================================
-- PAYEES
-- ============================================================
CREATE TABLE IF NOT EXISTS payees (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    default_category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    transfer_account_id UUID REFERENCES accounts(id) ON DELETE CASCADE, -- set for transfer payees
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, name)
);


-- ============================================================
-- SCHEDULED TRANSACTIONS  (recurring / future transactions)
-- ============================================================
CREATE TABLE IF NOT EXISTS scheduled_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    payee_id UUID REFERENCES payees(id) ON DELETE SET NULL,
    category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    amount DECIMAL(15,2) NOT NULL,
    memo TEXT,
    flag_color TEXT CHECK (flag_color IN ('red', 'orange', 'yellow', 'green', 'blue', 'purple')),
    frequency TEXT NOT NULL CHECK (frequency IN (
        'once', 'daily', 'weekly', 'every_other_week',
        'twice_a_month', 'every_4_weeks', 'monthly',
        'every_other_month', 'twice_a_year', 'yearly'
    )),
    next_date DATE NOT NULL,
    end_date DATE,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);


-- ============================================================
-- TRANSACTIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    payee_id UUID REFERENCES payees(id) ON DELETE SET NULL,
    category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    scheduled_transaction_id UUID REFERENCES scheduled_transactions(id) ON DELETE SET NULL,
    -- Self-referencing FKs for transfers and splits:
    transfer_transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,  -- paired leg of a transfer
    parent_transaction_id UUID REFERENCES transactions(id) ON DELETE CASCADE,     -- set on subtransactions (splits)
    amount DECIMAL(15,2) NOT NULL,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    memo TEXT,
    type TEXT NOT NULL CHECK (type IN ('income', 'expense', 'transfer')),
    cleared TEXT NOT NULL DEFAULT 'uncleared' CHECK (cleared IN ('uncleared', 'cleared', 'reconciled')),
    approved BOOLEAN NOT NULL DEFAULT true,  -- false for auto-imported transactions pending review
    flag_color TEXT CHECK (flag_color IN ('red', 'orange', 'yellow', 'green', 'blue', 'purple')),
    import_id TEXT,     -- deduplication key for bank imports
    is_split BOOLEAN NOT NULL DEFAULT false,  -- true when this transaction has subtransactions
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    -- Only deduplicate on actual import IDs; NULLs are excluded from uniqueness by default
    UNIQUE(account_id, import_id)
);


-- ============================================================
-- BUDGETS  (one row per user per calendar month)
-- ============================================================
CREATE TABLE IF NOT EXISTS budgets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
    year INTEGER NOT NULL CHECK (year >= 1900),
    -- to_be_budgeted is computed (total assigned income − total allocated); not stored
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, month, year)
);


-- ============================================================
-- CATEGORY ALLOCATIONS  (envelope amounts per category per month)
-- ============================================================
CREATE TABLE IF NOT EXISTS category_allocations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    budget_id UUID NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
    category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    budgeted_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
    -- activity_amount is computed (sum of transactions for this category this month)
    -- available_amount is computed (budgeted + activity + rollover from prior month)
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(budget_id, category_id)
);


-- ============================================================
-- CATEGORY GOALS
-- ============================================================
CREATE TABLE IF NOT EXISTS category_goals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    category_id UUID NOT NULL UNIQUE REFERENCES categories(id) ON DELETE CASCADE,
    goal_type TEXT NOT NULL CHECK (goal_type IN (
        'target_balance',           -- save up to $X
        'target_balance_by_date',   -- save $X by a specific month
        'monthly_savings',          -- add $X every month
        'monthly_spending',         -- plan to spend $X every month (Needed for Spending)
        'debt_payoff'               -- pay off debt by a target date
    )),
    target_amount DECIMAL(15,2),    -- used by target_balance, target_balance_by_date, debt_payoff
    target_date DATE,               -- used by target_balance_by_date, debt_payoff
    monthly_amount DECIMAL(15,2),   -- used by monthly_savings, monthly_spending
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);


-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_accounts_user_id ON accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_category_groups_user_id ON category_groups(user_id);
CREATE INDEX IF NOT EXISTS idx_categories_user_id ON categories(user_id);
CREATE INDEX IF NOT EXISTS idx_categories_group_id ON categories(group_id);
CREATE INDEX IF NOT EXISTS idx_payees_user_id ON payees(user_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_transactions_user_id ON scheduled_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_transactions_next_date ON scheduled_transactions(next_date);
CREATE INDEX IF NOT EXISTS idx_transactions_account_id ON transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_category_id ON transactions(category_id);
CREATE INDEX IF NOT EXISTS idx_transactions_payee_id ON transactions(payee_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_transactions_parent_id ON transactions(parent_transaction_id);
CREATE INDEX IF NOT EXISTS idx_transactions_transfer_id ON transactions(transfer_transaction_id);
CREATE INDEX IF NOT EXISTS idx_budgets_user_id ON budgets(user_id);
CREATE INDEX IF NOT EXISTS idx_budgets_month_year ON budgets(month, year);
CREATE INDEX IF NOT EXISTS idx_category_allocations_budget_id ON category_allocations(budget_id);
CREATE INDEX IF NOT EXISTS idx_category_allocations_category_id ON category_allocations(category_id);


-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE category_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE payees ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduled_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE category_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE category_goals ENABLE ROW LEVEL SECURITY;

-- Profiles
CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);

-- Account types — seeded/shared data, readable by all authenticated users
CREATE POLICY "Account types are publicly readable" ON account_types FOR SELECT USING (true);

-- Accounts
CREATE POLICY "Users can view own accounts" ON accounts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own accounts" ON accounts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own accounts" ON accounts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own accounts" ON accounts FOR DELETE USING (auth.uid() = user_id);

-- Category groups
CREATE POLICY "Users can view own category groups" ON category_groups FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own category groups" ON category_groups FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own category groups" ON category_groups FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own category groups" ON category_groups FOR DELETE USING (auth.uid() = user_id);

-- Categories
CREATE POLICY "Users can view own categories" ON categories FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own categories" ON categories FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own categories" ON categories FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own categories" ON categories FOR DELETE USING (auth.uid() = user_id);

-- Payees
CREATE POLICY "Users can view own payees" ON payees FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own payees" ON payees FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own payees" ON payees FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own payees" ON payees FOR DELETE USING (auth.uid() = user_id);

-- Scheduled transactions
CREATE POLICY "Users can view own scheduled transactions" ON scheduled_transactions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own scheduled transactions" ON scheduled_transactions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own scheduled transactions" ON scheduled_transactions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own scheduled transactions" ON scheduled_transactions FOR DELETE USING (auth.uid() = user_id);

-- Transactions (ownership resolved through account)
CREATE POLICY "Users can view own transactions" ON transactions FOR SELECT USING (
    EXISTS (SELECT 1 FROM accounts WHERE accounts.id = transactions.account_id AND accounts.user_id = auth.uid())
);
CREATE POLICY "Users can insert own transactions" ON transactions FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM accounts WHERE accounts.id = transactions.account_id AND accounts.user_id = auth.uid())
);
CREATE POLICY "Users can update own transactions" ON transactions FOR UPDATE USING (
    EXISTS (SELECT 1 FROM accounts WHERE accounts.id = transactions.account_id AND accounts.user_id = auth.uid())
);
CREATE POLICY "Users can delete own transactions" ON transactions FOR DELETE USING (
    EXISTS (SELECT 1 FROM accounts WHERE accounts.id = transactions.account_id AND accounts.user_id = auth.uid())
);

-- Budgets
CREATE POLICY "Users can view own budgets" ON budgets FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own budgets" ON budgets FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own budgets" ON budgets FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own budgets" ON budgets FOR DELETE USING (auth.uid() = user_id);

-- Category allocations (ownership resolved through budget)
CREATE POLICY "Users can view own category allocations" ON category_allocations FOR SELECT USING (
    EXISTS (SELECT 1 FROM budgets WHERE budgets.id = category_allocations.budget_id AND budgets.user_id = auth.uid())
);
CREATE POLICY "Users can insert own category allocations" ON category_allocations FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM budgets WHERE budgets.id = category_allocations.budget_id AND budgets.user_id = auth.uid())
);
CREATE POLICY "Users can update own category allocations" ON category_allocations FOR UPDATE USING (
    EXISTS (SELECT 1 FROM budgets WHERE budgets.id = category_allocations.budget_id AND budgets.user_id = auth.uid())
);
CREATE POLICY "Users can delete own category allocations" ON category_allocations FOR DELETE USING (
    EXISTS (SELECT 1 FROM budgets WHERE budgets.id = category_allocations.budget_id AND budgets.user_id = auth.uid())
);

-- Category goals (ownership resolved through category)
CREATE POLICY "Users can view own category goals" ON category_goals FOR SELECT USING (
    EXISTS (SELECT 1 FROM categories WHERE categories.id = category_goals.category_id AND categories.user_id = auth.uid())
);
CREATE POLICY "Users can insert own category goals" ON category_goals FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM categories WHERE categories.id = category_goals.category_id AND categories.user_id = auth.uid())
);
CREATE POLICY "Users can update own category goals" ON category_goals FOR UPDATE USING (
    EXISTS (SELECT 1 FROM categories WHERE categories.id = category_goals.category_id AND categories.user_id = auth.uid())
);
CREATE POLICY "Users can delete own category goals" ON category_goals FOR DELETE USING (
    EXISTS (SELECT 1 FROM categories WHERE categories.id = category_goals.category_id AND categories.user_id = auth.uid())
);


-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_updated_at              BEFORE UPDATE ON profiles              FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_account_types_updated_at         BEFORE UPDATE ON account_types         FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_accounts_updated_at              BEFORE UPDATE ON accounts              FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_category_groups_updated_at       BEFORE UPDATE ON category_groups       FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_categories_updated_at            BEFORE UPDATE ON categories            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_payees_updated_at                BEFORE UPDATE ON payees                FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_scheduled_transactions_updated_at BEFORE UPDATE ON scheduled_transactions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_transactions_updated_at          BEFORE UPDATE ON transactions          FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_budgets_updated_at               BEFORE UPDATE ON budgets               FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_category_allocations_updated_at  BEFORE UPDATE ON category_allocations  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_category_goals_updated_at        BEFORE UPDATE ON category_goals        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
