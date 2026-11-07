import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Product,
  Ingredient,
  ProductionRun,
  StockMovement,
} from '../types';
import {
  fetchDailyClosings,
  fetchPacketTypes,
  fetchPackingRecords,
  fetchDailyWages,
  fetchProductSellingPrices,
  saveProductSellingPrice,
  fetchStockMovements,
  fetchProductionRuns,
  fetchProducts,
} from '../services/supabase';
import { roundCurrency, roundStock, isBasicIngredientName } from '../services/costing';
import { LoadingSpinner } from './LoadingSpinner';
import { useFeedback } from '../context/FeedbackContext';
import {
  FiCalendar,
  FiArrowLeft,
  FiEdit3,
  FiCheck,
  FiX,
  FiTrendingUp,
  FiTrendingDown,
  FiPackage,
  FiLayers,
  FiDroplet,
  FiUsers,
  FiBox,
  FiRefreshCw,
  FiSearch,
  FiActivity,
  FiBarChart2,
  FiPieChart,
  FiSliders,
} from 'react-icons/fi';

interface ProductionCostingAdminViewProps {
  products: Product[];
  ingredients: Ingredient[];
  productionRuns: ProductionRun[];
  stockMovements?: StockMovement[];
  onRefresh: () => void;
}

interface ProductCostSummary {
  productId: string;
  productName: string;
  totalProductionKg: number;
  batchCount: number;
  ingredientCost: number;
  oilCost: number;
  basicIngredientsCost: number;
  productionWages: number;
  packingWages: number;
  packagingMaterialCost: number;
  totalPacketsPacked: number;
  totalManufacturingCost: number;
  costPerKg: number;
  costPerPacket: number;
  wholesalePricePerKg: number;
  profitPerKg: number;
  profitPerPacket: number;
  profitMarginPercent: number;
}

