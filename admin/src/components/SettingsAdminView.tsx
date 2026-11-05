import React, { useState, useEffect } from 'react';
import {
  FiLock,
  FiShield,
  FiTrash2,
  FiRefreshCw,
  FiCheck,
  FiAlertTriangle,
  FiEye,
  FiEyeOff,
  FiInfo,
  FiPrinter,
  FiSave,
  FiKey,
} from 'react-icons/fi';
import { supabase, invalidateAdminCache, resetAllStocksToZero, verifyAdminPin } from '../services/supabase';
import {
  Product,
  Ingredient,
  ProductionRun,
  StockMovement,
  FactoryProfile,
  DEFAULT_FACTORY_PROFILE,
} from '../types';
import { useFeedback } from '../context/FeedbackContext';
import { useLanguage } from '../context/LanguageContext';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { FiGlobe, FiSun, FiMoon } from 'react-icons/fi';

interface SettingsAdminViewProps {
  products: Product[];
  ingredients: Ingredient[];
  productionRuns: ProductionRun[];
  stockMovements: StockMovement[];
  onRefresh: () => void;
}

export const SettingsAdminView: React.FC<SettingsAdminViewProps> = ({
  products,
  ingredients,
  productionRuns,
  stockMovements,
  onRefresh,
}) => {
  const { showToast } = useFeedback();
  const { language, setLanguage, t } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const { changePin } = useAuth();

  // ==========================================
  // 1. ADMIN PIN STATE (6 Digits - Default: 123456)
  // ==========================================
  const [oldAdminPin, setOldAdminPin] = useState<string>('');
  const [newAdminPin, setNewAdminPin] = useState<string>('');
  const [confirmAdminPin, setConfirmAdminPin] = useState<string>('');
  const [adminPinLoading, setAdminPinLoading] = useState<boolean>(false);
  const [adminPinMessage, setAdminPinMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // ==========================================
  // 2. PANTRY / PRODUCTION PIN STATE (4 Digits - Default: 1234)
  // ==========================================
  const [currentPin, setCurrentPin] = useState<string>('1234');
  const [showCurrentPin, setShowCurrentPin] = useState<boolean>(false);
  const [newPin, setNewPin] = useState<string>('');
  const [confirmPin, setConfirmPin] = useState<string>('');
  const [pinLoading, setPinLoading] = useState<boolean>(false);
  const [pinMessage, setPinMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const cleanFooter = (text?: string) => {
    return (text || '').replace(/ശുദ്ധമായ എണ്ണയിൽ തയ്യാറാക്കിയത്\.?/g, '').trim();
  };

  // ==========================================
  // 2. FACTORY PROFILE STATE
  // ==========================================
  const [profile, setProfile] = useState<FactoryProfile>(() => {
    try {
      const saved = localStorage.getItem('pulari_factory_profile');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.billFooter) {
          parsed.billFooter = cleanFooter(parsed.billFooter) || 'നന്ദി! വീണ്ടും സന്ദർശിക്കുക.';
        }
        return { ...DEFAULT_FACTORY_PROFILE, ...parsed };
      }
      return DEFAULT_FACTORY_PROFILE;
    } catch {
      return DEFAULT_FACTORY_PROFILE;
    }
  });
  const [profileSaved, setProfileSaved] = useState<boolean>(false);

  // ==========================================
  // 3. DATA RESET MODAL & ACTION
  // ==========================================
  type ResetActionType = 'sales' | 'batches' | 'ledger' | 'stock' | 'zero_all_stocks' | 'full';
  const [resetModalType, setResetModalType] = useState<ResetActionType | null>(null);
  const [enteredPin, setEnteredPin] = useState<string>('');
  const [resetConfirmationText, setResetConfirmationText] = useState<string>('');
  const [resetError, setResetError] = useState<string>('');
  const [resetLoading, setResetLoading] = useState<boolean>(false);
  const [resetSuccessNotice, setResetSuccessNotice] = useState<string | null>(null);

  // Load PIN and Factory Profile from cache and audit logs
  useEffect(() => {
    const cached = localStorage.getItem('pulari_production_pin');
    if (cached && /^\d{4}$/.test(cached)) setCurrentPin(cached);

    (async () => {
      try {
        // Fetch PIN
        const { data: pinData } = await supabase
          .from('audit_logs')
          .select('details')
          .eq('action', 'PRODUCTION_PIN_CHANGED')
          .order('created_at', { ascending: false })
          .limit(1);

        if (pinData && pinData.length > 0 && pinData[0].details?.pin) {
          const pinVal = String(pinData[0].details.pin);
          if (/^\d{4}$/.test(pinVal)) {
            setCurrentPin(pinVal);
            localStorage.setItem('pulari_production_pin', pinVal);
          }
        }

        // Fetch Factory / Bill Profile
        const { data: profileData } = await supabase
          .from('audit_logs')
          .select('details')
          .eq('action', 'FACTORY_PROFILE_UPDATED')
          .order('created_at', { ascending: false })
          .limit(1);

        if (profileData && profileData.length > 0 && profileData[0].details) {
          const remoteProfile = profileData[0].details;
          if (remoteProfile.billFooter) {
            remoteProfile.billFooter = cleanFooter(remoteProfile.billFooter) || 'നന്ദി! വീണ്ടും സന്ദർശിക്കുക.';
          }
          const merged = { ...DEFAULT_FACTORY_PROFILE, ...remoteProfile };
          setProfile(merged);
          localStorage.setItem('pulari_factory_profile', JSON.stringify(merged));
          window.dispatchEvent(new CustomEvent('pulari_factory_profile_updated', { detail: merged }));
        }
      } catch {
        // silent fallback
      }
    })();
  }, []);

  // Update Admin PIN (6 Digits)
  const handleUpdateAdminPin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminPinMessage(null);

    if (!oldAdminPin.trim()) {
      setAdminPinMessage({
        type: 'error',
        text: 'നിലവിലെ അഡ്മിൻ പിൻ നൽകുക (Please enter current Admin PIN)',
      });
      return;
    }

    if (!/^\d{6}$/.test(newAdminPin)) {
      setAdminPinMessage({
        type: 'error',
        text: 'പുതിയ അഡ്മിൻ പിൻ കൃത്യമായി 6 അക്കങ്ങൾ (0-9) ആയിരിക്കണം (Admin PIN must be exactly 6 digits)',
      });
      return;
    }

    if (newAdminPin !== confirmAdminPin) {
      setAdminPinMessage({
        type: 'error',
        text: 'നൽകിയ രണ്ട് അഡ്മിൻ പിന്നുകളും പൊരുത്തപ്പെടുന്നില്ല (Admin PINs do not match)',
      });
      return;
    }

    setAdminPinLoading(true);
    try {
      const res = await changePin(oldAdminPin.trim(), newAdminPin.trim());
      if (res.success) {
        setOldAdminPin('');
        setNewAdminPin('');
        setConfirmAdminPin('');
        setAdminPinMessage({
          type: 'success',
          text: 'അഡ്മിൻ പിൻ വിജയകരമായി മാറ്റി! (Admin PIN updated successfully to 6 digits)',
        });
        showToast('അഡ്മിൻ പിൻ വിജയകരമായി മാറ്റി!', 'success');
        setTimeout(() => setAdminPinMessage(null), 4000);
      } else {
        setAdminPinMessage({
          type: 'error',
          text: res.error || 'പിൻ അപ്ഡേറ്റ് ചെയ്യുന്നതിൽ പരാജയപ്പെട്ടു (Failed to update PIN)',
        });
      }
    } catch (err: any) {
      setAdminPinMessage({
        type: 'error',
        text: err?.message || 'Error updating Admin PIN',
      });
    } finally {
      setAdminPinLoading(false);
    }
  };

  // Update Production PIN (4 Digits)
  const handleUpdatePin = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinMessage(null);

    if (!/^\d{4}$/.test(newPin)) {
      setPinMessage({
        type: 'error',
        text: 'പിൻ കൃത്യമായി 4 അക്കങ്ങൾ (0-9) ആയിരിക്കണം (PIN must be exactly 4 digits)',
      });
      return;
    }

    if (newPin !== confirmPin) {
      setPinMessage({
        type: 'error',
        text: 'നൽകിയ രണ്ട് പിന്നുകളും പൊരുത്തപ്പെടുന്നില്ല (PINs do not match)',
      });
      return;
    }

    setPinLoading(true);
    try {
      // 1. Audit log in Supabase
      await supabase.from('audit_logs').insert([
        {
          actor: 'Super Admin',
          action: 'PRODUCTION_PIN_CHANGED',
          entity_type: 'SECURITY',
          entity_id: null,
          details: { pin: newPin, updated_at: new Date().toISOString() },
        },
      ]);

      // 2. Cache locally
      localStorage.setItem('pulari_production_pin', newPin);
      setCurrentPin(newPin);
      setNewPin('');
      setConfirmPin('');
      setPinMessage({
        type: 'success',
        text: 'പ്രൊഡക്ഷൻ പിൻ വിജയകരമായി മാറ്റി! (Production PIN updated successfully)',
      });
      setTimeout(() => setPinMessage(null), 3000);
    } catch (err: any) {
      localStorage.setItem('pulari_production_pin', newPin);
      setCurrentPin(newPin);
      setNewPin('');
      setConfirmPin('');
      setPinMessage({
        type: 'success',
        text: 'പ്രൊഡക്ഷൻ പിൻ സേവ് ചെയ്തു! (PIN saved locally)',
      });
      setTimeout(() => setPinMessage(null), 3000);
    } finally {
      setPinLoading(false);
    }
  };

  // Save Factory Profile
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    const updatedProfile = {
      ...profile,
      billFooter: cleanFooter(profile.billFooter) || 'നന്ദി! വീണ്ടും സന്ദർശിക്കുക.',
    };
    try {
      localStorage.setItem('pulari_factory_profile', JSON.stringify(updatedProfile));
      setProfile(updatedProfile);
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 2500);

      // Dispatch event so Sleek Bill Preview updates immediately
      window.dispatchEvent(new CustomEvent('pulari_factory_profile_updated', { detail: updatedProfile }));
      window.dispatchEvent(new Event('storage'));

      // Cloud persistence via Supabase audit_logs
      await supabase.from('audit_logs').insert({
        action: 'FACTORY_PROFILE_UPDATED',
        details: updatedProfile,
      });
    } catch {
      // Local storage fallback already succeeded
    }
  };

  // Execute Data Reset
  const handleExecuteReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError('');

    // PIN verification: verify 6-digit Admin PIN
    const cleanPin = enteredPin.trim();
    const activeAdminPin = localStorage.getItem('pulari_admin_pin') || '123456';
    let isPinCorrect = cleanPin === activeAdminPin;

    if (!isPinCorrect) {
      try {
        const res = await verifyAdminPin(cleanPin);
        if (res.success) isPinCorrect = true;
      } catch {
        // offline fallback
      }
    }

    if (!isPinCorrect) {
      setResetError('നൽകിയ അഡ്മിൻ പിൻ തെറ്റാണ്! (Invalid Admin PIN. Enter 123456)');
      return;
    }

    if (resetModalType === 'full' && resetConfirmationText.trim().toUpperCase() !== 'RESET') {
      setResetError('ദയവായി ബോക്സിൽ "RESET" എന്ന് ടൈപ്പ് ചെയ്യുക (Type RESET to confirm)');
      return;
    }

    setResetLoading(true);
    try {
      if (resetModalType === 'sales') {
        // Clear sales
        const { error: sErr } = await supabase.from('sales').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        if (sErr) throw sErr;
        invalidateAdminCache();
        setResetSuccessNotice('വിൽപ്പന രേഖകൾ പൂർണ്ണമായി റീസെറ്റ് ചെയ്തു (Sales cleared)');
        showToast('വിൽപ്പന രേഖകൾ പൂർണ്ണമായി റീസെറ്റ് ചെയ്തു!', 'success');
      } else if (resetModalType === 'batches') {
        // 1. Reverse product stock produced and restore ingredient consumption for all runs
        const { data: allRuns } = await supabase
          .from('production_runs')
          .select(`
            id,
            actual_quantity,
            product_id,
            production_consumption (
              ingredient_id,
              actual_quantity
            )
          `);

        if (allRuns && allRuns.length > 0) {
          const prodDeductMap = new Map<string, number>();
          const ingRestoreMap = new Map<string, number>();

          for (const run of allRuns) {
            if (run.product_id && Number(run.actual_quantity) > 0) {
              prodDeductMap.set(run.product_id, (prodDeductMap.get(run.product_id) || 0) + Number(run.actual_quantity));
            }
            if (run.production_consumption && (run.production_consumption as any[]).length > 0) {
              for (const pc of run.production_consumption as any[]) {
                if (pc.ingredient_id && Number(pc.actual_quantity) > 0) {
                  ingRestoreMap.set(pc.ingredient_id, (ingRestoreMap.get(pc.ingredient_id) || 0) + Number(pc.actual_quantity));
                }
              }
            }
          }

          // Deduct produced kg from products
          for (const [pId, qty] of prodDeductMap.entries()) {
            const { data: prod } = await supabase.from('products').select('current_stock').eq('id', pId).maybeSingle();
            if (prod) {
              const newStock = Math.max(0, Number(((prod.current_stock || 0) - qty).toFixed(3)));
              await supabase.from('products').update({ current_stock: newStock, updated_at: new Date().toISOString() }).eq('id', pId);
            }
          }

          // Restore consumed ingredients back to stock
          for (const [iId, qty] of ingRestoreMap.entries()) {
            const { data: ing } = await supabase.from('ingredients').select('current_stock').eq('id', iId).maybeSingle();
            if (ing) {
              const newStock = Number(((ing.current_stock || 0) + qty).toFixed(3));
              await supabase.from('ingredients').update({ current_stock: newStock, updated_at: new Date().toISOString() }).eq('id', iId);
            }
          }
        }

        // 2. Clear all packing records for products (so packets are not kept active on costing)
        const { error: pkrErr } = await supabase
          .from('packing_records')
          .delete()
          .neq('id', '00000000-0000-0000-0000-000000000000');
        if (pkrErr) {
          console.warn('Clear packing records error:', pkrErr);
        }

        // 3. Clear runs, consumption, closings, allocations
        const { error: pcErr } = await supabase.from('production_consumption').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        if (pcErr) throw pcErr;
        const { error: prErr } = await supabase.from('production_runs').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        if (prErr) throw prErr;
        const { error: dcErr } = await supabase.from('daily_closings').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        if (dcErr) throw dcErr;
        const { error: dcaErr } = await supabase.from('daily_cost_allocations').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        if (dcaErr) throw dcaErr;

        invalidateAdminCache();
        setResetSuccessNotice('പ്രൊഡക്ഷൻ ബാച്ചുകളും പാക്കറ്റുകളും റീസെറ്റ് ചെയ്തു, സ്റ്റോക്ക് ക്രമീകരിച്ചു (Batches & packets cleared, stocks reversed)');
        showToast('പ്രൊഡക്ഷൻ ബാച്ചുകളും പാക്കറ്റുകളും റീസെറ്റ് ചെയ്തു, സ്റ്റോക്ക് ക്രമീകരിച്ചു!', 'success');
      } else if (resetModalType === 'ledger') {
        // Clear stock movements
        const { error: smErr } = await supabase.from('stock_movements').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        if (smErr) throw smErr;
        invalidateAdminCache();
        setResetSuccessNotice('സ്റ്റോക്ക് ലെഡ്ജർ ക്ലിയർ ചെയ്തു (Stock ledger cleared)');
        showToast('സ്റ്റോക്ക് ലെഡ്ജർ ക്ലിയർ ചെയ്തു!', 'success');
      } else if (resetModalType === 'stock') {
        // Reset raw ingredients to baseline
        for (const ing of ingredients) {
          const baseline = ing.category === 'basic' ? 50 : 20;
          const { error } = await supabase.from('ingredients').update({ current_stock: baseline, updated_at: new Date().toISOString() }).eq('id', ing.id);
          if (error) throw error;
        }
        invalidateAdminCache();
        setResetSuccessNotice('ചേരുവകളുടെ സ്റ്റോക്ക് ക്രമീകരിച്ചു (Ingredient stock reset)');
        showToast('ചേരുവകളുടെ സ്റ്റോക്ക് ആരംഭ അളവിലേക്ക് പുനഃസ്ഥാപിച്ചു!', 'success');
      } else if (resetModalType === 'zero_all_stocks') {
        // Reset all products, ingredients, and packaging items current_stock to 0
        const res = await resetAllStocksToZero();
        if (!res.success) {
          throw new Error(res.message);
        }
        invalidateAdminCache();
        setResetSuccessNotice('എല്ലാ ഉൽപ്പന്നങ്ങൾ, ചേരുവകൾ, പാക്കറ്റുകൾ എന്നിവയുടെ സ്റ്റോക്ക് പൂജ്യമാക്കി (0)! (All stocks reset to 0)');
        showToast('എല്ലാ ഉൽപ്പന്നങ്ങൾ, ചേരുവകൾ, പാക്കറ്റുകൾ എന്നിവയുടെ സ്റ്റോക്ക് പൂജ്യമാക്കി (0)!', 'success');
      } else if (resetModalType === 'full') {
        // Full factory reset: clear sales, runs, consumption, closings, allocations, stock movements, reset product stock to 0, ingredients to baseline
        const { error: sErr } = await supabase.from('sales').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        if (sErr) throw sErr;
        try {
          await supabase.from('packing_records').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        } catch {}
        const { error: pcErr } = await supabase.from('production_consumption').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        if (pcErr) throw pcErr;
        const { error: prErr } = await supabase.from('production_runs').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        if (prErr) throw prErr;
        const { error: dcErr } = await supabase.from('daily_closings').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        if (dcErr) throw dcErr;
        const { error: dcaErr } = await supabase.from('daily_cost_allocations').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        if (dcaErr) throw dcaErr;
        const { error: smErr } = await supabase.from('stock_movements').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        if (smErr) throw smErr;

        // Reset product stocks to 0
        const { error: pZeroErr } = await supabase.from('products').update({ current_stock: 0, updated_at: new Date().toISOString() }).neq('id', '00000000-0000-0000-0000-000000000000');
        if (pZeroErr) throw pZeroErr;

        // Reset ingredients to baseline
        for (const ing of ingredients) {
          const baseline = ing.category === 'basic' ? 50 : 20;
          await supabase.from('ingredients').update({ current_stock: baseline, updated_at: new Date().toISOString() }).eq('id', ing.id);
        }

        invalidateAdminCache();
        setResetSuccessNotice('ഫാക്ടറി ഡാറ്റ പൂർണ്ണമായി റീസെറ്റ് ചെയ്തു (Full factory reset complete)');
        showToast('ഫാക്ടറി ഡാറ്റ പൂർണ്ണമായി റീസെറ്റ് ചെയ്തു!', 'success');
      }

      // Audit log
      try {
        await supabase.from('audit_logs').insert([
          {
            actor: 'Super Admin',
            action: `RESET_${(resetModalType || 'DATA').toUpperCase()}`,
            entity_type: 'SYSTEM',
            entity_id: 'MAINTENANCE',
            details: { type: resetModalType, executed_at: new Date().toISOString() },
          },
        ]);
      } catch (logErr) {
        console.warn('Audit log write error (non-fatal):', logErr);
      }

      setResetModalType(null);
      setEnteredPin('');
      setResetConfirmationText('');
      window.dispatchEvent(new Event('storage'));
      onRefresh();
    } catch (err: any) {
      setResetError(`റീസെറ്റ് ചെയ്യുന്നതിൽ തടസ്സം: ${err?.message || 'Error executing reset'}`);
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-16 font-sans">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-stone-200 dark:border-[#2E2828]">
        <div>
                    <h1 className="text-xl sm:text-2xl font-black text-stone-900 dark:text-white flex items-center gap-2">
            <span>{language === 'ml' ? 'സിസ്റ്റം ക്രമീകരണങ്ങൾ' : 'System Settings'}</span>
          </h1>
          <p className="text-xs text-stone-500 dark:text-stone-400 mt-1">
            {language === 'ml'
              ? 'പ്രൊഡക്ഷൻ പിൻ, ഫാക്ടറി വിവരങ്ങൾ, ഡാറ്റ നിയന്ത്രണങ്ങൾ'
              : 'Production PIN, factory profile, data reset tools'}
          </p>
        </div>

        {resetSuccessNotice && (
          <div className="p-2.5 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 text-xs font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-2 font-malayalam animate-fade-in">
            <FiCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{resetSuccessNotice}</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* ============================================================ */}
        {/* CARD 0: LANGUAGE & APPEARANCE SYSTEM                         */}
        {/* ============================================================ */}
        <div className="lg:col-span-2 p-6 rounded-3xl bg-white dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#2E2828] shadow-apple-card space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-pulari-primary/10 text-pulari-primary dark:text-pulari-gold flex items-center justify-center font-black">
                <FiGlobe className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-stone-900 dark:text-white">
                  {language === 'ml' ? 'ഭാഷ & ഡിസൈൻ തീം' : 'Language & Display Theme'}
                </h2>
                <p className="text-xs text-stone-500 dark:text-stone-400">
                  {language === 'ml'
                    ? 'സിസ്റ്റത്തിന്റെ ഭാഷയും ഡാർക്ക്/ലൈറ്റ് തീമും മാറ്റുക'
                    : 'Configure application language and dark/light color scheme'}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {/* Language Switcher Buttons */}
              <div className="flex items-center p-1 bg-stone-100 dark:bg-[#141212] rounded-xl border border-stone-200 dark:border-[#2E2828]">
                <button
                  type="button"
                  onClick={() => setLanguage('ml')}
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    language === 'ml'
                      ? 'bg-pulari-primary text-white shadow-xs'
                      : 'text-stone-600 dark:text-stone-300 hover:text-stone-900'
                  }`}
                >
                  മലയാളം
                </button>
                <button
                  type="button"
                  onClick={() => setLanguage('en')}
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    language === 'en'
                      ? 'bg-pulari-primary text-white shadow-xs'
                      : 'text-stone-600 dark:text-stone-300 hover:text-stone-900'
                  }`}
                >
                  English
                </button>
              </div>

              {/* Theme Switcher Toggle */}
              <button
                type="button"
                onClick={toggleTheme}
                className="flex items-center gap-2 px-3.5 py-2 rounded-xl border border-stone-200 dark:border-[#2E2828] bg-stone-50 dark:bg-stone-800 text-stone-700 dark:text-stone-200 text-xs font-bold hover:bg-stone-100 dark:hover:bg-stone-700 transition-colors cursor-pointer"
                title={theme === 'dark' ? 'Light Theme' : 'Dark Theme'}
              >
                {theme === 'dark' ? (
                  <>
                    <FiSun className="w-4 h-4 text-amber-400" />
                    <span>{language === 'ml' ? 'ലൈറ്റ് തീം' : 'Light Theme'}</span>
                  </>
                ) : (
                  <>
                    <FiMoon className="w-4 h-4 text-stone-600" />
                    <span>{language === 'ml' ? 'ഡാർക്ക് തീം' : 'Dark Theme'}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* ============================================================ */}
        {/* CARD 1A: ADMIN LOGIN PIN MANAGEMENT (6 DIGITS) */}
        {/* ============================================================ */}
        <div className="p-6 rounded-3xl bg-white dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#2E2828] shadow-apple-card space-y-5">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-epso-red/10 text-epso-red dark:text-amber-400 flex items-center justify-center font-black">
                <FiShield className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-stone-900 dark:text-white font-malayalam">
                  അഡ്മിൻ ലോഗിൻ പിൻ (Admin PIN - 6 Digits)
                </h2>
                <p className="text-xs text-stone-400 font-malayalam">
                  അഡ്മിൻ പാനൽ സുരക്ഷിതമായി ലോഗിൻ ചെയ്യുന്നതിനുള്ള 6-അക്ക മാസ്റ്റർ പിൻ മാറ്റുക (ഡിഫോൾട്ട്: 123456)
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-stone-100 dark:bg-[#282323] border border-stone-200 dark:border-[#332A2A]">
              <span className="text-[10px] uppercase font-bold text-stone-400">നീളം:</span>
              <span className="font-mono font-black text-xs text-stone-700 dark:text-stone-300">
                6 അക്കങ്ങൾ
              </span>
            </div>
          </div>

          {/* Form to update Admin PIN */}
          <form onSubmit={handleUpdateAdminPin} className="space-y-4 pt-2 border-t border-stone-100 dark:border-[#282323]">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 font-malayalam mb-1">
                  നിലവിലെ പിൻ (Old PIN) *
                </label>
                <input
                  type="password"
                  maxLength={6}
                  required
                  value={oldAdminPin}
                  onChange={(e) => setOldAdminPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="6 digits"
                  className="w-full p-2.5 rounded-xl border border-stone-200 dark:border-[#2E2828] bg-stone-50 dark:bg-[#141212] text-stone-900 dark:text-white font-mono font-bold text-center text-sm tracking-widest focus:outline-none focus:ring-2 focus:ring-epso-red/30"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 font-malayalam mb-1">
                  പുതിയ പിൻ (New PIN) *
                </label>
                <input
                  type="password"
                  maxLength={6}
                  required
                  value={newAdminPin}
                  onChange={(e) => setNewAdminPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="6 digits"
                  className="w-full p-2.5 rounded-xl border border-stone-200 dark:border-[#2E2828] bg-stone-50 dark:bg-[#141212] text-stone-900 dark:text-white font-mono font-bold text-center text-sm tracking-widest focus:outline-none focus:ring-2 focus:ring-epso-red/30"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 font-malayalam mb-1">
                  സ്ഥിരീകരിക്കുക (Confirm) *
                </label>
                <input
                  type="password"
                  maxLength={6}
                  required
                  value={confirmAdminPin}
                  onChange={(e) => setConfirmAdminPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="6 digits"
                  className="w-full p-2.5 rounded-xl border border-stone-200 dark:border-[#2E2828] bg-stone-50 dark:bg-[#141212] text-stone-900 dark:text-white font-mono font-bold text-center text-sm tracking-widest focus:outline-none focus:ring-2 focus:ring-epso-red/30"
                />
              </div>
            </div>

            {adminPinMessage && (
              <div
                className={`p-3 rounded-xl text-xs font-bold font-malayalam flex items-center gap-2 ${
                  adminPinMessage.type === 'success'
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                    : 'bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300'
                }`}
              >
                {adminPinMessage.type === 'success' ? (
                  <FiCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <FiAlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                )}
                <span>{adminPinMessage.text}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={adminPinLoading || !oldAdminPin || newAdminPin.length !== 6 || confirmAdminPin.length !== 6}
              className="w-full py-2.5 rounded-xl bg-epso-red hover:bg-epso-red-hover dark:bg-amber-500 dark:hover:bg-amber-600 text-white dark:text-stone-950 font-bold text-xs shadow-sm press-apple transition-colors font-malayalam flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
            >
              {adminPinLoading ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white dark:border-stone-900 border-t-transparent rounded-full animate-spin" />
                  <span>അപ്ഡേറ്റ് ചെയ്യുന്നു...</span>
                </>
              ) : (
                <>
                  <FiKey className="w-3.5 h-3.5" />
                  <span>അഡ്മിൻ പിൻ മാറ്റുക (Update Admin PIN)</span>
                </>
              )}
            </button>
          </form>
        </div>

        {/* ============================================================ */}
        {/* CARD 1B: PANTRY / PRODUCTION PIN MANAGEMENT */}
        {/* ============================================================ */}
        <div className="p-6 rounded-3xl bg-white dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#2E2828] shadow-apple-card space-y-5">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-500/10 text-epso-orange flex items-center justify-center font-black">
                <FiLock className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-stone-900 dark:text-white font-malayalam">
                  PWA പാൻട്രി / പ്രൊഡക്ഷൻ പിൻ (Pantry PIN)
                </h2>
                <p className="text-xs text-stone-400 font-malayalam">
                  അടുക്കള ജീവനക്കാർക്ക് PWA പാൻട്രി മാനേജ്‌മെന്റിനായി ആവശ്യമായ 4-അക്ക സെക്യൂരിറ്റി കോഡ് (ഡിഫോൾട്ട്: 1234)
                </p>
              </div>
            </div>

            {/* Current PIN status pill */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-stone-100 dark:bg-[#282323] border border-stone-200 dark:border-[#332A2A]">
              <span className="text-[10px] uppercase font-bold text-stone-400">നിലവിലെ പിൻ:</span>
              <span className="font-mono font-black text-sm tracking-widest text-stone-900 dark:text-white">
                {showCurrentPin ? currentPin : '••••'}
              </span>
              <button
                type="button"
                onClick={() => setShowCurrentPin(!showCurrentPin)}
                className="text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 cursor-pointer"
                title={showCurrentPin ? 'Hide PIN' : 'Show PIN'}
              >
                {showCurrentPin ? <FiEyeOff className="w-3.5 h-3.5" /> : <FiEye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {/* Form to update PIN */}
          <form onSubmit={handleUpdatePin} className="space-y-4 pt-2 border-t border-stone-100 dark:border-[#282323]">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 font-malayalam mb-1">
                  പുതിയ പിൻ (New PIN) *
                </label>
                <input
                  type="password"
                  maxLength={4}
                  required
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="4 digits"
                  className="w-full p-2.5 rounded-xl border border-stone-200 dark:border-[#2E2828] bg-stone-50 dark:bg-[#141212] text-stone-900 dark:text-white font-mono font-bold text-center text-base tracking-widest focus:outline-none focus:ring-2 focus:ring-epso-red/30"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 font-malayalam mb-1">
                  സ്ഥിരീകരിക്കുക (Confirm) *
                </label>
                <input
                  type="password"
                  maxLength={4}
                  required
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="4 digits"
                  className="w-full p-2.5 rounded-xl border border-stone-200 dark:border-[#2E2828] bg-stone-50 dark:bg-[#141212] text-stone-900 dark:text-white font-mono font-bold text-center text-base tracking-widest focus:outline-none focus:ring-2 focus:ring-epso-red/30"
                />
              </div>
            </div>

            {pinMessage && (
              <div
                className={`p-3 rounded-xl text-xs font-bold font-malayalam flex items-center gap-2 ${
                  pinMessage.type === 'success'
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                    : 'bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300'
                }`}
              >
                {pinMessage.type === 'success' ? (
                  <FiCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <FiAlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                )}
                <span>{pinMessage.text}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={pinLoading || newPin.length !== 4 || confirmPin.length !== 4}
              className="w-full py-2.5 rounded-xl bg-stone-900 hover:bg-stone-800 dark:bg-white dark:hover:bg-stone-200 text-white dark:text-stone-900 font-bold text-xs shadow-sm press-apple transition-colors font-malayalam flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
            >
              {pinLoading ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white dark:border-stone-900 border-t-transparent rounded-full animate-spin" />
                  <span>അപ്ഡേറ്റ് ചെയ്യുന്നു...</span>
                </>
              ) : (
                <>
                  <FiKey className="w-3.5 h-3.5" />
                  <span>പിൻ മാറ്റുക (Update PIN)</span>
                </>
              )}
            </button>
          </form>
        </div>

        {/* ============================================================ */}
        {/* CARD 2: FACTORY BILLING PROFILE */}
        {/* ============================================================ */}
        <div className="p-6 rounded-3xl bg-white dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#2E2828] shadow-apple-card space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center font-black">
                <FiPrinter className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-stone-900 dark:text-white font-malayalam">
                  ഫാക്ടറി & ബില്ലിംഗ് വിവരങ്ങൾ
                </h2>
                <p className="text-xs text-stone-400 font-malayalam">
                  ഇൻവോയ്സ്, റസീപ്റ്റ്, പർച്ചേസ് ലിസ്റ്റ് എന്നിവയിലെ ഹെഡർ വിവരങ്ങൾ
                </p>
              </div>
            </div>

            {profileSaved && (
              <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 font-malayalam flex items-center gap-1">
                <FiCheck className="w-3.5 h-3.5" /> സേവ് ചെയ്തു!
              </span>
            )}
          </div>

          <form onSubmit={handleSaveProfile} className="space-y-3.5 text-xs font-malayalam">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-stone-700 dark:text-stone-300 mb-1">
                  സ്ഥാപന പേര് (Business / Pulari Bakes Name)
                </label>
                <input
                  type="text"
                  required
                  value={profile.name}
                  onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                  placeholder="e.g. PULARI BAKES"
                  className="w-full p-2.5 rounded-xl border border-stone-200 dark:border-[#2E2828] bg-stone-50 dark:bg-[#141212] text-stone-900 dark:text-white font-bold focus:outline-none focus:ring-1 focus:ring-epso-orange"
                />
              </div>

              <div>
                <label className="block font-bold text-stone-700 dark:text-stone-300 mb-1">
                  ഫോൺ നമ്പർ (Phone Number / WhatsApp)
                </label>
                <input
                  type="text"
                  value={profile.phone}
                  onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                  placeholder="e.g. +91 9876543210"
                  className="w-full p-2.5 rounded-xl border border-stone-200 dark:border-[#2E2828] bg-stone-50 dark:bg-[#141212] text-stone-900 dark:text-white font-bold focus:outline-none focus:ring-1 focus:ring-epso-orange"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-stone-700 dark:text-stone-300 mb-1">
                  ഇമെയിൽ വിലാസം (Email Address)
                </label>
                <input
                  type="email"
                  value={profile.email || ''}
                  onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                  placeholder="e.g. info@pularibakes.com"
                  className="w-full p-2.5 rounded-xl border border-stone-200 dark:border-[#2E2828] bg-stone-50 dark:bg-[#141212] text-stone-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-epso-orange"
                />
              </div>

              <div>
                <label className="block font-bold text-stone-700 dark:text-stone-300 mb-1">
                  സ്ഥലം / പ്രദേശം (City / Location)
                </label>
                <input
                  type="text"
                  value={profile.location || ''}
                  onChange={(e) => setProfile({ ...profile, location: e.target.value })}
                  placeholder="e.g. Industrial Estate, Malappuram"
                  className="w-full p-2.5 rounded-xl border border-stone-200 dark:border-[#2E2828] bg-stone-50 dark:bg-[#141212] text-stone-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-epso-orange"
                />
              </div>
            </div>

            <div>
              <label className="block font-bold text-stone-700 dark:text-stone-300 mb-1">
                പൂർണ്ണ വിലാസം (Full Address on Bill)
              </label>
              <input
                type="text"
                value={profile.address}
                onChange={(e) => setProfile({ ...profile, address: e.target.value })}
                placeholder="e.g. Near Industrial Estate, Malappuram, Kerala - 676505"
                className="w-full p-2.5 rounded-xl border border-stone-200 dark:border-[#2E2828] bg-stone-50 dark:bg-[#141212] text-stone-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-epso-orange"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-stone-700 dark:text-stone-300 mb-1">
                  GSTIN നമ്പർ (GST Number)
                </label>
                <input
                  type="text"
                  value={profile.gst || ''}
                  onChange={(e) => setProfile({ ...profile, gst: e.target.value.toUpperCase() })}
                  placeholder="e.g. 32AAAAA0000A1Z5"
                  className="w-full p-2.5 rounded-xl border border-stone-200 dark:border-[#2E2828] bg-stone-50 dark:bg-[#141212] text-stone-900 dark:text-white font-mono focus:outline-none focus:ring-1 focus:ring-epso-orange"
                />
              </div>

              <div>
                <label className="block font-bold text-stone-700 dark:text-stone-300 mb-1">
                  FSSAI ലൈസൻസ് നമ്പർ
                </label>
                <input
                  type="text"
                  value={profile.fssai}
                  onChange={(e) => setProfile({ ...profile, fssai: e.target.value })}
                  placeholder="e.g. 11322001000123"
                  className="w-full p-2.5 rounded-xl border border-stone-200 dark:border-[#2E2828] bg-stone-50 dark:bg-[#141212] text-stone-900 dark:text-white font-mono focus:outline-none focus:ring-1 focus:ring-epso-orange"
                />
              </div>
            </div>

            <div>
              <label className="block font-bold text-stone-700 dark:text-stone-300 mb-1">
                റസീപ്റ്റ് സന്ദേശം (Bill Footer Note)
              </label>
              <input
                type="text"
                value={profile.billFooter}
                onChange={(e) => setProfile({ ...profile, billFooter: e.target.value })}
                placeholder="e.g. നന്ദി! വീണ്ടും സന്ദർശിക്കുക."
                className="w-full p-2.5 rounded-xl border border-stone-200 dark:border-[#2E2828] bg-stone-50 dark:bg-[#141212] text-stone-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-epso-orange"
              />
            </div>

            <button
              type="submit"
              className="w-full py-2.5 rounded-xl bg-epso-orange hover:bg-orange-600 dark:bg-amber-500 dark:hover:bg-amber-600 text-white dark:text-stone-950 font-black shadow-md press-apple flex items-center justify-center gap-2 cursor-pointer transition-all"
            >
              <FiSave className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>ബില്ലിംഗ് വിവരങ്ങൾ സേവ് ചെയ്യുക (Save Bill Details)</span>
            </button>
          </form>
        </div>

        {/* ============================================================ */}
        {/* CARD 3: DATA RESET & MAINTENANCE SUITE */}
        {/* ============================================================ */}
        <div className="p-6 rounded-3xl bg-white dark:bg-[#1E1B1B] border border-red-200 dark:border-red-950/60 shadow-apple-card space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-red-100 dark:bg-red-950/60 text-red-600 flex items-center justify-center font-black">
              <FiShield className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-red-600 dark:text-red-400 font-malayalam">
                ഡാറ്റ റീസെറ്റ് ടൂളുകൾ (Data Maintenance)
              </h2>
              <p className="text-xs text-stone-400 font-malayalam">
                ടെസ്റ്റിംഗ് ഡാറ്റ ക്ലിയർ ചെയ്യാനും ഫാക്ടറി ആരംഭ നിലയിലേക്ക് മാറ്റാനും
              </p>
            </div>
          </div>

          <div className="space-y-2 pt-2 border-t border-stone-100 dark:border-[#282323] text-xs font-malayalam">
            {/* Reset Sales */}
            <div className="p-3 rounded-2xl bg-stone-50 dark:bg-[#181515] border border-stone-200/80 dark:border-[#282323] flex items-center justify-between gap-3">
              <div>
                <span className="font-bold text-stone-900 dark:text-white block">
                  റീസെറ്റ് വിൽപ്പന (Clear Sales Records)
                </span>
                <span className="text-[11px] text-stone-400 block">
                  വിൽപ്പന രസീതുകളും കസ്റ്റമർ ഹിസ്റ്ററിയും ക്ലിയർ ചെയ്യുന്നു.
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setResetModalType('sales');
                  setEnteredPin('');
                  setResetError('');
                }}
                className="px-3 py-1.5 rounded-xl bg-red-100 hover:bg-red-200 dark:bg-red-950/40 dark:hover:bg-red-900/40 text-red-700 dark:text-red-300 font-bold shrink-0 press-apple cursor-pointer text-[11px]"
              >
                Reset Sales
              </button>
            </div>

            {/* Reset Batches */}
            <div className="p-3 rounded-2xl bg-stone-50 dark:bg-[#181515] border border-stone-200/80 dark:border-[#282323] flex items-center justify-between gap-3">
              <div>
                <span className="font-bold text-stone-900 dark:text-white block">
                  റീസെറ്റ് ബാച്ചുകൾ (Clear Production Runs)
                </span>
                <span className="text-[11px] text-stone-400 block">
                  പ്രൊഡക്ഷൻ റണ്ണുകൾ ({productionRuns.length} runs), പാക്കറ്റ് റെക്കോർഡുകൾ, ദിവസേനയുള്ള ക്ലോസിംഗ് എന്നിവ നീക്കം ചെയ്യുന്നു.
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setResetModalType('batches');
                  setEnteredPin('');
                  setResetError('');
                }}
                className="px-3 py-1.5 rounded-xl bg-red-100 hover:bg-red-200 dark:bg-red-950/40 dark:hover:bg-red-900/40 text-red-700 dark:text-red-300 font-bold shrink-0 press-apple cursor-pointer text-[11px]"
              >
                Reset Runs
              </button>
            </div>

            {/* Clear Movements */}
            <div className="p-3 rounded-2xl bg-stone-50 dark:bg-[#181515] border border-stone-200/80 dark:border-[#282323] flex items-center justify-between gap-3">
              <div>
                <span className="font-bold text-stone-900 dark:text-white block">
                  ക്ലിയർ ലെഡ്ജർ (Clear Stock Movements)
                </span>
                <span className="text-[11px] text-stone-400 block">
                  സ്റ്റോക്ക് ഇൻ/ഔട്ട് ലോഗുകൾ ({stockMovements.length} logs) ക്ലിയർ ചെയ്യുന്നു.
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setResetModalType('ledger');
                  setEnteredPin('');
                  setResetError('');
                }}
                className="px-3 py-1.5 rounded-xl bg-red-100 hover:bg-red-200 dark:bg-red-950/40 dark:hover:bg-red-900/40 text-red-700 dark:text-red-300 font-bold shrink-0 press-apple cursor-pointer text-[11px]"
              >
                Clear Ledger
              </button>
            </div>

            {/* Reset All Stocks to Zero */}
            <div className="p-3.5 rounded-2xl bg-amber-500/10 dark:bg-amber-950/20 border border-amber-500/30 flex items-center justify-between gap-3">
              <div>
                <span className="font-bold text-amber-950 dark:text-amber-200 block text-xs">
                  ⚠️ എല്ലാ സ്റ്റോക്കും 0 ആക്കുക (Reset All Stocks to Zero)
                </span>
                <span className="text-[11px] text-stone-600 dark:text-stone-300 block">
                  എല്ലാ ഉൽപ്പന്നങ്ങൾ, ചേരുവകൾ, പാക്കറ്റുകൾ എന്നിവയുടെ സ്റ്റോക്ക് 0 ആക്കുന്നു. പേരുകളും റസിപ്പികളും നിലനിൽക്കും.
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setResetModalType('zero_all_stocks');
                  setEnteredPin('');
                  setResetError('');
                }}
                className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold shrink-0 shadow-sm press-apple cursor-pointer text-[11px]"
              >
                Set to 0
              </button>
            </div>

            {/* Reset Stock */}
            <div className="p-3 rounded-2xl bg-stone-50 dark:bg-[#181515] border border-stone-200/80 dark:border-[#282323] flex items-center justify-between gap-3">
              <div>
                <span className="font-bold text-stone-900 dark:text-white block">
                  സ്റ്റോക്ക് റീസെറ്റ് (Reset Stock to Baseline)
                </span>
                <span className="text-[11px] text-stone-400 block">
                  ചേരുവകളുടെ സ്റ്റോക്ക് സ്റ്റാൻഡേർഡ് ആരംഭ അളവിലേക്ക് പുനഃസ്ഥാപിക്കുന്നു.
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setResetModalType('stock');
                  setEnteredPin('');
                  setResetError('');
                }}
                className="px-3 py-1.5 rounded-xl bg-amber-100 hover:bg-amber-200 dark:bg-amber-950/40 dark:hover:bg-amber-900/40 text-amber-800 dark:text-amber-300 font-bold shrink-0 press-apple cursor-pointer text-[11px]"
              >
                Reset Stock
              </button>
            </div>

            {/* Full Factory Reset */}
            <div className="p-3.5 rounded-2xl bg-red-500/10 border border-red-500/30 flex items-center justify-between gap-3 mt-3">
              <div>
                <span className="font-black text-red-600 dark:text-red-400 block text-xs">
                  ⚠️ പൂർണ്ണ ഫാക്ടറി റീസെറ്റ് (Factory Full Reset)
                </span>
                <span className="text-[11px] text-red-700/80 dark:text-red-300/80 block">
                  എല്ലാ സെയിൽസും ബാച്ചുകളും റീസെറ്റ് ചെയ്തു ആദ്യ ദിവസത്തെ അവസ്ഥയിലേക്ക് മാറ്റുന്നു.
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setResetModalType('full');
                  setEnteredPin('');
                  setResetConfirmationText('');
                  setResetError('');
                }}
                className="px-3.5 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold shrink-0 shadow-sm press-apple cursor-pointer text-[11px]"
              >
                Full Reset
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* CONFIRMATION MODAL FOR RESET ACTIONS */}
      {/* ============================================================ */}
      {resetModalType && (
        <div className="fixed inset-0 z-[9999] overflow-y-auto">
          <div
            className="fixed inset-0 w-full h-full bg-black/70 backdrop-blur-md animate-apple-backdrop"
            onClick={() => !resetLoading && setResetModalType(null)}
          />

          <div className="min-h-full flex items-center justify-center p-3 sm:p-5 relative z-10 pointer-events-none">
            <div className="w-full md:w-[70vw] md:max-w-md bg-white dark:bg-[#1E1B1B] rounded-3xl p-6 border border-stone-200 dark:border-[#2E2828] shadow-apple-modal animate-apple-modal pointer-events-auto">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-2xl bg-red-100 dark:bg-red-950/60 text-red-600 flex items-center justify-center font-black shrink-0">
                  <FiAlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-stone-900 dark:text-white font-malayalam">
                    റീസെറ്റ് സ്ഥിരീകരിക്കുക (Confirm Reset)
                  </h3>
                  <span className="text-xs text-red-600 dark:text-red-400 font-bold uppercase tracking-wider font-mono">
                    Action: {resetModalType.toUpperCase()}
                  </span>
                </div>
              </div>

              <p className="text-xs text-stone-500 dark:text-stone-400 font-malayalam mb-4 leading-relaxed">
                ഈ പ്രക്രിയ തിരഞ്ഞെടുത്ത ഡാറ്റ പൂർണ്ണമായി മായ്ച്ചുകളയുന്നതാണ്. മുന്നോട്ട് പോകുന്നതിന് പ്രൊഡക്ഷൻ പിൻ നൽകുക.
              </p>

              <form onSubmit={handleExecuteReset} className="space-y-4 text-xs font-malayalam">
                {resetModalType === 'full' && (
                  <div>
                    <label className="block font-bold text-stone-700 dark:text-stone-300 mb-1">
                      സ്ഥിരീകരിക്കാൻ "RESET" എന്ന് ടൈപ്പ് ചെയ്യുക:
                    </label>
                    <input
                      type="text"
                      required
                      value={resetConfirmationText}
                      onChange={(e) => setResetConfirmationText(e.target.value)}
                      placeholder="RESET"
                      className="w-full p-2.5 rounded-xl border border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950/20 text-red-900 dark:text-red-200 font-mono font-bold uppercase focus:outline-none"
                    />
                  </div>
                )}

                <div>
                  <label className="block font-bold text-stone-700 dark:text-stone-300 mb-1">
                    അഡ്മിൻ പിൻ നൽകുക (6-digit Admin PIN) *
                  </label>
                  <input
                    type="password"
                    maxLength={6}
                    required
                    autoFocus
                    value={enteredPin}
                    onChange={(e) => setEnteredPin(e.target.value.replace(/\D/g, ''))}
                    placeholder="••••••"
                    className="w-full p-3 rounded-xl border border-stone-200 dark:border-[#2E2828] bg-stone-50 dark:bg-[#141212] text-stone-900 dark:text-white font-mono font-black text-center text-lg tracking-widest focus:outline-none"
                  />
                </div>

                {resetError && (
                  <div className="p-2.5 rounded-xl bg-red-100 dark:bg-red-950/60 border border-red-300 dark:border-red-800 text-red-800 dark:text-red-300 text-xs font-bold flex items-center gap-2">
                    <FiAlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
                    <span>{resetError}</span>
                  </div>
                )}

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-stone-100 dark:border-[#282323]">
                  <button
                    type="button"
                    onClick={() => setResetModalType(null)}
                    disabled={resetLoading}
                    className="px-4 py-2 rounded-xl text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-[#282323] font-bold cursor-pointer"
                  >
                    റദ്ദാക്കുക (Cancel)
                  </button>
                  <button
                    type="submit"
                    disabled={resetLoading || enteredPin.length !== 6}
                    className="px-5 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold shadow-sm press-apple flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                  >
                    {resetLoading ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin shrink-0" />
                        <span>റീസെറ്റ് ചെയ്യുന്നു...</span>
                      </>
                    ) : (
                      <>
                        <FiTrash2 className="w-3.5 h-3.5" />
                        <span>റീസെറ്റ് സ്ഥിരീകരിക്കുക</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
