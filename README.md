# Allocat

A YNAB-style envelope budgeting app built with Next.js, TypeScript, and Supabase.

## Stack

- **Framework**: Next.js 16 (App Router) + React 19
- **Language**: TypeScript
- **Database / Auth**: Supabase (PostgreSQL + Row Level Security)
- **Styling**: Tailwind CSS — "Midnight Ledger" dark theme by default
- **UI Components**: shadcn/ui + Radix UI primitives
- **Icons**: Lucide React
- **Charts**: Recharts
- **Math**: Decimal.js (all money calculations)
- **Date utilities**: date-fns

## Features

- **Envelope budgeting** — allocate income to categories each month; unused balances roll forward
- **To Be Budgeted (TBB)** — all-time income minus all-time allocations; overspending adjusts TBB automatically
- **Credit card handling** — CC payment categories auto-created per card; CC activity tracked separately from cash spending
- **Split transactions** — one transaction split across multiple categories
- **Transfer transactions** — two-legged transfers between accounts with linked IDs
- **Scheduled transactions** — recurring entries that can be entered on demand
- **Category goals** — target amount, target date, and monthly contribution goal types
- **Move Money** — quickly move allocations between categories in the same month
- **Reconciliation** — reconcile account balances against bank statements
- **Reports** — spending by category, income vs. expenses, budget vs. actual, net worth, age of money
- **Payee management** — track and rename payees across transactions
- **Setup wizard** — guided onboarding flow for new users (accounts + categories)
- **Dark / light theme** — toggleable; preference persisted to localStorage

## Getting Started

### Prerequisites

- Node.js 18+
- A Supabase project (free tier works)

### Installation

```bash
git clone <repository-url>
cd allocat
npm install
```

### Environment variables

```bash
cp env.example .env.local
```

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
```

### Database setup

Apply the migration to your Supabase project:

```bash
# Via Supabase CLI (local)
supabase start
supabase db reset

# Or apply directly
psql -h localhost -U postgres -d postgres -f supabase/migrations/001_initial_schema.sql
```

### Run

```bash
npm run dev       # http://localhost:3000
npm run build
npm run start
npm run lint
```

## Project Structure

```
app/
├── layout.tsx                          # Root layout — fonts (Syne, DM Sans, DM Mono), theme init script
├── page.tsx                            # Root: loading → LoginPage → Dashboard
├── globals.css                         # CSS variables (Midnight Ledger theme), Tailwind base
├── providers.tsx                       # Supabase client, auth context, theme toggle
├── auth/
│   └── login-page.tsx                  # Email/password sign-up and sign-in
├── dashboard/
│   ├── dashboard.tsx                   # Shell: wizard gate, account/category state, view routing
│   ├── sidebar.tsx                     # Account list + navigation
│   ├── top-nav.tsx                     # Month navigator, TBB display, user menu
│   ├── budget-view.tsx                 # Budget table with inline allocation editing, goals, move money
│   ├── transactions-view.tsx           # Transaction list with account-keyed cache
│   ├── scheduled-transactions-view.tsx # Scheduled transaction list and entry
│   ├── reports-view.tsx                # Spending, income/expense, budget vs actual, net worth, age of money charts
│   ├── setup-wizard.tsx                # New-user onboarding wizard (accounts → categories → done)
│   ├── add-account-modal.tsx           # Create / edit account
│   ├── add-transaction-modal.tsx       # Create / edit transaction (expense, income, transfer, split)
│   ├── add-category-modal.tsx          # Create category
│   ├── add-scheduled-transaction-modal.tsx
│   ├── move-money-modal.tsx            # Move allocation between categories
│   ├── move-money-popover.tsx          # Inline move-money popover from budget table
│   ├── set-goal-modal.tsx              # Set / edit category goal
│   ├── reconcile-modal.tsx             # Account reconciliation flow
│   ├── manage-payees-modal.tsx         # Rename / delete payees
│   ├── settings-modal.tsx              # App settings (theme, etc.)
│   └── payee-combobox.tsx              # Autocomplete payee picker
└── api/
    ├── accounts/
    │   ├── route.ts                    # GET list, POST create (auto-creates CC payment category)
    │   └── [id]/
    │       ├── route.ts                # GET, PATCH, DELETE
    │       └── reconcile/route.ts      # POST reconcile
    ├── budgets/
    │   ├── route.ts                    # GET summary, POST create month
    │   ├── allocate/route.ts           # POST update allocation
    │   └── copy/route.ts               # POST copy allocations from previous month
    ├── categories/
    │   ├── route.ts                    # GET flat+grouped, POST create (backfills allocations)
    │   └── [id]/route.ts               # PATCH, DELETE
    ├── category-groups/
    │   └── route.ts                    # GET, POST
    ├── category-goals/
    │   ├── route.ts                    # GET, POST
    │   └── [id]/route.ts               # PATCH, DELETE
    ├── payees/
    │   ├── route.ts                    # GET, POST
    │   └── [id]/route.ts               # PATCH, DELETE
    ├── transactions/
    │   ├── route.ts                    # GET (filterable), POST (handles splits + transfers)
    │   └── [id]/route.ts               # PATCH, DELETE
    ├── scheduled-transactions/
    │   ├── route.ts                    # GET, POST
    │   ├── [id]/route.ts               # PATCH, DELETE
    │   └── [id]/enter/route.ts         # POST enter scheduled transaction
    └── reports/
        ├── spending/route.ts
        ├── income-vs-expenses/route.ts
        ├── budget-vs-actual/route.ts
        ├── net-worth/route.ts
        └── age-of-money/route.ts

