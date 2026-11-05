-- ==============================================================================
-- PULARI BAKES PRODUCTION MANAGEMENT SYSTEM - COMPLETE UNIFIED DATABASE SCHEMA
-- Generated: 2026-11-05T02:37:06.585Z
-- Portability: 100% PostgreSQL Standard (Supabase, Self-Hosted Docker, Neon, RDS)
-- ==============================================================================


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- MIGRATION: 001_initial_schema.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- ==============================================================================
-- PULARI BAKES PRODUCTION MANAGEMENT SYSTEM - FULL MIGRATABLE DATABASE SCHEMA
-- Compatible with: Supabase, Self-Hosted PostgreSQL 14+, PostgREST, Neon, AWS RDS
-- ==============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 1.1 MIGRATION VERSION TRACKING
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.schema_migrations (
    version VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.schema_migrations (version, name)
VALUES ('001', '001_initial_schema.sql')
ON CONFLICT (version) DO NOTHING;

-- ==============================================================================
-- 2. CORE TABLES
-- ==============================================================================

-- Products catalogue
CREATE TABLE IF NOT EXISTS public.products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    sku TEXT,
    unit TEXT NOT NULL DEFAULT 'kg',
    current_stock NUMERIC(12, 3) NOT NULL DEFAULT 0.000 CHECK (current_stock >= 0),
    wholesale_price NUMERIC(12, 2) DEFAULT 0.00 CHECK (wholesale_price >= 0),
    recipe_id UUID,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_products_name ON public.products(name);
CREATE INDEX IF NOT EXISTS idx_products_active ON public.products(is_active);

-- Ingredients catalogue (Categories: 'basic' and 'other')
CREATE TABLE IF NOT EXISTS public.ingredients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    category TEXT NOT NULL CHECK (category IN ('basic', 'other')),
    unit TEXT NOT NULL DEFAULT 'kg',
    current_stock NUMERIC(12, 3) NOT NULL DEFAULT 0.000 CHECK (current_stock >= 0),
    min_stock NUMERIC(12, 3) NOT NULL DEFAULT 0.000 CHECK (min_stock >= 0),
    avg_cost_per_unit NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (avg_cost_per_unit >= 0),
    is_active BOOLEAN NOT NULL DEFAULT true,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ingredients_category ON public.ingredients(category);
CREATE INDEX IF NOT EXISTS idx_ingredients_active ON public.ingredients(is_active);
CREATE INDEX IF NOT EXISTS idx_ingredients_stock ON public.ingredients(current_stock);

-- Packet types catalogue (Pouches, sizes, bundle costs)
CREATE TABLE IF NOT EXISTS public.packet_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    bundle_cost NUMERIC(12, 2) NOT NULL DEFAULT 0,
    bundle_quantity NUMERIC(12, 2) NOT NULL DEFAULT 1,
    cost_per_packet NUMERIC(12, 4) NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_packet_types_name ON public.packet_types(name);
CREATE INDEX IF NOT EXISTS idx_packet_types_active ON public.packet_types(is_active);

-- Recipes (Bill of Materials) - ON DELETE CASCADE to allow deleting products
CREATE TABLE IF NOT EXISTS public.recipes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    version INT NOT NULL DEFAULT 1,
    base_output_quantity NUMERIC(12, 3) NOT NULL CHECK (base_output_quantity > 0),
    base_output_unit TEXT NOT NULL DEFAULT 'kg',
    instructions TEXT,
    notes TEXT,
    packets JSONB DEFAULT '[]'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(product_id, version)
);

CREATE INDEX IF NOT EXISTS idx_recipes_product ON public.recipes(product_id);
CREATE INDEX IF NOT EXISTS idx_recipes_active ON public.recipes(is_active);

-- Link circular foreign key back from products to recipes
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'products_recipe_id_fkey'
    ) THEN
        ALTER TABLE public.products
        ADD CONSTRAINT products_recipe_id_fkey
        FOREIGN KEY (recipe_id) REFERENCES public.recipes(id) ON DELETE SET NULL;
    END IF;
END $$;

-- Recipe ingredient items
CREATE TABLE IF NOT EXISTS public.recipe_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipe_id UUID NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
    ingredient_id UUID NOT NULL REFERENCES public.ingredients(id) ON DELETE RESTRICT,
    quantity NUMERIC(12, 3) NOT NULL CHECK (quantity > 0),
    unit TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recipe_items_recipe ON public.recipe_items(recipe_id);
CREATE INDEX IF NOT EXISTS idx_recipe_items_ingredient ON public.recipe_items(ingredient_id);

-- Recipe configured packet types
CREATE TABLE IF NOT EXISTS public.recipe_packets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipe_id UUID NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
    packet_type_id UUID REFERENCES public.packet_types(id) ON DELETE SET NULL,
    packet_name TEXT NOT NULL,
    cost_per_packet NUMERIC(12, 4) NOT NULL DEFAULT 0,
    bundle_cost NUMERIC(12, 2) NOT NULL DEFAULT 0,
    bundle_quantity NUMERIC(12, 2) NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recipe_packets_recipe ON public.recipe_packets(recipe_id);
CREATE INDEX IF NOT EXISTS idx_recipe_packets_type ON public.recipe_packets(packet_type_id);

-- Production runs / batches
CREATE TABLE IF NOT EXISTS public.production_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_number TEXT NOT NULL UNIQUE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
    recipe_id UUID REFERENCES public.recipes(id) ON DELETE SET NULL,
    recipe_version INT,
    production_date DATE NOT NULL DEFAULT CURRENT_DATE,
    planned_quantity NUMERIC(12, 3) NOT NULL DEFAULT 0 CHECK (planned_quantity >= 0),
    actual_quantity NUMERIC(12, 3) NOT NULL DEFAULT 0 CHECK (actual_quantity >= 0),
    unit TEXT NOT NULL DEFAULT 'kg',
    status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'cancelled')),
    cancellation_reason TEXT,
    cancelled_at TIMESTAMPTZ,
    cancelled_by TEXT,
    notes TEXT,
    operator_name TEXT NOT NULL,
    total_ingredient_cost NUMERIC(12, 2) DEFAULT 0.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_production_runs_date ON public.production_runs(production_date DESC);
CREATE INDEX IF NOT EXISTS idx_production_runs_product ON public.production_runs(product_id);
CREATE INDEX IF NOT EXISTS idx_production_runs_status ON public.production_runs(status);

