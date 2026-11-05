-- Migration: Add packet_types and recipe_packets tables, add packets column to recipes, and link packing_records to production_runs

-- 1. Create packet_types table
CREATE TABLE IF NOT EXISTS public.packet_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    bundle_cost NUMERIC(12, 2) NOT NULL DEFAULT 0,
    bundle_quantity NUMERIC(12, 2) NOT NULL DEFAULT 1,
    cost_per_packet NUMERIC(12, 4) NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.packet_types DISABLE ROW LEVEL SECURITY;

-- 2. Create recipe_packets table
CREATE TABLE IF NOT EXISTS public.recipe_packets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipe_id UUID NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
    packet_type_id UUID REFERENCES public.packet_types(id) ON DELETE SET NULL,
    packet_name TEXT NOT NULL,
    cost_per_packet NUMERIC(12, 4) NOT NULL DEFAULT 0,
    bundle_cost NUMERIC(12, 2) NOT NULL DEFAULT 0,
    bundle_quantity NUMERIC(12, 2) NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.recipe_packets DISABLE ROW LEVEL SECURITY;

-- 3. Add packets JSONB column to recipes table for flexible local/cached lookups
ALTER TABLE public.recipes ADD COLUMN IF NOT EXISTS packets JSONB DEFAULT '[]'::jsonb;

-- 4. Add production_run_id column to packing_records table
ALTER TABLE public.packing_records ADD COLUMN IF NOT EXISTS production_run_id UUID REFERENCES public.production_runs(id) ON DELETE SET NULL;

-- 5. Seed default packet types requested by user
INSERT INTO public.packet_types (name, bundle_cost, bundle_quantity, cost_per_packet, is_active)
SELECT '3kg HM Packet', 0, 1, 0, true
WHERE NOT EXISTS (SELECT 1 FROM public.packet_types WHERE name = '3kg HM Packet');

INSERT INTO public.packet_types (name, bundle_cost, bundle_quantity, cost_per_packet, is_active)
SELECT '2KG HM Packet', 0, 1, 0, true
WHERE NOT EXISTS (SELECT 1 FROM public.packet_types WHERE name = '2KG HM Packet');

INSERT INTO public.packet_types (name, bundle_cost, bundle_quantity, cost_per_packet, is_active)
SELECT '10 x 12 Packet', 0, 1, 0, true
WHERE NOT EXISTS (SELECT 1 FROM public.packet_types WHERE name = '10 x 12 Packet');

INSERT INTO public.packet_types (name, bundle_cost, bundle_quantity, cost_per_packet, is_active)
SELECT '10 x 14 Packet', 0, 1, 0, true
WHERE NOT EXISTS (SELECT 1 FROM public.packet_types WHERE name = '10 x 14 Packet');

INSERT INTO public.packet_types (name, bundle_cost, bundle_quantity, cost_per_packet, is_active)
SELECT '10 x 16 Packet', 0, 1, 0, true
WHERE NOT EXISTS (SELECT 1 FROM public.packet_types WHERE name = '10 x 16 Packet');

INSERT INTO public.packet_types (name, bundle_cost, bundle_quantity, cost_per_packet, is_active)
SELECT '8 x 10 Packet', 0, 1, 0, true
WHERE NOT EXISTS (SELECT 1 FROM public.packet_types WHERE name = '8 x 10 Packet');

INSERT INTO public.packet_types (name, bundle_cost, bundle_quantity, cost_per_packet, is_active)
SELECT '8 x 12 Packet', 0, 1, 0, true
WHERE NOT EXISTS (SELECT 1 FROM public.packet_types WHERE name = '8 x 12 Packet');
