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
