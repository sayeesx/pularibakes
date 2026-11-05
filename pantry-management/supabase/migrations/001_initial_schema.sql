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
