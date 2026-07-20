# CommercePilot AI — Backend

Express.js + TypeScript REST API with multi-tenant architecture, Better Auth, and AI Commerce Copilot.

**API:** https://commerce-pilot-aibackend-b63jib4i6.vercel.app

## Tech Stack

- Node.js + Express.js + TypeScript
- Better Auth (Email + Google OAuth)
- MongoDB Atlas (official driver, repository pattern)
- Groq SDK (gpt-oss-120b) for AI features
- Vercel Serverless deployment

## Quick Start

```bash
npm install
cp .env.example .env
# Edit .env (see Environment Variables below)
npm run seed    # Creates demo user + sample products
npm run dev     # http://localhost:5000
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `MONGODB_URI` | Yes | MongoDB connection string |
| `DB_NAME` | No | Database name (default: `commercepilot_ai`) |
| `BETTER_AUTH_SECRET` | Yes | Auth secret (min 32 chars in production) |
| `BETTER_AUTH_URL` | Prod | Backend URL |
| `CLIENT_URL` | Prod | Frontend URL — comma-separated for multiple origins |
| `GROQ_API_KEY` | Yes | Groq API key (`gsk_...`) |
| `GOOGLE_CLIENT_ID` | No | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | No | Google OAuth client secret |
| `PORT` | No | Server port (default: 5000) |

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start dev server with hot reload |
| `npm run build` | Compile TypeScript |
| `npm start` | Start production server |
| `npm run typecheck` | Type-check without building |
| `npm run seed` | Seed database with demo user + sample products |

## Project Structure

```
backend/
├── api/index.ts              # Vercel serverless entry point
├── src/
│   ├── config/
│   │   ├── database.ts       # MongoDB singleton (lazy in serverless)
│   │   ├── environment.ts    # Type-safe env vars with parseOrigins()
│   │   └── auth.ts           # Better Auth config with trustedOrigins
│   ├── features/
│   │   ├── auth/             # Auth, user, store, subscription, staff management
│   │   ├── products/         # Products + categories CRUD
│   │   ├── inventory/        # Stock tracking, adjustments, alerts
│   │   ├── sales/            # Point-of-sale, invoices, payments
│   │   ├── returns/          # Return processing, refunds
│   │   ├── customers/        # Customer management
│   │   ├── bundles/          # Product bundles
│   │   ├── reports/          # Sales, inventory, profit reports
│   │   ├── analytics/        # Revenue, profit, growth analytics
│   │   ├── ai/               # AI Commerce Copilot (Groq)
│   │   ├── dashboard/        # Dashboard summary
│   │   ├── activity-logs/    # Audit trail
│   │   ├── notifications/    # User notifications
│   │   └── admin/            # Super admin management
│   ├── middleware/
│   │   ├── auth.middleware.ts # requireAuth, requireStoreAccess, requirePermission
│   │   └── error.middleware.ts
│   ├── routes/
│   │   └── index.ts          # All API route registration
│   ├── scripts/
│   │   └── seed.ts           # Demo data seeder
│   ├── types/
│   │   └── custom.d.ts       # Ambient type declarations (helmet, rate-limit, groq-sdk)
│   └── utils/
│       ├── error-handler.ts
│       ├── logger.ts
│       └── api-response.ts   # sendSuccess, sendPaginated, sendError
├── vercel.json               # cleanUrls: true
└── package.json
```

## API Base URL

```
https://commerce-pilot-aibackend-b63jib4i6.vercel.app/api/v1
```

## Key Endpoints

### Authentication

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/auth/sign-up/email` | Public | Register new user |
| POST | `/api/auth/sign-in/email` | Public | Login |
| GET | `/api/auth/get-session` | Public | Get current session |
| POST | `/api/auth/sign-out` | Auth | Logout |
| POST | `/api/auth/store` | Auth | Create store (auto-creates user with storeId + approved status) |

### Products

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/v1/products` | Store | List products (paginated) |
| GET | `/api/v1/products/:id` | Store | Get product |
| POST | `/api/v1/products` | Store + permission | Create product |
| PATCH | `/api/v1/products/:id` | Store + permission | Update product |
| DELETE | `/api/v1/products/:id` | Store + permission | Soft delete product |

### Categories

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/v1/categories` | Store | List categories |
| POST | `/api/v1/categories` | Store + permission | Create category |
| PATCH | `/api/v1/categories/:id` | Store + permission | Update category |
| DELETE | `/api/v1/categories/:id` | Store + permission | Delete category |

