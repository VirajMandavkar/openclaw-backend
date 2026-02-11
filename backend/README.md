# OpenClaw Managed Hosting SaaS - Backend

Control plane for managed OpenClaw container hosting with secure workspace isolation.

## Architecture

- **Control Plane**: Node.js + Express API
- **Database**: PostgreSQL (user data, workspaces, subscriptions)
- **Container Runtime**: Docker with isolated networking
- **Payment Gateway**: Razorpay (UPI, cards, net banking)

## Key Features

- One workspace = one isolated Docker container
- No public container ports (all access through control plane proxy)
- JWT-based authentication
- Subscription-gated workspace access
- Automatic secret redaction in logs
- Resource limits enforced per container

## Prerequisites

- Node.js 18+
- Docker Desktop running
- PostgreSQL 15 (via docker-compose)

## Quick Start

### 1. Install Dependencies

```bash
cd backend
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env and update:
# - JWT_SECRET (already generated)
# - RAZORPAY_KEY_ID (get from Razorpay dashboard)
# - RAZORPAY_KEY_SECRET
# - RAZORPAY_WEBHOOK_SECRET
```

### 3. Start Database

```bash
# From project root
docker-compose up -d
```

### 4. Run Migrations

```bash
npm run migrate
```

### 5. Start Development Server

```bash
npm run dev
```

Server will start at http://localhost:3000

## API Endpoints

### Authentication

- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login and get JWT
- `GET /api/auth/me` - Get current user (requires auth)
- `POST /api/auth/logout` - Logout

### Health Check

- `GET /health` - Server and database health status

## Database Schema

- **users**: User accounts with bcrypt password hashing
- **workspaces**: Workspace configurations and container metadata
- **subscriptions**: Razorpay subscription data
- **payment_events**: Immutable audit log of all payment webhooks

## Scripts

- `npm start` - Start production server
- `npm run dev` - Start development server with nodemon
- `npm run migrate` - Run database migrations
- `npm run lint` - Lint code with ESLint
- `npm run format` - Format code with Prettier

## Security Features

### Secrets Protection
- Passwords hashed with bcrypt (10 rounds minimum)
- JWT tokens with expiration
- Automatic secret redaction in logs (passwords, API keys, tokens never logged)
- Environment variables for all sensitive configs

### Container Isolation
- No public ports exposed from containers
- CPU and memory limits enforced
- Internal Docker network only
- Dropped Linux capabilities
- No new privileges allowed

### SQL Injection Prevention
- All queries use parameterized statements
- No string concatenation in SQL

## Project Structure

```
backend/
├── src/
│   ├── index.js                 # Express app entry point
│   ├── config/
│   │   ├── database.js          # PostgreSQL connection pool
│   │   └── docker.js            # Docker client setup
│   ├── models/
│   │   ├── user.js              # User CRUD operations
│   │   ├── workspace.js         # Workspace CRUD operations
│   │   └── subscription.js      # Subscription management
│   ├── middleware/
│   │   ├── auth.js              # JWT validation
│   │   └── errorHandler.js      # Global error handling
│   ├── routes/
│   │   └── auth.js              # Authentication endpoints
│   ├── services/
│   │   ├── authService.js       # JWT generation/verification
│   │   └── containerManager.js  # Docker container lifecycle
│   └── utils/
│       └── logger.js            # Winston logger with secret redaction
├── migrations/
│   ├── 001_create_users.sql
│   ├── 002_create_workspaces.sql
│   ├── 003_create_subscriptions.sql
│   └── 004_create_payment_events.sql
└── package.json
```

## Development Roadmap

### Week 1: Foundation ✅ (In Progress)
- [x] Project scaffolding
- [x] Database migrations
- [x] Authentication system (register/login)
- [x] User model
- [x] Workspace model
- [x] Subscription model
- [x] Container manager service
- [ ] Test authentication flow
- [ ] Create Docker internal network

### Week 2: Workspace Management
- [ ] Workspace CRUD API
- [ ] Container lifecycle integration
- [ ] OpenClaw proxy route

### Week 3: Payments
- [ ] Razorpay integration
- [ ] Webhook handling
- [ ] Subscription enforcement middleware

### Week 4: Frontend & Deployment
- [ ] React dashboard
- [ ] VPS deployment
- [ ] Testing & bug fixes

## Testing the API

### Register a User

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "password": "SecurePass123!A"}'
```

### Login

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "password": "SecurePass123!A"}'
```

### Get Current User

```bash
curl http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## Environment Variables

See `.env.example` for required configuration.

## Contributing

Follow the project's COPILOT_RULES.md:
- Prefer boring, readable code
- Explicit over implicit
- No magic abstractions
- Never log secrets
- Always use parameterized queries

## License

ISC