export const ProductionCostingAdminView: React.FC<ProductionCostingAdminViewProps> = ({
  products,
  ingredients,
  productionRuns,
  stockMovements,
  onRefresh,
}) => {
  const { showToast } = useFeedback();
  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);

  // Available distinct production dates
  const availableDates = useMemo(() => {
    const dates = Array.from(
      new Set(
        productionRuns
          .filter((r) => (r.status === 'completed' || (r.status !== 'cancelled' && Number(r.actualQuantity) > 0)) && r.productionDate)
          .map((r) => r.productionDate)
      )
    ).sort().reverse();
    return dates;
  }, [productionRuns]);

  // Default to 'all' (Total Costing / All-Time Average) as explicitly requested!
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('pulari_admin_costing_selected_date');
      if (saved) return saved;
    } catch {}
    return 'all';
  });
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<ProductCostSummary | null>(null);

  // Data states
  const [productCosts, setProductCosts] = useState<ProductCostSummary[]>([]);
  const [allPackings, setAllPackings] = useState<any[]>([]);
  const [packetTypeCostMap, setPacketTypeCostMap] = useState<Record<string, number>>({});
  const [sellingPrices, setSellingPrices] = useState<Record<string, number>>({});
  const [editingPriceId, setEditingPriceId] = useState<string | null>(null);
  const [editPriceValue, setEditPriceValue] = useState<string>('');
  const [isSavingPrice, setIsSavingPrice] = useState(false);
  const [closingDataMap, setClosingDataMap] = useState<Record<string, any>>({});
  const [wageDataMap, setWageDataMap] = useState<Record<string, any>>({});
  const [dailyBasicMap, setDailyBasicMap] = useState<Record<string, number>>({});

  // Per-product detail data
  const [detailIngredients, setDetailIngredients] = useState<any[]>([]);

  const loadCostingData = useCallback(async (dateFilter: string) => {
    setIsLoading(true);
    try {
      // 1. Fetch all needed data in parallel (auto-fetched)
      const [closings, allPackingRecords, wageList, pricesData, packetTypesList, fetchedMovements, freshRuns, freshProds] = await Promise.all([
        fetchDailyClosings(90),
        fetchPackingRecords({ limit: 500 }),
        fetchDailyWages(90),
        fetchProductSellingPrices(),
        fetchPacketTypes().catch(() => []),
        fetchStockMovements(false).catch(() => []),
        fetchProductionRuns(true).catch(() => productionRuns),
        fetchProducts(true).catch(() => products),
      ]);

      const runsToUse = freshRuns && freshRuns.length > 0 ? freshRuns : productionRuns;
      const prodsToUse = freshProds && freshProds.length > 0 ? freshProds : products;

      const movements = (stockMovements && stockMovements.length > 0) ? stockMovements : (fetchedMovements || []);

      // Build ingredients cost lookup
      const ingCostMap = new Map<string, number>();
      for (const ing of ingredients || []) {
        if (ing.id) ingCostMap.set(ing.id, Number(ing.avgCostPerUnit) || 0);
        if (ing.name) ingCostMap.set(ing.name.toLowerCase().trim(), Number(ing.avgCostPerUnit) || 0);
      }

      // Compute daily basic ingredients consumption cost by date
      // Basic ingredients: ഉപ്പ്, അണ്ടി തോട്, ചിപ്പ്ളി പൊടി, കറിവേപ്പില
      const basicCostByDate: Record<string, number> = {};
      for (const m of movements) {
        if ((m.quantity || 0) >= 0) continue;
        const itemName = (m.itemName || '').toLowerCase().trim();
        const reason = (m.reason || '').toLowerCase();

        const isBasic = isBasicIngredientName(itemName) || reason.includes('daily basic ingredient usage');
        if (!isBasic) continue;

        // Exclude oil (oil is tracked separately via daily closings)
        if (itemName.includes('ഓയിൽ') || itemName.includes('oil')) continue;

        const isConsumption =
          m.movementType === 'production_consumption' ||
          reason.includes('daily basic ingredient usage');
        if (!isConsumption) continue;

        const dateMatch = m.reason?.match(/\b(\d{4}-\d{2}-\d{2})\b/);
        const movDate = dateMatch ? dateMatch[1] : (m.createdAt ? m.createdAt.split('T')[0] : '');
        if (!movDate) continue;

        const qtyKg = m.unit?.toLowerCase() === 'g' ? Math.abs(m.quantity) / 1000 : Math.abs(m.quantity);
        const unitCost = (m.costPerUnit && m.costPerUnit > 0)
          ? m.costPerUnit
          : (ingCostMap.get(m.itemId) || ingCostMap.get(itemName) || 0);
        const cost = roundCurrency(qtyKg * unitCost);

        basicCostByDate[movDate] = roundCurrency((basicCostByDate[movDate] || 0) + cost);
      }
      setDailyBasicMap(basicCostByDate);

      setAllPackings(allPackingRecords || []);

      const pCostMap: Record<string, number> = {};
      for (const pt of packetTypesList || []) {
        if (pt.name) {
          pCostMap[pt.name.toLowerCase().trim()] = Number(pt.costPerPacket) || 0;
        }
      }
      setPacketTypeCostMap(pCostMap);

      // Build selling prices map
      const priceMap: Record<string, number> = {};
      for (const p of pricesData) {
        priceMap[p.productId] = p.wholesalePricePerKg;
      }
      setSellingPrices(priceMap);

      // Wage map by date
      const wageMap: Record<string, any> = {};
      for (const w of wageList) {
        wageMap[w.productionDate] = w;
      }
      setWageDataMap(wageMap);

      // Closing map by date
      const closingMap: Record<string, any> = {};
      for (const c of closings) {
        closingMap[c.productionDate] = c;
      }
      setClosingDataMap(closingMap);

      // Completed runs: status is 'completed' or batch has positive actualQuantity and is not cancelled
      const completedRuns = runsToUse.filter(
        (r) => (r.status === 'completed' || (r.status !== 'cancelled' && Number(r.actualQuantity) > 0))
      );

      // 2. Compute costing for ALL products in catalog
      const summaries: ProductCostSummary[] = [];

      for (const prod of prodsToUse) {
        let pRuns = completedRuns.filter((r) => r.productId === prod.id);

        if (dateFilter !== 'all') {
          pRuns = pRuns.filter((r) => r.productionDate === dateFilter);
        }

        const totalKg = pRuns.reduce((sum, r) => sum + (r.actualQuantity || 0), 0);
        const batchCount = pRuns.length;

        // Ingredients cost from runs (excluding basic ingredients to avoid double-counting)
        let ingredientCost = 0;
        for (const run of pRuns) {
          if (run.ingredientsConsumed && Array.isArray(run.ingredientsConsumed) && run.ingredientsConsumed.length > 0) {
            for (const ing of run.ingredientsConsumed) {
              if (isBasicIngredientName(ing.ingredientName || '')) continue;
              ingredientCost += (ing.totalCost || 0);
            }
          } else if (run.totalIngredientCost) {
            ingredientCost += run.totalIngredientCost;
          }
        }
        ingredientCost = roundCurrency(ingredientCost);

        // Product packing records
        let prodPacking = allPackingRecords.filter((pr) => pr.productId === prod.id);
        if (dateFilter !== 'all') {
          prodPacking = prodPacking.filter((pr) => pr.packingDate === dateFilter);
        }
        const prodPackets = prodPacking.reduce((sum, pr) => sum + (pr.packetsPacked || 0), 0);
        const packagingMaterialCost = roundCurrency(
          prodPacking.reduce((sum, pr) => {
            const sizeKey = (pr.packetSize || '').toLowerCase().trim();
            const unitCost = Number(pr.coverUnitCost) || pCostMap[sizeKey] || 0;
            const cost = (pr.packagingCost && pr.packagingCost > 0)
              ? Number(pr.packagingCost)
              : roundCurrency((pr.packetsPacked || 0) * unitCost);
            return sum + cost;
          }, 0)
        );

        // Oil, Basic Ingredients, Cooking and Packing Wages allocation: proportional to production weight on respective dates
        let oilCost = 0;
        let basicIngredientsCost = 0;
        let productionWages = 0; // Cooking workers wage (കുക്കിംഗ് തൊഴിലാളികൾ)
        let packingWages = 0;    // Packing workers wage (പാക്കിംഗ് തൊഴിലാളികൾ)

        if (pRuns.length > 0) {
          for (const run of pRuns) {
            const rDate = run.productionDate;
            const closing = rDate ? closingMap[rDate] : null;
            const wage = rDate ? wageMap[rDate] : null;

            // Day total production weight
            const dayRuns = completedRuns.filter((r) => r.productionDate === rDate);
            const dayTotalKg = dayRuns.reduce((s, r) => s + (r.actualQuantity || 0), 0);
            const ratio = dayTotalKg > 0 ? (run.actualQuantity || 0) / dayTotalKg : 1;

            if (closing && closing.oilConsumed > 0) {
              const dayOilCost = roundCurrency(closing.oilConsumed * (closing.oilCostPerKg || 150));
              oilCost += roundCurrency(dayOilCost * ratio);
            }

            const dayBasicCost = basicCostByDate[rDate] || 0;
            if (dayBasicCost > 0) {
              basicIngredientsCost += roundCurrency(dayBasicCost * ratio);
            }

            // Cooking workers wage (കുക്കിംഗ് തൊഴിലാളികൾ)
            const dayProdWages = wage?.productionWageAmount ?? (closing?.productionWages || 0);
            productionWages += roundCurrency(dayProdWages * ratio);

            // Packing workers wage (പാക്കിംഗ് തൊഴിലാളികൾ)
            const dayPackWages = wage?.packingWageAmount ?? 0;
            if (dayPackWages > 0) {
              packingWages += roundCurrency(dayPackWages * ratio);
            }
          }
        }

        oilCost = roundCurrency(oilCost);
        basicIngredientsCost = roundCurrency(basicIngredientsCost);
        productionWages = roundCurrency(productionWages);
        packingWages = roundCurrency(packingWages);

        const totalManufacturingCost = roundCurrency(
          ingredientCost + oilCost + basicIngredientsCost + productionWages + packingWages + packagingMaterialCost
        );

        const costPerKg = totalKg > 0 ? roundCurrency(totalManufacturingCost / totalKg) : 0;
        const costPerPacket = prodPackets > 0 ? roundCurrency(totalManufacturingCost / prodPackets) : 0;
        const wholesalePricePerKg = priceMap[prod.id] || prod.wholesalePrice || 0;
        const profitPerKg = wholesalePricePerKg > 0 && costPerKg > 0 ? roundCurrency(wholesalePricePerKg - costPerKg) : 0;
        const profitPerPacket = wholesalePricePerKg > 0 && prodPackets > 0
          ? roundCurrency((wholesalePricePerKg * totalKg - totalManufacturingCost) / prodPackets)
          : 0;
        const profitMarginPercent = wholesalePricePerKg > 0 && profitPerKg !== 0
          ? Number(((profitPerKg / wholesalePricePerKg) * 100).toFixed(1))
          : 0;

        summaries.push({
          productId: prod.id,
          productName: prod.name,
          totalProductionKg: totalKg,
          batchCount,
          ingredientCost,
          oilCost,
          basicIngredientsCost,
          productionWages,
          packingWages,
          packagingMaterialCost,
          totalPacketsPacked: prodPackets,
          totalManufacturingCost,
          costPerKg,
          costPerPacket,
          wholesalePricePerKg,
          profitPerKg,
          profitPerPacket,
          profitMarginPercent,
        });
      }

      setProductCosts(summaries);
    } catch (err) {
      console.error('Failed to load costing data:', err);
    } finally {
      setIsLoading(false);
    }
  }, [products, productionRuns, ingredients, stockMovements]);

  useEffect(() => {
    if (onRefresh) onRefresh();
    loadCostingData(selectedDate);
  }, [selectedDate, loadCostingData, onRefresh]);

  // Auto-fetch when window gains focus (no manual reload needed)
  useEffect(() => {
    const handleFocus = () => {
      if (onRefresh) onRefresh();
      loadCostingData(selectedDate);
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [selectedDate, loadCostingData, onRefresh]);

  // Load detail ingredients for a product
  const loadProductDetail = useCallback(async (productId: string) => {
    const runs = productionRuns.filter(
      (r) =>
        r.productId === productId &&
        (r.status === 'completed' || (r.status !== 'cancelled' && Number(r.actualQuantity) > 0)) &&
        (selectedDate === 'all' || r.productionDate === selectedDate)
    );

    const ingMap: Record<string, { name: string; unit: string; qty: number; cost: number }> = {};

    for (const run of runs) {
      if (run.ingredientsConsumed) {
        for (const ing of run.ingredientsConsumed) {
          if (isBasicIngredientName(ing.ingredientName || '')) continue;
          const key = ing.ingredientId || ing.ingredientName || 'unknown';
          if (!ingMap[key]) {
            ingMap[key] = {
              name: ing.ingredientName || ing.ingredientId || 'Unknown',
              unit: ing.unit || 'kg',
              qty: 0,
              cost: 0,
            };
          }
          ingMap[key].qty += (ing.actualQuantity || 0);
          ingMap[key].cost += (ing.totalCost || 0);
        }
      }
    }

    setDetailIngredients(Object.values(ingMap));
  }, [productionRuns, selectedDate]);

  // Persist selected product in URL
  const handleOpenDetail = (product: ProductCostSummary) => {
    setSelectedProduct(product);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('tab', 'costing');
      url.searchParams.set('productId', product.productId);
      window.history.pushState({ tab: 'costing', productId: product.productId }, '', url.toString());
    } catch {
      // ignore
    }
    if (onRefresh) onRefresh();
    loadCostingData(selectedDate);
    loadProductDetail(product.productId);
  };

  const handleCloseDetail = () => {
    setSelectedProduct(null);
    try {
      localStorage.removeItem('pulari_admin_costing_selected_product_id');
      const url = new URL(window.location.href);
      url.searchParams.delete('productId');
      window.history.pushState({ tab: 'costing' }, '', url.toString());
    } catch {
      // ignore
    }
  };

  // Restore selected product on reload or when productCosts update
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const savedProdId = params.get('productId');
      if (savedProdId && productCosts.length > 0 && !selectedProduct) {
        const found = productCosts.find((p) => p.productId === savedProdId);
        if (found) {
          setSelectedProduct(found);
          loadProductDetail(found.productId);
        }
      }
    } catch {
      // ignore
    }
  }, [productCosts, selectedProduct, loadProductDetail]);

  // Support browser popstate (back/forward) navigation
  useEffect(() => {
    const handlePopState = () => {
      try {
        const params = new URLSearchParams(window.location.search);
        const pid = params.get('productId');
        if (!pid) {
          setSelectedProduct(null);
        } else if (productCosts.length > 0) {
          const found = productCosts.find((p) => p.productId === pid);
          if (found) {
            setSelectedProduct(found);
            loadProductDetail(found.productId);
          }
        }
      } catch {}
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [productCosts, loadProductDetail]);

  // Keep detailIngredients fresh whenever selectedDate or selectedProduct changes
  useEffect(() => {
    if (selectedProduct) {
      loadProductDetail(selectedProduct.productId);
    }
  }, [selectedProduct, selectedDate, loadProductDetail]);

  // Persist selectedDate choice
  useEffect(() => {
    try {
      localStorage.setItem('pulari_admin_costing_selected_date', selectedDate);
    } catch {
      // ignore
    }
  }, [selectedDate]);

  const handleSavePrice = async (productId: string) => {
    const price = Number(editPriceValue) || 0;
    if (price < 0) return;

    setIsSavingPrice(true);
    try {
      await saveProductSellingPrice(productId, price);
      setSellingPrices((prev) => ({ ...prev, [productId]: price }));
      setEditingPriceId(null);
      showToast('വില വിജയകരമായി സേവ് ചെയ്തു', 'success');
      await loadCostingData(selectedDate);
    } catch (err: any) {
      showToast(`വില സേവ് ചെയ്യാനായില്ല: ${err?.message || 'Unknown error'}`, 'error');
    } finally {
      setIsSavingPrice(false);
    }
  };

  const formatCurrency = (val: number) => `₹${val.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const formatDate = (dateStr: string) => {
    if (dateStr === 'all') return 'ആകെ ശരാശരി (All-Time Average / Total)';
    if (dateStr === todayStr) return 'ഇന്ന് (Today)';
    try {
      return new Date(dateStr + 'T00:00:00').toLocaleDateString('ml-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  // Filtered by search
  const filteredProductCosts = useMemo(() => {
    return productCosts.filter((p) =>
      (p?.productName || '').toLowerCase().includes((search || '').toLowerCase())
    );
  }, [productCosts, search]);

  // Compute daily price fluctuation trend for selected product
  const productDailyTrends = useMemo(() => {
    if (!selectedProduct) return [];
    const prodId = selectedProduct.productId;
    const prodRuns = productionRuns.filter(
      (r) => r.productId === prodId && r.status === 'completed' && r.productionDate
    );

    const dateMap = new Map<string, { runs: ProductionRun[]; totalKg: number }>();
    for (const r of prodRuns) {
      const d = r.productionDate!;
      if (!dateMap.has(d)) {
        dateMap.set(d, { runs: [], totalKg: 0 });
      }
      const entry = dateMap.get(d)!;
      entry.runs.push(r);
      entry.totalKg += (r.actualQuantity || 0);
    }

    const trends: {
      date: string;
      costPerKg: number;
      totalKg: number;
      ingredientCost: number;
      manufacturingCost: number;
    }[] = [];

    const sortedDates = Array.from(dateMap.keys()).sort();

    for (const d of sortedDates) {
      const { runs, totalKg } = dateMap.get(d)!;
      let ingCost = 0;
      for (const r of runs) {
        if (r.ingredientsConsumed && Array.isArray(r.ingredientsConsumed)) {
          for (const ing of r.ingredientsConsumed) {
            ingCost += (ing.totalCost || 0);
          }
        } else if (r.totalIngredientCost) {
          ingCost += r.totalIngredientCost;
        }
      }

      const dayAllRuns = productionRuns.filter((r) => r.status === 'completed' && r.productionDate === d);
      const dayTotalKgAll = dayAllRuns.reduce((s, r) => s + (r.actualQuantity || 0), 0);
      const ratio = dayTotalKgAll > 0 ? totalKg / dayTotalKgAll : 1;

      const closing = closingDataMap[d];
      const wage = wageDataMap[d];

      let dayOil = 0;
      if (closing && closing.oilConsumed > 0) {
        dayOil = roundCurrency((closing.oilConsumed * (closing.oilCostPerKg || 150)) * ratio);
      }
      const dayBasicCost = roundCurrency((dailyBasicMap[d] || 0) * ratio);
      const dayProdWages = roundCurrency(((wage?.productionWageAmount ?? closing?.productionWages) || 0) * ratio);
      const dayPackWages = roundCurrency((wage?.packingWageAmount || 0) * ratio);

      const mfgCost = roundCurrency(ingCost + dayOil + dayBasicCost + dayProdWages + dayPackWages);
      const costPerKg = totalKg > 0 ? roundCurrency(mfgCost / totalKg) : 0;

      trends.push({
        date: d,
        costPerKg,
        totalKg: roundStock(totalKg),
        ingredientCost: roundCurrency(ingCost),
        manufacturingCost: mfgCost,
      });
    }

    return trends;
  }, [selectedProduct, productionRuns, closingDataMap, wageDataMap, dailyBasicMap]);

  // Ingredient sensitivity breakdown: how each ingredient affects 1 kg finished product cost
  const ingredientImpactList = useMemo(() => {
    if (!selectedProduct || !detailIngredients.length) return [];
    const totalProdKg = selectedProduct.totalProductionKg || 1;
    const totalMfgCost = selectedProduct.totalManufacturingCost || 1;

    return detailIngredients
      .map((ing) => {
        const costPerKg = roundCurrency((ing.cost || 0) / totalProdKg);
        const percent = Number((((ing.cost || 0) / totalMfgCost) * 100).toFixed(1));
        const qtyPerKg = Number(((ing.qty || 0) / totalProdKg).toFixed(3));
        const tenPercentRise = roundCurrency(costPerKg * 0.1);

        return {
          name: ing.name,
          unit: ing.unit,
          totalQty: ing.qty,
          totalCost: ing.cost,
          costPerKg,
          percent,
          qtyPerKg,
          tenPercentRise,
        };
      })
      .sort((a, b) => b.costPerKg - a.costPerKg);
  }, [selectedProduct, detailIngredients]);

  // If restoring a product from URL on reload, show spinner until costing data is resolved
  const targetProductId = useMemo(() => {
    try {
      return new URLSearchParams(window.location.search).get('productId');
    } catch {
      return null;
    }
  }, []);

  if (targetProductId && !selectedProduct && isLoading) {
    return (
      <div className="py-24 flex flex-col items-center justify-center space-y-3 font-malayalam">
        <LoadingSpinner />
        <p className="text-xs font-bold text-stone-400">
          ഉൽപ്പന്നത്തിന്റെ കോസ്റ്റിംഗ് വിവരങ്ങൾ ലഭ്യമാക്കുന്നു...
        </p>
      </div>
    );
  }

  // Detail view
  if (selectedProduct) {
    const p = productCosts.find((pc) => pc.productId === selectedProduct.productId) || selectedProduct;
    const trendValues = productDailyTrends.map((t) => t.costPerKg);
    const minTrend = trendValues.length > 0 ? Math.min(...trendValues) : p.costPerKg;
    const maxTrend = trendValues.length > 0 ? Math.max(...trendValues) : p.costPerKg;
    const priceDiff = maxTrend - minTrend;

    return (
      <div className="space-y-6 pb-8 font-malayalam max-w-6xl mx-auto">
        {/* Back Button and Date Segmented Control inside Detail Page */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <button
            onClick={handleCloseDetail}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-stone-100 dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#2E2828] text-xs font-bold text-stone-700 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-[#282323] transition-colors cursor-pointer press-apple w-fit"
          >
            <FiArrowLeft className="w-4 h-4" />
            <span>തിരികെ ലിസ്റ്റിലേക്ക്</span>
          </button>

          {/* Costing View Options inside Product Detail */}
          <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-stone-100 dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#2E2828] overflow-x-auto no-scrollbar shrink-0">
            <button
              type="button"
              onClick={() => setSelectedDate('all')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                selectedDate === 'all'
                  ? 'bg-amber-500 text-stone-950 shadow-xs font-black'
                  : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-white'
              }`}
            >
              <FiActivity className="w-3.5 h-3.5" />
              <span>ആകെ ശരാശരി (All-Time Average)</span>
            </button>

            <button
              type="button"
              onClick={() => setSelectedDate(todayStr)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                selectedDate === todayStr
                  ? 'bg-amber-500 text-stone-950 shadow-xs font-black'
                  : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-white'
              }`}
            >
              <FiCalendar className="w-3.5 h-3.5" />
              <span>ഇന്നത്തെ ചെലവ് (Today)</span>
            </button>

            {/* Specific Date Dropdown */}
            <div className="flex items-center gap-1 pl-2 border-l border-stone-200 dark:border-stone-700">
              <select
                value={selectedDate !== 'all' && selectedDate !== todayStr ? selectedDate : ''}
                onChange={(e) => {
                  if (e.target.value) setSelectedDate(e.target.value);
                }}
                className={`text-xs font-bold focus:outline-none cursor-pointer py-1.5 px-2.5 rounded-xl border border-stone-200 dark:border-[#2E2828] bg-white dark:bg-[#1E1B1B] text-stone-800 dark:text-stone-200 shadow-2xs transition-colors ${
                  selectedDate !== 'all' && selectedDate !== todayStr
                    ? '!bg-amber-500/20 !border-amber-500/50 text-amber-800 dark:text-amber-300'
                    : 'hover:border-stone-300 dark:hover:border-stone-600'
                }`}
              >
                <option value="" disabled className="bg-white dark:bg-[#1E1B1B] text-stone-400 dark:text-stone-500">
                  മറ്റു തീയതികൾ (Other Dates)...
                </option>
                {availableDates.map((d) => (
                  <option key={d} value={d} className="bg-white dark:bg-[#1E1B1B] text-stone-900 dark:text-stone-100">
                    {formatDate(d)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Product Header */}
        <div className="p-6 rounded-3xl bg-gradient-to-br from-stone-50 to-stone-100 dark:from-[#1A1616] dark:to-[#1E1B1B] border border-stone-200 dark:border-[#2E2828] shadow-apple-card flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-black text-stone-900 dark:text-white">{p.productName}</h2>
            <p className="text-xs text-stone-500 dark:text-stone-400 mt-1">
              {p.batchCount} ബാച്ചുകൾ · {p.totalProductionKg.toFixed(1)} kg ആകെ ഉൽപ്പാദനം · {p.totalPacketsPacked} പാക്കറ്റുകൾ
            </p>
          </div>

          <div className="text-left sm:text-right bg-white dark:bg-[#141212] p-3.5 rounded-2xl border border-stone-200 dark:border-[#282323] shrink-0">
            <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block">
              {selectedDate === 'all' ? 'ശരാശരി ചെലവ് / കിലോ' : 'ചെലവ് / കിലോ'}
            </span>
            <span className="text-2xl font-black text-stone-900 dark:text-white font-mono">
              {formatCurrency(p.costPerKg)}
            </span>
          </div>
        </div>

        {/* DAILY PRICE FLUCTUATION TREND CHART */}
        <div className="p-5 rounded-3xl bg-white dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#2E2828] shadow-apple-card space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-stone-100 dark:border-[#282323]">
            <div>
              <h3 className="text-sm font-black text-stone-900 dark:text-white flex items-center gap-2">
                <FiActivity className="w-4 h-4 text-amber-500" />
                <span>ദിവസേനയുള്ള വില വ്യതിയാന ട്രെൻഡ് (Daily Price Fluctuation Trend)</span>
              </h3>
              <p className="text-xs text-stone-400 mt-0.5">
                വിവിധ ദിവസങ്ങളിൽ ഈ ഉൽപ്പന്നത്തിന്റെ 1 കിലോഗ്രാമിന് വന്ന ഉൽപ്പാദന ചെലവ്
              </p>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-stone-100 dark:bg-[#252020] text-stone-700 dark:text-stone-300 font-mono">
                കുറഞ്ഞത്: {formatCurrency(minTrend)}
              </span>
              <span className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-stone-100 dark:bg-[#252020] text-stone-700 dark:text-stone-300 font-mono">
                കൂടിയത്: {formatCurrency(maxTrend)}
              </span>
              {priceDiff > 0 && (
                <span className="text-[11px] font-bold px-2 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 font-mono flex items-center gap-1">
                  <FiTrendingUp className="w-3.5 h-3.5" />
                  <span>±₹{priceDiff.toFixed(1)}/kg</span>
                </span>
              )}
            </div>
          </div>

          {/* SVG Trend Chart */}
          {productDailyTrends.length >= 1 ? (
            <div className="w-full overflow-x-auto no-scrollbar pt-2">
              <div className="min-w-[420px]">
                <svg viewBox="0 0 520 160" className="w-full h-40 overflow-visible">
                  <defs>
                    <linearGradient id="costGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.35" />
                      <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.0" />
                    </linearGradient>
                  </defs>

                  {/* Horizontal Guide Lines */}
                  <line x1="40" y1="20" x2="500" y2="20" stroke="currentColor" className="text-stone-200 dark:text-stone-800" strokeDasharray="3 3" />
                  <line x1="40" y1="75" x2="500" y2="75" stroke="currentColor" className="text-stone-200 dark:text-stone-800" strokeDasharray="3 3" />
                  <line x1="40" y1="130" x2="500" y2="130" stroke="currentColor" className="text-stone-200 dark:text-stone-800" />

                  {/* Calculate Chart Coordinates */}
                  {(() => {
                    const count = productDailyTrends.length;
                    const paddingX = 50;
                    const chartW = 500 - paddingX;
                    const minC = Math.max(0, minTrend * 0.85);
                    const maxC = maxTrend * 1.15 || 100;
                    const range = Math.max(1, maxC - minC);

                    const points = productDailyTrends.map((t, idx) => {
                      const x = count === 1 ? 260 : paddingX + (idx / (count - 1)) * (chartW - paddingX);
                      const y = 130 - ((t.costPerKg - minC) / range) * 110;
                      return { x, y, data: t };
                    });

                    const polylinePoints = points.map((p) => `${p.x},${p.y}`).join(' ');
                    const areaPoints = `${points[0].x},130 ${polylinePoints} ${points[points.length - 1].x},130`;

                    return (
                      <>
                        {/* Area Gradient */}
                        <polygon points={areaPoints} fill="url(#costGradient)" />

                        {/* Trend Curve Line */}
                        <polyline
                          fill="none"
                          stroke="#f59e0b"
                          strokeWidth="3"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          points={polylinePoints}
                        />

                        {/* Points & Labels */}
                        {points.map((pt, idx) => {
                          const isHigh = pt.data.costPerKg === maxTrend && priceDiff > 0;
                          const isLow = pt.data.costPerKg === minTrend && priceDiff > 0;

                          return (
                            <g key={idx} className="cursor-pointer group">
                              {/* Vertical Drop Line */}
                              <line
                                x1={pt.x}
                                y1={pt.y}
                                x2={pt.x}
                                y2="130"
                                stroke="currentColor"
                                className="text-stone-300 dark:text-stone-700/60"
                                strokeDasharray="2 2"
                              />

                              {/* Point Dot */}
                              <circle
                                cx={pt.x}
                                cy={pt.y}
                                r={isHigh || isLow ? 6 : 5}
                                className={isHigh ? 'fill-red-500' : isLow ? 'fill-emerald-500' : 'fill-amber-500'}
                                stroke="white"
                                strokeWidth="2"
                              />

                              {/* Price Label above point */}
                              <text
                                x={pt.x}
                                y={pt.y - 10}
                                textAnchor="middle"
                                className="text-[10px] font-bold font-mono fill-stone-800 dark:fill-stone-200 select-none"
                              >
                                ₹{pt.data.costPerKg.toFixed(1)}
                              </text>

                              {/* Date & Qty Label below line */}
                              <text
                                x={pt.x}
                                y="146"
                                textAnchor="middle"
                                className="text-[9px] font-semibold fill-stone-400 select-none"
                              >
                                {pt.data.date.slice(5)} ({pt.data.totalKg}kg)
                              </text>
                            </g>
                          );
                        })}
                      </>
                    );
                  })()}
                </svg>
              </div>
            </div>
          ) : (
            <div className="py-6 text-center text-xs text-stone-400">
              ട്രെൻഡ് രേഖപ്പെടുത്താൻ പൂർത്തിയായ പ്രൊഡക്ഷൻ ബാച്ചുകൾ ഒന്നും ലഭ്യമല്ല.
            </div>
          )}
        </div>

        {/* INGREDIENT PRICE IMPACT & SENSITIVITY BREAKDOWN */}
        <div className="p-5 rounded-3xl bg-white dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#2E2828] shadow-apple-card space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-stone-100 dark:border-[#2E2828]">
            <div>
              <h3 className="text-sm font-black text-stone-900 dark:text-white flex items-center gap-2">
                <FiSliders className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span>ചേരുവകളുടെ വില സ്വാധീനം (Ingredient Cost Contribution & Sensitivity)</span>
              </h3>
              <p className="text-xs text-stone-400 mt-0.5">
                1 കിലോഗ്രാം സ്നാക്ക് ഉണ്ടാക്കാൻ ഓരോ ചേരുവയ്ക്കും വരുന്ന ചെലവും അതിന്റെ സ്വാധീനവും
              </p>
            </div>
          </div>

          {ingredientImpactList.length > 0 ? (
            <div className="space-y-3">
              {ingredientImpactList.map((item, idx) => (
                <div
                  key={idx}
                  className="p-3.5 rounded-2xl bg-stone-50 dark:bg-[#141212] border border-stone-200/70 dark:border-[#282323] space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-bold text-xs sm:text-sm text-stone-900 dark:text-white">
                        {item.name}
                      </span>
                      <span className="text-[11px] text-stone-400 block font-mono">
                        1 kg-ക്ക് ആവശ്യം: {item.qtyPerKg} {item.unit}
                      </span>
                    </div>

                    <div className="text-right">
                      <span className="text-sm font-black text-stone-900 dark:text-white font-mono block">
                        ₹{item.costPerKg.toFixed(2)} / kg
                      </span>
                      <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 font-mono">
                        ചെലവിന്റെ {item.percent}%
                      </span>
                    </div>
                  </div>

                  {/* Impact Progress Bar */}
                  <div className="w-full bg-stone-200 dark:bg-stone-800 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-amber-500 h-full rounded-full transition-all duration-300"
                      style={{ width: `${Math.min(100, Math.max(5, item.percent))}%` }}
                    />
                  </div>

                  {/* Sensitivity Calculation Note */}
                  <div className="flex items-center justify-between text-[10px] text-stone-500 dark:text-stone-400 pt-1 border-t border-stone-200/40 dark:border-[#282323]">
                    <span>ഈ ചേരുവയുടെ വിലയിൽ 10% വർദ്ധനവുണ്ടായാൽ:</span>
                    <span className="font-bold font-mono text-amber-700 dark:text-amber-400">
                      കിലോയ്ക്ക് +₹{item.tenPercentRise.toFixed(2)} കൂടും (+{(item.percent * 0.1).toFixed(2)}%)
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-4 text-center text-xs text-stone-400">
              ചേരുവകളുടെ വിശദാംശങ്ങൾ ലഭ്യമല്ല
            </div>
          )}
        </div>

        {/* Cost Breakdown Strip */}
        <div className="space-y-2.5">
          <h3 className="text-sm font-black text-stone-800 dark:text-stone-200 px-1">ചെലവ് വിതരണ കണക്ക് (Cost Allocation)</h3>

          {[
            { label: 'ചേരുവകളുടെ ചെലവ്', value: p.ingredientCost, icon: FiBox, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-950/20' },
            { label: 'ഉപയോഗിച്ച ഓയിലിന്റെ ചെലവ്', value: p.oilCost, icon: FiDroplet, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-950/20' },
            { label: 'അടിസ്ഥാന ചേരുവകൾ (ഉപ്പ്, തോട്..)', value: p.basicIngredientsCost, icon: FiLayers, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/20' },
            { label: 'കുക്കിംഗ് തൊഴിലാളികളുടെ കൂലി', value: p.productionWages, icon: FiUsers, color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-50 dark:bg-orange-950/20' },
            { label: 'പാക്കിംഗ് തൊഴിലാളികളുടെ കൂലി', value: p.packingWages, icon: FiUsers, color: 'text-indigo-600 dark:text-indigo-400', bg: 'bg-indigo-50 dark:bg-indigo-950/20' },
            { label: 'പാക്കിംഗ് കവർ / മെറ്റീരിയലുകൾ', value: p.packagingMaterialCost, icon: FiPackage, color: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-50 dark:bg-purple-950/20' },
          ].map((item, idx) => {
            const Icon = item.icon;
            return (
              <div key={idx} className={`flex items-center justify-between p-4 rounded-2xl ${item.bg} border border-stone-100 dark:border-stone-800/30`}>
                <div className="flex items-center gap-3">
                  <Icon className={`w-5 h-5 ${item.color}`} />
                  <span className="text-xs sm:text-sm font-bold text-stone-700 dark:text-stone-300">{item.label}</span>
                </div>
                <span className="text-sm sm:text-base font-black text-stone-900 dark:text-white font-mono">{formatCurrency(item.value)}</span>
              </div>
            );
          })}

          {/* Total */}
          <div className="flex items-center justify-between p-5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/20 border-2 border-emerald-200 dark:border-emerald-800/50 mt-4">
            <span className="text-xs sm:text-sm font-black text-emerald-800 dark:text-emerald-300 uppercase tracking-wider">
              {selectedDate === 'all' ? 'ആകെ ഉൽപ്പാദന ചെലവ് (Total Manufacturing Cost)' : 'ഇന്നത്തെ ആകെ ഉൽപ്പാദന ചെലവ്'}
            </span>
            <span className="text-xl font-black text-emerald-700 dark:text-emerald-200 font-mono">{formatCurrency(p.totalManufacturingCost)}</span>
          </div>
        </div>

        {/* PACKET TYPES & PACKAGING BREAKDOWN (How packets affect costing) */}
        {(() => {
          const prodPackings = allPackings.filter((pr) => pr.productId === p.productId && (selectedDate === 'all' || pr.packingDate === selectedDate));
          const pMap: Record<string, { size: string; count: number; cost: number }> = {};
          for (const pr of prodPackings) {
            const s = pr.packetSize || 'Unknown';
            if (!pMap[s]) pMap[s] = { size: s, count: 0, cost: 0 };
            const sKey = s.toLowerCase().trim();
            const uCost = Number(pr.coverUnitCost) || packetTypeCostMap[sKey] || 0;
            const itemCost = (pr.packagingCost && pr.packagingCost > 0)
              ? Number(pr.packagingCost)
              : roundCurrency((pr.packetsPacked || 0) * uCost);
            pMap[s].count += (pr.packetsPacked || 0);
            pMap[s].cost += itemCost;
          }
          const packetList = Object.values(pMap);

          return (
            <div className="p-5 rounded-3xl bg-white dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#2E2828] shadow-apple-card space-y-3 font-malayalam">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FiPackage className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                  <h3 className="text-sm font-black text-stone-900 dark:text-white">
                    ഉപയോഗിച്ച പാക്കറ്റുകളുടെ വിശദാംശങ്ങൾ (Packets Used & Cost Impact)
                  </h3>
                </div>
                <span className="text-xs font-mono font-bold text-stone-500">
                  {p.totalPacketsPacked} pkts ആകെ
                </span>
              </div>
              <p className="text-xs text-stone-400">
                തിരഞ്ഞെടുത്ത പാക്കറ്റുകളുടെ എണ്ണവും തരവും അനുസരിച്ചുള്ള പാക്കിംഗ് ചെലവ്:
              </p>

              {packetList.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 pt-1">
                  {packetList.map((item, idx) => (
                    <div key={idx} className="p-3 rounded-2xl bg-stone-50 dark:bg-[#141212] border border-stone-200/70 dark:border-[#282323] flex items-center justify-between">
                      <div>
                        <span className="font-bold text-xs text-stone-900 dark:text-white block font-mono">{item.size}</span>
                        <span className="text-[11px] text-stone-400 font-mono">{item.count} pkts</span>
                      </div>
                      <div className="text-right">
                        <span className="font-mono font-black text-xs text-purple-700 dark:text-purple-400 block">
                          ₹{item.cost.toFixed(2)}
                        </span>
                        <span className="text-[10px] text-stone-400 font-mono">
                          {item.count > 0 ? `₹${(item.cost / item.count).toFixed(2)}/pkt` : ''}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-4 text-center text-xs text-stone-400">
                  പാക്കറ്റ് വിവരങ്ങൾ ലഭ്യമല്ല
                </div>
              )}
            </div>
          );
        })()}

        {/* Production Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[
            { label: 'ആകെ ഉൽപ്പാദിപ്പിച്ചത്', value: `${p.totalProductionKg.toFixed(1)} kg` },
            { label: 'ആകെ പാക്കറ്റുകൾ', value: String(p.totalPacketsPacked) },
            { label: selectedDate === 'all' ? 'ശരാശരി ചെലവ് / കിലോ' : 'യൂണിറ്റ് ചെലവ് / കിലോ', value: formatCurrency(p.costPerKg) },
            { label: 'യൂണിറ്റ് ചെലവ് / പാക്കറ്റ്', value: p.totalPacketsPacked > 0 ? formatCurrency(p.costPerPacket) : '—' },
            { label: 'വില്പന വില / കിലോ', value: p.wholesalePricePerKg > 0 ? formatCurrency(p.wholesalePricePerKg) : 'നൽകിയിട്ടില്ല.' },
            { label: 'ലാഭം / കിലോ', value: p.wholesalePricePerKg > 0 ? formatCurrency(p.profitPerKg) : '—' },
          ].map((item, idx) => (
            <div key={idx} className="p-4 rounded-2xl bg-white dark:bg-[#1A1616] border border-stone-200 dark:border-[#2E2828] shadow-apple-card">
              <p className="text-[10px] font-bold text-stone-500 dark:text-stone-400 uppercase tracking-wider mb-1">{item.label}</p>
              <p className="text-base font-black text-stone-900 dark:text-white font-mono">{item.value}</p>
            </div>
          ))}
        </div>

        {/* Ingredient Details Table */}
        {detailIngredients.length > 0 && (
          <div className="space-y-2.5">
            <h3 className="text-sm font-black text-stone-800 dark:text-stone-200 px-1">ഉപയോഗിച്ച ചേരുവകളുടെ ലിസ്റ്റ്</h3>
            <div className="rounded-2xl border border-stone-200 dark:border-[#2E2828] overflow-hidden shadow-sm">
              <div className="grid grid-cols-[1fr_100px_100px] gap-2 px-4 py-3 bg-stone-50 dark:bg-[#1E1B1B] text-[10px] font-bold text-stone-500 dark:text-stone-400 uppercase tracking-wider">
                <span>ചേരുവ</span>
                <span className="text-right">അളവ്</span>
                <span className="text-right">ചെലവ്</span>
              </div>
              {detailIngredients.map((ing, idx) => (
                <div key={idx} className="grid grid-cols-[1fr_100px_100px] gap-2 px-4 py-3 border-t border-stone-100 dark:border-[#2E2828]/50 text-xs sm:text-sm">
                  <span className="font-bold text-stone-800 dark:text-stone-200 truncate">{ing.name}</span>
                  <span className="text-right text-stone-600 dark:text-stone-400 font-mono">{ing.qty.toFixed(2)} {ing.unit}</span>
                  <span className="text-right font-bold text-stone-900 dark:text-white font-mono">{formatCurrency(ing.cost)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Dashboard view
  return (
    <div className="space-y-6 pb-8 font-malayalam">
      {/* Top Header and Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-stone-200 dark:border-[#2E2828]">
        <div>
          <h2 className="text-base sm:text-lg font-black text-stone-900 dark:text-white">
            ഉൽപ്പന്ന കോസ്റ്റിംഗ് (Product Costing Summary)
          </h2>
          <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
            {filteredProductCosts.length} ഉൽപ്പന്നങ്ങൾ · തീയതി തിരിച്ചുള്ള വിശദാംശങ്ങൾക്ക് കാർഡിലെ 'വിശദാംശങ്ങൾ' ക്ലിക്ക് ചെയ്യുക
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="relative flex-1 sm:w-64">
            <FiSearch className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search product..."
              className="w-full pl-10 pr-4 py-2 rounded-xl border border-stone-200 dark:border-[#2E2828] bg-white dark:bg-[#1E1B1B] text-xs text-stone-900 dark:text-white placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-epso-red/30 dark:focus:ring-amber-500/30 transition-all"
            />
          </div>

          {/* Refresh button */}
          <button
            onClick={() => loadCostingData(selectedDate)}
            disabled={isLoading}
            className="p-2.5 rounded-xl border border-stone-200 dark:border-[#2E2828] bg-white dark:bg-[#1E1B1B] text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-[#282323] transition-colors cursor-pointer disabled:opacity-50 shrink-0"
            title="Refresh Costing"
          >
            <FiRefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-epso-red dark:text-amber-400' : ''}`} />
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="min-h-[35vh] flex items-center justify-center">
          <LoadingSpinner size="md" label="കോസ്റ്റിംഗ് വിവരങ്ങൾ ലഭ്യമാക്കുന്നു..." />
        </div>
      ) : filteredProductCosts.length === 0 ? (
        <div className="min-h-[35vh] flex flex-col items-center justify-center gap-3 text-center">
          <FiLayers className="w-12 h-12 text-stone-300 dark:text-stone-600" />
          <p className="text-sm font-bold text-stone-500 dark:text-stone-400">ഉൽപ്പന്നങ്ങൾ ഒന്നും കണ്ടെത്താനായില്ല</p>
        </div>
      ) : (
        <>
          {/* Products Costing Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-5">
            {filteredProductCosts.map((p) => {
              const isEditing = editingPriceId === p.productId;
              const hasSellingPrice = p.wholesalePricePerKg > 0;
              const hasProfit = hasSellingPrice && p.costPerKg > 0;

              return (
                <div
                  key={p.productId}
                  className="p-5 rounded-2xl bg-white dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#2E2828] shadow-apple-card dark:shadow-apple-card-dark flex flex-col justify-between transition-all hover:border-stone-300 dark:hover:border-stone-700"
                >
                  <div>
                    {/* Header: Title & Subtitle */}
                    <div className="mb-2">
                      <h3 className="text-base font-bold text-stone-900 dark:text-white truncate">
                        {p.productName}
                      </h3>
                      <p className="text-[11px] text-stone-500 dark:text-stone-400 font-malayalam mt-0.5">
                        {p.totalProductionKg.toFixed(1)} kg · {p.batchCount} ബാച്ച് · {p.totalPacketsPacked} പാക്കറ്റുകൾ
                      </p>
                    </div>

                    {/* Details Box - EXACTLY as requested */}
                    <div className="p-3 bg-stone-50 dark:bg-[#141212] rounded-xl border border-stone-100 dark:border-[#282323] space-y-2.5 my-3 text-xs font-malayalam">
                      {/* ഉൽപ്പാദന ചെലവ് */}
                      <div className="flex items-center justify-between">
                        <span className="text-stone-500 dark:text-stone-400 font-semibold">
                          ഉൽപ്പാദന ചെലവ്
                        </span>
                        <span className="font-black text-sm text-stone-900 dark:text-white font-mono">
                          {formatCurrency(p.totalManufacturingCost)}
                        </span>
                      </div>

                      {/* ചെലവ് / കിലോ */}
                      <div className="flex items-center justify-between pt-1 border-t border-stone-200/60 dark:border-[#282323]">
                        <span className="text-stone-500 dark:text-stone-400 font-semibold">
                          ചെലവ് / കിലോ
                        </span>
                        <span className="font-bold text-stone-900 dark:text-white font-mono">
                          {formatCurrency(p.costPerKg)}
                        </span>
                      </div>

                      {/* വില്പന വില / കിലോ */}
                      <div className="flex items-center justify-between pt-1 border-t border-stone-200/60 dark:border-[#282323]">
                        <span className="text-stone-500 dark:text-stone-400 font-semibold">
                          വില്പന വില / കിലോ
                        </span>
                        {isEditing ? (
                          <div className="flex items-center gap-1">
                            <span className="text-xs font-bold text-stone-400">₹</span>
                            <input
                              type="number"
                              value={editPriceValue}
                              onChange={(e) => setEditPriceValue(e.target.value)}
                              min="0"
                              step="1"
                              className="w-20 px-2 py-0.5 rounded-lg border border-epso-red dark:border-amber-500 bg-white dark:bg-[#1E1B1B] text-xs font-mono font-bold text-stone-900 dark:text-white focus:outline-none"
                              autoFocus
                            />
                            <button
                              onClick={() => handleSavePrice(p.productId)}
                              disabled={isSavingPrice}
                              className="p-1 rounded-md bg-emerald-600 text-white hover:bg-emerald-700 cursor-pointer"
                            >
                              {isSavingPrice ? <FiRefreshCw className="w-3 h-3 animate-spin" /> : <FiCheck className="w-3 h-3" />}
                            </button>
                            <button
                              onClick={() => setEditingPriceId(null)}
                              className="p-1 rounded-md bg-stone-200 dark:bg-stone-700 text-stone-600 dark:text-stone-300 hover:bg-stone-300 cursor-pointer"
                            >
                              <FiX className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <span className={`font-extrabold text-sm font-mono ${hasSellingPrice ? 'text-epso-red dark:text-amber-400' : 'text-stone-400 font-sans italic text-xs'}`}>
                              {hasSellingPrice ? formatCurrency(p.wholesalePricePerKg) : 'നൽകിയിട്ടില്ല.'}
                            </span>
                            <button
                              onClick={() => {
                                setEditingPriceId(p.productId);
                                setEditPriceValue(String(p.wholesalePricePerKg || ''));
                              }}
                              className="p-1 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 transition-colors cursor-pointer"
                              title="വില മാറ്റുക"
                            >
                              <FiEdit3 className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Profit / Margin info if available */}
                      {hasProfit && !isEditing && (
                        <div className="flex items-center justify-between pt-1 border-t border-stone-200/60 dark:border-[#282323]">
                          <span className="text-stone-500 dark:text-stone-400 font-semibold">
                            ലാഭം / കിലോ
                          </span>
                          <div className="flex items-center gap-1.5 font-mono">
                            <span className={`font-bold ${p.profitPerKg >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>
                              {formatCurrency(p.profitPerKg)}
                            </span>
                            <span className={`text-[10px] px-1.5 py-0.2 rounded font-bold ${p.profitMarginPercent >= 0 ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300' : 'bg-red-50 text-red-600'}`}>
                              {p.profitMarginPercent.toFixed(1)}%
                            </span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Bottom Details Button */}
                    <button
                      onClick={() => handleOpenDetail(p)}
                      className="w-full mt-2 inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-stone-950 text-xs font-bold transition-all shadow-sm active:scale-95 cursor-pointer font-malayalam"
                    >
                      <span>വിശദാംശങ്ങൾ →</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};
