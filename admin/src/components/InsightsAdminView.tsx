import React, { useState, useEffect, useMemo } from 'react';
import { Product, Ingredient, ProductionRun, StockMovement } from '../types';
import { fetchSales } from '../services/supabase';
import {
  FiTrendingUp,
  FiBox,
  FiDollarSign,
  FiLayers,
  FiArrowUpRight,
  FiPieChart,
  FiBarChart2,
  FiActivity,
  FiCalendar,
  FiAward,
  FiShoppingBag,
  FiPercent,
  FiPackage,
} from 'react-icons/fi';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts';
import { useTheme } from '../context/ThemeContext';
import { AnimatedNumber } from './AnimatedNumber';

interface InsightsAdminViewProps {
  products: Product[];
  ingredients: Ingredient[];
  productionRuns: ProductionRun[];
  stockMovements: StockMovement[];
  onNavigateTab: (tab: any) => void;
}

export const InsightsAdminView: React.FC<InsightsAdminViewProps> = ({
  products,
  ingredients,
  productionRuns,
  stockMovements,
  onNavigateTab,
}) => {
  const { isDark } = useTheme();
  const [timeRange, setTimeRange] = useState<'today' | '7d' | '30d' | 'all' | 'custom'>('7d');
  const [customStartDate, setCustomStartDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split('T')[0];
  });
  const [customEndDate, setCustomEndDate] = useState<string>(() => new Date().toISOString().split('T')[0]);

  // Compute effective date range normalized (handles Day N to Day M and vice versa)
  const { fromDate, toDate, isReversed } = useMemo(() => {
    const today = new Date();
    const todayIso = today.toISOString().split('T')[0];

    if (timeRange === 'today') {
      return { fromDate: todayIso, toDate: todayIso, isReversed: false };
    } else if (timeRange === '7d') {
      const d = new Date();
      d.setDate(d.getDate() - 6);
      return { fromDate: d.toISOString().split('T')[0], toDate: todayIso, isReversed: false };
    } else if (timeRange === '30d') {
      const d = new Date();
      d.setDate(d.getDate() - 29);
      return { fromDate: d.toISOString().split('T')[0], toDate: todayIso, isReversed: false };
    } else if (timeRange === 'custom') {
      const s = customStartDate || customEndDate || todayIso;
      const e = customEndDate || customStartDate || todayIso;
      const reversed = s > e;
      const [start, end] = reversed ? [e, s] : [s, e];
      return { fromDate: start, toDate: end, isReversed: reversed };
    }
    // 'all'
    return { fromDate: '', toDate: '', isReversed: false };
  }, [timeRange, customStartDate, customEndDate]);

  // Filter production runs based on active date range
  const filteredProductionRuns = useMemo(() => {
    if (!fromDate && !toDate) return productionRuns;
    return productionRuns.filter((run) => {
      const d = run.productionDate || (run.createdAt ? run.createdAt.split('T')[0] : '');
      if (!d) return false;
      if (fromDate && d < fromDate) return false;
      if (toDate && d > toDate) return false;
      return true;
    });
  }, [productionRuns, fromDate, toDate]);

  // Filter stock movements based on active date range
  const filteredStockMovements = useMemo(() => {
    if (!fromDate && !toDate) return stockMovements;
    return stockMovements.filter((m) => {
      const d = m.createdAt ? m.createdAt.split('T')[0] : '';
      if (!d) return false;
      if (fromDate && d < fromDate) return false;
      if (toDate && d > toDate) return false;
      return true;
    });
  }, [stockMovements, fromDate, toDate]);

  // Real financial calculations
  const totalFinishedGoodsValuation = products.reduce((acc, p) => acc + p.currentStock * p.wholesalePrice, 0);
  const totalRawValuation = ingredients.reduce((acc, ing) => acc + ing.currentStock * ing.avgCostPerUnit, 0);
  const totalWorkingCapital = totalFinishedGoodsValuation + totalRawValuation;

  // Output stats in selected range
  const completedRunsInRange = useMemo(
    () => filteredProductionRuns.filter((r) => r.status === 'completed'),
    [filteredProductionRuns]
  );
  const totalOutputInRangeKg = useMemo(
    () => completedRunsInRange.reduce((acc, r) => acc + (r.actualQuantity || 0), 0),
    [completedRunsInRange]
  );

  // Real Production Volume over time based on filtered date range
  const productionTrendsData = useMemo(() => {
    const dateMap = new Map<string, { date: string; outputKg: number; count: number }>();

    if (fromDate && toDate) {
      const start = new Date(fromDate);
      const end = new Date(toDate);
      const diffTime = end.getTime() - start.getTime();
      const diffDays = Math.max(0, Math.round(diffTime / (1000 * 3600 * 24)));

      if (diffDays <= 60) {
        for (let i = 0; i <= diffDays; i++) {
          const d = new Date(start);
          d.setDate(d.getDate() + i);
          const iso = d.toISOString().split('T')[0];
          const displayDate = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          dateMap.set(iso, { date: displayDate, outputKg: 0, count: 0 });
        }
      }
    }

    filteredProductionRuns.forEach((run) => {
      if (run.status === 'completed' && run.productionDate) {
        const iso = run.productionDate;
        const displayDate = new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const item = dateMap.get(iso) || { date: displayDate, outputKg: 0, count: 0 };
        item.outputKg = Number((item.outputKg + (run.actualQuantity || 0)).toFixed(2));
        item.count += 1;
        dateMap.set(iso, item);
      }
    });

    return Array.from(dateMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, val]) => val);
  }, [filteredProductionRuns, fromDate, toDate]);

  // Real Consumption by Ingredient in selected range
  const ingredientConsumptionData = useMemo(() => {
    const ingMap = new Map<string, { name: string; quantity: number; unit: string }>();

    filteredProductionRuns.forEach((run) => {
      (run.ingredientsConsumed || []).forEach((c) => {
        const existing = ingMap.get(c.ingredientId) || {
          name: c.ingredientName || 'Ingredient',
          quantity: 0,
          unit: c.unit,
        };
        existing.quantity = Number((existing.quantity + c.actualQuantity).toFixed(2));
        ingMap.set(c.ingredientId, existing);
      });
    });

    if (ingMap.size === 0) {
      filteredStockMovements
        .filter((m) => m.itemType === 'raw' && m.movementType === 'out')
        .forEach((m) => {
          const existing = ingMap.get(m.itemId) || {
            name: m.itemName,
            quantity: 0,
            unit: m.unit,
          };
          existing.quantity = Number((existing.quantity + m.quantity).toFixed(2));
          ingMap.set(m.itemId, existing);
        });
    }

    return Array.from(ingMap.values())
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 6);
  }, [filteredProductionRuns, filteredStockMovements]);

  const [salesList, setSalesList] = useState<any[]>([]);

  useEffect(() => {
    fetchSales().then((data) => setSalesList(data)).catch((err) => console.error(err));
  }, []);

  // Filter sales based on active date range
  const filteredSales = useMemo(() => {
    if (!fromDate && !toDate) return salesList;
    return salesList.filter((s) => {
      const d = s.sale_date || (s.created_at ? s.created_at.split('T')[0] : '');
      if (!d) return false;
      if (fromDate && d < fromDate) return false;
      if (toDate && d > toDate) return false;
      return true;
    });
  }, [salesList, fromDate, toDate]);

  // Top Produced Products in selected range
  const topProducedProducts = useMemo(() => {
    const prodMap = new Map<string, { id: string; name: string; outputKg: number; batchCount: number }>();

    filteredProductionRuns
      .filter((r) => r.status === 'completed')
      .forEach((r) => {
        const pId = r.productId;
        const pName = r.productName || products.find((p) => p.id === pId)?.name || 'ഉൽപ്പന്നം';
        const existing = prodMap.get(pId) || { id: pId, name: pName, outputKg: 0, batchCount: 0 };
        existing.outputKg += (r.actualQuantity || 0);
        existing.batchCount += 1;
        prodMap.set(pId, existing);
      });

    return Array.from(prodMap.values())
      .map((item) => ({
        ...item,
        outputKg: Number(item.outputKg.toFixed(1)),
        percentOfTotal: totalOutputInRangeKg > 0 ? Math.round((item.outputKg / totalOutputInRangeKg) * 100) : 0,
      }))
      .sort((a, b) => b.outputKg - a.outputKg)
      .slice(0, 5);
  }, [filteredProductionRuns, products, totalOutputInRangeKg]);

  // Top Sales Products by Revenue
  const topSalesProducts = useMemo(() => {
    const salesMap = new Map<string, { name: string; revenue: number; quantityKg: number; ordersCount: number }>();

    filteredSales.forEach((s) => {
      const pName = s.product_name || products.find((p) => p.id === s.product_id)?.name || 'ഉൽപ്പന്നം';
      const existing = salesMap.get(pName) || { name: pName, revenue: 0, quantityKg: 0, ordersCount: 0 };
      existing.revenue += Number(s.total_amount) || 0;
      existing.quantityKg += Number(s.quantity) || 0;
      existing.ordersCount += 1;
      salesMap.set(pName, existing);
    });

    const totalSalesRevenue = Array.from(salesMap.values()).reduce((sum, s) => sum + s.revenue, 0);

    return Array.from(salesMap.values())
      .map((s) => ({
        ...s,
        revenue: Math.round(s.revenue),
        quantityKg: Number(s.quantityKg.toFixed(1)),
        percentOfSales: totalSalesRevenue > 0 ? Math.round((s.revenue / totalSalesRevenue) * 100) : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);
  }, [filteredSales, products]);

  // Top Profits & Margin Products
  const topProfitableProducts = useMemo(() => {
    const productCostMap = new Map<string, number>();
    productionRuns
      .filter((r) => r.status === 'completed' && (r.actualQuantity || 0) > 0 && (r.totalIngredientCost || 0) > 0)
      .forEach((r) => {
        const pName = r.productName || products.find((p) => p.id === r.productId)?.name;
        if (pName && !productCostMap.has(pName)) {
          productCostMap.set(pName, (r.totalIngredientCost || 0) / r.actualQuantity);
        }
      });

    const profitMap = new Map<string, {
      name: string;
      revenue: number;
      estimatedCost: number;
      profit: number;
      marginPercent: number;
      qtySold: number;
    }>();

    filteredSales.forEach((s) => {
      const pName = s.product_name || products.find((p) => p.id === s.product_id)?.name || 'ഉൽപ്പന്നം';
      const revenue = Number(s.total_amount) || 0;
      const qty = Number(s.quantity) || 0;

      const baseUnitCost = productCostMap.get(pName) || ((revenue / (qty || 1)) * 0.68);
      const unitCost = baseUnitCost + 25; // add packing & wage shared cost
      const estimatedCost = Math.round(qty * unitCost);
      const profit = Math.round(revenue - estimatedCost);

      const existing = profitMap.get(pName) || {
        name: pName,
        revenue: 0,
        estimatedCost: 0,
        profit: 0,
        marginPercent: 0,
        qtySold: 0,
      };

      existing.revenue += revenue;
      existing.estimatedCost += estimatedCost;
      existing.profit += profit;
      existing.qtySold += qty;
      existing.marginPercent = existing.revenue > 0 ? Math.round((existing.profit / existing.revenue) * 100) : 0;
      profitMap.set(pName, existing);
    });

    return Array.from(profitMap.values())
      .sort((a, b) => b.profit - a.profit)
      .slice(0, 5);
  }, [filteredSales, productionRuns, products]);

  // Capital Distribution Pie Data
  const valuationPieData = useMemo(() => [
    { name: 'Finished Snacks', value: totalFinishedGoodsValuation, color: '#EA580C' },
    { name: 'Raw Materials', value: totalRawValuation, color: '#F59E0B' },
  ], [totalFinishedGoodsValuation, totalRawValuation]);

  return (
    <div className="space-y-6 pb-20 max-w-6xl">
      {/* Top Header & Date Range Toolbar */}
      <div className="flex flex-col gap-4 pb-3 border-b border-stone-200 dark:border-[#2E2828]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-end gap-3">
          {/* Preset Buttons */}
          <div className="flex flex-wrap items-center gap-1.5 p-1 bg-stone-100 dark:bg-[#1E1B1B] rounded-xl border border-stone-200 dark:border-[#2E2828]">
            <button
              onClick={() => setTimeRange('today')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                timeRange === 'today'
                  ? 'bg-white dark:bg-stone-800 text-epso-red dark:text-amber-400 shadow-2xs'
                  : 'text-stone-500 hover:text-stone-800 dark:hover:text-stone-200'
              }`}
            >
              Today
            </button>
            <button
              onClick={() => setTimeRange('7d')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                timeRange === '7d'
                  ? 'bg-white dark:bg-stone-800 text-epso-red dark:text-amber-400 shadow-2xs'
                  : 'text-stone-500 hover:text-stone-800 dark:hover:text-stone-200'
              }`}
            >
              7 Days
            </button>
            <button
              onClick={() => setTimeRange('30d')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                timeRange === '30d'
                  ? 'bg-white dark:bg-stone-800 text-epso-red dark:text-amber-400 shadow-2xs'
                  : 'text-stone-500 hover:text-stone-800 dark:hover:text-stone-200'
              }`}
            >
              30 Days
            </button>
            <button
              onClick={() => setTimeRange('all')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                timeRange === 'all'
                  ? 'bg-white dark:bg-stone-800 text-epso-red dark:text-amber-400 shadow-2xs'
                  : 'text-stone-500 hover:text-stone-800 dark:hover:text-stone-200'
              }`}
            >
              All Time
            </button>
            <button
              onClick={() => setTimeRange('custom')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                timeRange === 'custom'
                  ? 'bg-white dark:bg-stone-800 text-epso-red dark:text-amber-400 shadow-2xs'
                  : 'text-stone-500 hover:text-stone-800 dark:hover:text-stone-200'
              }`}
            >
              <FiCalendar className="w-3.5 h-3.5" />
              Custom Range
            </button>
          </div>
        </div>

        {/* Custom Date Range Picker (Day N to Day M vice versa) */}
        {timeRange === 'custom' && (
          <div className="flex flex-wrap items-center gap-3 p-3 bg-stone-50 dark:bg-[#1A1818] rounded-xl border border-stone-200 dark:border-[#2E2828] animate-in fade-in duration-200">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-stone-600 dark:text-stone-300">From Date (Day N):</span>
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="px-2.5 py-1.5 text-xs font-medium bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700 rounded-lg text-stone-800 dark:text-stone-200 focus:outline-none focus:ring-2 focus:ring-epso-orange"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-stone-600 dark:text-stone-300">To Date (Day M):</span>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="px-2.5 py-1.5 text-xs font-medium bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700 rounded-lg text-stone-800 dark:text-stone-200 focus:outline-none focus:ring-2 focus:ring-epso-orange"
              />
            </div>

            {/* Quick Helper / Swap button */}
            <div className="flex items-center gap-2 ml-auto">
              <button
                type="button"
                onClick={() => {
                  const s = customStartDate;
                  setCustomStartDate(customEndDate);
                  setCustomEndDate(s);
                }}
                className="px-2.5 py-1 text-[11px] font-bold rounded-lg border border-stone-300 dark:border-stone-700 text-stone-600 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-800 transition-colors"
                title="Swap From and To dates"
              >
                ⇄ Swap (Day M ↔ Day N)
              </button>
              <button
                type="button"
                onClick={() => {
                  const today = new Date().toISOString().split('T')[0];
                  setCustomStartDate(today);
                  setCustomEndDate(today);
                }}
                className="px-2.5 py-1 text-[11px] font-bold rounded-lg border border-stone-300 dark:border-stone-700 text-stone-600 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-800 transition-colors"
              >
                Set Today
              </button>
            </div>

            {fromDate && toDate && (
              <div className="w-full text-[11px] text-stone-500 dark:text-stone-400 flex items-center gap-1.5">
                <span>Active Range:</span>
                <span className="font-bold text-epso-orange">
                  {fromDate} {fromDate !== toDate ? `to ${toDate}` : '(Single Day)'}
                </span>
                {isReversed && (
                  <span className="text-amber-500 font-semibold">(Auto-adjusted order)</span>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Range Summary Indicators (Malayalam) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-3 bg-stone-50 dark:bg-[#1A1818] rounded-xl border border-stone-200 dark:border-[#2E2828]">
          <div className="text-[11px] font-bold text-stone-500 dark:text-stone-400 font-malayalam tracking-tight">
            ആകെ ഉൽപ്പാദനം
          </div>
          <div className="text-xl font-black text-epso-orange mt-0.5">
            <AnimatedNumber value={totalOutputInRangeKg} suffix=" kg" decimals={1} />
          </div>
        </div>
        <div className="p-3 bg-stone-50 dark:bg-[#1A1818] rounded-xl border border-stone-200 dark:border-[#2E2828]">
          <div className="text-[11px] font-bold text-stone-500 dark:text-stone-400 font-malayalam tracking-tight">
            പാൻട്രി മൂലധനം
          </div>
          <div className="text-xl font-black text-stone-900 dark:text-white mt-0.5">
            <AnimatedNumber value={totalWorkingCapital} prefix="₹" />
          </div>
        </div>
        <div className="p-3 bg-stone-50 dark:bg-[#1A1818] rounded-xl border border-stone-200 dark:border-[#2E2828]">
          <div className="text-[11px] font-bold text-stone-500 dark:text-stone-400 font-malayalam tracking-tight">
            ആകെ ചേരുവകൾ
          </div>
          <div className="text-xl font-black text-stone-900 dark:text-white mt-0.5">
            <AnimatedNumber value={ingredients.length} suffix=" ഇനങ്ങൾ" />
          </div>
        </div>
      </div>

      {/* Financial Metric Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Total Working Capital */}
        <div className="p-5 rounded-2xl bg-white dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#2E2828] shadow-apple-card dark:shadow-apple-card-dark">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-stone-500 dark:text-stone-400 font-malayalam">
              ആകെ പാൻട്രി മൂലധനം (Working Capital)
            </span>
            <div className="p-2 rounded-xl bg-orange-50 dark:bg-orange-950/40 text-epso-orange">
              <FiDollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-stone-900 dark:text-white">
            <AnimatedNumber value={totalWorkingCapital} prefix="₹" />
          </div>
          <p className="text-[11px] text-stone-400 mt-1 font-malayalam">
            ഫിനിഷ്ഡ് ഗുഡ്സ് + ചേരുവകളുടെ ആകെ മൂല്യം
          </p>
        </div>

        {/* Finished Goods Valuation */}
        <div className="p-5 rounded-2xl bg-white dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#2E2828] shadow-apple-card dark:shadow-apple-card-dark">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-stone-500 dark:text-stone-400 font-malayalam">
              ഫിനിഷ്ഡ് സ്നാക്സ് (Finished Goods)
            </span>
            <div className="p-2 rounded-xl bg-red-50 dark:bg-red-950/40 text-epso-red">
              <FiBox className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-stone-900 dark:text-white">
            <AnimatedNumber value={totalFinishedGoodsValuation} prefix="₹" />
          </div>
          <p className="text-[11px] text-stone-400 mt-1 font-malayalam">
            {products.length} സ്നാക്കുകൾ സ്റ്റോക്കുള്ളത്
          </p>
        </div>

        {/* Raw Material Inventory */}
        <div className="p-5 rounded-2xl bg-white dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#2E2828] shadow-apple-card dark:shadow-apple-card-dark">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-stone-500 dark:text-stone-400 font-malayalam">
              അസംസ്കൃത വസ്തുക്കൾ (Raw Materials)
            </span>
            <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-500">
              <FiLayers className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-stone-900 dark:text-white">
            <AnimatedNumber value={totalRawValuation} prefix="₹" />
          </div>
          <p className="text-[11px] text-stone-400 mt-1 font-malayalam">
            {ingredients.length} രജിസ്റ്റർ ചെയ്ത ചേരുവകൾ
          </p>
        </div>
      </div>

      {/* Analytics Performance Leaderboard: Top Produced, Top Sales, Top Profits */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* 1. Top Produced Products */}
        <div className="p-5 rounded-2xl bg-white dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#2E2828] shadow-apple-card dark:shadow-apple-card-dark flex flex-col">
          <div className="flex items-center justify-between mb-4 pb-2 border-b border-stone-100 dark:border-[#282323]">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400">
                <FiAward className="w-4 h-4 stroke-[2.5]" />
              </div>
              <div>
                <h3 className="text-sm font-black text-stone-900 dark:text-white">
                  Top Produced
                </h3>
                <p className="text-[11px] text-stone-400 font-malayalam">
                  ഏറ്റവും കൂടുതൽ ഉൽപ്പാദിപ്പിച്ചവ
                </p>
              </div>
            </div>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300">
              Output
            </span>
          </div>

          {topProducedProducts.length === 0 ? (
            <div className="py-8 text-center text-xs text-stone-400 font-malayalam">
              ഉൽപ്പാദന വിവരങ്ങൾ ലഭ്യമല്ല
            </div>
          ) : (
            <div className="space-y-3 flex-1">
              {topProducedProducts.map((p, idx) => {
                const badgeColor =
                  idx === 0
                    ? 'bg-amber-500 text-white'
                    : idx === 1
                    ? 'bg-stone-300 text-stone-800 dark:bg-stone-600 dark:text-stone-100'
                    : idx === 2
                    ? 'bg-amber-700 text-white'
                    : 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300';

                return (
                  <div key={p.id} className="p-2.5 rounded-xl bg-stone-50/70 dark:bg-[#141212] border border-stone-100 dark:border-[#282323] space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`w-5 h-5 rounded-full text-[10px] font-black flex items-center justify-center shrink-0 ${badgeColor}`}>
                          {idx + 1}
                        </span>
                        <span className="text-xs font-bold text-stone-800 dark:text-stone-200 truncate max-w-[140px] font-malayalam">
                          {p.name}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-black text-amber-600 dark:text-amber-400 font-mono">
                          {p.outputKg} kg
                        </span>
                        <span className="text-[10px] text-stone-400 ml-1">
                          ({p.batchCount} ബാച്ച്)
                        </span>
                      </div>
                    </div>
                    {/* Visual Progress Bar */}
                    <div className="w-full h-1.5 rounded-full bg-stone-200 dark:bg-stone-800 overflow-hidden">
                      <div
                        className="h-full bg-amber-500 rounded-full transition-all duration-500"
                        style={{ width: `${Math.max(8, p.percentOfTotal)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 2. Top Sales Products */}
        <div className="p-5 rounded-2xl bg-white dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#2E2828] shadow-apple-card dark:shadow-apple-card-dark flex flex-col">
          <div className="flex items-center justify-between mb-4 pb-2 border-b border-stone-100 dark:border-[#282323]">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400">
                <FiShoppingBag className="w-4 h-4 stroke-[2.5]" />
              </div>
              <div>
                <h3 className="text-sm font-black text-stone-900 dark:text-white">
                  Top Sales
                </h3>
                <p className="text-[11px] text-stone-400 font-malayalam">
                  കൂടുതൽ വിൽപ്പനയുള്ള ഉൽപ്പന്നങ്ങൾ
                </p>
              </div>
            </div>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300">
              Revenue
            </span>
          </div>

          {topSalesProducts.length === 0 ? (
            <div className="py-8 text-center text-xs text-stone-400 font-malayalam">
              ഈ കാലയളവിൽ വിൽപ്പന രേഖപ്പെടുത്തിയിട്ടില്ല
            </div>
          ) : (
            <div className="space-y-3 flex-1">
              {topSalesProducts.map((s, idx) => {
                const badgeColor =
                  idx === 0
                    ? 'bg-emerald-500 text-white'
                    : idx === 1
                    ? 'bg-stone-300 text-stone-800 dark:bg-stone-600 dark:text-stone-100'
                    : idx === 2
                    ? 'bg-emerald-700 text-white'
                    : 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300';

                return (
                  <div key={s.name} className="p-2.5 rounded-xl bg-stone-50/70 dark:bg-[#141212] border border-stone-100 dark:border-[#282323] space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`w-5 h-5 rounded-full text-[10px] font-black flex items-center justify-center shrink-0 ${badgeColor}`}>
                          {idx + 1}
                        </span>
                        <span className="text-xs font-bold text-stone-800 dark:text-stone-200 truncate max-w-[140px] font-malayalam">
                          {s.name}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-black text-emerald-600 dark:text-emerald-400 font-mono">
                          ₹{s.revenue.toLocaleString('en-IN')}
                        </span>
                        <span className="text-[10px] text-stone-400 ml-1">
                          ({s.quantityKg} kg)
                        </span>
                      </div>
                    </div>
                    {/* Visual Progress Bar */}
                    <div className="w-full h-1.5 rounded-full bg-stone-200 dark:bg-stone-800 overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                        style={{ width: `${Math.max(8, s.percentOfSales)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 3. Top Profits & Margins */}
        <div className="p-5 rounded-2xl bg-white dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#2E2828] shadow-apple-card dark:shadow-apple-card-dark flex flex-col">
          <div className="flex items-center justify-between mb-4 pb-2 border-b border-stone-100 dark:border-[#282323]">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400">
                <FiTrendingUp className="w-4 h-4 stroke-[2.5]" />
              </div>
              <div>
                <h3 className="text-sm font-black text-stone-900 dark:text-white">
                  Top Profits
                </h3>
                <p className="text-[11px] text-stone-400 font-malayalam">
                  ഏറ്റവും കൂടുതൽ ലാഭം നൽകിയവ
                </p>
              </div>
            </div>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-950/60 text-purple-800 dark:text-purple-300">
              Margin
            </span>
          </div>

          {topProfitableProducts.length === 0 ? (
            <div className="py-8 text-center text-xs text-stone-400 font-malayalam">
              ലാഭ കണക്കുകൾ ലഭ്യമായിട്ടില്ല
            </div>
          ) : (
            <div className="space-y-3 flex-1">
              {topProfitableProducts.map((pr, idx) => {
                const badgeColor =
                  idx === 0
                    ? 'bg-purple-500 text-white'
                    : idx === 1
                    ? 'bg-stone-300 text-stone-800 dark:bg-stone-600 dark:text-stone-100'
                    : idx === 2
                    ? 'bg-purple-700 text-white'
                    : 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300';

                return (
                  <div key={pr.name} className="p-2.5 rounded-xl bg-stone-50/70 dark:bg-[#141212] border border-stone-100 dark:border-[#282323] space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`w-5 h-5 rounded-full text-[10px] font-black flex items-center justify-center shrink-0 ${badgeColor}`}>
                          {idx + 1}
                        </span>
                        <span className="text-xs font-bold text-stone-800 dark:text-stone-200 truncate max-w-[130px] font-malayalam">
                          {pr.name}
                        </span>
                      </div>
                      <div className="text-right flex items-center gap-1.5">
                        <span className="text-xs font-black text-purple-600 dark:text-purple-400 font-mono">
                          ₹{pr.profit.toLocaleString('en-IN')}
                        </span>
                        <span className="text-[10px] font-black px-1.5 py-0.5 rounded-md bg-purple-50 dark:bg-purple-950/50 text-purple-600 dark:text-purple-300">
                          {pr.marginPercent}%
                        </span>
                      </div>
                    </div>
                    {/* Visual Progress Bar */}
                    <div className="w-full h-1.5 rounded-full bg-stone-200 dark:bg-stone-800 overflow-hidden">
                      <div
                        className="h-full bg-purple-500 rounded-full transition-all duration-500"
                        style={{ width: `${Math.max(8, Math.min(100, pr.marginPercent))}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Main Charts: Wave Area Chart for Production Volume */}
      <div className="p-5 rounded-2xl bg-white dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#2E2828] shadow-apple-card dark:shadow-apple-card-dark">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="flex items-center gap-2">
              <FiTrendingUp className="w-4 h-4 text-epso-orange" />
              <h3 className="text-sm font-black text-stone-900 dark:text-white">
                Daily Production Volume Curve
              </h3>
            </div>
            <p className="text-xs text-stone-400 font-malayalam mt-0.5">
              അടുക്കളയിൽ രേഖപ്പെടുത്തിയ ഉൽപ്പാദന അളവ് (Output in kg)
            </p>
          </div>
        </div>

        <div className="h-64 sm:h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={productionTrendsData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="pulariAreaGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#EA580C" stopOpacity={0.45} />
                  <stop offset="95%" stopColor="#EA580C" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#2E2828' : '#F1F2F4'} vertical={false} />
              <XAxis dataKey="date" stroke={isDark ? '#A39E9B' : '#6B7280'} fontSize={11} tickLine={false} />
              <YAxis stroke={isDark ? '#A39E9B' : '#6B7280'} fontSize={11} tickLine={false} tickFormatter={(val) => `${val}kg`} />
              <Tooltip
                contentStyle={{
                  backgroundColor: isDark ? '#141212' : '#FFFFFF',
                  borderColor: isDark ? '#2E2828' : '#E5E7EB',
                  borderRadius: '14px',
                  fontSize: '11px',
                }}
                formatter={(val: any) => [`${val} kg`, 'Output']}
              />
              <Area
                type="monotone"
                dataKey="outputKg"
                stroke="#EA580C"
                strokeWidth={3}
                fillOpacity={1}
                fill="url(#pulariAreaGradient)"
                isAnimationActive={true}
                animationDuration={1200}
                animationEasing="ease-out"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Dual Charts: Consumption Bar Chart & Capital Pie */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Ingredient Consumption Velocity */}
        <div className="p-5 rounded-2xl bg-white dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#2E2828] shadow-apple-card dark:shadow-apple-card-dark">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-black text-stone-900 dark:text-white">
                Top Consumed Raw Materials
              </h3>
              <p className="text-xs text-stone-400 font-malayalam">
                ബാച്ചുകളിൽ ഏറ്റവും കൂടുതൽ ഉപയോഗിച്ച ചേരുവകൾ
              </p>
            </div>
          </div>

          <div className="h-72 w-full">
            {ingredientConsumptionData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-stone-400 font-malayalam">
                ഉപഭോഗ രേഖകൾ കണ്ടെത്താനായില്ല
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={ingredientConsumptionData} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#2E2828' : '#F1F2F4'} horizontal={false} />
                  <XAxis type="number" stroke={isDark ? '#A39E9B' : '#6B7280'} fontSize={9.5} tickLine={false} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    stroke={isDark ? '#A39E9B' : '#6B7280'}
                    fontSize={9.5}
                    tick={{ fontSize: 9.5 }}
                    tickLine={false}
                    interval={0}
                    width={95}
                    tickFormatter={(val: string) => (val && val.length > 13 ? `${val.slice(0, 12)}…` : val)}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: isDark ? '#141212' : '#FFFFFF',
                      borderColor: isDark ? '#2E2828' : '#E5E7EB',
                      borderRadius: '12px',
                      fontSize: '11px',
                    }}
                    formatter={(val: any, _, item: any) => [`${val} ${item.payload.unit}`, 'Consumed']}
                  />
                  <Bar dataKey="quantity" fill="#F59E0B" radius={[0, 6, 6, 0]} isAnimationActive={true} animationDuration={1000} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Capital Distribution Donut Chart */}
        <div className="p-5 rounded-2xl bg-white dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#2E2828] shadow-apple-card dark:shadow-apple-card-dark">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-black text-stone-900 dark:text-white">
                Capital Distribution
              </h3>
              <p className="text-xs text-stone-400 font-malayalam">
                ഫിനിഷ്ഡ് സ്നാക്കുകൾ vs അസംസ്കൃത ചേരുവകൾ
              </p>
            </div>
          </div>

          <div className="h-64 w-full flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={valuationPieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={5}
                  dataKey="value"
                  isAnimationActive={true}
                  animationDuration={1200}
                >
                  {valuationPieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(val: any) => [`₹${Number(val).toLocaleString('en-IN')}`, 'Valuation']}
                  contentStyle={{
                    backgroundColor: isDark ? '#141212' : '#FFFFFF',
                    borderColor: isDark ? '#2E2828' : '#E5E7EB',
                    borderRadius: '12px',
                    fontSize: '11px',
                  }}
                />
                <Legend
                  verticalAlign="bottom"
                  height={36}
                  formatter={(val) => <span className="text-xs font-semibold text-stone-700 dark:text-stone-300">{val}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};
