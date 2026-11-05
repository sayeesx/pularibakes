-- Migration 003: Enable Row Level Security (RLS) on public.packet_types and public.recipe_packets
-- Fixes Supabase lint warnings for exposed public tables

-- 1. Enable RLS on public.packet_types
ALTER TABLE public.packet_types ENABLE ROW LEVEL SECURITY;

-- Allow reading packet types
CREATE POLICY "Allow public read access on packet_types"
    ON public.packet_types
    FOR SELECT
    USING (true);

-- Allow full access for data manipulation
CREATE POLICY "Allow write access on packet_types"
    ON public.packet_types
    FOR ALL
    USING (true)
    WITH CHECK (true);

-- 2. Enable RLS on public.recipe_packets
ALTER TABLE public.recipe_packets ENABLE ROW LEVEL SECURITY;

-- Allow reading recipe packets
CREATE POLICY "Allow public read access on recipe_packets"
    ON public.recipe_packets
    FOR SELECT
    USING (true);

-- Allow full access for data manipulation
CREATE POLICY "Allow write access on recipe_packets"
    ON public.recipe_packets
    FOR ALL
    USING (true)
    WITH CHECK (true);
