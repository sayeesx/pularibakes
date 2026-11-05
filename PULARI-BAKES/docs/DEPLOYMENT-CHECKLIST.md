# PULARI BAKES — PRODUCTION DEPLOYMENT RUNBOOK & CHECKLIST
**Document Reference**: PB-OPS-2026-01  
**Classification**: DevOps & Production Reliability Runbook  
**Date**: November 2026  
**Auditor**: DevOps and Production Reliability Engineer  
**Scope**: Pulari Bakes Deployment Pipeline (Supabase, Vercel/Netlify, Docker Self-Hosted)

---

## 1. Pre-Flight Verification Gate

Before initiating production deployment, all gates below must be checked and confirmed:

- [x] **Git Repository State**: Clean working tree on `main` branch. All commits pushed to `https://github.com/sayeesx/pularibakes.git`.
- [x] **No Secrets in Source Control**: Verified `.gitignore` prevents `.env`, `.env.*`, and credentials from being committed.
- [x] **Automated Test Suite**: 100% pass rate in Vitest (`62/62 tests passing`).
  ```bash
  cd pantry-management
  npx vitest run
  ```
- [x] **TypeScript Type Safety**: Zero compilation errors across both applications.
  ```bash
  cd admin && npm run build
  cd ../pantry-management && npm run build
  ```
- [x] **Asset Audit**: Zero legacy brand references (`pulari-logo.jpg` and `#5C1313` verified).

---

## 2. Database Provisioning & Migration Sequence

### Target Database Credentials:
* **Project URL**: `https://dlqnmjmomhxavdkttltg.supabase.co`
* **Project Ref**: `dlqnmjmomhxavdkttltg`
* **Anonymous Key**: `sb_publishable_1Nr_5rex4Cy8Sm0Lp0CWyQ_4qAjr1bl`

### Sequential Migration Application:
Run the migration scripts in exact order via Supabase SQL Editor or `database/db-tool.js`:

1. **`001_initial_schema.sql`**:
   * Creates 19 core inventory, product, recipe, and production tables.
   * Installs atomic procedures `record_production_run_atomic` and `adjust_stock_atomic`.
   * Sets up `schema_migrations` tracking.
2. **`002_seed_data.sql`**:
   * Seeds 28 standard snack items (Banana Chips, Murukku, Mixture, Pakkavada, etc.).
   * Seeds 45 ingredients with standard packaging units and metric conversions.
   * Initializes default administrative PIN hash.
3. **`003_special_mixtures.sql`**:
   * Creates 7 special mixture tables.
   * Deploys `prepare_special_mixture_atomic`, `cancel_special_mixture_batch_atomic`, and `record_production_run_with_mixtures_atomic`.
   * Enforces weighted average costing protections.
4. **`004_unit_conversions_and_audit.sql`**:
   * Creates `unit_conversions` table with metric factors and bakery density constants.
   * Deploys automated diagnostic function `verify_database_integrity()`.

### Database Integrity Verification:
Execute the diagnostic function in SQL Editor:
```sql
SELECT * FROM verify_database_integrity();
```
*Expected output: All test cases pass with zero orphaned foreign keys or negative balances.*

---

## 3. Environment Variable Configuration

### A. Admin Console (`admin/.env.production`)
```env
VITE_SUPABASE_URL=https://dlqnmjmomhxavdkttltg.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_1Nr_5rex4Cy8Sm0Lp0CWyQ_4qAjr1bl
VITE_APP_ENV=production
```

### B. Pantry Management PWA (`pantry-management/.env.production`)
```env
VITE_SUPABASE_URL=https://dlqnmjmomhxavdkttltg.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_1Nr_5rex4Cy8Sm0Lp0CWyQ_4qAjr1bl
VITE_APP_ENV=production
```

---

## 4. Production Hosting Options

### Option A: Cloud Hosting (Vercel / Netlify / Cloudflare Pages)

#### 1. Build Commands:
* **Admin Application**:
  * Build command: `npm run build`
  * Output directory: `dist`
  * Root directory: `admin`
* **Pantry Management PWA**:
  * Build command: `npm run build`
  * Output directory: `dist`
  * Root directory: `pantry-management`

#### 2. SPA Fallback Routing Configuration:
* For Netlify: Verify `_redirects` in `public/`:
  ```
  /*    /index.html   200
  ```
* For Vercel: Add `vercel.json` if necessary:
  ```json
  {
    "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
  }
  ```

---

### Option B: Self-Hosted Docker Environment (Zero Cloud Lock-in)

For deployment to a VPS (Ubuntu / Debian / Alpine):
1. Clone the repository:
   ```bash
   git clone https://github.com/sayeesx/pularibakes.git
   cd pularibakes
   ```
2. Launch the PostgreSQL + PostgREST + Swagger stack:
   ```bash
   cd database
   docker compose up -d
   ```
3. Initialize the database schema:
   ```bash
   docker exec -i pulari-postgres psql -U postgres -d pulari_bakes < schema.sql
   ```
4. Point frontends to `http://<vps-ip>:3000` via Nginx reverse proxy with SSL certificate via Let's Encrypt Certbot.

---

## 5. Post-Deployment Smoke Test Protocol

Perform these 5 smoke tests immediately following deployment:

| Step | Application | Action | Verification Criteria |
| :--- | :--- | :--- | :--- |
| **1** | Admin Console | Enter Admin PIN in modal | Successfully unlocks dashboard; failed entries lock out after 5 tries |
| **2** | Pantry PWA | Open Pantry on Mobile | PWA loads offline service worker, shows Malayalam UI, Pulari logo |
| **3** | Pantry PWA | Record Production Batch | Stock reduces atomically; movements logged in database |
| **4** | Pantry PWA | Prepare Special Mixture | Raw materials deduct; mixture stock increments at true usable cost |
| **5** | Admin Console | Inspect Costing Analytics | WAC calculates correctly with 2-decimal rounded financial totals |

---

## 6. Rollback & Emergency Recovery Protocol

In the event of an unexpected regression:

1. **Immediate Frontend Rollback**: Revert to previous release tag in Vercel/Netlify dashboard (1-click rollback, $< 30$ seconds).
2. **Database State Restoration**:
   * If schema rollback is required, restore from pre-deployment backup:
     ```bash
     psql -h <host> -U <user> -d <dbname> < backups/pulari_pre_deploy_backup.sql
     ```
3. **Emergency Offline Operation**: The Pantry PWA retains queued transactions in browser IndexedDB. Floor operators can continue logging batches offline until network or database recovery is confirmed.
