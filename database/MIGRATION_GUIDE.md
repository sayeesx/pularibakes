# Pulari Bakes Production Management System - Database & Deployment Guide

This comprehensive guide details the independent architecture, database setup, and deployment workflows for **Pulari Bakes**.

---

## 1. Directory Architecture

```
PULARI_BAKES/
├── admin/                         # Pulari Bakes Admin Management Console (Vite + React 19 + TypeScript)
│   ├── public/pulari-logo.jpg     # Official brand logo
│   ├── vercel.json                # Vercel SPA routing & cache policy
│   ├── netlify.toml               # Netlify SPA routing & cache policy
│   └── src/                       # Desktop-first administrative dashboard & mixture management
├── pantry-management/             # Pulari Bakes Pantry Management PWA (Vite + React 19 + TypeScript + PWA)
│   ├── public/pulari-logo.jpg     # Official brand logo
│   ├── vercel.json                # Vercel SPA routing & cache policy
│   ├── netlify.toml               # Netlify SPA routing & cache policy
│   └── src/                       # Mobile-first pantry management & mixture preparation interface
├── database/                      # Complete database migrations & self-hosted Docker stack
│   ├── schema.sql                 # Complete DDL with all tables, constraints, RLS & atomic functions
│   ├── seed_data.sql              # Initial catalogue seed data (snack items, ingredients, defaults)
│   ├── 003_special_mixtures.sql   # Intermediate Cooked Mixtures schema & atomic procedures
│   ├── docker-compose.yml         # Self-hosted PostgreSQL 16 + PostgREST + Swagger UI
│   └── MIGRATION_GUIDE.md         # This document
└── supabase/
    └── migrations/
        ├── 001_initial_schema.sql
        ├── 002_seed_data.sql
        └── 003_special_mixtures.sql
```

---

## 2. Setting Up the New Pulari Bakes Supabase Project

> [!IMPORTANT]
> The original Epso Supabase project is completely untouched and isolated. All migrations and environment variables below apply exclusively to your **new** Pulari Bakes Supabase project.

### Step 1: Create a New Supabase Project
1. Log in to your [Supabase Dashboard](https://supabase.com/dashboard).
2. Click **New Project**, choose your organization, name it `Pulari Bakes`, set a secure database password, and select your preferred region.
3. Once provisioned, navigate to **Project Settings** -> **API** and copy:
   - **Project URL** (`https://[YOUR_PULARI_REF].supabase.co`)
   - **anon / public key** (`eyJ...`)

### Step 2: Execute Schema & Migrations
In your Supabase dashboard, open the **SQL Editor** and run the migration scripts in numerical sequence:

1. **Run `001_initial_schema.sql`** (or `database/schema.sql`):
   - Creates 19 core tables (`products`, `ingredients`, `recipes`, `production_runs`, `stock_movements`, `audit_logs`, `daily_closings`, `cost_allocations`, etc.).
   - Enables Row Level Security (RLS) policies.
   - Installs atomic stored procedures (`record_production_run_atomic`, `cancel_production_run_atomic`, etc.).
2. **Run `002_seed_data.sql`**:
   - Seeds initial snacks catalogue, raw ingredients, packet types, and default security PIN.
3. **Run `003_special_mixtures.sql`**:
   - Creates `special_mixtures`, `special_mixture_recipes`, `special_mixture_recipe_items`, `special_mixture_batches`, `special_mixture_consumption`, `product_recipe_mixtures`, `production_mixture_consumption`.
   - Installs atomic functions `prepare_special_mixture_atomic` and `record_production_run_with_mixtures_atomic`.

### Step 3: Configure Environment Variables
Create or update `.env` in both frontends with your **new** Pulari Bakes credentials:

**`admin/.env`**:
```env
VITE_SUPABASE_URL=https://[YOUR_PULARI_REF].supabase.co
VITE_SUPABASE_ANON_KEY=[YOUR_PULARI_ANON_KEY]
```

**`pantry-management/.env`**:
```env
VITE_SUPABASE_URL=https://[YOUR_PULARI_REF].supabase.co
VITE_SUPABASE_ANON_KEY=[YOUR_PULARI_ANON_KEY]
```

*(Note: In local development or demo mode without active credentials, both applications run seamlessly with honest local storage fallback!)*

---

## 3. Special Cooked Mixtures & Cake Production Feature

Pulari Bakes produces cakes and custom baked goods alongside traditional snacks.

### Intermediate Preparations Supported:
- **Whipping Cream (വിപ്പിംഗ് ക്രീം)**
- **Plum Cake Mixture (പ്ലം കേക്ക് മിക്സ്ചർ)**
- **Chocolate Cake Mixture (ചോക്ലേറ്റ് കേക്ക് മിക്സ്ചർ)**
- **Vanilla Cake Mixture (വാനില കേക്ക് മിക്സ്ചർ)**
- **Butter Cream (ബട്ടർ ക്രീം)**
- Custom Administrator-Defined Formulations

### Strict Inventory Accounting Rules:
1. **Mixture Preparation**:
   - Preparing a mixture deducts the required raw ingredients (e.g. Flour, Sugar, Butter) from stock.
   - Computes weighted average cost per unit output.
   - Increases the stock of the intermediate special mixture.
2. **Cake / Product Production**:
   - When a cake is baked using a prepared mixture, **only the mixture stock is deducted**.
   - **CRITICAL**: The original raw ingredients of the mixture are **NEVER re-deducted**, guaranteeing zero double counting.
3. **Batch Cancellation**:
   - Cancelling a mixture batch automatically deducts the mixture output yield and restores the consumed raw ingredients.
   - Cancelling a cake production run restores only the mixture stock, preserving raw ingredient balances.

---

## 4. Strict Language Switcher (Malayalam / English)

- Accessible directly via Settings and top navigation headers.
- Persistent key: `pulari_language_preference`.
- **STRICT RULE**: Never displays Malayalam and English mixed together in the same screen. Full monolingual rendering based on active selection.

---

## 5. Deployment Guide (Vercel & Netlify)

Both applications include pre-configured `vercel.json` and `netlify.toml` files with SPA route fallbacks (`/* -> /index.html`) and cache-invalidation headers for `version.json`.

### Deploying to Vercel
1. Install Vercel CLI (`npm i -g vercel`) or connect your GitHub repository in the Vercel dashboard.
2. To deploy **Admin**:
   - Root directory: `admin`
   - Framework preset: `Vite`
   - Build command: `npm run build`
   - Output directory: `dist`
   - Add environment variables: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
3. To deploy **Pantry Management PWA**:
   - Root directory: `pantry-management`
   - Framework preset: `Vite`
   - Build command: `npm run build`
   - Output directory: `dist`
   - Add environment variables: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.

### Deploying to Netlify
1. Connect repository in Netlify or run `netlify deploy --prod`.
2. Base directory: `admin` (or `pantry-management`).
3. Build command: `npm run build`.
4. Publish directory: `dist`.
5. Netlify will automatically detect `netlify.toml` for SPA rewrites and caching policies.

---

## 6. Verification & Test Suite

Run the comprehensive test suite in `pantry-management`:
```bash
cd pantry-management
npm test
```
All 29 tests will execute and pass, verifying:
- Snack catalogue and ingredient seeding
- Special mixtures catalogue and BOM recipes
- Preparation workflow and weighted average cost calculation
- Strict zero double-counting during cake production
- Atomic batch cancellation and stock restorations