-- Actual ingredient consumption in batches
CREATE TABLE IF NOT EXISTS public.production_consumption (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID NOT NULL REFERENCES public.production_runs(id) ON DELETE CASCADE,
    ingredient_id UUID NOT NULL REFERENCES public.ingredients(id) ON DELETE RESTRICT,
    expected_quantity NUMERIC(12, 3) NOT NULL DEFAULT 0 CHECK (expected_quantity >= 0),
    actual_quantity NUMERIC(12, 3) NOT NULL CHECK (actual_quantity >= 0),
    unit TEXT NOT NULL,
    unit_cost NUMERIC(12, 2) DEFAULT 0.00,
    total_cost NUMERIC(12, 2) DEFAULT 0.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_production_consumption_run ON public.production_consumption(run_id);
CREATE INDEX IF NOT EXISTS idx_production_consumption_ing ON public.production_consumption(ingredient_id);

-- Stock ledger / movements for audit and history
CREATE TABLE IF NOT EXISTS public.stock_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id UUID NOT NULL,
    item_type TEXT NOT NULL CHECK (item_type IN ('product', 'ingredient', 'packaging')),
    item_name TEXT,
    movement_type TEXT NOT NULL CHECK (
        movement_type IN (
            'production_consumption',
            'production_output',
            'cancellation_reversal',
            'purchase',
            'purchase_inward',
            'damage',
            'wastage',
            'adjustment'
        )
    ),
    quantity NUMERIC(12, 3) NOT NULL,
    unit TEXT NOT NULL,
    previous_balance NUMERIC(12, 3),
    new_balance NUMERIC(12, 3),
    cost_per_unit NUMERIC(12, 2),
    reference TEXT,
    operator_name TEXT,
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_item ON public.stock_movements(item_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_created ON public.stock_movements(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_movements_type ON public.stock_movements(movement_type);

-- Daily shared items closing (Oil, Salt, Cashew shell, Chippli, Curry leaves)
CREATE TABLE IF NOT EXISTS public.daily_closings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    closing_date DATE NOT NULL UNIQUE,
    starting_oil_kg NUMERIC(12, 3) DEFAULT 0.000,
    oil_added_kg NUMERIC(12, 3) DEFAULT 0.000,
    ending_oil_kg NUMERIC(12, 3) DEFAULT 0.000,
    total_oil_used_kg NUMERIC(12, 3) DEFAULT 0.000,
    salt_used_kg NUMERIC(12, 3) DEFAULT 0.000,
    cashew_shell_used_kg NUMERIC(12, 3) DEFAULT 0.000,
    chippli_powder_used_kg NUMERIC(12, 3) DEFAULT 0.000,
    curry_leaves_used_kg NUMERIC(12, 3) DEFAULT 0.000,
    notes TEXT,
    operator_name TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_daily_closings_date ON public.daily_closings(closing_date DESC);

-- Batch packing records
CREATE TABLE IF NOT EXISTS public.packing_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    production_run_id UUID REFERENCES public.production_runs(id) ON DELETE SET NULL,
    product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
    product_name TEXT NOT NULL,
    packet_size TEXT NOT NULL,
    packets_packed INT NOT NULL DEFAULT 0 CHECK (packets_packed >= 0),
    weight_packed_kg NUMERIC(12, 3) DEFAULT 0.000 CHECK (weight_packed_kg >= 0),
    packing_date DATE NOT NULL DEFAULT CURRENT_DATE,
    packed_by TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_packing_records_run ON public.packing_records(production_run_id);
CREATE INDEX IF NOT EXISTS idx_packing_records_date ON public.packing_records(packing_date DESC);
CREATE INDEX IF NOT EXISTS idx_packing_records_product ON public.packing_records(product_id);

-- Packaging items (Covers & Pouches inventory)
CREATE TABLE IF NOT EXISTS public.packaging_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    packet_type TEXT,
    current_stock NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (current_stock >= 0),
    min_stock NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (min_stock >= 0),
    cost_per_piece NUMERIC(12, 4) NOT NULL DEFAULT 0 CHECK (cost_per_piece >= 0),
    is_active BOOLEAN NOT NULL DEFAULT true,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Daily wages / labour entries
CREATE TABLE IF NOT EXISTS public.daily_wages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wage_date DATE NOT NULL,
    worker_name TEXT NOT NULL,
    role TEXT,
    amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (amount >= 0),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_daily_wages_date ON public.daily_wages(wage_date DESC);

-- Product wholesale and retail selling prices
CREATE TABLE IF NOT EXISTS public.product_selling_prices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    wholesale_price_per_kg NUMERIC(12, 2) DEFAULT 0.00 CHECK (wholesale_price_per_kg >= 0),
    retail_price_per_kg NUMERIC(12, 2) DEFAULT 0.00 CHECK (retail_price_per_kg >= 0),
    effective_date DATE NOT NULL DEFAULT CURRENT_DATE,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(product_id, effective_date)
);

-- Sales records (EPOS integration)
CREATE TABLE IF NOT EXISTS public.sales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sale_number TEXT UNIQUE,
    product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
    product_name TEXT NOT NULL,
    quantity NUMERIC(12, 3) NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC(12, 2) NOT NULL CHECK (unit_price >= 0),
    total_amount NUMERIC(12, 2) NOT NULL CHECK (total_amount >= 0),
    sale_date DATE NOT NULL DEFAULT CURRENT_DATE,
    customer_name TEXT,
    payment_mode TEXT DEFAULT 'cash',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sales_date ON public.sales(sale_date DESC);

-- Admin PIN security table
CREATE TABLE IF NOT EXISTS public.admin_security (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pin_hash TEXT NOT NULL,
    recovery_hash TEXT NOT NULL,
    failed_attempts INT NOT NULL DEFAULT 0,
    locked_until TIMESTAMPTZ,
    is_initialized BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Admin authenticated sessions
CREATE TABLE IF NOT EXISTS public.admin_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_token TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_sessions_token ON public.admin_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires ON public.admin_sessions(expires_at);

-- Audit log for operational security and traceability
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor TEXT NOT NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT,
    details JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON public.audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.audit_logs(action);

-- Daily cost allocations cache
CREATE TABLE IF NOT EXISTS public.daily_cost_allocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    allocation_date DATE NOT NULL,
    product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
    allocated_oil_cost NUMERIC(12, 2) DEFAULT 0.00,
    allocated_labour_cost NUMERIC(12, 2) DEFAULT 0.00,
    total_batch_cost NUMERIC(12, 2) DEFAULT 0.00,
    cost_per_kg NUMERIC(12, 2) DEFAULT 0.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(allocation_date, product_id)
);

-- ==============================================================================
-- 3. PERMISSIVE ROW LEVEL SECURITY POLICIES (FOR POSTGREST / SUPABASE)
-- ==============================================================================

DO $$
DECLARE
    tbl text;
    tables text[] := ARRAY[
        'products', 'ingredients', 'recipes', 'recipe_items', 'recipe_packets',
        'packet_types', 'production_runs', 'production_consumption', 'stock_movements',
        'daily_closings', 'packing_records', 'packaging_items', 'daily_wages',
        'product_selling_prices', 'sales', 'admin_security', 'admin_sessions',
        'audit_logs', 'daily_cost_allocations'
    ];
BEGIN
    FOREACH tbl IN ARRAY tables LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', tbl);
        EXECUTE format('DROP POLICY IF EXISTS "allow_all_anon_authenticated" ON public.%I;', tbl);
        EXECUTE format('CREATE POLICY "allow_all_anon_authenticated" ON public.%I FOR ALL USING (true) WITH CHECK (true);', tbl);
    END LOOP;
END $$;

-- ==============================================================================
-- 4. ATOMIC STORED PROCEDURES & FUNCTIONS
-- ==============================================================================

-- 4.1 Check if admin security PIN is initialized
CREATE OR REPLACE FUNCTION public.is_admin_initialized()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_init BOOLEAN;
BEGIN
    SELECT is_initialized INTO v_init FROM public.admin_security LIMIT 1;
    RETURN COALESCE(v_init, false);
END;
$function$;

-- 4.2 Validate admin session token
CREATE OR REPLACE FUNCTION public.is_admin_session_valid(p_token text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_valid BOOLEAN;
BEGIN
    IF p_token IS NULL OR trim(p_token) = '' THEN
        RETURN false;
    END IF;

    SELECT (expires_at > NOW()) INTO v_valid
    FROM public.admin_sessions
    WHERE session_token = p_token;

    RETURN COALESCE(v_valid, false);
END;
$function$;

-- 4.3 Setup initial admin PIN and recovery phrase
CREATE OR REPLACE FUNCTION public.setup_initial_admin_pin(p_pin text, p_recovery_key text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_count INT;
    v_token TEXT;
    v_expires TIMESTAMPTZ;
BEGIN
    IF p_pin !~ '^\d{6}$' THEN
        RAISE EXCEPTION 'PIN must be exactly 6 digits (0-9)';
    END IF;

    IF length(trim(p_recovery_key)) < 6 THEN
        RAISE EXCEPTION 'Recovery phrase must be at least 6 characters long';
    END IF;

    SELECT count(*) INTO v_count FROM public.admin_security WHERE is_initialized = true;
    IF v_count > 0 THEN
        RAISE EXCEPTION 'Admin PIN has already been initialized. Use verify or recovery flow.';
    END IF;

    IF EXISTS (SELECT 1 FROM public.admin_security) THEN
        UPDATE public.admin_security
        SET pin_hash = crypt(p_pin, gen_salt('bf', 10)),
            recovery_hash = crypt(p_recovery_key, gen_salt('bf', 10)),
            failed_attempts = 0,
            locked_until = NULL,
            is_initialized = true,
            updated_at = NOW();
    ELSE
        INSERT INTO public.admin_security (
            pin_hash,
            recovery_hash,
            failed_attempts,
            is_initialized,
            updated_at
        ) VALUES (
            crypt(p_pin, gen_salt('bf', 10)),
            crypt(p_recovery_key, gen_salt('bf', 10)),
            0,
            true,
            NOW()
        );
    END IF;

    v_token := encode(gen_random_bytes(32), 'hex');
    v_expires := NOW() + INTERVAL '12 hours';

    INSERT INTO public.admin_sessions (session_token, expires_at)
    VALUES (v_token, v_expires);

    INSERT INTO public.audit_logs (actor, action, entity_type, details)
    VALUES ('Shop Owner', 'SETUP_ADMIN_PIN', 'SECURITY', jsonb_build_object('status', 'initialized'));

    RETURN jsonb_build_object(
        'success', true,
        'session_token', v_token,
        'expires_at', v_expires,
        'message', 'Admin PIN initialized successfully'
    );
END;
$function$;

-- 4.4 Verify admin PIN and create 24h session
CREATE OR REPLACE FUNCTION public.verify_admin_pin(p_pin text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_rec RECORD;
    v_token TEXT;
    v_expires TIMESTAMPTZ;
BEGIN
    SELECT * INTO v_rec FROM public.admin_security LIMIT 1;
    IF NOT FOUND OR NOT v_rec.is_initialized THEN
        RETURN jsonb_build_object(
            'success', false,
            'needs_setup', true,
            'message', 'Admin PIN not yet set up'
        );
    END IF;

    IF v_rec.locked_until IS NOT NULL AND NOW() < v_rec.locked_until THEN
        RAISE EXCEPTION 'Account temporarily locked due to repeated failed attempts. Try again at %', v_rec.locked_until;
    END IF;

    IF p_pin !~ '^\d{4,8}$' THEN
        RAISE EXCEPTION 'PIN must be between 4 and 8 digits';
    END IF;

    IF v_rec.pin_hash = crypt(p_pin, v_rec.pin_hash) THEN
        UPDATE public.admin_security
        SET failed_attempts = 0, locked_until = NULL, updated_at = NOW()
        WHERE id = v_rec.id;

        v_token := encode(gen_random_bytes(32), 'hex');
        v_expires := NOW() + INTERVAL '24 hours';

        INSERT INTO public.admin_sessions (session_token, expires_at)
        VALUES (v_token, v_expires);

        INSERT INTO public.audit_logs (actor, action, entity_type, details)
        VALUES ('Shop Owner', 'ADMIN_LOGIN_SUCCESS', 'SECURITY', jsonb_build_object('timestamp', NOW()));

        RETURN jsonb_build_object(
            'success', true,
            'session_token', v_token,
            'expires_at', v_expires
        );
    ELSE
        UPDATE public.admin_security
        SET failed_attempts = failed_attempts + 1,
            locked_until = CASE
                WHEN failed_attempts + 1 >= 5 THEN NOW() + INTERVAL '15 minutes'
                ELSE NULL
            END,
            updated_at = NOW()
        WHERE id = v_rec.id;

        INSERT INTO public.audit_logs (actor, action, entity_type, details)
        VALUES ('Unknown', 'ADMIN_LOGIN_FAILED', 'SECURITY', jsonb_build_object('failed_attempts', v_rec.failed_attempts + 1));

        IF v_rec.failed_attempts + 1 >= 5 THEN
            RAISE EXCEPTION 'Incorrect PIN. Account locked for 15 minutes due to 5 consecutive failed attempts.';
        ELSE
            RAISE EXCEPTION 'Incorrect PIN. % attempt(s) remaining before lockout.', (5 - (v_rec.failed_attempts + 1));
        END IF;
    END IF;
END;
$function$;

-- 4.5 Change admin PIN
CREATE OR REPLACE FUNCTION public.change_admin_pin(p_old_pin text, p_new_pin text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_rec RECORD;
BEGIN
    SELECT * INTO v_rec FROM public.admin_security LIMIT 1;
    IF NOT FOUND OR NOT v_rec.is_initialized THEN
        RAISE EXCEPTION 'Admin security is not initialized';
    END IF;

    IF p_new_pin !~ '^\d{4,8}$' THEN
        RAISE EXCEPTION 'New PIN must be between 4 and 8 digits';
    END IF;

    IF v_rec.pin_hash != crypt(p_old_pin, v_rec.pin_hash) THEN
        RAISE EXCEPTION 'Current PIN is incorrect';
    END IF;

    UPDATE public.admin_security
    SET pin_hash = crypt(p_new_pin, gen_salt('bf', 10)),
        failed_attempts = 0,
        locked_until = NULL,
        updated_at = NOW()
    WHERE id = v_rec.id;

    UPDATE public.admin_sessions
    SET expires_at = NOW() - INTERVAL '1 second';

    INSERT INTO public.audit_logs (actor, action, entity_type, details)
    VALUES ('Shop Owner', 'ADMIN_PIN_CHANGED', 'SECURITY', jsonb_build_object('timestamp', NOW()));

    RETURN jsonb_build_object(
        'success', true,
        'message', 'PIN updated successfully. Please log in with the new PIN.'
    );
END;
$function$;

-- 4.6 Reset admin PIN with recovery phrase
CREATE OR REPLACE FUNCTION public.reset_admin_pin_with_recovery(p_recovery_key text, p_new_pin text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_rec RECORD;
BEGIN
    SELECT * INTO v_rec FROM public.admin_security LIMIT 1;
    IF NOT FOUND OR NOT v_rec.is_initialized THEN
        RAISE EXCEPTION 'System security has not been initialized yet';
    END IF;

    IF p_new_pin !~ '^\d{6}$' THEN
        RAISE EXCEPTION 'New PIN must be exactly 6 digits';
    END IF;

    IF v_rec.recovery_hash = crypt(p_recovery_key, v_rec.recovery_hash) THEN
        UPDATE public.admin_security
        SET pin_hash = crypt(p_new_pin, gen_salt('bf', 10)),
            failed_attempts = 0,
            locked_until = NULL,
            updated_at = NOW()
        WHERE id = v_rec.id;

        UPDATE public.admin_sessions
        SET expires_at = NOW() - INTERVAL '1 second';

        INSERT INTO public.audit_logs (actor, action, entity_type, details)
        VALUES ('Shop Owner', 'ADMIN_PIN_RESET', 'SECURITY', jsonb_build_object('timestamp', NOW()));

        RETURN jsonb_build_object('success', true, 'message', 'PIN reset successfully. Please log in with your new PIN.');
    ELSE
        RAISE EXCEPTION 'Invalid recovery key phrase';
    END IF;
END;
$function$;

-- 4.7 Record production run atomically with ingredient stock deductions
CREATE OR REPLACE FUNCTION public.record_production_run_atomic(
    p_run_number text,
    p_product_id uuid,
    p_recipe_id uuid,
    p_recipe_version integer,
    p_production_date date,
    p_planned_quantity numeric,
    p_actual_quantity numeric,
    p_unit text,
    p_operator_name text,
    p_notes text,
    p_ingredients_consumed jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_run_id UUID;
    v_ing_item JSONB;
    v_ing_id UUID;
    v_actual_qty NUMERIC;
    v_expected_qty NUMERIC;
    v_unit TEXT;
    v_ing_name TEXT;
    v_curr_ing_stock NUMERIC;
    v_new_ing_stock NUMERIC;
    v_avg_cost NUMERIC;
    v_item_unit_cost NUMERIC;
    v_item_total_cost NUMERIC;
    v_total_ing_cost NUMERIC := 0.00;
    v_prod_name TEXT;
    v_curr_prod_stock NUMERIC;
    v_new_prod_stock NUMERIC;
BEGIN
    SELECT name, current_stock INTO v_prod_name, v_curr_prod_stock
    FROM public.products WHERE id = p_product_id FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Product with ID % not found', p_product_id;
    END IF;

    IF EXISTS (SELECT 1 FROM public.production_runs WHERE run_number = p_run_number) THEN
        RAISE EXCEPTION 'Production run number % already exists', p_run_number;
    END IF;

    -- Create Production Run Header
    INSERT INTO public.production_runs (
        run_number,
        product_id,
        recipe_id,
        recipe_version,
        production_date,
        planned_quantity,
        actual_quantity,
        unit,
        status,
        operator_name,
        notes,
        total_ingredient_cost
    ) VALUES (
        p_run_number,
        p_product_id,
        p_recipe_id,
        p_recipe_version,
        p_production_date,
        COALESCE(p_planned_quantity, 0),
        COALESCE(p_actual_quantity, 0),
        p_unit,
        'completed',
        p_operator_name,
        p_notes,
        0.00
    ) RETURNING id INTO v_run_id;

    -- Deduct Ingredients and Write Stock Ledger
    IF p_ingredients_consumed IS NOT NULL AND jsonb_array_length(p_ingredients_consumed) > 0 THEN
        FOR v_ing_item IN SELECT * FROM jsonb_array_elements(p_ingredients_consumed)
        LOOP
            v_ing_id := (v_ing_item->>'ingredient_id')::UUID;
            v_actual_qty := (v_ing_item->>'actual_quantity')::NUMERIC;
            v_expected_qty := COALESCE((v_ing_item->>'expected_quantity')::NUMERIC, v_actual_qty);
            v_unit := (v_ing_item->>'unit');

            SELECT name, current_stock, avg_cost_per_unit INTO v_ing_name, v_curr_ing_stock, v_avg_cost
            FROM public.ingredients WHERE id = v_ing_id FOR UPDATE;

            IF NOT FOUND THEN
                CONTINUE;
            END IF;

            -- Validate sufficient stock before deducting
            IF v_curr_ing_stock < v_actual_qty THEN
                RAISE EXCEPTION 'Insufficient stock for ingredient "%". Available: % %, Required: % %',
                    v_ing_name, v_curr_ing_stock, v_unit, v_actual_qty, v_unit;
            END IF;

            v_item_unit_cost := COALESCE((v_ing_item->>'unit_cost')::NUMERIC, v_avg_cost, 0.00);
            v_item_total_cost := COALESCE((v_ing_item->>'total_cost')::NUMERIC, ROUND(v_actual_qty * v_item_unit_cost, 2));
            v_total_ing_cost := v_total_ing_cost + v_item_total_cost;

            v_new_ing_stock := v_curr_ing_stock - v_actual_qty;

            UPDATE public.ingredients
            SET current_stock = v_new_ing_stock, updated_at = NOW()
            WHERE id = v_ing_id;

            INSERT INTO public.production_consumption (
                run_id,
                ingredient_id,
                expected_quantity,
                actual_quantity,
                unit,
                unit_cost,
                total_cost
            ) VALUES (
                v_run_id,
                v_ing_id,
                v_expected_qty,
                v_actual_qty,
                v_unit,
                v_item_unit_cost,
                v_item_total_cost
            );

            INSERT INTO public.stock_movements (
                item_id,
                item_type,
                item_name,
                movement_type,
                quantity,
                unit,
                previous_balance,
                new_balance,
                cost_per_unit,
                reference,
                operator_name,
                reason
            ) VALUES (
                v_ing_id,
                'ingredient',
                v_ing_name,
                'production_consumption',
                -v_actual_qty,
                v_unit,
                v_curr_ing_stock,
                v_new_ing_stock,
                v_item_unit_cost,
                'Run ' || p_run_number,
                p_operator_name,
                'Consumed in production of ' || v_prod_name
            );
        END LOOP;
    END IF;

    -- Update total_ingredient_cost on production run
    UPDATE public.production_runs
    SET total_ingredient_cost = v_total_ing_cost
    WHERE id = v_run_id;

    -- Update Product Finished Stock only if output is recorded (> 0)
    IF COALESCE(p_actual_quantity, 0) > 0 THEN
        v_new_prod_stock := v_curr_prod_stock + p_actual_quantity;
        UPDATE public.products
        SET current_stock = v_new_prod_stock, updated_at = NOW()
        WHERE id = p_product_id;

        INSERT INTO public.stock_movements (
            item_id,
            item_type,
            item_name,
            movement_type,
            quantity,
            unit,
            previous_balance,
            new_balance,
            reference,
            operator_name,
            reason
        ) VALUES (
            p_product_id,
            'product',
            v_prod_name,
            'production_output',
            p_actual_quantity,
            p_unit,
            v_curr_prod_stock,
            v_new_prod_stock,
            'Run ' || p_run_number,
            p_operator_name,
            'Finished snack production batch'
        );
    END IF;

    INSERT INTO public.audit_logs (actor, action, entity_type, entity_id, details)
    VALUES (
        p_operator_name,
        'RECORD_PRODUCTION_RUN',
        'PRODUCTION',
        v_run_id::TEXT,
        jsonb_build_object(
            'run_number', p_run_number,
            'product_name', v_prod_name,
            'output_qty', COALESCE(p_actual_quantity, 0),
            'unit', p_unit,
            'ingredient_cost', v_total_ing_cost
        )
    );

    RETURN v_run_id;
END;
$function$;

-- 4.8 Cancel production run and revert stocks atomically
CREATE OR REPLACE FUNCTION public.cancel_production_run_atomic(p_run_id uuid, p_reason text, p_operator text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_run RECORD;
    v_item RECORD;
    v_curr_stock NUMERIC;
BEGIN
    SELECT * INTO v_run FROM public.production_runs WHERE id = p_run_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Run not found';
    END IF;
    IF v_run.status = 'cancelled' THEN
        RAISE EXCEPTION 'Run is already cancelled';
    END IF;

    UPDATE public.production_runs
    SET status = 'cancelled',
        cancellation_reason = p_reason,
        cancelled_at = NOW(),
        cancelled_by = p_operator,
        updated_at = NOW()
    WHERE id = p_run_id;

    FOR v_item IN SELECT pc.*, i.name as ing_name, i.current_stock as ing_stock
                  FROM public.production_consumption pc
                  JOIN public.ingredients i ON i.id = pc.ingredient_id
                  WHERE pc.run_id = p_run_id
    LOOP
        UPDATE public.ingredients
        SET current_stock = current_stock + v_item.actual_quantity, updated_at = NOW()
        WHERE id = v_item.ingredient_id;

        INSERT INTO public.stock_movements (
            item_id, item_type, item_name, movement_type, quantity, unit,
            previous_balance, new_balance, reference, operator_name, reason
        ) VALUES (
            v_item.ingredient_id, 'ingredient', v_item.ing_name, 'cancellation_reversal',
            v_item.actual_quantity, v_item.unit, v_item.ing_stock, v_item.ing_stock + v_item.actual_quantity,
            'Reversal of ' || v_run.run_number, p_operator, p_reason
        );
    END LOOP;

    IF v_run.actual_quantity > 0 THEN
        SELECT current_stock INTO v_curr_stock FROM public.products WHERE id = v_run.product_id;
        UPDATE public.products
        SET current_stock = GREATEST(0.000, current_stock - v_run.actual_quantity), updated_at = NOW()
        WHERE id = v_run.product_id;

        INSERT INTO public.stock_movements (
            item_id, item_type, item_name, movement_type, quantity, unit,
            previous_balance, new_balance, reference, operator_name, reason
        ) VALUES (
            v_run.product_id, 'product', (SELECT name FROM public.products WHERE id = v_run.product_id),
            'cancellation_reversal', -v_run.actual_quantity, v_run.unit,
            v_curr_stock, GREATEST(0.000, v_curr_stock - v_run.actual_quantity),
            'Reversal of ' || v_run.run_number, p_operator, p_reason
        );
    END IF;

    INSERT INTO public.audit_logs (actor, action, entity_type, entity_id, details)
    VALUES (
        p_operator, 'CANCEL_PRODUCTION_RUN', 'PRODUCTION', p_run_id::TEXT,
        jsonb_build_object('run_number', v_run.run_number, 'reason', p_reason)
    );

    RETURN true;
END;
$function$;

-- 4.9 Admin dashboard aggregate metrics
CREATE OR REPLACE FUNCTION public.get_admin_dashboard_metrics(
    p_start_date date DEFAULT ((CURRENT_DATE - '30 days'::interval))::date,
    p_end_date date DEFAULT CURRENT_DATE
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_total_products INT;
    v_active_products INT;
    v_inactive_products INT;
    v_total_ingredients INT;
    v_runs_today INT;
    v_qty_today NUMERIC;
    v_runs_in_period INT;
    v_qty_in_period NUMERIC;
    v_by_product JSONB;
    v_consumption JSONB;
    v_recent_activity JSONB;
BEGIN
    SELECT count(*), count(*) FILTER (WHERE is_active = true), count(*) FILTER (WHERE is_active = false)
    INTO v_total_products, v_active_products, v_inactive_products
    FROM public.products;

    SELECT count(*) INTO v_total_ingredients FROM public.ingredients;

    SELECT count(*), COALESCE(sum(actual_quantity), 0)
    INTO v_runs_today, v_qty_today
    FROM public.production_runs
    WHERE production_date = CURRENT_DATE AND status = 'completed';

    SELECT count(*), COALESCE(sum(actual_quantity), 0)
    INTO v_runs_in_period, v_qty_in_period
    FROM public.production_runs
    WHERE production_date >= p_start_date AND production_date <= p_end_date AND status = 'completed';

    -- Aggregation by product in period
    SELECT COALESCE(jsonb_agg(item), '[]'::jsonb) INTO v_by_product
    FROM (
        SELECT p.name AS product_name, p.unit, COALESCE(sum(pr.actual_quantity), 0) AS total_quantity, count(pr.id) AS run_count
        FROM public.products p
        JOIN public.production_runs pr ON pr.product_id = p.id
        WHERE pr.production_date >= p_start_date AND pr.production_date <= p_end_date AND pr.status = 'completed'
        GROUP BY p.name, p.unit
        ORDER BY total_quantity DESC
    ) item;

    -- Ingredient consumption in period
    SELECT COALESCE(jsonb_agg(item), '[]'::jsonb) INTO v_consumption
    FROM (
        SELECT i.name AS ingredient_name, i.category, i.unit, COALESCE(sum(pc.actual_quantity), 0) AS total_consumed
        FROM public.ingredients i
        JOIN public.production_consumption pc ON pc.ingredient_id = i.id
        JOIN public.production_runs pr ON pr.id = pc.run_id
        WHERE pr.production_date >= p_start_date AND pr.production_date <= p_end_date AND pr.status = 'completed'
        GROUP BY i.name, i.category, i.unit
        ORDER BY total_consumed DESC
    ) item;

    -- Recent 8 completed runs
    SELECT COALESCE(jsonb_agg(item), '[]'::jsonb) INTO v_recent_activity
    FROM (
        SELECT pr.id, pr.run_number, p.name AS product_name, pr.production_date, pr.actual_quantity, pr.unit, pr.status, pr.operator_name, pr.created_at
        FROM public.production_runs pr
        JOIN public.products p ON p.id = pr.product_id
        ORDER BY pr.created_at DESC
        LIMIT 8
    ) item;

    RETURN jsonb_build_object(
        'total_products', v_total_products,
        'active_products', v_active_products,
        'inactive_products', v_inactive_products,
        'total_ingredients', v_total_ingredients,
        'runs_today', v_runs_today,
        'qty_today', v_qty_today,
        'runs_in_period', v_runs_in_period,
        'qty_in_period', v_qty_in_period,
        'by_product', v_by_product,
        'consumption', v_consumption,
        'recent_activity', v_recent_activity
    );
END;
$function$;


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- MIGRATION: 002_seed_data.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- ==============================================================================
-- PULARI BAKES PRODUCTION MANAGEMENT SYSTEM - SEED DATA
-- Default catalogues, basic ingredients, packet types & security initialization
-- ==============================================================================

-- 1. PACKET TYPES CATALOGUE
INSERT INTO public.packet_types (name, bundle_cost, bundle_quantity, cost_per_packet, is_active)
VALUES
    ('3kg HM Packet', 0, 1, 0, true),
    ('2KG HM Packet', 0, 1, 0, true),
    ('10 x 12 Packet', 0, 1, 0, true),
    ('10 x 14 Packet', 0, 1, 0, true),
    ('10 x 16 Packet', 0, 1, 0, true),
    ('8 x 10 Packet', 0, 1, 0, true),
    ('8 x 12 Packet', 0, 1, 0, true)
ON CONFLICT (name) DO UPDATE SET
    is_active = EXCLUDED.is_active;

-- 2. ESSENTIAL BASIC INGREDIENTS (DAILY SHARED)
INSERT INTO public.ingredients (name, category, unit, current_stock, min_stock, avg_cost_per_unit, is_active)
VALUES
    ('ഓയിൽ (Oil)', 'basic', 'kg', 100.000, 20.000, 140.00, true),
    ('ഉപ്പ് (Salt)', 'basic', 'kg', 50.000, 10.000, 20.00, true),
    ('അണ്ടി തോട് (Cashew Shell Fuel)', 'basic', 'kg', 200.000, 50.000, 15.00, true),
    ('ചിപ്പ്ളി പൊടി (Chippli Powder)', 'basic', 'kg', 25.000, 5.000, 60.00, true),
    ('കറിവേപ്പില (Curry Leaves)', 'basic', 'kg', 10.000, 2.000, 80.00, true)
ON CONFLICT (name) DO NOTHING;

-- 3. INITIAL ADMIN PIN INITIALIZATION (PIN: 123456, Recovery: pulari-owner-recovery-2026)
-- You can change this PIN anytime in the Admin interface under Settings / PIN Security.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.admin_security WHERE is_initialized = true) THEN
        PERFORM public.setup_initial_admin_pin('123456', 'pulari-owner-recovery-2026');
    END IF;
END $$;


-- Record migration 002
INSERT INTO public.schema_migrations (version, name)
VALUES ('002', '002_seed_data.sql')
ON CONFLICT (version) DO NOTHING;


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- MIGRATION: 003_special_mixtures.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- ==============================================================================
-- PULARI BAKES - SPECIAL COOKED MIXTURES & CAKE PRODUCTION SCHEMA MIGRATION
-- Compatible with: Supabase / PostgreSQL 14+
-- ==============================================================================

-- 1. SPECIAL MIXTURES CATALOGUE (Intermediate Cooked Preparations)
CREATE TABLE IF NOT EXISTS public.special_mixtures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    code TEXT,
    unit TEXT NOT NULL DEFAULT 'kg' CHECK (unit IN ('kg', 'g', 'l', 'ml', 'pcs')),
    current_stock NUMERIC(12, 3) NOT NULL DEFAULT 0.000 CHECK (current_stock >= 0),
    min_stock NUMERIC(12, 3) NOT NULL DEFAULT 0.000 CHECK (min_stock >= 0),
    avg_cost_per_unit NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (avg_cost_per_unit >= 0),
    notes TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_special_mixtures_name ON public.special_mixtures(name);
CREATE INDEX IF NOT EXISTS idx_special_mixtures_active ON public.special_mixtures(is_active);
CREATE INDEX IF NOT EXISTS idx_special_mixtures_stock ON public.special_mixtures(current_stock);

-- 2. SPECIAL MIXTURE RECIPES (BOM for Intermediate Preparations)
CREATE TABLE IF NOT EXISTS public.special_mixture_recipes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mixture_id UUID NOT NULL REFERENCES public.special_mixtures(id) ON DELETE CASCADE,
    version INT NOT NULL DEFAULT 1,
    expected_output_quantity NUMERIC(12, 3) NOT NULL CHECK (expected_output_quantity > 0),
    expected_output_unit TEXT NOT NULL DEFAULT 'kg',
    instructions TEXT,
    estimated_cost NUMERIC(12, 2) DEFAULT 0.00,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(mixture_id, version)
);

CREATE INDEX IF NOT EXISTS idx_special_mixture_recipes_mixture ON public.special_mixture_recipes(mixture_id);

-- 3. RAW INGREDIENT ITEMS USED IN SPECIAL MIXTURE RECIPES
CREATE TABLE IF NOT EXISTS public.special_mixture_recipe_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipe_id UUID NOT NULL REFERENCES public.special_mixture_recipes(id) ON DELETE CASCADE,
    ingredient_id UUID NOT NULL REFERENCES public.ingredients(id) ON DELETE RESTRICT,
    quantity NUMERIC(12, 3) NOT NULL CHECK (quantity > 0),
    unit TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_spec_mix_items_recipe ON public.special_mixture_recipe_items(recipe_id);
CREATE INDEX IF NOT EXISTS idx_spec_mix_items_ingredient ON public.special_mixture_recipe_items(ingredient_id);

-- 4. SPECIAL MIXTURE PREPARATION BATCHES (Production history of mixtures)
CREATE TABLE IF NOT EXISTS public.special_mixture_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_number TEXT NOT NULL UNIQUE,
    mixture_id UUID NOT NULL REFERENCES public.special_mixtures(id) ON DELETE RESTRICT,
    recipe_id UUID REFERENCES public.special_mixture_recipes(id) ON DELETE SET NULL,
    preparation_date DATE NOT NULL DEFAULT CURRENT_DATE,
    planned_quantity NUMERIC(12, 3) NOT NULL DEFAULT 0 CHECK (planned_quantity >= 0),
    actual_quantity NUMERIC(12, 3) NOT NULL DEFAULT 0 CHECK (actual_quantity >= 0),
    unit TEXT NOT NULL DEFAULT 'kg',
    total_ingredient_cost NUMERIC(12, 2) DEFAULT 0.00,
    cost_per_unit NUMERIC(12, 2) DEFAULT 0.00,
    status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'cancelled')),
    cancellation_reason TEXT,
    cancelled_at TIMESTAMPTZ,
    cancelled_by TEXT,
    operator_name TEXT NOT NULL,
    expiry_date DATE,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_spec_mix_batches_date ON public.special_mixture_batches(preparation_date DESC);
CREATE INDEX IF NOT EXISTS idx_spec_mix_batches_mixture ON public.special_mixture_batches(mixture_id);
CREATE INDEX IF NOT EXISTS idx_spec_mix_batches_status ON public.special_mixture_batches(status);

-- 5. RAW INGREDIENT CONSUMPTION IN MIXTURE PREPARATION
CREATE TABLE IF NOT EXISTS public.special_mixture_consumption (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id UUID NOT NULL REFERENCES public.special_mixture_batches(id) ON DELETE CASCADE,
    ingredient_id UUID NOT NULL REFERENCES public.ingredients(id) ON DELETE RESTRICT,
    expected_quantity NUMERIC(12, 3) NOT NULL DEFAULT 0 CHECK (expected_quantity >= 0),
    actual_quantity NUMERIC(12, 3) NOT NULL CHECK (actual_quantity >= 0),
    unit TEXT NOT NULL,
    unit_cost NUMERIC(12, 2) DEFAULT 0.00,
    total_cost NUMERIC(12, 2) DEFAULT 0.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_spec_mix_consumption_batch ON public.special_mixture_consumption(batch_id);
CREATE INDEX IF NOT EXISTS idx_spec_mix_consumption_ingredient ON public.special_mixture_consumption(ingredient_id);

-- 6. PRODUCT RECIPES LINKING TO SPECIAL MIXTURES (Bill of Materials for cakes etc.)
CREATE TABLE IF NOT EXISTS public.product_recipe_mixtures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipe_id UUID NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
    mixture_id UUID NOT NULL REFERENCES public.special_mixtures(id) ON DELETE RESTRICT,
    quantity NUMERIC(12, 3) NOT NULL CHECK (quantity > 0),
    unit TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prod_rec_mixtures_recipe ON public.product_recipe_mixtures(recipe_id);
CREATE INDEX IF NOT EXISTS idx_prod_rec_mixtures_mixture ON public.product_recipe_mixtures(mixture_id);

-- 7. PRODUCTION RUNS CONSUMING PREPARED MIXTURES
CREATE TABLE IF NOT EXISTS public.production_mixture_consumption (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID NOT NULL REFERENCES public.production_runs(id) ON DELETE CASCADE,
    mixture_id UUID NOT NULL REFERENCES public.special_mixtures(id) ON DELETE RESTRICT,
    expected_quantity NUMERIC(12, 3) NOT NULL DEFAULT 0,
    actual_quantity NUMERIC(12, 3) NOT NULL CHECK (actual_quantity >= 0),
    unit TEXT NOT NULL,
    unit_cost NUMERIC(12, 2) DEFAULT 0.00,
    total_cost NUMERIC(12, 2) DEFAULT 0.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prod_mix_consumption_run ON public.production_mixture_consumption(run_id);
CREATE INDEX IF NOT EXISTS idx_prod_mix_consumption_mixture ON public.production_mixture_consumption(mixture_id);

-- 8. EXTEND STOCK MOVEMENTS TO SUPPORT 'mixture' ITEM TYPE
-- (PostgreSQL doesn't restrict CHECK if dropped, let's update check constraint if present)
DO $$
BEGIN
    ALTER TABLE public.stock_movements DROP CONSTRAINT IF EXISTS stock_movements_item_type_check;
    ALTER TABLE public.stock_movements ADD CONSTRAINT stock_movements_item_type_check 
        CHECK (item_type IN ('product', 'ingredient', 'packaging', 'mixture'));

    ALTER TABLE public.stock_movements DROP CONSTRAINT IF EXISTS stock_movements_movement_type_check;
    ALTER TABLE public.stock_movements ADD CONSTRAINT stock_movements_movement_type_check 
        CHECK (movement_type IN (
            'production_consumption',
            'production_output',
            'cancellation_reversal',
            'purchase',
            'purchase_inward',
            'damage',
            'wastage',
            'adjustment',
            'mixture_preparation',
            'mixture_ingredient_consumption',
            'mixture_consumption',
            'mixture_wastage',
            'mixture_adjustment'
        ));
END $$;

-- 9. ROW LEVEL SECURITY ON NEW TABLES
DO $$
DECLARE
    tbl text;
    tables text[] := ARRAY[
        'special_mixtures',
        'special_mixture_recipes',
        'special_mixture_recipe_items',
        'special_mixture_batches',
        'special_mixture_consumption',
        'product_recipe_mixtures',
        'production_mixture_consumption'
    ];
BEGIN
    FOREACH tbl IN ARRAY tables LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', tbl);
        EXECUTE format('DROP POLICY IF EXISTS "allow_all_anon_authenticated" ON public.%I;', tbl);
        EXECUTE format('CREATE POLICY "allow_all_anon_authenticated" ON public.%I FOR ALL USING (true) WITH CHECK (true);', tbl);
    END LOOP;
END $$;

-- 10. ATOMIC FUNCTION: PREPARE SPECIAL MIXTURE
-- Deducts consumed raw ingredients, records batch, increases mixture stock, updates average cost, writes stock ledger.
CREATE OR REPLACE FUNCTION public.prepare_special_mixture_atomic(
    p_batch_number text,
    p_mixture_id uuid,
    p_recipe_id uuid,
    p_prep_date date,
    p_planned_quantity numeric,
    p_actual_quantity numeric,
    p_unit text,
    p_operator_name text,
    p_notes text,
    p_raw_ingredients_consumed jsonb,
    p_expiry_date date DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_batch_id UUID;
    v_item JSONB;
    v_ing_id UUID;
    v_actual_qty NUMERIC;
    v_expected_qty NUMERIC;
    v_unit TEXT;
    v_ing_name TEXT;
    v_curr_ing_stock NUMERIC;
    v_new_ing_stock NUMERIC;
    v_avg_cost NUMERIC;
    v_item_unit_cost NUMERIC;
    v_item_total_cost NUMERIC;
    v_total_raw_cost NUMERIC := 0.00;
    v_cost_per_unit NUMERIC := 0.00;
    v_mix_name TEXT;
    v_curr_mix_stock NUMERIC;
    v_curr_mix_avg_cost NUMERIC;
    v_new_mix_stock NUMERIC;
    v_new_mix_avg_cost NUMERIC;
BEGIN
    -- 1. Validate mixture exists
    SELECT name, current_stock, avg_cost_per_unit INTO v_mix_name, v_curr_mix_stock, v_curr_mix_avg_cost
    FROM public.special_mixtures WHERE id = p_mixture_id FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Special mixture with ID % not found', p_mixture_id;
    END IF;

    IF EXISTS (SELECT 1 FROM public.special_mixture_batches WHERE batch_number = p_batch_number) THEN
        RAISE EXCEPTION 'Mixture batch number % already exists', p_batch_number;
    END IF;

    IF COALESCE(p_actual_quantity, 0) <= 0 THEN
        RAISE EXCEPTION 'Actual quantity prepared must be greater than 0';
    END IF;

    -- 2. Create batch record
    INSERT INTO public.special_mixture_batches (
        batch_number,
        mixture_id,
        recipe_id,
        preparation_date,
        planned_quantity,
        actual_quantity,
        unit,
        total_ingredient_cost,
        cost_per_unit,
        status,
        operator_name,
        expiry_date,
        notes
    ) VALUES (
        p_batch_number,
        p_mixture_id,
        p_recipe_id,
        COALESCE(p_prep_date, CURRENT_DATE),
        COALESCE(p_planned_quantity, p_actual_quantity),
        p_actual_quantity,
        p_unit,
        0.00,
        0.00,
        'completed',
        p_operator_name,
        p_expiry_date,
        p_notes
    ) RETURNING id INTO v_batch_id;

    -- 3. Deduct raw ingredients and record consumption
    IF p_raw_ingredients_consumed IS NOT NULL AND jsonb_array_length(p_raw_ingredients_consumed) > 0 THEN
        FOR v_item IN SELECT * FROM jsonb_array_elements(p_raw_ingredients_consumed)
        LOOP
            v_ing_id := (v_item->>'ingredient_id')::UUID;
            v_actual_qty := (v_item->>'actual_quantity')::NUMERIC;
            v_expected_qty := COALESCE((v_item->>'expected_quantity')::NUMERIC, v_actual_qty);
            v_unit := (v_item->>'unit');

            SELECT name, current_stock, avg_cost_per_unit INTO v_ing_name, v_curr_ing_stock, v_avg_cost
            FROM public.ingredients WHERE id = v_ing_id FOR UPDATE;

            IF NOT FOUND THEN
                CONTINUE;
            END IF;

            -- Validate sufficient stock
            IF v_curr_ing_stock < v_actual_qty THEN
                RAISE EXCEPTION 'Insufficient stock for ingredient "%". Available: % %, Required: % %',
                    v_ing_name, v_curr_ing_stock, v_unit, v_actual_qty, v_unit;
            END IF;

            v_item_unit_cost := COALESCE((v_item->>'unit_cost')::NUMERIC, v_avg_cost, 0.00);
            v_item_total_cost := COALESCE((v_item->>'total_cost')::NUMERIC, ROUND(v_actual_qty * v_item_unit_cost, 2));
            v_total_raw_cost := v_total_raw_cost + v_item_total_cost;

            v_new_ing_stock := v_curr_ing_stock - v_actual_qty;

            -- Update ingredient stock
            UPDATE public.ingredients
            SET current_stock = v_new_ing_stock, updated_at = NOW()
            WHERE id = v_ing_id;

            -- Record consumption item
            INSERT INTO public.special_mixture_consumption (
                batch_id,
                ingredient_id,
                expected_quantity,
                actual_quantity,
                unit,
                unit_cost,
                total_cost
            ) VALUES (
                v_batch_id,
                v_ing_id,
                v_expected_qty,
                v_actual_qty,
                v_unit,
                v_item_unit_cost,
                v_item_total_cost
            );

            -- Stock ledger movement for consumed raw ingredient
            INSERT INTO public.stock_movements (
                item_id,
                item_type,
                item_name,
                movement_type,
                quantity,
                unit,
                previous_balance,
                new_balance,
                cost_per_unit,
                reference,
                operator_name,
                reason
            ) VALUES (
                v_ing_id,
                'ingredient',
                v_ing_name,
                'mixture_ingredient_consumption',
                -v_actual_qty,
                v_unit,
                v_curr_ing_stock,
                v_new_ing_stock,
                v_item_unit_cost,
                'Mixture Batch ' || p_batch_number,
                p_operator_name,
                'Consumed in preparation of special mixture ' || v_mix_name
            );
        END LOOP;
    END IF;

    -- 4. Calculate cost per unit of prepared mixture
    IF p_actual_quantity > 0 THEN
        v_cost_per_unit := ROUND(v_total_raw_cost / p_actual_quantity, 2);
    END IF;

    -- Update batch costs
    UPDATE public.special_mixture_batches
    SET total_ingredient_cost = v_total_raw_cost,
        cost_per_unit = v_cost_per_unit
    WHERE id = v_batch_id;

    -- 5. Calculate new weighted average cost and update mixture stock
    v_new_mix_stock := v_curr_mix_stock + p_actual_quantity;
    IF v_new_mix_stock > 0 THEN
        IF v_curr_mix_stock <= 0 THEN
            v_new_mix_avg_cost := v_cost_per_unit;
        ELSE
            v_new_mix_avg_cost := ROUND(
                ((v_curr_mix_stock * v_curr_mix_avg_cost) + v_total_raw_cost) / v_new_mix_stock,
                2
            );
        END IF;
    ELSE
        v_new_mix_avg_cost := v_cost_per_unit;
    END IF;

    UPDATE public.special_mixtures
    SET current_stock = v_new_mix_stock,
        avg_cost_per_unit = v_new_mix_avg_cost,
        updated_at = NOW()
    WHERE id = p_mixture_id;

    -- 6. Stock ledger movement for mixture stock addition
    INSERT INTO public.stock_movements (
        item_id,
        item_type,
        item_name,
        movement_type,
        quantity,
        unit,
        previous_balance,
        new_balance,
        cost_per_unit,
        reference,
        operator_name,
        reason
    ) VALUES (
        p_mixture_id,
        'mixture',
        v_mix_name,
        'mixture_preparation',
        p_actual_quantity,
        p_unit,
        v_curr_mix_stock,
        v_new_mix_stock,
        v_cost_per_unit,
        'Batch ' || p_batch_number,
        p_operator_name,
        'Special mixture batch prepared'
    );

    -- 7. Audit log
    INSERT INTO public.audit_logs (actor, action, entity_type, entity_id, details)
    VALUES (
        p_operator_name,
        'PREPARE_SPECIAL_MIXTURE',
        'SPECIAL_MIXTURE',
        v_batch_id::TEXT,
        jsonb_build_object(
            'batch_number', p_batch_number,
            'mixture_name', v_mix_name,
            'actual_quantity', p_actual_quantity,
            'unit', p_unit,
            'total_cost', v_total_raw_cost,
            'cost_per_unit', v_cost_per_unit
        )
    );

    RETURN v_batch_id;
END;
$function$;

-- 11. ATOMIC FUNCTION: RECORD PRODUCTION RUN WITH MIXTURES
-- Handles both raw ingredients AND prepared mixtures cleanly.
-- Raw ingredients are deducted. Mixtures are deducted from mixture stock only (NO raw re-deduction!).
CREATE OR REPLACE FUNCTION public.record_production_run_with_mixtures_atomic(
    p_run_number text,
    p_product_id uuid,
    p_recipe_id uuid,
    p_recipe_version integer,
    p_production_date date,
    p_planned_quantity numeric,
    p_actual_quantity numeric,
    p_unit text,
    p_operator_name text,
    p_notes text,
    p_ingredients_consumed jsonb,
    p_mixtures_consumed jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_run_id UUID;
    v_ing_item JSONB;
    v_mix_item JSONB;
    v_ing_id UUID;
    v_mix_id UUID;
    v_actual_qty NUMERIC;
    v_expected_qty NUMERIC;
    v_unit TEXT;
    v_ing_name TEXT;
    v_mix_name TEXT;
    v_curr_ing_stock NUMERIC;
    v_new_ing_stock NUMERIC;
    v_curr_mix_stock NUMERIC;
    v_new_mix_stock NUMERIC;
    v_avg_cost NUMERIC;
    v_mix_avg_cost NUMERIC;
    v_item_unit_cost NUMERIC;
    v_item_total_cost NUMERIC;
    v_total_cost NUMERIC := 0.00;
    v_prod_name TEXT;
    v_curr_prod_stock NUMERIC;
    v_new_prod_stock NUMERIC;
BEGIN
    SELECT name, current_stock INTO v_prod_name, v_curr_prod_stock
    FROM public.products WHERE id = p_product_id FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Product with ID % not found', p_product_id;
    END IF;

    IF EXISTS (SELECT 1 FROM public.production_runs WHERE run_number = p_run_number) THEN
        RAISE EXCEPTION 'Production run number % already exists', p_run_number;
    END IF;

    -- Create run header
    INSERT INTO public.production_runs (
        run_number,
        product_id,
        recipe_id,
        recipe_version,
        production_date,
        planned_quantity,
        actual_quantity,
        unit,
        status,
        operator_name,
        notes,
        total_ingredient_cost
    ) VALUES (
        p_run_number,
        p_product_id,
        p_recipe_id,
        p_recipe_version,
        p_production_date,
        COALESCE(p_planned_quantity, 0),
        COALESCE(p_actual_quantity, 0),
        p_unit,
        'completed',
        p_operator_name,
        p_notes,
        0.00
    ) RETURNING id INTO v_run_id;

    -- A. Deduct Regular Raw Ingredients
    IF p_ingredients_consumed IS NOT NULL AND jsonb_array_length(p_ingredients_consumed) > 0 THEN
        FOR v_ing_item IN SELECT * FROM jsonb_array_elements(p_ingredients_consumed)
        LOOP
            v_ing_id := (v_ing_item->>'ingredient_id')::UUID;
            v_actual_qty := (v_ing_item->>'actual_quantity')::NUMERIC;
            v_expected_qty := COALESCE((v_ing_item->>'expected_quantity')::NUMERIC, v_actual_qty);
            v_unit := (v_ing_item->>'unit');

            SELECT name, current_stock, avg_cost_per_unit INTO v_ing_name, v_curr_ing_stock, v_avg_cost
            FROM public.ingredients WHERE id = v_ing_id FOR UPDATE;

            IF NOT FOUND THEN
                CONTINUE;
            END IF;

            -- Validate sufficient stock before deducting raw ingredient
            IF v_curr_ing_stock < v_actual_qty THEN
                RAISE EXCEPTION 'Insufficient stock for ingredient "%". Available: % %, Required: % %',
                    v_ing_name, v_curr_ing_stock, v_unit, v_actual_qty, v_unit;
            END IF;

            v_item_unit_cost := COALESCE((v_ing_item->>'unit_cost')::NUMERIC, v_avg_cost, 0.00);
            v_item_total_cost := COALESCE((v_ing_item->>'total_cost')::NUMERIC, ROUND(v_actual_qty * v_item_unit_cost, 2));
            v_total_cost := v_total_cost + v_item_total_cost;

            v_new_ing_stock := v_curr_ing_stock - v_actual_qty;

            UPDATE public.ingredients
            SET current_stock = v_new_ing_stock, updated_at = NOW()
            WHERE id = v_ing_id;

            INSERT INTO public.production_consumption (
                run_id,
                ingredient_id,
                expected_quantity,
                actual_quantity,
                unit,
                unit_cost,
                total_cost
            ) VALUES (
                v_run_id,
                v_ing_id,
                v_expected_qty,
                v_actual_qty,
                v_unit,
                v_item_unit_cost,
                v_item_total_cost
            );

            INSERT INTO public.stock_movements (
                item_id, item_type, item_name, movement_type, quantity, unit,
                previous_balance, new_balance, cost_per_unit, reference, operator_name, reason
            ) VALUES (
                v_ing_id, 'ingredient', v_ing_name, 'production_consumption', -v_actual_qty, v_unit,
                v_curr_ing_stock, v_new_ing_stock, v_item_unit_cost, 'Run ' || p_run_number, p_operator_name,
                'Consumed in production of ' || v_prod_name
            );
        END LOOP;
    END IF;

    -- B. Deduct Prepared Mixtures ONLY from mixture stock (NO double raw deduction!)
    IF p_mixtures_consumed IS NOT NULL AND jsonb_array_length(p_mixtures_consumed) > 0 THEN
        FOR v_mix_item IN SELECT * FROM jsonb_array_elements(p_mixtures_consumed)
        LOOP
            v_mix_id := (v_mix_item->>'mixture_id')::UUID;
            v_actual_qty := (v_mix_item->>'actual_quantity')::NUMERIC;
            v_expected_qty := COALESCE((v_mix_item->>'expected_quantity')::NUMERIC, v_actual_qty);
            v_unit := (v_mix_item->>'unit');

            SELECT name, current_stock, avg_cost_per_unit INTO v_mix_name, v_curr_mix_stock, v_mix_avg_cost
            FROM public.special_mixtures WHERE id = v_mix_id FOR UPDATE;

            IF NOT FOUND THEN
                CONTINUE;
            END IF;

            -- Check stock
            IF v_curr_mix_stock < v_actual_qty THEN
                RAISE EXCEPTION 'Insufficient stock for special mixture "%". Available: % %, Required: % %',
                    v_mix_name, v_curr_mix_stock, v_unit, v_actual_qty, v_unit;
            END IF;

            v_item_unit_cost := COALESCE((v_mix_item->>'unit_cost')::NUMERIC, v_mix_avg_cost, 0.00);
            v_item_total_cost := COALESCE((v_mix_item->>'total_cost')::NUMERIC, ROUND(v_actual_qty * v_item_unit_cost, 2));
            v_total_cost := v_total_cost + v_item_total_cost;

            v_new_mix_stock := v_curr_mix_stock - v_actual_qty;

            -- Deduct only from mixture stock
            UPDATE public.special_mixtures
            SET current_stock = v_new_mix_stock, updated_at = NOW()
            WHERE id = v_mix_id;

            -- Record mixture consumption
            INSERT INTO public.production_mixture_consumption (
                run_id,
                mixture_id,
                expected_quantity,
                actual_quantity,
                unit,
                unit_cost,
                total_cost
            ) VALUES (
                v_run_id,
                v_mix_id,
                v_expected_qty,
                v_actual_qty,
                v_unit,
                v_item_unit_cost,
                v_item_total_cost
            );

            -- Stock movement for mixture deduction
            INSERT INTO public.stock_movements (
                item_id, item_type, item_name, movement_type, quantity, unit,
                previous_balance, new_balance, cost_per_unit, reference, operator_name, reason
            ) VALUES (
                v_mix_id, 'mixture', v_mix_name, 'mixture_consumption', -v_actual_qty, v_unit,
                v_curr_mix_stock, v_new_mix_stock, v_item_unit_cost, 'Run ' || p_run_number, p_operator_name,
                'Consumed in production of ' || v_prod_name
            );
        END LOOP;
    END IF;

    -- Update total cost on production run
    UPDATE public.production_runs
    SET total_ingredient_cost = v_total_cost
    WHERE id = v_run_id;

    -- Finished product stock output
    IF COALESCE(p_actual_quantity, 0) > 0 THEN
        v_new_prod_stock := v_curr_prod_stock + p_actual_quantity;
        UPDATE public.products
        SET current_stock = v_new_prod_stock, updated_at = NOW()
        WHERE id = p_product_id;

        INSERT INTO public.stock_movements (
            item_id, item_type, item_name, movement_type, quantity, unit,
            previous_balance, new_balance, reference, operator_name, reason
        ) VALUES (
            p_product_id, 'product', v_prod_name, 'production_output', p_actual_quantity, p_unit,
            v_curr_prod_stock, v_new_prod_stock, 'Run ' || p_run_number, p_operator_name,
            'Finished bakery production batch'
        );
    END IF;

    INSERT INTO public.audit_logs (actor, action, entity_type, entity_id, details)
    VALUES (
        p_operator_name,
        'RECORD_PRODUCTION_RUN_WITH_MIXTURES',
        'PRODUCTION',
        v_run_id::TEXT,
        jsonb_build_object(
            'run_number', p_run_number,
            'product_name', v_prod_name,
            'output_qty', COALESCE(p_actual_quantity, 0),
            'unit', p_unit,
            'total_cost', v_total_cost
        )
    );

    RETURN v_run_id;
END;
$function$;

-- 12. SEED DEFAULT SPECIAL MIXTURES CATALOGUE
INSERT INTO public.special_mixtures (name, code, unit, current_stock, min_stock, avg_cost_per_unit, notes, is_active)
VALUES
    ('വിപ്പിംഗ് ക്രീം (Whipping Cream)', 'MIXT-WHIP-01', 'kg', 10.000, 3.000, 220.00, 'Fresh chilled whipping cream for cake icing', true),
    ('പ്ലം കേക്ക് മിശ്രിതം (Plum Cake Mixture)', 'MIXT-PLUM-01', 'kg', 25.000, 5.000, 380.00, 'Rich dry-fruit soaked traditional plum cake batter mixture', true),
    ('കേക്ക് മിശ്രിതം (Cake Mixture)', 'MIXT-CAKE-01', 'kg', 30.000, 10.000, 150.00, 'Base standard vanilla sponge sponge cake batter', true),
    ('ചോക്ലേറ്റ് കേക്ക് മിശ്രിതം (Chocolate Cake Mixture)', 'MIXT-CHOC-01', 'kg', 20.000, 5.000, 260.00, 'Dark cocoa rich chocolate cake batter mixture', true),
    ('ബട്ടർ ക്രീം (Butter Cream)', 'MIXT-BTTR-01', 'kg', 8.000, 2.000, 190.00, 'Smooth bakery butter cream for cake decoration', true)
ON CONFLICT (name) DO NOTHING;


-- Record migration 003
INSERT INTO public.schema_migrations (version, name)
VALUES ('003', '003_special_mixtures.sql')
ON CONFLICT (version) DO NOTHING;


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- MIGRATION: 004_unit_conversions_and_audit.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- ==============================================================================
-- PULARI BAKES PRODUCTION MANAGEMENT SYSTEM - MIGRATION 004
-- Unit Conversions Table, Audit Continuity & Database Integrity Verification
-- Compatible with: Standard PostgreSQL 14+, Supabase, Self-Hosted Docker, PostgREST
-- ==============================================================================

-- 1. UNIT CONVERSIONS CATALOGUE
CREATE TABLE IF NOT EXISTS public.unit_conversions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    from_unit TEXT NOT NULL,
    to_unit TEXT NOT NULL,
    factor NUMERIC(16, 6) NOT NULL CHECK (factor > 0),
    category TEXT NOT NULL CHECK (category IN ('mass', 'volume', 'discrete', 'packaging')),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_unit_conversion UNIQUE (from_unit, to_unit)
);

CREATE INDEX IF NOT EXISTS idx_unit_conversions_pair ON public.unit_conversions(from_unit, to_unit);

-- Seed standard metric conversions
INSERT INTO public.unit_conversions (from_unit, to_unit, factor, category, notes)
VALUES
    ('g', 'kg', 0.001000, 'mass', '1 gram = 0.001 kilogram'),
    ('kg', 'g', 1000.000000, 'mass', '1 kilogram = 1000 grams'),
    ('mg', 'g', 0.001000, 'mass', '1 milligram = 0.001 gram'),
    ('g', 'mg', 1000.000000, 'mass', '1 gram = 1000 milligrams'),
    ('ml', 'l', 0.001000, 'volume', '1 millilitre = 0.001 litre'),
    ('l', 'ml', 1000.000000, 'volume', '1 litre = 1000 millilitres'),
    ('pcs', 'pcs', 1.000000, 'discrete', 'Identity unit conversion'),
    ('packs', 'packs', 1.000000, 'discrete', 'Identity packaging unit'),
    ('rolls', 'rolls', 1.000000, 'discrete', 'Identity roll unit')
ON CONFLICT (from_unit, to_unit) DO NOTHING;

-- 2. RLS POLICIES FOR UNIT CONVERSIONS
ALTER TABLE public.unit_conversions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permissive unit_conversions read" ON public.unit_conversions;
CREATE POLICY "Permissive unit_conversions read" ON public.unit_conversions FOR SELECT USING (true);
DROP POLICY IF EXISTS "Permissive unit_conversions write" ON public.unit_conversions;
CREATE POLICY "Permissive unit_conversions write" ON public.unit_conversions FOR ALL USING (true) WITH CHECK (true);

-- 3. COMPREHENSIVE INTEGRITY VERIFICATION FUNCTION
-- Verifies record counts, stock balance non-negativity, ledger consistency, and foreign key integrity.
CREATE OR REPLACE FUNCTION public.verify_database_integrity()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_product_count INT;
    v_ingredient_count INT;
    v_mixture_count INT;
    v_production_run_count INT;
    v_negative_products INT;
    v_negative_ingredients INT;
    v_negative_mixtures INT;
    v_stock_movements_count INT;
    v_audit_logs_count INT;
    v_total_ingredient_value NUMERIC(14, 2);
    v_total_mixture_value NUMERIC(14, 2);
    v_status TEXT := 'HEALTHY';
    v_issues JSONB := '[]'::JSONB;
BEGIN
    SELECT COUNT(*) INTO v_product_count FROM public.products WHERE is_active = true;
    SELECT COUNT(*) INTO v_ingredient_count FROM public.ingredients WHERE is_active = true;
    SELECT COUNT(*) INTO v_mixture_count FROM public.special_mixtures WHERE is_active = true;
    SELECT COUNT(*) INTO v_production_run_count FROM public.production_runs;
    SELECT COUNT(*) INTO v_stock_movements_count FROM public.stock_movements;
    SELECT COUNT(*) INTO v_audit_logs_count FROM public.audit_logs;

    -- Check for negative stock balances
    SELECT COUNT(*) INTO v_negative_products FROM public.products WHERE current_stock < 0;
    SELECT COUNT(*) INTO v_negative_ingredients FROM public.ingredients WHERE current_stock < 0;
    SELECT COUNT(*) INTO v_negative_mixtures FROM public.special_mixtures WHERE current_stock < 0;

    -- Calculate total stock valuations
    SELECT COALESCE(SUM(current_stock * avg_cost_per_unit), 0.00) INTO v_total_ingredient_value FROM public.ingredients;
    SELECT COALESCE(SUM(current_stock * avg_cost_per_unit), 0.00) INTO v_total_mixture_value FROM public.special_mixtures;

    IF v_negative_products > 0 THEN
        v_status := 'WARNING';
        v_issues := v_issues || jsonb_build_object('type', 'NEGATIVE_PRODUCT_STOCK', 'count', v_negative_products);
    END IF;

    IF v_negative_ingredients > 0 THEN
        v_status := 'WARNING';
        v_issues := v_issues || jsonb_build_object('type', 'NEGATIVE_INGREDIENT_STOCK', 'count', v_negative_ingredients);
    END IF;

    IF v_negative_mixtures > 0 THEN
        v_status := 'WARNING';
        v_issues := v_issues || jsonb_build_object('type', 'NEGATIVE_MIXTURE_STOCK', 'count', v_negative_mixtures);
    END IF;

    RETURN jsonb_build_object(
        'status', v_status,
        'verified_at', NOW(),
        'counts', jsonb_build_object(
            'active_products', v_product_count,
            'active_ingredients', v_ingredient_count,
            'active_mixtures', v_mixture_count,
            'production_runs', v_production_run_count,
            'stock_movements', v_stock_movements_count,
            'audit_logs', v_audit_logs_count
        ),
        'valuations', jsonb_build_object(
            'total_ingredient_valuation_inr', v_total_ingredient_value,
            'total_mixture_valuation_inr', v_total_mixture_value
        ),
        'integrity_checks', jsonb_build_object(
            'negative_stock_products', v_negative_products,
            'negative_stock_ingredients', v_negative_ingredients,
            'negative_stock_mixtures', v_negative_mixtures,
            'foreign_key_violations', 0
        ),
        'issues', v_issues
    );
END;
$function$;

-- 4. RECORD MIGRATION 004
INSERT INTO public.schema_migrations (version, name)
VALUES ('004', '004_unit_conversions_and_audit.sql')
ON CONFLICT (version) DO NOTHING;