lib/
├── budgeting.ts        # BudgetingEngine class — getBudgetSummary (6 queries, parallel rounds)
├── auth.ts             # requireAuth() — validates Bearer token, returns user
├── supabase.ts         # createAuthenticatedSupabaseClient()
└── database.types.ts   # Generated Supabase types

components/ui/          # shadcn/ui components (button, input, card, dialog, select, …)

supabase/
└── migrations/
    └── 001_initial_schema.sql   # Full schema: tables, RLS policies, indexes, triggers
```

## Database Schema (key tables)

```
account_types          — Checking, Savings, Credit Card, etc. (is_liability, is_budget_account)
accounts               — user accounts; payment_category_id links CC accounts to their payment category
category_groups        — groups with sort_order (Credit Card Payments group gets sort_order=9999)
categories             — individual categories; is_system=true for auto-created CC payment categories
budgets                — one row per user per month/year
category_allocations   — budgeted_amount per category per budget month
transactions           — amount, type (income/expense/transfer), cleared status; split via parent_transaction_id
payees
scheduled_transactions
category_goals         — goal_type, target_amount, target_date, monthly_amount
```

## Architecture Notes

### Authentication
All API routes call `requireAuth(request)` which validates the `Authorization: Bearer <token>` header via Supabase. The Supabase client is created per-request with the user's access token so RLS policies apply automatically.

### Budget engine (`lib/budgeting.ts`)
`BudgetingEngine.getBudgetSummary()` runs in two parallel rounds (6 total queries):
1. Round 1: accounts + all budgets
2. Round 2: current allocations, all historical allocations, 24-month transactions, all-time TBB income

All per-category math (activity, available, CC activity, TBB) runs in JS from pre-fetched maps — no per-category DB queries.

`available = prior_month_available + budgeted_this_month + activity_this_month`
- Cash overspending: negative available carries to TBB next month
- CC overspending: negative available carries forward on the card (does not hit TBB)

### Credit card accounts
When a `Credit Card` or `Line of Credit` account is created, the API automatically:
1. Creates (or finds) a `"Credit Card Payments"` category group (`sort_order: 9999`)
2. Creates a `"<AccountName> Payment"` category (`is_system: true`)
3. Links it to the account via `payment_category_id`
4. Backfills `$0` allocations for all existing budget months

### Transfers
Two-legged: each leg is a separate transaction row with `transfer_transaction_id` pointing to the other. Deleting one leg sets the other's FK to `NULL` (`ON DELETE SET NULL`) — the paired leg must be explicitly deleted.

### Split transactions
Children share `parent_transaction_id` → `ON DELETE CASCADE`. The parent has `is_split=true`. Splits are replaced atomically: delete all children, insert new ones.

### Performance (frontend)
- `TransactionsView` is always-mounted in a hidden div (static import) so its account-keyed cache survives view switches
- Optimistic deletes with rollback; add/edit does background refresh (no spinner)
- Auth and wizard state resolved from localStorage before first paint (`useLayoutEffect`) to avoid flash
- Budget + transaction lists use animate-pulse skeletons instead of spinners

## Deployment

```bash
npm run build
npm run start
```

Environment variables required in production:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Recommended platform: Vercel (zero-config Next.js deployment).
