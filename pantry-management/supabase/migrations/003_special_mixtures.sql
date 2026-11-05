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
