import React, { useState, useMemo, useEffect } from 'react';
import { StockMovement, Ingredient, Product } from '../types';
import {
  FiSearch,
  FiArrowDownRight,
  FiArrowUpRight,
  FiRefreshCw,
  FiLayers,
  FiPrinter,
  FiFilter,
  FiChevronLeft,
  FiChevronRight,
  FiChevronsLeft,
  FiChevronsRight,
  FiPackage,
  FiDollarSign,
  FiDroplet,
  FiBox,
  FiArrowUp,
  FiArrowDown,
  FiRotateCcw,
} from 'react-icons/fi';
import { PrintPurchaseListModal } from './PrintPurchaseListModal';
import { useLockBodyScroll } from '../hooks/useLockBodyScroll';

export type LedgerCategory = 'all' | 'basic' | 'packets' | 'wages' | 'ingredients' | 'products';
export type SortField = 'date' | 'name' | 'quantity' | 'type' | 'category';
export type SortOrder = 'asc' | 'desc';

export interface UnifiedLedgerEntry {
  id: string;
  itemId: string;
  itemType: 'raw' | 'finished' | 'ingredient' | 'product' | 'wage' | 'packaging';
  itemName: string;
  category: 'basic' | 'packets' | 'wages' | 'ingredients' | 'products';
  movementType: 'in' | 'out' | 'adjust' | 'opening' | 'purchase' | 'production_consumption' | 'production_output' | 'cancellation_reversal';
  quantity: number;
  unit: string;
  previousBalance: number;
  newBalance: number;
  costPerUnit?: number;
  reference: string;
  operatorName: string;
  reason?: string;
  createdAt: string;
}

interface StockLedgerAdminViewProps {
  movements: StockMovement[];
  ingredients?: Ingredient[];
  products?: Product[];
  wages?: any[];
  onRefresh: () => void;
}

