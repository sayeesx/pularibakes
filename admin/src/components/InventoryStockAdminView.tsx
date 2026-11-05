import React, { useState, useMemo } from 'react';
import { Product, ProductionRun } from '../types';
import { useFullCostStockValuation } from '../hooks/useFullCostStockValuation';
import {
  FiPackage,
  FiSearch,
  FiPlus,
  FiMinus,
  FiTrash2,
  FiRefreshCw,
  FiDollarSign,
  FiLayers,
  FiCheckCircle,
  FiXCircle,
  FiAlertTriangle,
  FiEdit3,
} from 'react-icons/fi';
import { adjustProductStock } from '../services/supabase';
import { AnimatedNumber } from './AnimatedNumber';
import { useFeedback } from '../context/FeedbackContext';
import { useLockBodyScroll } from '../hooks/useLockBodyScroll';
import { createPortal } from 'react-dom';

interface InventoryStockAdminViewProps {
  products: Product[];
  productionRuns?: ProductionRun[];
  onRefresh: () => void;
}

export const InventoryStockAdminView: React.FC<InventoryStockAdminViewProps> = ({
  products,
  productionRuns = [],
  onRefresh,
}) => {
  const { showToast, confirm } = useFeedback();

  const [search, setSearch] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'in_stock' | 'out_of_stock'>('all');
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Stock Adjustment Modal states
  const [adjustModalOpen, setAdjustModalOpen] = useState(false);
  const [activeProduct, setActiveProduct] = useState<Product | null>(null);
  const [adjustDelta, setAdjustDelta] = useState<number | string>(10);
  const [adjustIsAdd, setAdjustIsAdd] = useState<boolean>(true);
  const [adjustReason, setAdjustReason] = useState<string>('മാനുവൽ സ്റ്റോക്ക് അഡ്ജസ്റ്റ്മെന്റ്');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Direct Set Stock Modal states
  const [setStockModalOpen, setSetStockModalOpen] = useState(false);
  const [directStockValue, setDirectStockValue] = useState<number | string>(0);

  useLockBodyScroll(adjustModalOpen || setStockModalOpen);

  // Full-cost per kg map & valuation (from production costing calculations)
  const { costPerKgMap } = useFullCostStockValuation(products, productionRuns);

  // Summary Metrics: uses wholesale price if set, otherwise falls back to full production cost per kg
  const totalValuation = useMemo(() => {
    return products.reduce((acc, p) => {
      const stock = p.currentStock || 0;
      if (stock <= 0) return acc;
      const costPrice = costPerKgMap[p.id] || 0;
      const effectivePrice = p.wholesalePrice && p.wholesalePrice > 0 ? p.wholesalePrice : costPrice;
      return acc + Math.round(stock * effectivePrice);
    }, 0);
  }, [products, costPerKgMap]);

  const totalQuantityKg = useMemo(() => {
    return products.reduce((acc, p) => acc + (p.currentStock || 0), 0);
  }, [products]);

  const inStockCount = useMemo(() => {
    return products.filter((p) => (p.currentStock || 0) > 0).length;
  }, [products]);

  const outOfStockCount = useMemo(() => {
    return products.filter((p) => (p.currentStock || 0) <= 0).length;
  }, [products]);

  // Filtered Products
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const q = search.toLowerCase().trim();
      const matchSearch =
        !q ||
        (p.name || '').toLowerCase().includes(q) ||
        (p.sku && (p.sku || '').toLowerCase().includes(q));

      if (!matchSearch) return false;

      if (filterMode === 'in_stock') return (p.currentStock || 0) > 0;
      if (filterMode === 'out_of_stock') return (p.currentStock || 0) <= 0;
      return true;
    });
  }, [products, search, filterMode]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await onRefresh();
      showToast('സ്റ്റോക്ക് വിവരങ്ങൾ പുതുക്കി', 'info');
    } catch {
      showToast('വിവരങ്ങൾ ലഭ്യമാക്കുന്നതിൽ പിഴവ്', 'error');
    } finally {
      setTimeout(() => setIsRefreshing(false), 300);
    }
  };

  const openAdjust = (product: Product, isAdd: boolean) => {
    setActiveProduct(product);
    setAdjustIsAdd(isAdd);
    setAdjustDelta(isAdd ? 10 : Math.min(product.currentStock || 0, 5));
    setAdjustReason(
      isAdd
        ? 'ഉൽപ്പാദനം ചേർത്തത് (Production Inward)'
        : 'വിൽപ്പന / ഉപയോഗം (Sales / Outward)'
    );
    setAdjustModalOpen(true);
  };

  const openSetDirect = (product: Product) => {
    setActiveProduct(product);
    setDirectStockValue(product.currentStock || 0);
    setSetStockModalOpen(true);
  };

  const handleAdjustSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProduct) return;

    const qty = Number(adjustDelta);
    if (isNaN(qty) || qty <= 0) {
      showToast('സാധുവായ ഒരു അളവ് നൽകുക (Enter a valid quantity > 0)', 'warning');
      return;
    }

    if (!adjustIsAdd && qty > (activeProduct.currentStock || 0)) {
      showToast(
        `ലഭ്യമായ സ്റ്റോക്കിൽ (${activeProduct.currentStock} ${activeProduct.unit}) കൂടുതൽ കുറയ്ക്കാൻ കഴിയില്ല!`,
        'warning'
      );
      return;
    }

    const delta = adjustIsAdd ? qty : -qty;

    setIsSubmitting(true);
    try {
      await adjustProductStock(
        activeProduct.id,
        delta,
        adjustReason.trim() || (adjustIsAdd ? 'മാനുവൽ സ്റ്റോക്ക് ചേർത്തത്' : 'മാനുവൽ സ്റ്റോക്ക് കുറച്ചത്')
      );
      showToast(
        `"${activeProduct.name}" സ്റ്റോക്ക് ${adjustIsAdd ? `+${qty}` : `-${qty}`} ${activeProduct.unit} മാറ്റി`,
        'success'
      );
      setAdjustModalOpen(false);
      onRefresh();
    } catch (err: any) {
      showToast(`സ്റ്റോക്ക് മാറ്റുന്നതിൽ പിഴവ്: ${err?.message || 'Error'}`, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDirectSetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProduct) return;

    const targetStock = Number(directStockValue);
    if (isNaN(targetStock) || targetStock < 0) {
      showToast('സാധുവായ ഒരു അളവ് നൽകുക (Enter valid quantity >= 0)', 'warning');
      return;
    }

    const current = activeProduct.currentStock || 0;
    const delta = targetStock - current;

    if (delta === 0) {
      setSetStockModalOpen(false);
      return;
    }

    setIsSubmitting(true);
    try {
      await adjustProductStock(
        activeProduct.id,
        delta,
        `സ്റ്റോക്ക് നേരിട്ട് നിശ്ചയിച്ചു: ${current} → ${targetStock} ${activeProduct.unit}`
      );
      showToast(`സ്റ്റോക്ക് വിജയകരമായി ${targetStock} ${activeProduct.unit} ആയി നിശ്ചയിച്ചു`, 'success');
      setSetStockModalOpen(false);
      onRefresh();
    } catch (err: any) {
      showToast(`സ്റ്റോക്ക് മാറ്റുന്നതിൽ പിഴവ്: ${err?.message || 'Error'}`, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClearStock = async (product: Product) => {
    if ((product.currentStock || 0) <= 0) {
      showToast('സ്റ്റോക്ക് ഇതിനകം 0 ആണ്! (Stock is already 0)', 'info');
      return;
    }

    const confirmed = await confirm({
      title: `സ്റ്റോക്ക് ഡിലീറ്റ് ചെയ്യണോ?`,
      message: `"${product.name}" ന്റെ നിലവിലെ സ്റ്റോക്ക് (${product.currentStock} ${product.unit}) പൂർണ്ണമായി പൂജ്യമാക്കണോ (0)?`,
      confirmLabel: 'സ്റ്റോക്ക് 0 ആക്കുക (Delete)',
      cancelLabel: 'റദ്ദാക്കുക',
      isDestructive: true,
    });

    if (!confirmed) return;

    try {
      await adjustProductStock(
        product.id,
        -product.currentStock,
        'സ്റ്റോക്ക് പൂർണ്ണമായി ഡിലീറ്റ് ചെയ്തു (Stock Cleared to 0)'
      );
      showToast(`"${product.name}" സ്റ്റോക്ക് 0 ആക്കി മാറ്റി`, 'success');
      onRefresh();
    } catch (err: any) {
      showToast(`ഡിലീറ്റ് പരാജയപ്പെട്ടു: ${err?.message || 'Error'}`, 'error');
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-stone-200 dark:border-[#2E2828]">
        <div>
          <h2 className="text-xl font-black text-stone-900 dark:text-white flex items-center gap-2">
            <FiLayers className="w-5 h-5 text-amber-500" />
            <span>ഉൽപ്പന്ന സ്റ്റോക്ക് ഇൻവെന്ററി (Finished Goods Stock)</span>
          </h2>
          <p className="text-xs text-stone-400 font-malayalam mt-0.5">
            തയ്യാറാക്കിയ ഉൽപ്പന്നങ്ങളുടെ നിലവിലെ സ്റ്റോക്ക് വിവരങ്ങളും മാനുവൽ അഡ്ജസ്റ്റ്മെന്റും
          </p>
        </div>

        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-stone-100 hover:bg-stone-200 dark:bg-[#282323] dark:hover:bg-[#342D2D] text-stone-700 dark:text-stone-300 font-bold text-xs press-apple transition-colors cursor-pointer disabled:opacity-60"
        >
          <FiRefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
          <span>Refresh Stock</span>
        </button>
      </div>

      {/* Primary KPI Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Stock Valuation */}
        <div className="p-5 rounded-2xl bg-white dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#2E2828] shadow-apple-card">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-stone-500 font-malayalam">ആകെ സ്റ്റോക്ക് മൂല്യം</span>
            <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400">
              <FiDollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 font-mono">
            <AnimatedNumber value={totalValuation} prefix="₹" />
          </div>
          <p className="text-[10px] text-stone-400 mt-1 font-malayalam">ഉൽപ്പാദന ചെലവ് / മൊത്തവില അടിസ്ഥാനത്തിൽ</p>
        </div>

        {/* Total Quantity */}
        <div className="p-5 rounded-2xl bg-white dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#2E2828] shadow-apple-card">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-stone-500 font-malayalam">ആകെ സ്റ്റോക്ക് അളവ്</span>
            <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400">
              <FiPackage className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-stone-900 dark:text-white font-mono">
            <AnimatedNumber value={totalQuantityKg} decimals={1} suffix=" kg" />
          </div>
          <p className="text-[10px] text-stone-400 mt-1 font-malayalam">തയ്യാറാക്കിയ ഉൽപ്പന്നങ്ങൾ</p>
        </div>

        {/* In Stock Items */}
        <div className="p-5 rounded-2xl bg-white dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#2E2828] shadow-apple-card">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-stone-500 font-malayalam">സ്റ്റോക്കുള്ളവ</span>
            <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400">
              <FiCheckCircle className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-blue-600 dark:text-blue-400 font-mono">
            {inStockCount} <span className="text-xs text-stone-400 font-sans font-normal">ഇനങ്ങൾ</span>
          </div>
          <p className="text-[10px] text-stone-400 mt-1 font-malayalam">സ്റ്റോക്ക് &gt; 0 ഉള്ളവ</p>
        </div>

        {/* Zero Stock Items */}
        <div className="p-5 rounded-2xl bg-white dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#2E2828] shadow-apple-card">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-stone-500 font-malayalam">സ്റ്റോക്ക് തീർന്നവ</span>
            <div className="p-2 rounded-xl bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400">
              <FiAlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-red-600 dark:text-red-400 font-mono">
            {outOfStockCount} <span className="text-xs text-stone-400 font-sans font-normal">ഇനങ്ങൾ</span>
          </div>
          <p className="text-[10px] text-stone-400 mt-1 font-malayalam">സ്റ്റോക്ക് 0 ആയവ</p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <FiSearch className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ഉൽപ്പന്നത്തിന്റെ പേരോ SKU നോ തിരയുക..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-stone-200 dark:border-[#2E2828] bg-white dark:bg-[#1E1B1B] text-xs text-stone-900 dark:text-white placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-500/30 transition-all font-malayalam"
          />
        </div>

        <div className="flex items-center gap-1.5 p-1 bg-stone-100 dark:bg-[#1E1B1B] rounded-xl border border-stone-200 dark:border-[#2E2828]">
          <button
            onClick={() => setFilterMode('all')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              filterMode === 'all'
                ? 'bg-white dark:bg-[#282323] text-stone-900 dark:text-white shadow-sm'
                : 'text-stone-500 hover:text-stone-800 dark:text-stone-400'
            }`}
          >
            All ({products.length})
          </button>
          <button
            onClick={() => setFilterMode('in_stock')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              filterMode === 'in_stock'
                ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 shadow-sm'
                : 'text-stone-500 hover:text-stone-800 dark:text-stone-400'
            }`}
          >
            In Stock ({inStockCount})
          </button>
          <button
            onClick={() => setFilterMode('out_of_stock')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              filterMode === 'out_of_stock'
                ? 'bg-red-100 dark:bg-red-950/60 text-red-800 dark:text-red-300 shadow-sm'
                : 'text-stone-500 hover:text-stone-800 dark:text-stone-400'
            }`}
          >
            Zero Stock ({outOfStockCount})
          </button>
        </div>
      </div>

      {/* Spacious 2-3 Column Card Grid for Wide Desktop Screens */}
      {filteredProducts.length === 0 ? (
        <div className="py-16 text-center text-xs text-stone-400 dark:text-stone-500 font-malayalam bg-white dark:bg-[#1E1B1B] rounded-2xl border border-stone-200 dark:border-[#2E2828]">
          ഉൽപ്പന്നങ്ങൾ കണ്ടെത്തിയില്ല
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {filteredProducts.map((p) => {
            const stock = p.currentStock || 0;
            const costPrice = costPerKgMap[p.id] || 0;
            const effectivePrice = p.wholesalePrice && p.wholesalePrice > 0 ? p.wholesalePrice : costPrice;
            const valuation = Math.round(stock * effectivePrice);
            const isZero = stock <= 0;

            return (
              <div
                key={p.id}
                className={`p-6 rounded-3xl bg-white dark:bg-[#1E1B1B] border transition-all shadow-apple-card flex flex-col justify-between ${
                  isZero
                    ? 'border-red-200 dark:border-red-950/60'
                    : 'border-stone-200 dark:border-[#2E2828] hover:border-amber-400/50'
                }`}
              >
                <div>
                  {/* Card Header */}
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="min-w-0">
                      <h3 className="text-base font-black text-stone-900 dark:text-white truncate">
                        {p.name}
                      </h3>
                      {p.sku && (
                        <span className="text-[11px] font-mono text-stone-400 dark:text-stone-500 block">
                          SKU: {p.sku}
                        </span>
                      )}
                    </div>

                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${
                        p.isActive
                          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/40'
                          : 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-400'
                      }`}
                    >
                      {p.isActive ? <FiCheckCircle className="w-3 h-3" /> : <FiXCircle className="w-3 h-3" />}
                      <span>{p.isActive ? 'Active' : 'Inactive'}</span>
                    </span>
                  </div>

                  {/* Stock High-Impact Hero Metric Box */}
                  <div
                    className={`p-4 rounded-2xl border space-y-3 mb-4 transition-colors ${
                      isZero
                        ? 'bg-red-50/60 dark:bg-red-950/20 border-red-200 dark:border-red-900/40'
                        : 'bg-stone-50 dark:bg-[#141212] border-stone-200/80 dark:border-[#282323]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-stone-500 dark:text-stone-400 font-malayalam flex items-center gap-1.5">
                        <FiPackage className="w-4 h-4 text-amber-500" />
                        <span>നിലവിലെ സ്റ്റോക്ക് (Current Stock)</span>
                      </span>

                      <button
                        onClick={() => openSetDirect(p)}
                        className="text-[11px] text-stone-500 hover:text-stone-900 dark:hover:text-white font-bold flex items-center gap-1 hover:underline cursor-pointer"
                        title="നേരിട്ട് തിരുത്തുക"
                      >
                        <FiEdit3 className="w-3 h-3" />
                        <span>നേരിട്ട് നൽകുക</span>
                      </button>
                    </div>

                    <div className="flex items-baseline justify-between">
                      <div className="flex items-baseline gap-1.5">
                        <span
                          className={`text-3xl font-black font-mono tracking-tight ${
                            isZero
                              ? 'text-red-500 dark:text-red-400'
                              : 'text-stone-900 dark:text-white'
                          }`}
                        >
                          {stock}
                        </span>
                        <span className="text-xs font-bold text-stone-400">{p.unit}</span>
                      </div>

                      <div className="text-right">
                        <span className="text-[10px] text-stone-400 block font-malayalam">സ്റ്റോക്ക് മൂല്യം</span>
                        <span className="text-sm font-black text-emerald-600 dark:text-emerald-400 font-mono">
                          ₹{valuation.toLocaleString('en-IN')}
                        </span>
                      </div>
                    </div>

                    {/* Wholesale Rate note */}
                    <div className="flex items-center justify-between text-[11px] pt-2 border-t border-stone-200/60 dark:border-[#282323] text-stone-500 font-mono">
                      <span>{p.wholesalePrice && p.wholesalePrice > 0 ? `മൊത്തവില: ₹${p.wholesalePrice} / ${p.unit}` : `ചെലവ് / കിലോ: ₹${costPrice.toFixed(2)} / ${p.unit}`}</span>
                      {isZero ? (
                        <span className="text-red-500 font-bold font-malayalam">സ്റ്റോക്ക് തീർന്നു</span>
                      ) : (
                        <span className="text-emerald-600 dark:text-emerald-400 font-bold font-malayalam">സ്റ്റോക്ക് ലഭ്യമാണ്</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Manual Stock Actions Toolbar */}
                <div className="space-y-2 pt-2 border-t border-stone-100 dark:border-[#282323]">
                  <div className="grid grid-cols-2 gap-2">
                    {/* Add Stock Button */}
                    <button
                      onClick={() => openAdjust(p, true)}
                      className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/50 text-xs font-bold press-apple transition-colors cursor-pointer"
                    >
                      <FiPlus className="w-3.5 h-3.5 stroke-[3]" />
                      <span className="font-malayalam">സ്റ്റോക്ക് കൂട്ടുക</span>
                    </button>

                    {/* Reduce Stock Button */}
                    <button
                      onClick={() => openAdjust(p, false)}
                      disabled={isZero}
                      className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-orange-50 hover:bg-orange-100 dark:bg-orange-950/40 dark:hover:bg-orange-900/60 text-orange-700 dark:text-orange-300 border border-orange-200 dark:border-orange-800/50 text-xs font-bold press-apple transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <FiMinus className="w-3.5 h-3.5 stroke-[3]" />
                      <span className="font-malayalam">സ്റ്റോക്ക് കുറയ്ക്കുക</span>
                    </button>
                  </div>

                  {/* Clear / Delete Stock Button */}
                  <button
                    onClick={() => handleClearStock(p)}
                    disabled={isZero}
                    className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-stone-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 text-xs font-bold transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-stone-500 font-malayalam"
                  >
                    <FiTrash2 className="w-3.5 h-3.5" />
                    <span>സ്റ്റോക്ക് പൂജ്യമാക്കുക (Delete Stock to 0)</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Adjust Stock Modal (+ / -) */}
      {adjustModalOpen && activeProduct && typeof document !== 'undefined' &&
        createPortal(
          <div className="fixed inset-0 z-[9999] overflow-y-auto">
            <div
              className="fixed inset-0 w-full h-full bg-black/65 backdrop-blur-md"
              onClick={() => !isSubmitting && setAdjustModalOpen(false)}
            />
            <div className="min-h-full flex items-center justify-center p-4 relative z-10">
              <div className="w-full max-w-md bg-white dark:bg-[#1E1B1B] rounded-3xl p-6 sm:p-7 border border-stone-200 dark:border-[#2E2828] shadow-2xl space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-lg font-black text-stone-900 dark:text-white font-malayalam">
                      {adjustIsAdd ? 'സ്റ്റോക്ക് കൂട്ടുക (Add Stock)' : 'സ്റ്റോക്ക് കുറയ്ക്കുക (Reduce Stock)'}
                    </h3>
                    <p className="text-xs text-stone-400 font-malayalam mt-0.5">
                      {activeProduct.name} (നിലവിൽ: {activeProduct.currentStock} {activeProduct.unit})
                    </p>
                  </div>
                  <span
                    className={`p-2 rounded-xl text-xs font-black ${
                      adjustIsAdd
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                        : 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300'
                    }`}
                  >
                    {adjustIsAdd ? '+ ADD' : '- REDUCE'}
                  </span>
                </div>

                <form onSubmit={handleAdjustSubmit} className="space-y-4 text-xs font-malayalam">
                  <div>
                    <label className="block font-bold text-stone-700 dark:text-stone-300 mb-1">
                      {adjustIsAdd ? 'കൂട്ടേണ്ട അളവ് (Quantity to Add) *' : 'കുറയ്ക്കേണ്ട അളവ് (Quantity to Reduce) *'}
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        step="any"
                        min="0.1"
                        max={!adjustIsAdd ? activeProduct.currentStock : undefined}
                        value={adjustDelta}
                        onChange={(e) => setAdjustDelta(e.target.value)}
                        placeholder="10"
                        className="w-full px-4 py-3 rounded-2xl border-2 border-stone-300 dark:border-[#3E3838] bg-stone-50 dark:bg-[#141212] text-xl font-bold font-mono text-stone-900 dark:text-white focus:outline-none focus:border-amber-500"
                        required
                        autoFocus
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 font-bold text-stone-400">
                        {activeProduct.unit}
                      </span>
                    </div>

                    {/* Presets */}
                    <div className="flex items-center gap-1.5 flex-wrap pt-2">
                      <span className="text-[10px] text-stone-400 font-bold">Presets:</span>
                      {[5, 10, 25, 50, 100].map((amt) => (
                        <button
                          key={amt}
                          type="button"
                          onClick={() => setAdjustDelta(amt)}
                          className="px-2.5 py-1 rounded-lg bg-stone-100 dark:bg-[#282323] hover:bg-stone-200 dark:hover:bg-[#342D2D] text-stone-700 dark:text-stone-300 font-mono font-bold text-xs cursor-pointer"
                        >
                          {amt} {activeProduct.unit}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block font-bold text-stone-700 dark:text-stone-300 mb-1">
                      കാരണം / റഫറൻസ് (Reason / Reference)
                    </label>
                    <input
                      type="text"
                      value={adjustReason}
                      onChange={(e) => setAdjustReason(e.target.value)}
                      placeholder="ഉദാ: ഉൽപ്പാദനം ചേർത്തത്, വിൽപ്പന, സാമ്പിൾ..."
                      className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 dark:border-[#2E2828] bg-white dark:bg-[#141212] text-xs text-stone-900 dark:text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  {/* Calculated Result Preview */}
                  {(() => {
                    const deltaNum = Number(adjustDelta) || 0;
                    const resultingStock = adjustIsAdd
                      ? (activeProduct.currentStock || 0) + deltaNum
                      : Math.max(0, (activeProduct.currentStock || 0) - deltaNum);

                    return (
                      <div className="p-3 rounded-xl bg-stone-50 dark:bg-[#141212] border border-stone-200/80 dark:border-[#282323] flex items-center justify-between text-xs">
                        <span className="text-stone-500">മാറ്റത്തിന് ശേഷമുള്ള സ്റ്റോക്ക്:</span>
                        <span className="font-mono font-black text-sm text-stone-900 dark:text-white">
                          {resultingStock} {activeProduct.unit}
                        </span>
                      </div>
                    );
                  })()}

                  <div className="flex items-center justify-end gap-2 pt-3 border-t border-stone-100 dark:border-[#282323]">
                    <button
                      type="button"
                      onClick={() => setAdjustModalOpen(false)}
                      className="px-4 py-2.5 rounded-xl text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-[#282323] font-bold cursor-pointer"
                    >
                      റദ്ദാക്കുക
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting || Number(adjustDelta) <= 0}
                      className={`px-5 py-2.5 rounded-xl font-black text-white shadow-sm cursor-pointer press-apple flex items-center gap-2 disabled:opacity-50 ${
                        adjustIsAdd
                          ? 'bg-emerald-600 hover:bg-emerald-700'
                          : 'bg-orange-600 hover:bg-orange-700'
                      }`}
                    >
                      {isSubmitting ? (
                        <FiRefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <span>{adjustIsAdd ? 'സ്റ്റോക്ക് ചേർക്കുക' : 'സ്റ്റോക്ക് കുറയ്ക്കുക'}</span>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Direct Set Stock Modal */}
      {setStockModalOpen && activeProduct && typeof document !== 'undefined' &&
        createPortal(
          <div className="fixed inset-0 z-[9999] overflow-y-auto">
            <div
              className="fixed inset-0 w-full h-full bg-black/65 backdrop-blur-md"
              onClick={() => !isSubmitting && setSetStockModalOpen(false)}
            />
            <div className="min-h-full flex items-center justify-center p-4 relative z-10">
              <div className="w-full max-w-md bg-white dark:bg-[#1E1B1B] rounded-3xl p-6 sm:p-7 border border-stone-200 dark:border-[#2E2828] shadow-2xl space-y-4">
                <h3 className="text-lg font-black text-stone-900 dark:text-white font-malayalam">
                  സ്റ്റോക്ക് നേരിട്ട് നിശ്ചയിക്കുക (Direct Stock Update)
                </h3>
                <p className="text-xs text-stone-400 font-malayalam">
                  {activeProduct.name} - പുതിയ കൃത്യമായ സ്റ്റോക്ക് നൽകുക
                </p>

                <form onSubmit={handleDirectSetSubmit} className="space-y-4 text-xs font-malayalam">
                  <div>
                    <label className="block font-bold text-stone-700 dark:text-stone-300 mb-1">
                      പുതിയ സ്റ്റോക്ക് അളവ് ({activeProduct.unit}) *
                    </label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={directStockValue}
                      onChange={(e) => setDirectStockValue(e.target.value)}
                      className="w-full px-4 py-3 rounded-2xl border-2 border-stone-300 dark:border-[#3E3838] bg-stone-50 dark:bg-[#141212] text-xl font-bold font-mono text-stone-900 dark:text-white focus:outline-none focus:border-amber-500"
                      required
                      autoFocus
                    />
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-3 border-t border-stone-100 dark:border-[#2E2828]">
                    <button
                      type="button"
                      onClick={() => setSetStockModalOpen(false)}
                      className="px-4 py-2.5 rounded-xl text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-[#282323] font-bold cursor-pointer"
                    >
                      റദ്ദാക്കുക
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="px-5 py-2.5 rounded-xl bg-epso-red hover:bg-epso-red-hover dark:bg-amber-500 dark:hover:bg-amber-600 text-white dark:text-stone-950 font-black shadow-sm cursor-pointer press-apple flex items-center gap-2 disabled:opacity-50"
                    >
                      {isSubmitting ? (
                        <FiRefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <span>സേവ് ചെയ്യുക</span>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
