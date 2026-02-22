# Allocat - YNAB-Style Budgeting App Backend

A comprehensive backend for a YNAB-style budgeting application built with Next.js 15, TypeScript, and Supabase. This backend enforces proper budgeting logic and provides a robust API for managing personal finances.

## Features

### 🔐 Authentication & Security
- **Supabase Auth Integration**: Secure email/password authentication
- **Row Level Security (RLS)**: Users can only access their own data
- **JWT Token Validation**: Secure API endpoints with bearer token authentication

### 💰 Core Budgeting Logic
- **To Be Budgeted (TBB) Management**: Income increases TBB, allocations decrease it
- **Category Available Calculation**: `available = last_month_available + budgeted - activity`
- **Overspending Handling**: 
  - Cash overspending reduces next month's TBB
  - Credit overspending increases credit account balance
- **Balance Rollover**: Positive available balances roll forward into next month
- **Negative TBB Prevention**: System prevents allocating more than available

### 🏦 Financial Management
- **Multi-Account Support**: Checking, savings, credit, investment, and cash accounts
- **Category Groups**: Organize categories into logical groups
- **Transaction Types**: Income, expense, and transfer transactions
- **Scheduled Transactions**: Support for recurring transactions

### 📊 Reporting & Analytics
- **Spending Reports**: Analyze spending by category, month, or account
- **Net Worth Tracking**: Monitor assets, liabilities, and net worth over time
- **Cash Flow Analysis**: Track income vs. expenses over time periods

## Architecture

### Database Schema
```
users (id, email, created_at, updated_at)
├── accounts (id, user_id, name, type, balance, created_at, updated_at)
├── categories (id, user_id, name, group_name, created_at, updated_at)
├── budgets (id, user_id, month, year, to_be_budgeted, created_at, updated_at)
│   └── category_allocations (id, budget_id, category_id, budgeted_amount, available_amount, activity_amount, created_at, updated_at)
└── transactions (id, account_id, category_id, amount, date, description, type, is_scheduled, created_at, updated_at)
```

### API Endpoints

#### Accounts
- `GET /api/accounts` - List user accounts
- `POST /api/accounts` - Create new account
- `PUT /api/accounts/[id]` - Update account
- `DELETE /api/accounts/[id]` - Delete account

#### Categories
- `GET /api/categories` - List user categories (grouped)
- `POST /api/categories` - Create new category

#### Budgets
- `GET /api/budgets?month=X&year=Y` - Get monthly budget summary
- `POST /api/budgets` - Create new monthly budget
- `POST /api/budgets/allocate` - Allocate funds to categories

#### Transactions
- `GET /api/transactions` - List transactions with filtering
- `POST /api/transactions` - Create new transaction

#### Reports
- `GET /api/reports/spending` - Spending analysis reports
- `GET /api/reports/net-worth` - Net worth tracking

## Technology Stack

- **Framework**: Next.js 15 (App Router)
- **Language**: TypeScript
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth
- **API**: Next.js API Routes
- **Validation**: Zod
- **Math**: Decimal.js (for precise financial calculations)

## Getting Started

### Prerequisites
- Node.js 18+ 
- npm or yarn
- Supabase account and project

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd allocat
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp env.example .env.local
   ```
   
   Fill in your Supabase credentials:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
   SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
   ```

4. **Set up Supabase database**
   ```bash
   # Install Supabase CLI
   npm install -g supabase
   
   # Start local Supabase
   supabase start
   
   # Apply migrations
   npm run db:push
   
   # Generate types
   npm run db:generate
   ```

5. **Run the development server**
   ```bash
   npm run dev
   ```

### Database Setup

The application includes a comprehensive database migration that sets up:

- All necessary tables with proper relationships
- Row Level Security policies
- Indexes for optimal performance
- Triggers for automatic timestamp updates
- Check constraints for data integrity

To apply the migration:

```bash
# Using Supabase CLI
supabase db reset

# Or manually apply the migration file
psql -h localhost -U postgres -d postgres -f supabase/migrations/001_initial_schema.sql
```

## Usage Examples

### Creating a Budget

```typescript
// Create a new monthly budget
const response = await fetch('/api/budgets', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    month: 12,
    year: 2024,
    to_be_budgeted: 5000
  })
});
```

### Allocating Funds

```typescript
// Allocate $500 to groceries category
const response = await fetch('/api/budgets/allocate', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    budget_id: 'budget-uuid',
    category_id: 'category-uuid',
    amount: 500
  })
});
```

### Recording a Transaction

```typescript
// Record a grocery expense
const response = await fetch('/api/transactions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    account_id: 'account-uuid',
    category_id: 'category-uuid',
    amount: -75.50,
    date: '2024-12-15',
    description: 'Grocery shopping',
    type: 'expense'
  })
});
```

## Budgeting Rules

### YNAB-Style Methodology

1. **Give Every Dollar a Job**: All income must be allocated to categories
2. **Embrace Your True Expenses**: Plan for irregular expenses
3. **Roll With the Punches**: Adjust categories as needed
4. **Age Your Money**: Build buffer between income and expenses

### System Enforcement

- **TBB Validation**: Cannot allocate more than available in TBB
- **Automatic Calculations**: Category available amounts update automatically
- **Overspending Handling**: Different rules for cash vs. credit overspending
- **Balance Rollover**: Positive balances carry forward to next month

## Security Features

- **Row Level Security**: Database-level access control
- **JWT Authentication**: Secure API access
- **User Isolation**: Complete data separation between users
- **Input Validation**: Comprehensive request validation
- **SQL Injection Protection**: Parameterized queries

## Performance Considerations

- **Database Indexes**: Optimized for common query patterns
- **Efficient Joins**: Minimal database round trips
- **Connection Pooling**: Supabase handles connection management
- **Caching Strategy**: Client-side caching for frequently accessed data

## Development

### Available Scripts

```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run start        # Start production server
npm run lint         # Run ESLint
npm run db:generate  # Generate TypeScript types from database
npm run db:push      # Push database changes
npm run db:reset     # Reset database
```

### Code Structure

```
├── app/
│   └── api/                 # API routes
│       ├── accounts/        # Account management
│       ├── budgets/         # Budget operations
│       ├── categories/      # Category management
│       ├── transactions/    # Transaction operations
│       └── reports/         # Financial reports
├── lib/
│   ├── auth.ts             # Authentication utilities
│   ├── budgeting.ts        # Core budgeting logic
│   ├── supabase.ts         # Supabase client configuration
│   └── database.types.ts   # Generated database types
├── supabase/
│   └── migrations/         # Database migrations
└── types/                  # TypeScript type definitions
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is licensed under the MIT License.

## Support

For questions or issues, please open an issue on GitHub or contact the development team.

---

**Note**: This is a backend-only implementation. You'll need to build a frontend application to interact with these APIs and provide a user interface for the budgeting functionality.