export const StockLedgerAdminView: React.FC<StockLedgerAdminViewProps> = ({
  movements,
  ingredients = [],
  products = [],
  wages = [],
  onRefresh,
}) => {
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'in' | 'out' | 'adjust'>('all');
  const [selectedCategory, setSelectedCategory] = useState<LedgerCategory>('all');
  const [selectedIngredient, setSelectedIngredient] = useState<string>('all');
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(25);
  const [purchaseListModalOpen, setPurchaseListModalOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useLockBodyScroll(purchaseListModalOpen);

  // Map ingredients by ID and name for quick lookups
  const ingredientMap = useMemo(() => {
    const map = new Map<string, Ingredient>();
    ingredients.forEach((ing) => {
      map.set(ing.id, ing);
      if (ing.name) map.set(ing.name.toLowerCase().trim(), ing);
    });
    return map;
  }, [ingredients]);

  // Function to classify any stock movement into its primary category
  const classifyItem = (
    m: StockMovement
  ): 'basic' | 'packets' | 'wages' | 'ingredients' | 'products' => {
    if (m.itemType === ('wage' as any)) return 'wages';

    const ing = ingredientMap.get(m.itemId) || ingredientMap.get((m.itemName || '').toLowerCase().trim());
    const nameLower = (m.itemName || '').toLowerCase();
    const unitLower = (m.unit || '').toLowerCase();
    const refLower = (m.reference || '').toLowerCase();
    const reasonLower = (m.reason || '').toLowerCase();

    // 1. Packets & Packaging items
    if (
      m.itemType === ('packaging' as any) ||
      ['packs', 'packet', 'packets', 'covers', 'cover', 'rolls', 'roll', 'pieces', 'pcs'].includes(unitLower) ||
      nameLower.includes('cover') ||
      nameLower.includes('packet') ||
      nameLower.includes('pouch') ||
      nameLower.includes('കവർ') ||
      nameLower.includes('പാക്കറ്റ്') ||
      refLower.includes('packing') ||
      reasonLower.includes('packing')
    ) {
      return 'packets';
    }

    // 2. Basic Ingredients (Oil, Salt, Sugar)
    const isBasicName =
      nameLower.includes('വെളിച്ചെണ്ണ') ||
      nameLower.includes('oil') ||
      nameLower.includes('എണ്ണ') ||
      nameLower.includes('ഉപ്പ്') ||
      nameLower.includes('salt') ||
      nameLower.includes('പഞ്ചസാര') ||
      nameLower.includes('sugar');

    if (
      ing?.category === 'basic' ||
      isBasicName ||
      refLower.includes('closing') ||
      reasonLower.includes('closing') ||
      reasonLower.includes('basic')
    ) {
      return 'basic';
    }

    // 3. Finished Products
    if (m.itemType === 'finished' || m.itemType === 'product') {
      return 'products';
    }

    // 4. Raw Ingredients / Spices
    return 'ingredients';
  };

  // Build unified ledger list combining stock movements + daily wages
  const allEntries: UnifiedLedgerEntry[] = useMemo(() => {
    // 1. Process regular stock movements
    const list: UnifiedLedgerEntry[] = movements.map((m) => {
      const cat = classifyItem(m);
      return {
        ...m,
        category: cat,
      };
    });

    // 2. Synthesize wage entries from daily wages so they are part of the ledger
    if (Array.isArray(wages)) {
      wages.forEach((w) => {
        if (!w || !w.productionDate) return;
        const totalBudget = Number(w.totalWageBudget) || 0;
        if (totalBudget <= 0) return;

        const cooks = Number(w.numCooks) || 0;
        const packers = Number(w.numPackers) || 0;
        const prodWage = Number(w.productionWageAmount) || 0;
        const packWage = Number(w.packingWageAmount) || 0;
        const prodKg = Number(w.totalProductionKg) || 0;
        const packets = Number(w.totalPacketsProduced) || 0;

        // If cooking wage was allocated
        if (prodWage > 0) {
          list.push({
            id: `wage-cook-${w.id || w.productionDate}`,
            itemId: `wage-cook-${w.productionDate}`,
            itemType: 'wage',
            itemName: 'കുക്കിംഗ് കൂലി (Cooking Wages)',
            category: 'wages',
            movementType: 'out',
            quantity: prodWage,
            unit: '₹',
            previousBalance: 0,
            newBalance: prodWage,
            costPerUnit: Number(w.wagePerCook) || 0,
            reference: `WAGE-${w.productionDate}`,
            operatorName: `${cooks} കുക്കുകൾ · ₹${w.wagePerCook || 0}/ഒരാൾക്ക്`,
            reason: `${prodKg.toFixed(1)} kg ഉൽപ്പാദനത്തിനായുള്ള കുക്കിംഗ് ലേബർ വിഹിതം`,
            createdAt: `${w.productionDate}T17:30:00.000Z`,
          });
        }

        // If packing wage was allocated
        if (packWage > 0) {
          list.push({
            id: `wage-pack-${w.id || w.productionDate}`,
            itemId: `wage-pack-${w.productionDate}`,
            itemType: 'wage',
            itemName: 'പാക്കിംഗ് കൂലി (Packing Wages)',
            category: 'wages',
            movementType: 'out',
            quantity: packWage,
            unit: '₹',
            previousBalance: 0,
            newBalance: packWage,
            costPerUnit: Number(w.wagePerPacker) || 0,
            reference: `WAGE-${w.productionDate}`,
            operatorName: `${packers} പാക്കർമാർ · ₹${w.wagePerPacker || 0}/ഒരാൾക്ക്`,
            reason: `${packets} പാക്കറ്റുകൾ പാക്ക് ചെയ്തതിൻ്റെ കൂലി വിഹിതം`,
            createdAt: `${w.productionDate}T18:00:00.000Z`,
          });
        }

        // If no split was made, show total
        if (prodWage === 0 && packWage === 0 && totalBudget > 0) {
          list.push({
            id: `wage-tot-${w.id || w.productionDate}`,
            itemId: `wage-tot-${w.productionDate}`,
            itemType: 'wage',
            itemName: 'ആകെ കൂലി (Daily Total Wage)',
            category: 'wages',
            movementType: 'out',
            quantity: totalBudget,
            unit: '₹',
            previousBalance: 0,
            newBalance: totalBudget,
            costPerUnit: totalBudget,
            reference: `WAGE-${w.productionDate}`,
            operatorName: `${cooks + packers} തൊഴിലാളികൾ`,
            reason: `${prodKg.toFixed(1)} kg ഉൽപ്പാദനം · ${packets} പാക്കറ്റുകൾ`,
            createdAt: `${w.productionDate}T18:00:00.000Z`,
          });
        }
      });
    }

    return list;
  }, [movements, wages, ingredientMap]);

  // Unique list of ingredient & item names for the specific filter dropdown
  const uniqueItemNames = useMemo(() => {
    const set = new Set<string>();
    allEntries.forEach((e) => {
      if (e.itemName) set.add(e.itemName);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [allEntries]);

  // Category counts for quick filter tabs
  const categoryCounts = useMemo(() => {
    const counts = {
      all: allEntries.length,
      basic: 0,
      packets: 0,
      wages: 0,
      ingredients: 0,
      products: 0,
    };
    allEntries.forEach((e) => {
      if (counts[e.category] !== undefined) {
        counts[e.category]++;
      }
    });
    return counts;
  }, [allEntries]);

  // Filtered entries
  const filteredEntries = useMemo(() => {
    return allEntries.filter((m) => {
      // 1. Category filter
      if (selectedCategory !== 'all' && m.category !== selectedCategory) {
        return false;
      }

      // 2. Specific ingredient filter
      if (selectedIngredient !== 'all' && m.itemName !== selectedIngredient) {
        return false;
      }

      // 3. Movement direction / type filter
      if (filterType !== 'all') {
        const isIn = m.movementType === 'in' || m.movementType === 'purchase' || m.movementType === 'production_output';
        const isOut = m.movementType === 'out' || m.movementType === 'production_consumption' || m.category === 'wages';
        const isAdjust = m.movementType === 'adjust' || m.movementType === 'cancellation_reversal' || m.movementType === 'opening';

        if (filterType === 'in' && !isIn) return false;
        if (filterType === 'out' && !isOut) return false;
        if (filterType === 'adjust' && !isAdjust) return false;
      }

      // 4. Text search
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchSearch =
          (m.itemName || '').toLowerCase().includes(q) ||
          (m.operatorName || '').toLowerCase().includes(q) ||
          (m.reference || '').toLowerCase().includes(q) ||
          (m.reason || '').toLowerCase().includes(q) ||
          (m.createdAt || '').toLowerCase().includes(q);
        if (!matchSearch) return false;
      }

      return true;
    });
  }, [allEntries, selectedCategory, selectedIngredient, filterType, search]);

  // Sorted entries
  const sortedEntries = useMemo(() => {
    return [...filteredEntries].sort((a, b) => {
      let comparison = 0;

      if (sortField === 'date') {
        const timeA = new Date(a.createdAt).getTime();
        const timeB = new Date(b.createdAt).getTime();
        comparison = timeA - timeB;
      } else if (sortField === 'name') {
        comparison = (a.itemName || '').localeCompare(b.itemName || '');
      } else if (sortField === 'quantity') {
        comparison = a.quantity - b.quantity;
      } else if (sortField === 'type') {
        comparison = (a.movementType || '').localeCompare(b.movementType || '');
      } else if (sortField === 'category') {
        comparison = (a.category || '').localeCompare(b.category || '');
      }

      return sortOrder === 'asc' ? comparison : -comparison;
    });
  }, [filteredEntries, sortField, sortOrder]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [search, filterType, selectedCategory, selectedIngredient, sortField, sortOrder, pageSize]);

  // Pagination calculations
  const totalEntries = sortedEntries.length;
  const totalPages = Math.max(1, Math.ceil(totalEntries / pageSize));
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);

  const paginatedEntries = useMemo(() => {
    const startIndex = (safeCurrentPage - 1) * pageSize;
    return sortedEntries.slice(startIndex, startIndex + pageSize);
  }, [sortedEntries, safeCurrentPage, pageSize]);

  // Quick action: Sort by Ingredients (Alphabetical)
  const handleSortByIngredients = () => {
    if (sortField === 'name') {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField('name');
      setSortOrder('asc');
    }
  };

  // Toggle column sort
  const handleToggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder(field === 'name' ? 'asc' : 'desc');
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setTimeout(() => setIsRefreshing(false), 400);
    }
  };

  // Helper for Category badge rendering
  const renderCategoryBadge = (cat: UnifiedLedgerEntry['category']) => {
    switch (cat) {
      case 'basic':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300">
            <FiDroplet className="w-2.5 h-2.5 shrink-0" />
            <span>അടിസ്ഥാന ചേരുവ</span>
          </span>
        );
      case 'packets':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-purple-100 dark:bg-purple-950/60 text-purple-800 dark:text-purple-300">
            <FiPackage className="w-2.5 h-2.5 shrink-0" />
            <span>പാക്കറ്റ് / കവർ</span>
          </span>
        );
      case 'wages':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-indigo-100 dark:bg-indigo-950/60 text-indigo-800 dark:text-indigo-300">
            <FiDollarSign className="w-2.5 h-2.5 shrink-0" />
            <span>കൂലി വിഹിതം</span>
          </span>
        );
      case 'products':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-100 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300">
            <FiBox className="w-2.5 h-2.5 shrink-0" />
            <span>ഫിനിഷ്ഡ് സ്നാക്ക്</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-stone-100 dark:bg-[#282323] text-stone-700 dark:text-stone-300">
            <FiLayers className="w-2.5 h-2.5 shrink-0" />
            <span>അസംസ്കൃത വസ്തു</span>
          </span>
        );
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto font-malayalam pb-12">
      {/* ======================================================== */}
      {/* Header Bar                                               */}
      {/* ======================================================== */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-stone-200 dark:border-[#2E2828]">
        <div>
          <h2 className="text-lg sm:text-xl font-black text-stone-900 dark:text-white flex items-center gap-2">
            <span>സ്റ്റോക്ക് ലെഡ്ജർ (Stock Movement Ledger)</span>
          </h2>
          <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
            അടിസ്ഥാന ചേരുവകൾ, പാക്കറ്റുകൾ, കൂലി, സ്നാക്കുകൾ എന്നിവയുടെ പൂർണ്ണ വരവ്-ചിലവ് ചരിത്രം
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {ingredients.length > 0 && (
            <button
              onClick={() => setPurchaseListModalOpen(true)}
              className="flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl border border-stone-200 dark:border-[#2E2828] bg-white dark:bg-[#1E1B1B] text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-[#282323] font-bold text-xs shadow-2xs press-apple transition-colors cursor-pointer"
              title="Print purchase & reorder list"
            >
              <FiPrinter className="w-3.5 h-3.5 text-epso-orange" />
              <span>Print Purchase List</span>
            </button>
          )}

          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 dark:bg-[#282323] dark:hover:bg-[#322c2c] text-stone-700 dark:text-stone-300 font-bold text-xs press-apple transition-colors cursor-pointer disabled:opacity-60"
          >
            <FiRefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* ======================================================== */}
      {/* HIGH-LEVEL SUMMARY METRIC CHIPS                          */}
      {/* ======================================================== */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        <div className="p-3 rounded-2xl bg-white dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#2E2828] shadow-apple-card">
          <span className="text-[10px] font-bold text-stone-400 block uppercase">ആകെ രേഖകൾ</span>
          <span className="text-lg font-black font-mono text-stone-900 dark:text-white mt-0.5 block">
            {allEntries.length}
          </span>
          <span className="text-[10px] text-stone-500">ലെഡ്ജർ എൻട്രികൾ</span>
        </div>

        <div className="p-3 rounded-2xl bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-900/40">
          <span className="text-[10px] font-bold text-amber-700 dark:text-amber-400 block uppercase">അടിസ്ഥാന ചേരുവകൾ</span>
          <span className="text-lg font-black font-mono text-amber-900 dark:text-amber-200 mt-0.5 block">
            {categoryCounts.basic}
          </span>
          <span className="text-[10px] text-amber-600/80 dark:text-amber-400/80">വെളിച്ചെണ്ണ, ഉപ്പ്..</span>
        </div>

        <div className="p-3 rounded-2xl bg-purple-50/50 dark:bg-purple-950/20 border border-purple-200/60 dark:border-purple-900/40">
          <span className="text-[10px] font-bold text-purple-700 dark:text-purple-400 block uppercase">പാക്കറ്റുകൾ & കവർ</span>
          <span className="text-lg font-black font-mono text-purple-900 dark:text-purple-200 mt-0.5 block">
            {categoryCounts.packets}
          </span>
          <span className="text-[10px] text-purple-600/80 dark:text-purple-400/80">കവർ ഉപയോഗം</span>
        </div>

        <div className="p-3 rounded-2xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-200/60 dark:border-indigo-900/40">
          <span className="text-[10px] font-bold text-indigo-700 dark:text-indigo-400 block uppercase">കൂലി വിഹിതം</span>
          <span className="text-lg font-black font-mono text-indigo-900 dark:text-indigo-200 mt-0.5 block">
            {categoryCounts.wages}
          </span>
          <span className="text-[10px] text-indigo-600/80 dark:text-indigo-400/80">കുക്കിംഗ് & പാക്കിംഗ്</span>
        </div>

        <div className="p-3 rounded-2xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200/60 dark:border-emerald-900/40">
          <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 block uppercase">മറ്റ് ചേരുവകൾ</span>
          <span className="text-lg font-black font-mono text-emerald-900 dark:text-emerald-200 mt-0.5 block">
            {categoryCounts.ingredients}
          </span>
          <span className="text-[10px] text-emerald-600/80 dark:text-emerald-400/80">മസാലകൾ & മാവ്</span>
        </div>

        <div className="p-3 rounded-2xl bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200/60 dark:border-blue-900/40">
          <span className="text-[10px] font-bold text-blue-700 dark:text-blue-400 block uppercase">സ്നാക്കുകൾ</span>
          <span className="text-lg font-black font-mono text-blue-900 dark:text-blue-200 mt-0.5 block">
            {categoryCounts.products}
          </span>
          <span className="text-[10px] text-blue-600/80 dark:text-blue-400/80">ഫിനിഷ്ഡ് ബാച്ചുകൾ</span>
        </div>
      </div>

      {/* ======================================================== */}
      {/* CATEGORY TABS (All, Basic, Packets, Wages, etc.)         */}
      {/* ======================================================== */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
        <button
          onClick={() => setSelectedCategory('all')}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            selectedCategory === 'all'
              ? 'bg-epso-red text-white shadow-sm dark:bg-amber-500 dark:text-stone-950'
              : 'bg-white dark:bg-[#1E1B1B] text-stone-600 dark:text-stone-300 border border-stone-200 dark:border-[#2E2828] hover:bg-stone-50 dark:hover:bg-[#252020]'
          }`}
        >
          <span>എല്ലാം (All)</span>
          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-black/10 dark:bg-white/20">
            {categoryCounts.all}
          </span>
        </button>

        <button
          onClick={() => setSelectedCategory('basic')}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            selectedCategory === 'basic'
              ? 'bg-amber-600 text-white shadow-sm dark:bg-amber-500 dark:text-stone-950'
              : 'bg-white dark:bg-[#1E1B1B] text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-900/40 hover:bg-amber-50 dark:hover:bg-amber-950/30'
          }`}
        >
          <FiDroplet className="w-3.5 h-3.5" />
          <span>അടിസ്ഥാന ചേരുവകൾ (Basic)</span>
          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-black/10 dark:bg-white/20">
            {categoryCounts.basic}
          </span>
        </button>

        <button
          onClick={() => setSelectedCategory('packets')}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            selectedCategory === 'packets'
              ? 'bg-purple-600 text-white shadow-sm dark:bg-purple-500 dark:text-white'
              : 'bg-white dark:bg-[#1E1B1B] text-purple-800 dark:text-purple-300 border border-purple-200 dark:border-purple-900/40 hover:bg-purple-50 dark:hover:bg-purple-950/30'
          }`}
        >
          <FiPackage className="w-3.5 h-3.5" />
          <span>പാക്കറ്റുകൾ & കവർ (Packets)</span>
          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-black/10 dark:bg-white/20">
            {categoryCounts.packets}
          </span>
        </button>

        <button
          onClick={() => setSelectedCategory('wages')}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            selectedCategory === 'wages'
              ? 'bg-indigo-600 text-white shadow-sm dark:bg-indigo-500 dark:text-white'
              : 'bg-white dark:bg-[#1E1B1B] text-indigo-800 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-900/40 hover:bg-indigo-50 dark:hover:bg-indigo-950/30'
          }`}
        >
          <FiDollarSign className="w-3.5 h-3.5" />
          <span>കൂലി വിഹിതം (Wages)</span>
          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-black/10 dark:bg-white/20">
            {categoryCounts.wages}
          </span>
        </button>

        <button
          onClick={() => setSelectedCategory('ingredients')}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            selectedCategory === 'ingredients'
              ? 'bg-emerald-600 text-white shadow-sm dark:bg-emerald-500 dark:text-stone-950'
              : 'bg-white dark:bg-[#1E1B1B] text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900/40 hover:bg-emerald-50 dark:hover:bg-emerald-950/30'
          }`}
        >
          <FiLayers className="w-3.5 h-3.5" />
          <span>മറ്റ് ചേരുവകൾ (Ingredients)</span>
          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-black/10 dark:bg-white/20">
            {categoryCounts.ingredients}
          </span>
        </button>

        <button
          onClick={() => setSelectedCategory('products')}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            selectedCategory === 'products'
              ? 'bg-blue-600 text-white shadow-sm dark:bg-blue-500 dark:text-white'
              : 'bg-white dark:bg-[#1E1B1B] text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-900/40 hover:bg-blue-50 dark:hover:bg-blue-950/30'
          }`}
        >
          <FiBox className="w-3.5 h-3.5" />
          <span>സ്നാക്കുകൾ (Products)</span>
          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-black/10 dark:bg-white/20">
            {categoryCounts.products}
          </span>
        </button>
      </div>

      {/* ======================================================== */}
      {/* CONTROLS BAR: Search, Filter, Sort by Ingredients       */}
      {/* ======================================================== */}
      <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between">
        {/* Search */}
        <div className="relative flex-1">
          <FiSearch className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ചേരുവ, ഓപ്പറേറ്റർ, റെഫറൻസ്, തീയതി പ്രകാരം തിരയുക..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-stone-200 dark:border-[#2E2828] bg-white dark:bg-[#1E1B1B] text-xs text-stone-900 dark:text-white placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-epso-red/30 dark:focus:ring-amber-500/30 transition-all font-malayalam"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-stone-400 hover:text-stone-600"
            >
              ✕
            </button>
          )}
        </div>

        {/* Filter by Specific Ingredient Dropdown */}
        <div className="flex items-center gap-2">
          <select
            value={selectedIngredient}
            onChange={(e) => setSelectedIngredient(e.target.value)}
            className="px-3 py-2.5 rounded-xl border border-stone-200 dark:border-[#2E2828] bg-white dark:bg-[#1E1B1B] text-xs font-bold text-stone-800 dark:text-stone-200 focus:outline-none cursor-pointer max-w-[200px]"
            title="Filter by specific item or ingredient"
          >
            <option value="all">എല്ലാ ഇനങ്ങളും (All Items)</option>
            {uniqueItemNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>

          {/* Quick "Sort by Ingredients" Button */}
          <button
            onClick={handleSortByIngredients}
            className={`flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-bold border transition-all cursor-pointer whitespace-nowrap ${
              sortField === 'name'
                ? 'bg-amber-100 border-amber-300 text-amber-900 dark:bg-amber-950/60 dark:border-amber-800 dark:text-amber-300 shadow-xs'
                : 'bg-white dark:bg-[#1E1B1B] border-stone-200 dark:border-[#2E2828] text-stone-700 dark:text-stone-300 hover:bg-stone-50'
            }`}
            title="Sort alphabetically by ingredient name"
          >
            <FiFilter className="w-3.5 h-3.5 text-epso-orange" />
            <span>ചേരുവകൾ പ്രകാരം അടുക്കുക</span>
            {sortField === 'name' && (
              sortOrder === 'asc' ? <FiArrowUp className="w-3 h-3" /> : <FiArrowDown className="w-3 h-3" />
            )}
          </button>
        </div>

        {/* Direction Tabs: All, In, Out, Adjust */}
        <div className="flex items-center gap-1 p-1 bg-stone-100 dark:bg-[#1E1B1B] rounded-xl border border-stone-200 dark:border-[#2E2828]">
          <button
            onClick={() => setFilterType('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              filterType === 'all'
                ? 'bg-white dark:bg-[#282323] text-stone-900 dark:text-white shadow-sm'
                : 'text-stone-500 hover:text-stone-800 dark:text-stone-400'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setFilterType('in')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              filterType === 'in'
                ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 shadow-sm'
                : 'text-stone-500 hover:text-stone-800 dark:text-stone-400'
            }`}
          >
            In (വരവ്)
          </button>
          <button
            onClick={() => setFilterType('out')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              filterType === 'out'
                ? 'bg-red-100 dark:bg-red-950/60 text-red-800 dark:text-red-300 shadow-sm'
                : 'text-stone-500 hover:text-stone-800 dark:text-stone-400'
            }`}
          >
            Out (ചിലവ്)
          </button>
          <button
            onClick={() => setFilterType('adjust')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              filterType === 'adjust'
                ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 shadow-sm'
                : 'text-stone-500 hover:text-stone-800 dark:text-stone-400'
            }`}
          >
            Adjust (മാറ്റം)
          </button>
        </div>
      </div>

      {/* ======================================================== */}
      {/* Movements & Expenses Table with Clickable Sort Headers   */}
      {/* ======================================================== */}
      <div className="rounded-3xl bg-white dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#2E2828] shadow-apple-card overflow-hidden">
        {paginatedEntries.length === 0 ? (
          <div className="py-16 text-center text-xs text-stone-400 dark:text-stone-500 font-malayalam space-y-2">
            <FiLayers className="w-8 h-8 mx-auto text-stone-300 dark:text-stone-600" />
            <p className="font-bold text-stone-600 dark:text-stone-400">
              തിരഞ്ഞെടുത്ത ഫിൽട്ടറുകൾക്കനുസരിച്ച് ലെഡ്ജർ രേഖകൾ ലഭ്യമല്ല
            </p>
            <p className="text-[11px] text-stone-400">
              ഫിൽട്ടറുകൾ റീസെറ്റ് ചെയ്യുക അല്ലെങ്കിൽ തിരയൽ പദം മാറ്റുക.
            </p>
            {(search || selectedCategory !== 'all' || selectedIngredient !== 'all' || filterType !== 'all') && (
              <button
                onClick={() => {
                  setSearch('');
                  setSelectedCategory('all');
                  setSelectedIngredient('all');
                  setFilterType('all');
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-stone-100 dark:bg-[#282323] text-stone-700 dark:text-stone-300 text-xs font-bold mt-2 cursor-pointer hover:bg-stone-200"
              >
                <FiRotateCcw className="w-3.5 h-3.5" />
                <span>എല്ലാ ഫിൽട്ടറുകളും ഒഴിവാക്കുക (Reset Filters)</span>
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-stone-200 dark:border-[#2E2828] bg-stone-50/70 dark:bg-[#161414] text-stone-500 dark:text-stone-400 font-bold font-malayalam select-none">
                  {/* Item / Ingredient Column */}
                  <th
                    onClick={() => handleToggleSort('name')}
                    className="py-3 px-4 cursor-pointer hover:text-stone-900 dark:hover:text-white transition-colors"
                  >
                    <div className="flex items-center gap-1.5">
                      <span>ചേരുവ / ഇനം (Item / Ingredient)</span>
                      {sortField === 'name' && (
                        sortOrder === 'asc' ? <FiArrowUp className="w-3 h-3 text-epso-orange" /> : <FiArrowDown className="w-3 h-3 text-epso-orange" />
                      )}
                    </div>
                  </th>

                  {/* Category Column */}
                  <th
                    onClick={() => handleToggleSort('category')}
                    className="py-3 px-4 cursor-pointer hover:text-stone-900 dark:hover:text-white transition-colors"
                  >
                    <div className="flex items-center gap-1.5">
                      <span>വിഭാഗം (Category)</span>
                      {sortField === 'category' && (
                        sortOrder === 'asc' ? <FiArrowUp className="w-3 h-3 text-epso-orange" /> : <FiArrowDown className="w-3 h-3 text-epso-orange" />
                      )}
                    </div>
                  </th>

                  {/* Type Column */}
                  <th
                    onClick={() => handleToggleSort('type')}
                    className="py-3 px-4 cursor-pointer hover:text-stone-900 dark:hover:text-white transition-colors"
                  >
                    <div className="flex items-center gap-1.5">
                      <span>തരം (Type)</span>
                      {sortField === 'type' && (
                        sortOrder === 'asc' ? <FiArrowUp className="w-3 h-3 text-epso-orange" /> : <FiArrowDown className="w-3 h-3 text-epso-orange" />
                      )}
                    </div>
                  </th>

                  {/* Quantity / Amount Column */}
                  <th
                    onClick={() => handleToggleSort('quantity')}
                    className="py-3 px-4 cursor-pointer hover:text-stone-900 dark:hover:text-white transition-colors text-right"
                  >
                    <div className="flex items-center justify-end gap-1.5">
                      <span>അളവ് / തുക (Change)</span>
                      {sortField === 'quantity' && (
                        sortOrder === 'asc' ? <FiArrowUp className="w-3 h-3 text-epso-orange" /> : <FiArrowDown className="w-3 h-3 text-epso-orange" />
                      )}
                    </div>
                  </th>

                  {/* Old -> New Balance */}
                  <th className="py-3 px-4">ബാലൻസ് (Old → New)</th>

                  {/* Reference / Reason */}
                  <th className="py-3 px-4">റെഫറൻസ് / കാരണം</th>

                  {/* Operator */}
                  <th className="py-3 px-4">ഓപ്പറേറ്റർ / തൊഴിലാളികൾ</th>

                  {/* Date Column */}
                  <th
                    onClick={() => handleToggleSort('date')}
                    className="py-3 px-4 cursor-pointer hover:text-stone-900 dark:hover:text-white transition-colors"
                  >
                    <div className="flex items-center gap-1.5">
                      <span>തീയതി (Date)</span>
                      {sortField === 'date' && (
                        sortOrder === 'asc' ? <FiArrowUp className="w-3 h-3 text-epso-orange" /> : <FiArrowDown className="w-3 h-3 text-epso-orange" />
                      )}
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 dark:divide-[#2E2828]/60">
                {paginatedEntries.map((m) => {
                  const isIn = m.movementType === 'in' || m.movementType === 'purchase' || m.movementType === 'production_output';
                  const isOut = m.movementType === 'out' || m.movementType === 'production_consumption' || m.category === 'wages';
                  const isWage = m.category === 'wages';

                  return (
                    <tr key={m.id} className="hover:bg-stone-50/80 dark:hover:bg-[#252020] transition-colors">
                      {/* Item Name & Details */}
                      <td className="py-3 px-4">
                        <span className="font-bold text-stone-900 dark:text-white font-malayalam block">
                          {m.itemName}
                        </span>
                        <span className="text-[10px] text-stone-400">
                          {m.reference ? m.reference : 'ലോഗ് ചെയ്ത എൻട്രി'}
                        </span>
                      </td>

                      {/* Category Badge */}
                      <td className="py-3 px-4">
                        {renderCategoryBadge(m.category)}
                      </td>

                      {/* Direction / Type Badge */}
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black ${
                            isWage
                              ? 'bg-indigo-100 dark:bg-indigo-950/50 text-indigo-800 dark:text-indigo-300'
                              : isIn
                              ? 'bg-emerald-100 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300'
                              : isOut
                              ? 'bg-red-100 dark:bg-red-950/50 text-red-800 dark:text-red-300'
                              : 'bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300'
                          }`}
                        >
                          {isIn ? (
                            <>
                              <FiArrowDownRight className="w-3 h-3" />
                              <span>IN (വരവ്)</span>
                            </>
                          ) : isOut ? (
                            <>
                              <FiArrowUpRight className="w-3 h-3" />
                              <span>{isWage ? 'WAGE (കൂലി)' : 'OUT (ചിലവ്)'}</span>
                            </>
                          ) : (
                            <span>ADJUST</span>
                          )}
                        </span>
                      </td>

                      {/* Change Quantity / Amount */}
                      <td className="py-3 px-4 font-mono font-bold text-right text-stone-900 dark:text-white">
                        <span
                          className={
                            isWage
                              ? 'text-indigo-600 dark:text-indigo-400'
                              : isIn
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-red-600 dark:text-red-400'
                          }
                        >
                          {isIn ? '+' : '-'}{m.unit === '₹' ? '₹' : ''}{m.quantity.toLocaleString('en-IN')} {m.unit !== '₹' ? m.unit : ''}
                        </span>
                      </td>

                      {/* Old -> New Balance */}
                      <td className="py-3 px-4 font-mono text-[11px] text-stone-500 dark:text-stone-400">
                        {isWage ? (
                          <span>-</span>
                        ) : (
                          <>
                            {m.previousBalance} → <span className="font-bold text-stone-900 dark:text-white">{m.newBalance}</span>
                          </>
                        )}
                      </td>

                      {/* Reference / Reason */}
                      <td className="py-3 px-4 max-w-xs">
                        <span className="font-mono text-[10px] text-stone-500 dark:text-stone-400 block truncate" title={m.reference}>
                          {m.reference}
                        </span>
                        {m.reason && (
                          <span className="text-[11px] text-stone-700 dark:text-stone-300 font-malayalam block line-clamp-2" title={m.reason}>
                            {m.reason}
                          </span>
                        )}
                      </td>

                      {/* Operator / Workers info */}
                      <td className="py-3 px-4 text-stone-600 dark:text-stone-300 font-medium">
                        {m.operatorName || '-'}
                      </td>

                      {/* Date */}
                      <td className="py-3 px-4 text-stone-400 text-[11px] font-mono whitespace-nowrap">
                        {new Date(m.createdAt).toLocaleDateString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ======================================================== */}
        {/* PAGINATION BAR ("add pages if the list becomes full")     */}
        {/* ======================================================== */}
        {totalEntries > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-5 py-4 border-t border-stone-200 dark:border-[#2E2828] bg-stone-50/50 dark:bg-[#161414] text-xs">
            {/* Range Indicator */}
            <div className="text-stone-500 dark:text-stone-400">
              <span>ആകെ </span>
              <span className="font-mono font-bold text-stone-900 dark:text-white">{totalEntries}</span>
              <span> രേഖകളിൽ </span>
              <span className="font-mono font-bold text-stone-900 dark:text-white">
                {(safeCurrentPage - 1) * pageSize + 1} - {Math.min(safeCurrentPage * pageSize, totalEntries)}
              </span>
              <span> എണ്ണം കാണിക്കുന്നു</span>
            </div>

            {/* Pagination Controls */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* Page size selector */}
              <div className="flex items-center gap-1.5 mr-2">
                <span className="text-stone-400 text-[11px]">പേജിൽ:</span>
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                  className="px-2 py-1 rounded-lg border border-stone-200 dark:border-[#2E2828] bg-white dark:bg-[#1E1B1B] text-xs font-bold text-stone-800 dark:text-stone-200 focus:outline-none cursor-pointer"
                >
                  <option value={15}>15</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>

              {/* First Page */}
              <button
                onClick={() => setCurrentPage(1)}
                disabled={safeCurrentPage === 1}
                className="p-1.5 rounded-lg border border-stone-200 dark:border-[#2E2828] bg-white dark:bg-[#1E1B1B] text-stone-700 dark:text-stone-300 hover:bg-stone-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                title="ആദ്യ പേജ് (First Page)"
              >
                <FiChevronsLeft className="w-4 h-4" />
              </button>

              {/* Prev Page */}
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={safeCurrentPage === 1}
                className="p-1.5 rounded-lg border border-stone-200 dark:border-[#2E2828] bg-white dark:bg-[#1E1B1B] text-stone-700 dark:text-stone-300 hover:bg-stone-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                title="മുമ്പത്തെ പേജ് (Previous Page)"
              >
                <FiChevronLeft className="w-4 h-4" />
              </button>

              {/* Page Numbers */}
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum: number;
                  if (totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (safeCurrentPage <= 3) {
                    pageNum = i + 1;
                  } else if (safeCurrentPage >= totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  } else {
                    pageNum = safeCurrentPage - 2 + i;
                  }

                  return (
                    <button
                      key={pageNum}
                      onClick={() => setCurrentPage(pageNum)}
                      className={`w-7 h-7 rounded-lg text-xs font-bold font-mono transition-all cursor-pointer ${
                        safeCurrentPage === pageNum
                          ? 'bg-epso-red text-white shadow-xs dark:bg-amber-500 dark:text-stone-950'
                          : 'bg-white dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#2E2828] text-stone-700 dark:text-stone-300 hover:bg-stone-100'
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}
              </div>

              {/* Next Page */}
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={safeCurrentPage === totalPages}
                className="p-1.5 rounded-lg border border-stone-200 dark:border-[#2E2828] bg-white dark:bg-[#1E1B1B] text-stone-700 dark:text-stone-300 hover:bg-stone-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                title="അടുത്ത പേജ് (Next Page)"
              >
                <FiChevronRight className="w-4 h-4" />
              </button>

              {/* Last Page */}
              <button
                onClick={() => setCurrentPage(totalPages)}
                disabled={safeCurrentPage === totalPages}
                className="p-1.5 rounded-lg border border-stone-200 dark:border-[#2E2828] bg-white dark:bg-[#1E1B1B] text-stone-700 dark:text-stone-300 hover:bg-stone-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                title="അവസാന പേജ് (Last Page)"
              >
                <FiChevronsRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Printable Purchase List Modal */}
      {ingredients.length > 0 && (
        <PrintPurchaseListModal
          isOpen={purchaseListModalOpen}
          onClose={() => setPurchaseListModalOpen(false)}
          ingredients={ingredients}
        />
      )}
    </div>
  );
};
