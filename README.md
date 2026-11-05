# Pulari Bakes (പൂലാരി ബേക്സ്)
### Bakery & Snack Production Management System

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![React 19](https://img.shields.io/badge/React-19-61dafb.svg)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-8.x-646cff.svg)](https://vitejs.dev/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-14%2B-336791.svg)](https://www.postgresql.org/)
[![PWA](https://img.shields.io/badge/PWA-Ready-orange.svg)](https://web.dev/progressive-web-apps/)
[![Vitest](https://img.shields.io/badge/Vitest-5.x-729B1B.svg)](https://vitest.dev/)
[![Zero Vendor Lock-in](https://img.shields.io/badge/Zero%20Lock--in-100%25%20Postgres-success.svg)](./docs/DATABASE-MIGRATION.md)

---

## 📖 Overview

**Pulari Bakes Production Management System** is an enterprise-grade bakery and confectionery manufacturing ERP designed for high-precision costing, continuous oil accounting, intermediate cooked mixture formulation (cakes, creams, and batters), and offline-first kitchen pantry execution.

Built from the ground up for **Zero Vendor Lock-in**, the application can run seamlessly on:
- Managed Supabase PostgreSQL
- Self-hosted PostgreSQL 14/15/16 via Docker / Podman
- Any Cloud PostgreSQL (AWS RDS, Neon, DigitalOcean, GCP Cloud SQL)
- Offline-first Local Storage mode (zero external database required)

---

## 🏗️ Directory Architecture

```
pulari_bakes/
├── admin/                         # Pulari Bakes Management Console (Desktop-first SPA)
│   ├── src/                       # Costing, recipe management, insights, sales & security
│   ├── vercel.json                # Vercel SPA routing
│   └── netlify.toml               # Netlify SPA routing
├── pantry-management/             # Kitchen Floor Pantry Management PWA (Mobile-first PWA)
│   ├── src/                       # Batch execution, mixture cooking, oil tracking, packing
│   ├── src/tests/                 # 51 Automated calculation & business logic validation tests
│   └── src/services/              # Precision costing & unit conversion engines
├── database/                      # Version-controlled migrations & database management
│   ├── migrations/                # Portable SQL migrations (001, 002, 003, 004)
│   ├── schema.sql                 # Complete unified PostgreSQL DDL
│   ├── docker-compose.yml         # Self-hosted PostgreSQL 16 + PostgREST + Swagger UI
│   └── db-tool.js                 # Database migration, backup, restore & audit CLI
├── supabase/                      # Supabase CLI-compatible migrations mirror
│   └── migrations/
└── docs/                          # Comprehensive system documentation
    ├── DATABASE-MIGRATION.md      # Section 13: Portability, migration, backup & restore
    └── CALCULATION-RULES.md       # Section 14: Calculation audit, formulas & precision standards
```

---

## 🎯 Key Features

### 1. Database Portability & Zero Vendor Lock-in (Section 13)
- **100% PostgreSQL Standard**: Uses ANSI SQL, standard stored procedures (`plpgsql`), standard UUIDs, and standard `CHECK` constraints.
- **Isolated Service Adapters**: Frontends interact through repository interfaces (`IPulariRepository`), isolating database, authentication, and file storage.
- **Predictable Versioned Migrations**: Every schema evolution is tracked in `public.schema_migrations`.
- **Self-Hosted Ready**: Complete `docker-compose.yml` provides a drop-in replacement with PostgreSQL 16, PostgREST v12, and Swagger UI.

### 2. High-Precision Costing & Calculation Engine (Section 14)
- **Zero Floating-Point Drift**: Exact decimal arithmetic eliminating IEEE 754 precision errors.
- **Unit Conversions**: Standard mass (`kg`, `g`, `mg`), volume (`L`, `ml`), and discrete (`pcs`, `packs`) conversions with density support. Incompatible conversions are strictly blocked.
- **Weighted Average Costing (WAC)**: Dynamically recalculates ingredient costs across price changes and consecutive purchases.
- **Special Intermediate Cooked Mixtures**:
  - Whip cream, plum cake mixture, chocolate cake mixture, and custom formulations.
  - Unit costing is based on **actual usable output**, not theoretical targets (e.g. ₹600 / 4.8kg = ₹125/kg).
  - Unusable waste is accounted for without double-counting consumed raw ingredients.
- **Strict Zero Double-Counting**: When cakes are baked using prepared mixtures, **only the mixture stock is deducted**. Raw ingredients are never re-deducted.
- **Continuous Oil Carry-Forward**:
  $$\text{Final Oil Stock} = \text{Previous Available Stock} - \text{Oil Used} + \text{Leftover Oil}$$
  $$\text{Net Oil Consumed} = \text{Oil Used} - \text{Leftover Oil}$$
  $$\text{Daily Oil Expense} = \text{Net Oil Consumed} \times \text{Cost per kg}$$
  Balances seamlessly carry forward to the next production day.
- **Shared Expense & Labour Distribution**: Weight-based proportional distribution across products with **exact penny reconciliation** (no paisa loss or gain).

### 3. Strict Monolingual Language Switcher
- Full monolingual rendering in **Malayalam (മലയാളം)** or **English**.
- Eliminates mixed-language UI confusion for kitchen operators and administrative staff.

---

## 🚀 Quick Start Guide

### Prerequisites
- Node.js 18+ (Node.js 22 Recommended)
- npm 9+
- Docker (Optional, for self-hosted PostgreSQL)

### 1. Configure Environment Variables
Copy `.env.example` in both frontends:

```bash
# Admin Console
cp admin/.env.example admin/.env

# Pantry Management PWA
cp pantry-management/.env.example pantry-management/.env
```

Fill in your database credentials:
```env
VITE_SUPABASE_URL=https://[YOUR-PROJECT-REF].supabase.co
VITE_SUPABASE_ANON_KEY=[YOUR-ANON-KEY]
```
*(Note: If left empty, both applications run seamlessly in offline local demo mode!)*

### 2. Run Locally

```bash
# Start Pantry Management PWA
cd pantry-management
npm install
npm run dev

# Start Admin Management Console
cd ../admin
npm install
npm run dev
```

---

## 🗄️ Database Management CLI (`db-tool.js`)

Manage migrations, backups, and audits from the command line:

```bash
# Check status of migrations
node database/db-tool.js status

# Compile unified schema.sql from migrations
node database/db-tool.js export-schema

# Verify PostgreSQL compatibility and check for vendor lock-in
node database/db-tool.js verify

# Generate timestamped backup archive
node database/db-tool.js backup

# Generate a new numbered migration template
node database/db-tool.js new add_supplier_discounts
```

### Self-Hosted PostgreSQL with Docker
```bash
cd database
docker compose up -d
```
Access points:
- PostgreSQL 16: `localhost:5432`
- PostgREST REST API: `http://localhost:3000`
- Swagger API Docs: `http://localhost:8080`

---

## 🧪 Automated Test Suite

Run the comprehensive 51-test suite covering all 15 business logic validation requirements:

```bash
cd pantry-management
npm test
```

### Test Coverage Highlights:
1. `1. Ingredient Unit Conversions` (Mass, volume, density, incompatible unit rejection)
2. `2. Weighted Average Purchase Costing` (Price volatility, zero stock, negative stock)
3. `3. Mixture Recipe Costing` (BOM formulation)
4. `4. Actual Mixture Output Costing` (Usable yield costing, zero output safeguard)
5. `5. Mixture Stock Deduction` (Traceable ledger entries)
6. `6. Product Production Using Prepared Mixtures` (Cake baking with intermediate mixtures)
7. `7. Prevention of Double Deductions` (Zero raw ingredient double-deduction)
8. `8. Wastage Calculations` (Shrinkage, scrap, yield %)
9. `9. Labour Allocation` (Cooking and packing labour reconciliation)
10. `10. Shared Expense Allocation` (Weight-ratio distribution with exact penny absorption)
11. `11. Oil Carry-Forward Workflow` (Multi-day continuous carry-forward)
12. `12. Inventory Opening and Closing Balances` (Double-entry balance equation)
13. `13. Concurrent Production Transactions & Stock Guards` (Negative stock prevention)
14. `14. Rounding and Decimal Precision` (Zero IEEE 754 floating-point drift)
15. `15. Database Backup and Restoration Integrity` (Manifest and table structure verification)

---

## 📚 Documentation Links
- [Database Migration & Portability Guide (Section 13)](./docs/DATABASE-MIGRATION.md)
- [Calculation Rules & Business Logic Audit (Section 14)](./docs/CALCULATION-RULES.md)

---

## 🔒 Security Notice
All `.env`, credentials, secrets, database dumps, and build artifacts are strictly excluded via `.gitignore`. Never commit API secret keys or service role keys to version control.
