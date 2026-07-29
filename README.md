# CommercePilot AI — Backend

Express.js + TypeScript REST API with multi-tenant architecture, Better Auth (Email & Google OAuth), MongoDB Atlas, and Groq-powered AI Commerce Copilot.

**API:** `https://commerce-pilot-aibackend-b63jib4i6.vercel.app`

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime & Framework | Node.js, Express.js (v4), TypeScript |
| Authentication | Better Auth 1.2+ (Email/Password & Google OAuth) |
| Database | MongoDB Atlas (Official Node Driver) |
| AI Engine | Groq SDK (`gpt-oss-120b` / LLMs) |
| Security & Utilities | Helmet, Express Rate Limit, CORS, Compression |
| Infrastructure | Vercel Serverless Functions |

## Quick Start

```bash
cd backend
npm install

# Setup environment variables
cp .env.example .env
# Edit .env with your MONGODB_URI, BETTER_AUTH_SECRET, GROQ_API_KEY, etc.

# Seed database with initial demo data
npm run seed

# Run local development server
npm run dev     # http://localhost:5000
```

## Scripts

| Script | Command | Description |
|---|---|---|
| `npm run dev` | `tsx watch src/server.ts` | Start backend server in development mode with live reload |
| `npm run build` | `tsc` | Compile TypeScript code to JavaScript (`dist/`) |
| `npm start` | `node dist/server.js` | Start production server from `dist/` |
| `npm run typecheck` | `tsc --noEmit` | Run static type checking with zero code output |
| `npm run seed` | `tsx src/scripts/seed.ts` | Seed database with demo user, store, and sample products |

### Verification & E2E Tests

Run end-to-end phase tests using `tsx`:

```bash
# Run Super Admin E2E Tests
npx tsx tests/e2e-phase14.ts

# Run Subscriptions & Billing E2E Tests
npx tsx tests/e2e-phase13.ts

# Run AI Copilot & Multi-Tenant E2E Tests
npx tsx tests/e2e-phase12.ts
```

## Environment Variables

Create `.env` inside `backend/`:

| Variable | Required | Default | Description |
|---|---|---|---|
| `MONGODB_URI` | Yes | - | MongoDB Atlas connection string |
| `DB_NAME` | No | `commercepilot_ai` | Target MongoDB database name |
| `BETTER_AUTH_SECRET` | Yes | - | Secret key for auth tokens (min 32 chars in production) |
| `BETTER_AUTH_URL` | Prod | `http://localhost:5000` | Public backend URL |
| `CLIENT_URL` | Prod | `http://localhost:3000` | Frontend origins (comma-separated for multi-origin CORS) |
| `GROQ_API_KEY` | Yes | - | Groq API Key (`gsk_...`) |
| `GOOGLE_CLIENT_ID` | No | - | Google OAuth Client ID |
| `GOOGLE_CLIENT_SECRET` | No | - | Google OAuth Client Secret |
| `PORT` | No | `5000` | Server listening port |

## Project Structure

```
backend/
├── api/
│   └── index.ts               # Vercel serverless entry handler
├── src/
│   ├── config/
│   │   ├── auth.ts            # Better Auth configuration
│   │   ├── database.ts        # MongoDB connection management & singleton
│   │   └── environment.ts     # Type-safe environment validation
│   ├── constants/             # Enums, roles, collection names, plan limits
│   ├── database/
│   │   └── indexes.ts         # Database index manager
│   ├── features/
│   │   ├── admin/             # Super admin dashboard & management
│   │   ├── ai/                # AI Copilot chat & generators
│   │   ├── auth/              # Auth controllers & store management
│   │   ├── bundles/           # Product bundle services
│   │   ├── categories/        # Category management
│   │   ├── dashboard/         # Store dashboard summary APIs
│   │   ├── inventory/         # Stock tracking & adjustments
│   │   ├── products/          # Product CRUD & search
│   │   ├── reports/           # Sales, profit & inventory reports
│   │   ├── returns/           # Order return processing
│   │   ├── sales/             # POS sales & invoice generation
│   │   ├── staff/             # Staff management & permissions
│   │   └── subscriptions/     # SaaS subscription & plan upgrades
│   ├── middleware/
│   │   ├── auth.middleware.ts # Security chain: requireAuth, requireStoreAccess, requirePermission
│   │   ├── error.middleware.ts# Global Error Handler
│   │   ├── role.middleware.ts # Role authorization
│   │   └── validation.middleware.ts # Input validation
│   ├── routes/
│   │   └── index.ts           # Central Express router mounting
│   ├── scripts/
│   │   └── seed.ts            # Seeder script for demo data
│   ├── server.ts              # Express HTTP server setup
│   ├── types/                 # Ambient TypeScript definitions
│   └── utils/                 # Logger, response formatters & custom errors
├── tests/                     # Phase verification & E2E tests
├── vercel.json                # Vercel serverless routing configuration
└── package.json
```

## Security & Multi-Tenancy Architecture

Every tenant endpoint enforces strict middleware chaining:

```
Request → requireAuth() → requireStoreAccess() → requireStoreApproved() → requirePermission() → Controller → Service → Repository → MongoDB
```

* **`storeId` Isolation:** `storeId` is strictly extracted from `req.user` (from session authentication), never accepted from user input (`req.body` or `req.query`).
* **Granular Permissions:** Staff members are restricted based on permissions stored in the `staff` collection.

## API Key Endpoints

| Method | Route | Access | Description |
|---|---|---|---|
| `GET` | `/health` | Public | Server health & DB ping status |
| `POST` | `/api/auth/sign-up/email` | Public | Register new user |
| `POST` | `/api/auth/sign-in/email` | Public | Login with email |
| `GET` | `/api/auth/get-session` | Authenticated | Get current session data |
| `POST` | `/api/auth/store` | Authenticated | Create a store for account |
| `GET` | `/api/v1/dashboard/summary` | Store Approved | Dashboard summary metrics |
| `GET` | `/api/v1/products` | Store Approved | Paginated products list |
| `POST` | `/api/v1/products` | Permission: products | Create new product |
| `GET` | `/api/v1/sales` | Store Approved | List store sales transactions |
| `POST` | `/api/v1/sales` | Permission: sales | Record new sale / invoice |
| `POST` | `/api/v1/ai/chat` | Permission: ai | Send prompt to AI Commerce Copilot |
| `GET` | `/api/v1/subscriptions` | Permission: settings | View store subscription details |
| `PATCH` | `/api/v1/subscriptions/upgrade` | Owner | Upgrade SaaS subscription plan |
| `GET` | `/api/v1/admin/dashboard` | Super Admin | Platform-wide admin metrics |

## License

Private — CommercePilot AI Platform.
