# Allocat Frontend - React (Next.js) YNAB-Style Budgeting App

A modern, responsive React frontend for the Allocat budgeting application, built with Next.js 15, TypeScript, Tailwind CSS, and shadcn/ui components.

## 🎯 Features

### 🔐 Authentication
- **Supabase Auth Integration**: Secure email/password authentication
- **Protected Routes**: Automatic redirect to login for unauthenticated users
- **Session Management**: Persistent authentication state

### 🏠 Dashboard Layout
- **Left Sidebar**: Account list with balances and account types
- **Main Content Area**: Switches between Budget and Transactions views
- **Top Navigation**: App title and user profile menu with logout

### 💰 Budget View
- **To Be Budgeted Display**: Large, highlighted TBB amount at the top
- **Category Table**: Organized by groups with inline editing
- **Real-time Updates**: Automatic calculation of available amounts
- **Visual Indicators**: Color-coded available amounts (green/positive, yellow/zero, red/negative)

### 💳 Transactions View
- **Account-specific Transactions**: Each account shows its own transaction history
- **Transaction Management**: Add new transactions with category assignment
- **Transaction Types**: Income, expense, and transfer support
- **Category Assignment**: Optional category assignment for better organization

### 🎨 Design & UX
- **YNAB-Inspired Layout**: Clean, spreadsheet-like budget table
- **Responsive Design**: Works seamlessly on desktop and mobile
- **Modern UI Components**: Built with shadcn/ui and Radix UI primitives
- **Tailwind CSS**: Utility-first styling with custom design system

## 🛠️ Technology Stack

- **Framework**: Next.js 15 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **UI Components**: shadcn/ui + Radix UI
- **Authentication**: Supabase Auth
- **State Management**: React Context + Hooks
- **Icons**: Lucide React

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ 
- npm or yarn
- Backend API running (see main README.md)

### Installation

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Set up environment variables**
   ```bash
   cp env.example .env.local
   ```
   
   Fill in your Supabase credentials:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

3. **Run the development server**
   ```bash
   npm run dev
   ```

