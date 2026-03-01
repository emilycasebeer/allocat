# Allocat — Claude Code Instructions

## Stack
- Next.js 16 App Router + React 19 + TypeScript
- Supabase (PostgreSQL + Auth + RLS)
- Tailwind CSS + shadcn/ui + Radix UI
- Decimal.js for all money math — never use plain JS arithmetic on currency
- Recharts for report charts
- date-fns for date formatting

## Key conventions

### Auth
Every API route must call `requireAuth(request)` from `lib/auth.ts` and create the Supabase client with the user's token via `createAuthenticatedSupabaseClient(user.accessToken)`. This ensures RLS policies apply. Do not use the service role client for user data reads.

### Money math
Always use `Decimal.js`. Never `a + b` or `parseFloat` arithmetic on amounts. Use `.toNumber()` only when storing in state or returning JSON.

### API routes
Return `NextResponse.json({ error: message }, { status })` for errors. The `createErrorResponse` helper is defined locally in each route file. Catch `error instanceof Error && error.message === 'Unauthorized'` to return 401; all other errors return 500.

### Frontend data fetching
Components fetch via `fetch('/api/...')` with `Authorization: Bearer ${accessToken}`. The access token comes from `useAuth()` in `providers.tsx`. Stable callbacks should store it in a `useRef` so async closures always read the current value without re-creating functions.

### No spinners — skeletons + optimistic updates
- Auth and wizard state: resolved from `localStorage` via `useLayoutEffect` before first paint
- Lists: animate-pulse skeleton placeholders, not loading spinners
- Transaction mutations: optimistic delete with rollback; add/edit triggers background refresh
- Balance updates: use `onBalanceDelta` (delta-based) not a full `fetchAccounts` round-trip

### Theme
CSS variables defined in `app/globals.css` ("Midnight Ledger" dark theme is the default). Colors use `hsl(var(--...))` — always use semantic tokens (`text-foreground`, `bg-card`, `text-muted-foreground`, `text-destructive`) not raw Tailwind color classes (`text-gray-400`, `text-red-600`). Dark mode is toggled via a class on `<html>`, not `prefers-color-scheme`.

### Fonts
- `font-display` (Syne) — brand name, headings
- `font-sans` (DM Sans) — body text (default)
- `font-mono` (DM Mono) — numbers, code

### Brand mark
Cat emoji (🐱) in a `h-8 w-8 rounded-lg bg-primary/15 border border-primary/25` container + `font-display` text `allo<span class="text-primary">cat</span>`. Match this pattern everywhere the brand appears.

## Project layout

```
app/api/          — API routes (one file per resource, [id] subdirs for item routes)
app/auth/         — Login/signup page
app/dashboard/    — All dashboard UI components
lib/
  budgeting.ts    — BudgetingEngine.getBudgetSummary() — the core budget calculation
  auth.ts         — requireAuth()
  supabase.ts     — createAuthenticatedSupabaseClient()
supabase/migrations/001_initial_schema.sql  — single migration, source of truth for schema
```

## Budget engine
`BudgetingEngine.getBudgetSummary(month, year)` does all budget math. It runs 6 DB queries in 2 parallel rounds; all per-category computation is pure JS. Do not add per-category DB queries inside loops. If you need new data, add it to an existing bulk query or add a 3rd parallel round.

`available = prior_month_available + budgeted + activity`
- Cash overspending: carried to TBB (reduces next-month TBB)
- CC overspending: carried forward on the CC category (does not hit TBB)

## Credit card accounts
Creating a `Credit Card` or `Line of Credit` account auto-creates:
1. `"Credit Card Payments"` category group (`sort_order: 9999`)
2. `"<Name> Payment"` category (`is_system: true`)
3. Backfills `$0` allocations across all existing budget months

The `payment_category_id` column on `accounts` links the account to its payment category.

## Transfer transactions
Two rows, each with `transfer_transaction_id` pointing to the other. `ON DELETE SET NULL` — deleting one leg must be followed by an explicit delete of the other leg.

## Split transactions
`parent_transaction_id` with `ON DELETE CASCADE` (children auto-delete). `is_split: true` on the parent. To update splits: delete all children, insert new ones. Send `splits: []` when switching a split back to a regular transaction.

## category_groups.sort_order
Default `0` for user groups. `9999` for the auto-created "Credit Card Payments" group. `getBudgetSummary` sorts categories by this value so CC payments appear at the bottom of the budget.
