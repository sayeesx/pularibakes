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