### Inventory

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/v1/inventory` | Store | List inventory |
| POST | `/api/v1/inventory` | Store + permission | Create adjustment |
| GET | `/api/v1/inventory/alerts` | Store | Low stock + dead stock alerts |
| GET | `/api/v1/inventory/dead-stock` | Store | Dead stock detection |
| GET | `/api/v1/inventory/history` | Store | Inventory movement history |

### Sales

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/v1/sales` | Store | List sales |
| POST | `/api/v1/sales` | Store + permission | Create sale |
| GET | `/api/v1/sales/:id` | Store | Get sale details |

### Returns

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/v1/returns` | Store | List returns |
| POST | `/api/v1/returns` | Store + permission | Process return |

### Reports

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/v1/reports/dashboard-summary` | Store | Dashboard summary (today/week/month sales, counts, alerts) |
| GET | `/api/v1/reports/inventory` | Store | Inventory report |
| GET | `/api/v1/reports/profit` | Store | Profit report |
| GET | `/api/v1/reports/top-products` | Store | Top products report |
| GET | `/api/v1/reports/sales-trend` | Store | Daily sales trend |

### Analytics

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/v1/analytics/dashboard` | Store | Revenue, profit, growth, top products |
| GET | `/api/v1/analytics/sales-trend` | Store | Sales trend data |
| GET | `/api/v1/analytics/inventory-alerts` | Store | Inventory alerts |

### AI

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/v1/ai/chat` | Store | AI Commerce Copilot chat |
| GET | `/api/v1/ai/conversations` | Store | List conversations |
| GET | `/api/v1/ai/conversations/:id` | Store | Get conversation |
| DELETE | `/api/v1/ai/conversations/:id` | Store | Delete conversation |

### Subscriptions

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/v1/subscriptions` | Store | List subscription plans |
| POST | `/api/v1/subscriptions` | Auth | Create subscription |
| PATCH | `/api/v1/subscriptions/:id` | Store + permission | Update subscription |

### Staff

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/v1/staff` | Store | List staff |
| POST | `/api/v1/staff` | Store + owner | Invite staff |
| PATCH | `/api/v1/staff/:id` | Store + owner | Update staff permissions |
| DELETE | `/api/v1/staff/:id` | Store + owner | Remove staff |

### Admin (Super Admin only)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/v1/admin/dashboard` | Super Admin | Platform dashboard |
| GET | `/api/v1/admin/users` | Super Admin | List users |
| GET | `/api/v1/admin/stores` | Super Admin | List stores |
| PATCH | `/api/v1/admin/users/:id/approve` | Super Admin | Approve user |
| PATCH | `/api/v1/admin/users/:id/reject` | Super Admin | Reject user |
| PATCH | `/api/v1/admin/users/:id/suspend` | Super Admin | Suspend user |
| GET | `/api/v1/admin/analytics` | Super Admin | Platform analytics |
| GET | `/api/v1/admin/activity-logs` | Super Admin | All activity logs |
| GET | `/api/v1/admin/ai-usage` | Super Admin | AI usage stats |

### Public

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/v1/public/products` | Public | Public product catalog |

### Health

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/health` | Public | Health check with DB status |
| GET | `/ready` | Public | Readiness probe |

## Architecture

Every business route uses this middleware chain:

```
request → requireAuth() → requireStoreAccess() → requireStoreApproved() → requirePermission() → controller → service → repository → MongoDB
```

- **Controller:** Validates request shape, calls service
- **Service:** Business logic, validation rules, orchestration
- **Repository:** Database queries only — never contains business logic
- **AI:** Never accesses MongoDB directly — calls backend APIs through service layer

## Multi-Tenancy

Every business collection contains a `storeId` field. Every database query filters by `storeId`. Users can never access another store's data — enforced at the middleware level.

## Deployment

### Vercel

Backend is deployed as a serverless function. Entry point: `api/index.ts`.

```json
// vercel.json
{
  "cleanUrls": true,
  "routes": [
    { "src": "/(.*)", "dest": "/api/index.ts" }
  ]
}
```

`CLIENT_URL` supports comma-separated origins for multiple environments (local dev + production).

### Docker

```bash
cp .env.example .env
docker compose up -d --build
```

## Demo Data

```bash
npm run seed
```

Creates:
- User: `testowner@example.com` / `TestPass123!`
- Store: "Demo Store" (starter plan, approved)
- Subscription: starter (active)
- 5 categories + 20 products with images
