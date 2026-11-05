import React, { useState, useEffect, useMemo } from 'react';
import {
  FiX,
  FiBox,
  FiDroplet,
  FiCalendar,
  FiTrendingDown,
  FiShoppingBag,
  FiAlertCircle,
  FiCheckCircle,
} from 'react-icons/fi';
import { Ingredient, StockMovement, Product, DailyClosing } from '../types';
import { fetchDailyClosings } from '../services/supabase';

interface IngredientDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  ingredient: Ingredient | null;
  stockMovements?: StockMovement[];
  products?: Product[];
}

export const IngredientDetailModal: React.FC<IngredientDetailModalProps> = ({
  isOpen,
  onClose,
  ingredient,
  stockMovements = [],
  products = [],
}) => {
  const [dailyClosings, setDailyClosings] = useState<DailyClosing[]>([]);
  const [isLoadingClosings, setIsLoadingClosings] = useState<boolean>(false);

  const isOil = useMemo(() => {
    if (!ingredient) return false;
    const n = (ingredient.name || '').toLowerCase();
    return n.includes('ഓയിൽ') || n.includes('oil');
  }, [ingredient]);

  // Load daily closings if this ingredient is Oil
  useEffect(() => {
    if (isOpen && isOil) {
      setIsLoadingClosings(true);
      fetchDailyClosings(60)
        .then((closings) => setDailyClosings(closings))
        .catch((err) => console.warn('Could not load daily closings for oil detail', err))
        .finally(() => setIsLoadingClosings(false));
    }
  }, [isOpen, isOil]);

  // Lock body and html scroll when modal is open so the background cannot scroll
  useEffect(() => {
    if (!isOpen) return;
    const originalBodyOverflow = document.body.style.overflow;
    const originalHtmlOverflow = document.documentElement.style.overflow;
    const originalTouchAction = document.body.style.touchAction;

    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    document.body.style.touchAction = 'none';

    return () => {
      document.body.style.overflow = originalBodyOverflow;
      document.documentElement.style.overflow = originalHtmlOverflow;
      document.body.style.touchAction = originalTouchAction;
    };
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Filter movements for this ingredient
  const ingredientMovements = useMemo(() => {
    if (!ingredient) return [];
    return stockMovements.filter((m) => {
      const matchId = m.itemId === ingredient.id;
      const matchName = m.itemName && ingredient.name && m.itemName.trim().toLowerCase() === ingredient.name.trim().toLowerCase();
      return matchId || matchName;
    });
  }, [ingredient, stockMovements]);

  // Consumption movements (where it was used)
  const consumptionMovements = useMemo(() => {
    return ingredientMovements.filter(
      (m) => m.movementType === 'production_consumption' || m.movementType === 'out' || Number(m.quantity) < 0
    );
  }, [ingredientMovements]);

  // Purchase movements
  const purchaseMovements = useMemo(() => {
    return ingredientMovements.filter(
      (m) => m.movementType === 'purchase' || m.movementType === 'in' || Number(m.quantity) > 0
    );
  }, [ingredientMovements]);

  // Total quantity used
  const totalQuantityUsed = useMemo(() => {
    if (isOil && dailyClosings.length > 0) {
      return dailyClosings.reduce((sum, c) => sum + (Number(c.oilConsumed) || 0), 0);
    }
    return consumptionMovements.reduce((sum, m) => sum + Math.abs(Number(m.quantity) || 0), 0);
  }, [isOil, dailyClosings, consumptionMovements]);

  // Where it was used (breakdown by product name or batch)
  const whereUsedList = useMemo(() => {
    if (!ingredient) return [];
    const usageMap: Record<string, { name: string; quantity: number; count: number }> = {};

    consumptionMovements.forEach((m) => {
      let prodName = 'മറ്റ് ഉപയോഗം (General Usage)';
      const reason = m.reason || '';
      const ref = m.reference || '';

      // Check if matches any product name
      for (const p of products) {
        if (p?.name && (reason.toLowerCase().includes(p.name.toLowerCase()) || ref.toLowerCase().includes(p.name.toLowerCase()))) {
          prodName = p.name;
          break;
        }
      }

      if (prodName === 'മറ്റ് ഉപയോഗം (General Usage)' && (reason.includes('ബാച്ച്') || reason.includes('Batch'))) {
        prodName = 'പ്രൊഡക്ഷൻ ബാച്ച് (Snack Batch)';
      }

      if (!usageMap[prodName]) {
        usageMap[prodName] = { name: prodName, quantity: 0, count: 0 };
      }
      usageMap[prodName].quantity += Math.abs(Number(m.quantity) || 0);
      usageMap[prodName].count += 1;
    });

    return Object.values(usageMap).sort((a, b) => b.quantity - a.quantity);
  }, [ingredient, consumptionMovements, products]);

  // Daily usage breakdown
  const dailyUsageList = useMemo(() => {
    if (isOil && dailyClosings.length > 0) {
      return dailyClosings.map((c) => {
        let poured = c.totalOilUsedKg ?? c.oilConsumed;
        let remaining = c.oilLeftoverKg ?? 0;
        return {
          date: c.productionDate,
          poured,
          remaining,
          consumed: c.oilConsumed,
          note: `${poured} kg ഒഴിച്ചു • ${remaining} kg ബാക്കി`,
        };
      });
    }

    const byDate: Record<string, { date: string; quantity: number; notes: string[] }> = {};
    consumptionMovements.forEach((m) => {
      const d = m.createdAt ? m.createdAt.split('T')[0] : 'Unknown';
      if (!byDate[d]) {
        byDate[d] = { date: d, quantity: 0, notes: [] };
      }
      byDate[d].quantity += Math.abs(Number(m.quantity) || 0);
      if (m.reason && !byDate[d].notes.includes(m.reason)) {
        byDate[d].notes.push(m.reason);
      }
    });

    return Object.values(byDate).sort((a, b) => b.date.localeCompare(a.date));
  }, [isOil, dailyClosings, consumptionMovements]);

  if (!isOpen || !ingredient) return null;

  const isLowStock = ingredient.isActive && ingredient.minStock > 0 && ingredient.currentStock <= ingredient.minStock;
  const totalStockValue = Math.round(ingredient.currentStock * ingredient.avgCostPerUnit);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs select-none"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-white dark:bg-[#1E1B1B] rounded-2xl border border-stone-200 dark:border-[#2E2828] max-h-[90vh] flex flex-col overflow-hidden animate-apple-modal"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-stone-200 dark:border-[#2E2828] flex items-center justify-between gap-3 bg-stone-50/70 dark:bg-[#181515]">
          <div className="flex items-center gap-3">
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${
              isOil
                ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300'
                : 'bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300'
            }`}>
              {isOil ? <FiDroplet className="w-6 h-6" /> : <FiBox className="w-6 h-6" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg sm:text-xl font-black text-stone-900 dark:text-white font-malayalam leading-tight">
                  {ingredient.name}
                </h2>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  isLowStock
                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                    : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                }`}>
                  {isLowStock ? 'കുറഞ്ഞ സ്റ്റോക്ക്' : 'ലഭ്യമായത്'}
                </span>
              </div>
              <p className="text-xs text-stone-500 dark:text-stone-400 font-malayalam">
                ചേരുവയുടെ ഉപയോഗ വിവരങ്ങളും കണക്കും (Ingredient Analytics)
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-200/50 dark:hover:bg-[#282323] transition-colors cursor-pointer"
            title="അടയ്ക്കുക (Close)"
          >
            <FiX className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-5 text-stone-800 dark:text-stone-200">
          
          {/* Top Quick Summary Cards */}
          <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
            {/* Current Stock */}
            <div className="p-3 rounded-xl bg-stone-50 dark:bg-[#141212] border border-stone-200 dark:border-[#282323] text-center">
              <span className="text-[11px] font-bold text-stone-500 dark:text-stone-400 block font-malayalam">
                ഇപ്പോഴത്തെ സ്റ്റോക്ക്
              </span>
              <span className={`text-lg sm:text-xl font-black tabular-nums block mt-0.5 ${
                isLowStock ? 'text-amber-600 dark:text-amber-400' : 'text-stone-900 dark:text-white'
              }`}>
                {ingredient.currentStock} <span className="text-xs font-semibold">{ingredient.unit}</span>
              </span>
            </div>

            {/* Total Used */}
            <div className="p-3 rounded-xl bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 text-center">
              <span className="text-[11px] font-bold text-amber-700 dark:text-amber-400 block font-malayalam">
                ആകെ ഉപയോഗിച്ചത്
              </span>
              <span className="text-lg sm:text-xl font-black text-amber-800 dark:text-amber-300 tabular-nums block mt-0.5">
                {Number(totalQuantityUsed.toFixed(1))} <span className="text-xs font-semibold">{ingredient.unit}</span>
              </span>
            </div>

            {/* Price / Unit */}
            <div className="p-3 rounded-xl bg-stone-50 dark:bg-[#141212] border border-stone-200 dark:border-[#282323] text-center">
              <span className="text-[11px] font-bold text-stone-500 dark:text-stone-400 block font-malayalam">
                വാങ്ങിയ വില / കിലോ
              </span>
              <span className="text-lg sm:text-xl font-black text-stone-900 dark:text-white tabular-nums block mt-0.5">
                ₹{ingredient.avgCostPerUnit}
              </span>
            </div>
          </div>

          {/* Value in Stock */}
          <div className="px-3 py-2 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/40 flex items-center justify-between text-xs font-malayalam">
            <span className="text-emerald-800 dark:text-emerald-300 font-bold flex items-center gap-1.5">
              <FiCheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              സ്റ്റോക്കിലുള്ളതിന്റെ ആകെ മൂല്യം (Total Stock Value):
            </span>
            <span className="font-black text-emerald-900 dark:text-emerald-200 font-mono text-sm">
              ₹{totalStockValue.toLocaleString('en-IN')}
            </span>
          </div>

          {/* Section: For Oil - Poured vs Remaining Daily Details */}
          {isOil && (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-black text-stone-900 dark:text-white uppercase tracking-wider font-malayalam flex items-center gap-1.5">
                  <FiDroplet className="w-4 h-4 text-amber-500" />
                  ഓയിൽ ഒഴിച്ചതും ബാക്കി വന്നതും (Daily Oil Log)
                </h3>
                <span className="text-[10px] text-stone-400 font-malayalam">
                  ദിവസം തോറുമുള്ള കണക്ക്
                </span>
              </div>

              {isLoadingClosings ? (
                <div className="p-4 text-center text-xs text-stone-400 font-malayalam">
                  കണക്കുകൾ ശേഖരിക്കുന്നു...
                </div>
              ) : dailyUsageList.length === 0 ? (
                <div className="p-4 rounded-xl bg-stone-50 dark:bg-[#141212] border border-stone-200 dark:border-[#282323] text-center text-xs text-stone-400 font-malayalam">
                  ഓയിൽ ഉപയോഗം ഇതുവരെ രേഖപ്പെടുത്തിയിട്ടില്ല.
                </div>
              ) : (
                <div className="space-y-2">
                  {dailyUsageList.slice(0, 10).map((day: any, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-xl bg-stone-50 dark:bg-[#141212] border border-stone-200 dark:border-[#282323] flex items-center justify-between gap-2 text-xs"
                    >
                      <div className="space-y-0.5">
                        <span className="font-mono font-bold text-stone-900 dark:text-stone-100 flex items-center gap-1.5">
                          <FiCalendar className="w-3.5 h-3.5 text-stone-400" />
                          {day.date}
                        </span>
                        <p className="text-[11px] text-stone-500 dark:text-stone-400 font-malayalam">
                          {day.note}
                        </p>
                      </div>

                      <div className="text-right">
                        <span className="text-[10px] text-stone-400 block font-malayalam">
                          യഥാർത്ഥ ഉപയോഗം
                        </span>
                        <span className="font-black text-amber-700 dark:text-amber-400 tabular-nums text-sm">
                          {day.consumed} {ingredient.unit}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Section: Where it was used (Products) */}
          <div className="space-y-2.5">
            <h3 className="text-xs font-black text-stone-900 dark:text-white uppercase tracking-wider font-malayalam flex items-center gap-1.5">
              <FiTrendingDown className="w-4 h-4 text-epso-orange" />
              ഏതൊക്കെ പലഹാരങ്ങളിൽ ചേർത്തു? (Where It Was Used)
            </h3>

            {whereUsedList.length === 0 ? (
              <div className="p-4 rounded-xl bg-stone-50 dark:bg-[#141212] border border-stone-200 dark:border-[#282323] text-center text-xs text-stone-400 font-malayalam">
                {isOil
                  ? 'ഓയിൽ എല്ലാ വറുക്കൽ ബാച്ചുകൾക്കുമായി പൊതുവായി ഉപയോഗിക്കുന്നു.'
                  : 'ഈ ചേരുവ ഉപയോഗിച്ച ബാച്ചുകൾ ഒന്നും രേഖപ്പെടുത്തിയിട്ടില്ല.'}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {whereUsedList.map((item, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-xl bg-stone-50 dark:bg-[#141212] border border-stone-200 dark:border-[#282323] flex items-center justify-between text-xs"
                  >
                    <div>
                      <span className="font-bold text-stone-900 dark:text-stone-100 block font-malayalam">
                        {item.name}
                      </span>
                      <span className="text-[10px] text-stone-400 font-malayalam">
                        {item.count} ബാച്ചുകളിൽ
                      </span>
                    </div>
                    <span className="font-extrabold text-stone-800 dark:text-stone-200 font-mono">
                      {Number(item.quantity.toFixed(1))} {ingredient.unit}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Section: Daily Usage History (Non-oil) */}
          {!isOil && (
            <div className="space-y-2.5">
              <h3 className="text-xs font-black text-stone-900 dark:text-white uppercase tracking-wider font-malayalam flex items-center gap-1.5">
                <FiCalendar className="w-4 h-4 text-blue-500" />
                ദിവസേനയുള്ള ഉപയോഗം (Daily Usage)
              </h3>

              {dailyUsageList.length === 0 ? (
                <div className="p-4 rounded-xl bg-stone-50 dark:bg-[#141212] border border-stone-200 dark:border-[#282323] text-center text-xs text-stone-400 font-malayalam">
                  ഉപയോഗ വിവരങ്ങൾ ലഭ്യമല്ല.
                </div>
              ) : (
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {dailyUsageList.slice(0, 10).map((day: any, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 rounded-xl bg-stone-50 dark:bg-[#141212] border border-stone-200 dark:border-[#282323] flex items-center justify-between text-xs"
                    >
                      <span className="font-mono text-stone-700 dark:text-stone-300">
                        {day.date}
                      </span>
                      <span className="font-bold text-stone-900 dark:text-stone-100 font-mono">
                        {Number(day.quantity.toFixed(1))} {ingredient.unit}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Recent Purchases */}
          <div className="space-y-2.5">
            <h3 className="text-xs font-black text-stone-900 dark:text-white uppercase tracking-wider font-malayalam flex items-center gap-1.5">
              <FiShoppingBag className="w-4 h-4 text-emerald-500" />
              അവസാനം വാങ്ങിയ വിവരങ്ങൾ (Recent Purchases)
            </h3>

            {purchaseMovements.length === 0 ? (
              <div className="p-3 rounded-xl bg-stone-50 dark:bg-[#141212] border border-stone-200 dark:border-[#282323] text-center text-xs text-stone-400 font-malayalam">
                വാങ്ങിയ വിവരങ്ങൾ രേഖപ്പെടുത്തിയിട്ടില്ല.
              </div>
            ) : (
              <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                {purchaseMovements.slice(0, 5).map((m, idx) => (
                  <div
                    key={idx}
                    className="p-2.5 rounded-xl bg-stone-50 dark:bg-[#141212] border border-stone-200 dark:border-[#282323] flex items-center justify-between text-xs"
                  >
                    <div>
                      <span className="font-mono text-stone-700 dark:text-stone-300">
                        {m.createdAt ? m.createdAt.split('T')[0] : 'N/A'}
                      </span>
                      <span className="text-[10px] text-stone-400 ml-2 font-malayalam">
                        {m.reason || 'വാങ്ങിയത് (Purchase)'}
                      </span>
                    </div>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                      +{Math.abs(Number(m.quantity) || 0)} {ingredient.unit}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

        {/* Footer */}
        <div className="p-3.5 sm:p-4 border-t border-stone-200 dark:border-[#2E2828] bg-stone-50/70 dark:bg-[#181515] flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-stone-900 hover:bg-stone-800 dark:bg-stone-100 dark:hover:bg-stone-200 text-white dark:text-stone-950 font-bold text-xs cursor-pointer transition-colors font-malayalam"
          >
            ശരി (Close)
          </button>
        </div>
      </div>
    </div>
  );
};