4. **Open your browser**
   Navigate to [http://localhost:3000](http://localhost:3000)

## 📱 Usage Guide

### First Time Setup
1. **Sign Up**: Create a new account with email/password
2. **Add Accounts**: Create your first financial accounts (checking, savings, etc.)
3. **Create Categories**: Set up budget categories organized by groups
4. **Create Budget**: Initialize your first monthly budget

### Daily Budgeting
1. **View Budget**: Switch to Budget view to see your monthly plan
2. **Allocate Funds**: Click on budgeted amounts to edit allocations
3. **Track Spending**: Record transactions in the Transactions view
4. **Monitor Progress**: Watch available amounts update in real-time

### Managing Transactions
1. **Select Account**: Click on an account in the sidebar
2. **Add Transaction**: Use the "Add Transaction" button
3. **Categorize**: Assign categories to transactions for better tracking
4. **View History**: Browse transaction history with filtering options

## 🎨 Component Architecture

```
app/
├── layout.tsx              # Root layout with providers
├── page.tsx                # Main page with auth routing
├── providers.tsx           # Supabase client and auth context
├── globals.css             # Global styles and Tailwind setup
├── auth/
│   └── login-page.tsx      # Authentication page
└── dashboard/
    ├── dashboard.tsx       # Main dashboard component
    ├── top-nav.tsx         # Top navigation bar
    ├── sidebar.tsx         # Left sidebar with accounts
    ├── budget-view.tsx     # Budget table and TBB display
    ├── transactions-view.tsx # Transaction list and management
    ├── add-account-modal.tsx    # Account creation modal
    ├── add-category-modal.tsx   # Category creation modal
    └── add-transaction-modal.tsx # Transaction creation modal

components/ui/               # shadcn/ui components
├── button.tsx
├── input.tsx
├── card.tsx
├── tabs.tsx
├── label.tsx
├── alert.tsx
├── avatar.tsx
├── dropdown-menu.tsx
├── select.tsx
└── dialog.tsx
```

## 🔧 Key Components

### Dashboard Component
- Manages overall application state
- Handles view switching (Budget vs Transactions)
- Coordinates data fetching and updates

### Budget View
- Displays "To Be Budgeted" prominently
- Shows categorized budget table with inline editing
- Calculates and displays available amounts
- Groups categories by logical groups

### Transactions View
- Account-specific transaction lists
- Transaction creation and management
- Category assignment and filtering

### Authentication System
- Supabase JWT token management
- Protected route handling
- User session persistence

## 🎯 Design Principles

### YNAB Methodology
- **Give Every Dollar a Job**: All income must be allocated
- **Embrace Your True Expenses**: Plan for irregular costs
- **Roll With the Punches**: Flexible category adjustments
- **Age Your Money**: Build buffer between income and expenses

### User Experience
- **Intuitive Navigation**: Clear visual hierarchy and navigation
- **Responsive Design**: Mobile-first approach with desktop optimization
- **Real-time Updates**: Immediate feedback on all actions
- **Visual Feedback**: Color-coded status indicators

## 🚀 Development

### Available Scripts
```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run start        # Start production server
npm run lint         # Run ESLint
```

### Code Style
- **TypeScript**: Strict type checking enabled
- **ESLint**: Next.js recommended configuration
- **Prettier**: Automatic code formatting
- **Component Structure**: Functional components with hooks

### State Management
- **React Context**: Authentication and user state
- **Local State**: Component-specific state with useState
- **Data Fetching**: Direct API calls with Supabase client
- **Real-time Updates**: Automatic refresh after mutations

## 🔒 Security Features

- **JWT Authentication**: Secure token-based authentication
- **Protected Routes**: Automatic redirect for unauthenticated users
- **Input Validation**: Client-side form validation
- **XSS Protection**: React's built-in XSS protection
- **CSRF Protection**: Supabase handles CSRF protection

## 📱 Responsive Design

### Breakpoints
- **Mobile**: < 768px - Stacked layout, full-width components
- **Tablet**: 768px - 1024px - Sidebar becomes collapsible
- **Desktop**: > 1024px - Full sidebar + main content layout

### Mobile Optimizations
- Touch-friendly buttons and inputs
- Swipe gestures for navigation
- Optimized table layouts for small screens
- Responsive modal positioning

## 🎨 Customization

### Theme Colors
The app uses CSS custom properties for theming:
```css
:root {
  --primary: 221.2 83.2% 53.3%;
  --secondary: 210 40% 96%;
  --accent: 210 40% 96%;
  --destructive: 0 84.2% 60.2%;
}
```

### Tailwind Configuration
Custom Tailwind configuration includes:
- Design system color palette
- Custom spacing and typography scales
- Animation utilities
- Component-specific utilities

## 🧪 Testing

### Manual Testing Checklist
- [ ] Authentication flow (signup, login, logout)
- [ ] Account creation and management
- [ ] Category creation and organization
- [ ] Budget creation and allocation
- [ ] Transaction recording and categorization
- [ ] Responsive design on different screen sizes
- [ ] Error handling and validation

### Browser Compatibility
- **Chrome**: 90+
- **Firefox**: 88+
- **Safari**: 14+
- **Edge**: 90+

## 🚀 Deployment

### Build Process
```bash
npm run build
```

### Environment Variables
Ensure these are set in production:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### Deployment Platforms
- **Vercel**: Recommended for Next.js apps
- **Netlify**: Alternative deployment option
- **AWS Amplify**: Enterprise deployment option

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License.

## 🆘 Support

For questions or issues:
1. Check the main README.md for backend setup
2. Review the component documentation above
3. Open an issue on GitHub
4. Contact the development team

---

**Note**: This frontend requires the Allocat backend API to be running and properly configured. See the main README.md for backend setup instructions.
