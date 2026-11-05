import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  FiDroplet,
  FiPlus,
  FiSearch,
  FiEdit2,
  FiBookOpen,
  FiClock,
  FiAlertTriangle,
  FiCheckCircle,
  FiDollarSign,
  FiLayers,
  FiX,
  FiSave,
  FiTrash2,
  FiRefreshCw,
  FiArrowUpRight,
} from 'react-icons/fi';
import { SpecialMixture, SpecialMixtureBatch, SpecialMixtureRecipe, Ingredient, UnitType } from '../types';
import {
  fetchSpecialMixtures,
  saveSpecialMixture,
  saveSpecialMixtureRecipe,
  fetchSpecialMixtureBatches,
} from '../services/supabase';
import { useLanguage } from '../context/LanguageContext';

interface SpecialMixturesAdminViewProps {
  ingredients: Ingredient[];
  onRefresh?: () => void;
}

export const SpecialMixturesAdminView: React.FC<SpecialMixturesAdminViewProps> = ({
  ingredients,
  onRefresh,
}) => {
  const { language, t } = useLanguage();

  const [mixtures, setMixtures] = useState<SpecialMixture[]>([]);
  const [batches, setBatches] = useState<SpecialMixtureBatch[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'low_stock'>('all');

  // Modals
  const [editingMixture, setEditingMixture] = useState<Partial<SpecialMixture> | null>(null);
  const [recipeMixture, setRecipeMixture] = useState<SpecialMixture | null>(null);
  const [historyMixture, setHistoryMixture] = useState<SpecialMixture | null>(null);
  const [saving, setSaving] = useState<boolean>(false);

  // Recipe Builder Form State
  const [recipeExpectedQty, setRecipeExpectedQty] = useState<number>(5);
  const [recipeExpectedUnit, setRecipeExpectedUnit] = useState<UnitType>('kg');
  const [recipeInstructions, setRecipeInstructions] = useState<string>('');
  const [recipeItems, setRecipeItems] = useState<
    Array<{
      ingredientId: string;
      quantity: number;
      unit: UnitType;
    }>
  >([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [mixData, batchData] = await Promise.all([
        fetchSpecialMixtures(true),
        fetchSpecialMixtureBatches(),
      ]);
      setMixtures(mixData);
      setBatches(batchData);
    } catch (err) {
      console.error('Failed to load mixtures data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Filtered Mixtures
  const filteredMixtures = useMemo(() => {
    return mixtures.filter((m) => {
      const matchesSearch =
        (m.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (m.code && (m.code || '').toLowerCase().includes(searchQuery.toLowerCase()));

      if (!matchesSearch) return false;

      if (statusFilter === 'active') return m.isActive;
      if (statusFilter === 'low_stock') return m.currentStock <= m.minStock;
      return true;
    });
  }, [mixtures, searchQuery, statusFilter]);

  // Aggregate Metrics
  const metrics = useMemo(() => {
    const total = mixtures.length;
    const lowStock = mixtures.filter((m) => m.currentStock <= m.minStock).length;
    const totalValuation = mixtures.reduce(
      (sum, m) => sum + (m.currentStock || 0) * (m.avgCostPerUnit || 0),
      0
    );
    return { total, lowStock, totalValuation };
  }, [mixtures]);

  // Open Recipe Builder
  const handleOpenRecipe = (mix: SpecialMixture) => {
    setRecipeMixture(mix);
    if (mix.recipe) {
      setRecipeExpectedQty(mix.recipe.expectedOutputQuantity || 5);
      setRecipeExpectedUnit(mix.recipe.expectedOutputUnit || mix.unit);
      setRecipeInstructions(mix.recipe.instructions || '');
      setRecipeItems(
        mix.recipe.items.map((i) => ({
          ingredientId: i.ingredientId,
          quantity: i.quantity,
          unit: i.unit,
        }))
      );
    } else {
      setRecipeExpectedQty(5);
      setRecipeExpectedUnit(mix.unit);
      setRecipeInstructions('');
      setRecipeItems([]);
    }
  };

  const handleOpenEdit = (mix: SpecialMixture) => {
    setEditingMixture(mix);
    if (mix.recipe) {
      setRecipeExpectedQty(mix.recipe.expectedOutputQuantity || 5);
      setRecipeExpectedUnit(mix.recipe.expectedOutputUnit || mix.unit);
      setRecipeInstructions(mix.recipe.instructions || '');
      setRecipeItems(
        (mix.recipe.items || []).map((i) => ({
          ingredientId: i.ingredientId,
          quantity: i.quantity,
          unit: i.unit,
        }))
      );
    } else {
      setRecipeExpectedQty(5);
      setRecipeExpectedUnit(mix.unit);
      setRecipeInstructions('');
      setRecipeItems([]);
    }
  };

  const handleOpenCreate = () => {
    setEditingMixture({
      name: '',
      unit: 'kg',
      currentStock: 0,
      minStock: 5,
      avgCostPerUnit: 0,
      isActive: true,
    });
    setRecipeExpectedQty(5);
    setRecipeExpectedUnit('kg');
    setRecipeInstructions('');
    setRecipeItems(
      ingredients.length > 0
        ? [
            {
              ingredientId: ingredients[0].id,
              quantity: 1,
              unit: ingredients[0].unit,
            },
          ]
        : []
    );
  };

  // Unit-aware calculation helper
  const calculateItemCost = useCallback(
    (ingredientId: string, quantity: number, unit: UnitType) => {
      const ing = ingredients.find((i) => i.id === ingredientId);
      if (!ing) return 0;
      const unitCost = ing.avgCostPerUnit || 0;
      let qtyInBase = quantity;
      if (unit === 'g' && ing.unit === 'kg') qtyInBase = quantity / 1000;
      else if (unit === 'kg' && ing.unit === 'g') qtyInBase = quantity * 1000;
      else if (unit === 'ml' && ing.unit === 'L') qtyInBase = quantity / 1000;
      else if (unit === 'L' && ing.unit === 'ml') qtyInBase = quantity * 1000;
      return qtyInBase * unitCost;
    },
    [ingredients]
  );

  // Recipe Estimated Cost Calculation with Precision
  const recipeCostEstimate = useMemo(() => {
    let totalCost = 0;
    recipeItems.forEach((item) => {
      totalCost += calculateItemCost(item.ingredientId, item.quantity, item.unit);
    });
    const costPerUnit = recipeExpectedQty > 0 ? totalCost / recipeExpectedQty : 0;
    return { totalCost, costPerUnit };
  }, [recipeItems, calculateItemCost, recipeExpectedQty]);

  // Save Recipe
  const handleSaveRecipe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recipeMixture) return;

    setSaving(true);
    try {
      await saveSpecialMixtureRecipe(recipeMixture.id, {
        expectedOutputQuantity: recipeExpectedQty,
        expectedOutputUnit: recipeExpectedUnit,
        instructions: recipeInstructions.trim() || undefined,
        estimatedCost: recipeCostEstimate.totalCost,
        items: recipeItems.map((item, idx) => ({
          id: `item-${idx}`,
          recipeId: '',
          ingredientId: item.ingredientId,
          quantity: item.quantity,
          unit: item.unit,
        })),
      });

      // Synchronize exact calculated cost per unit to the mixture record
      await saveSpecialMixture({
        ...recipeMixture,
        avgCostPerUnit: recipeCostEstimate.costPerUnit,
      });

      setRecipeMixture(null);
      loadData();
      if (onRefresh) onRefresh();
    } catch (err: any) {
      console.error('Failed to save recipe:', err);
      alert(err.message || 'Failed to save recipe');
    } finally {
      setSaving(false);
    }
  };

  // Save Mixture Details & Selected Ingredients
  const handleSaveMixture = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMixture || !editingMixture.name) return;

    setSaving(true);
    try {
      const computedAvgCost =
        recipeItems.length > 0
          ? recipeCostEstimate.costPerUnit
          : Number(editingMixture.avgCostPerUnit) || 0;

      const savedMix = await saveSpecialMixture({
        id: editingMixture.id,
        name: editingMixture.name.trim(),
        code: editingMixture.code?.trim() || undefined,
        unit: (editingMixture.unit || 'kg') as UnitType,
        currentStock: Number(editingMixture.currentStock) || 0,
        minStock: Number(editingMixture.minStock) || 0,
        avgCostPerUnit: computedAvgCost,
        notes: editingMixture.notes?.trim() || undefined,
        isActive: editingMixture.isActive ?? true,
      });

      if (recipeItems.length > 0) {
        await saveSpecialMixtureRecipe(savedMix.id, {
          expectedOutputQuantity: recipeExpectedQty || 5,
          expectedOutputUnit: recipeExpectedUnit || savedMix.unit,
          instructions: recipeInstructions.trim() || undefined,
          estimatedCost: recipeCostEstimate.totalCost,
          items: recipeItems.map((item, idx) => ({
            id: `item-${idx}`,
            recipeId: '',
            ingredientId: item.ingredientId,
            quantity: item.quantity,
            unit: item.unit,
          })),
        });
      }

      setEditingMixture(null);
      loadData();
      if (onRefresh) onRefresh();
    } catch (err: any) {
      console.error('Failed to save mixture:', err);
      alert(err.message || 'Failed to save mixture');
    } finally {
      setSaving(false);
    }
  };

  // Toggle Active
  const handleToggleActive = async (mix: SpecialMixture) => {
    try {
      await saveSpecialMixture({
        ...mix,
        isActive: !mix.isActive,
      });
      loadData();
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error('Failed to toggle status:', err);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in text-stone-900 dark:text-stone-100">
      {/* Top Header Card */}
      <div className="bg-white dark:bg-[#181616] p-5 sm:p-6 rounded-2xl border border-stone-200 dark:border-stone-800 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="p-3.5 rounded-2xl bg-pulari-primary/10 text-pulari-primary dark:text-pulari-gold">
            <FiDroplet className="w-7 h-7 stroke-[2.2]" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-stone-900 dark:text-white">
              {language === 'ml' ? 'പ്രത്യേക പാചകക്കൂട്ടുകൾ' : 'Special Prepared Mixtures'}
            </h1>
            <p className="text-xs sm:text-sm text-stone-500 dark:text-stone-400 mt-0.5">
              {language === 'ml'
                ? 'പ്ലം കേക്ക്, ചോക്ലേറ്റ്, ക്രീം എന്നിവയ്ക്കുള്ള ഇന്റർമീഡിയറ്റ് തയ്യാറെടുപ്പുകൾ'
                : 'Intermediate BOM formulations, prepared stock, and cake mixture costing'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={loadData}
            className="p-2.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-700 transition-colors cursor-pointer"
            title={t.refresh}
          >
            <FiRefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            type="button"
            onClick={handleOpenCreate}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-pulari-primary text-white font-bold text-xs sm:text-sm hover:bg-pulari-primary/90 transition-all shadow-md active:scale-95 cursor-pointer"
          >
            <FiPlus className="w-4 h-4 stroke-[3]" />
            <span>{language === 'ml' ? 'പുതിയ കൂട്ട് ചേർക്കുക' : 'New Mixture'}</span>
          </button>
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-[#181616] p-4 sm:p-5 rounded-2xl border border-stone-200 dark:border-stone-800 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-stone-400 uppercase tracking-wider">
              {language === 'ml' ? 'ആകെ കൂട്ടുകൾ' : 'Total Formulations'}
            </p>
            <p className="text-2xl font-black text-stone-900 dark:text-white mt-1">
              {metrics.total}
            </p>
          </div>
          <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400">
            <FiLayers className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white dark:bg-[#181616] p-4 sm:p-5 rounded-2xl border border-stone-200 dark:border-stone-800 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-stone-400 uppercase tracking-wider">
              {language === 'ml' ? 'സ്റ്റോക്ക് കുറവുള്ളവ' : 'Low Stock Warning'}
            </p>
            <p className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-1">
              {metrics.lowStock}
            </p>
          </div>
          <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400">
            <FiAlertTriangle className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white dark:bg-[#181616] p-4 sm:p-5 rounded-2xl border border-stone-200 dark:border-stone-800 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-stone-400 uppercase tracking-wider">
              {language === 'ml' ? 'സ്റ്റോക്ക് മൂല്യം' : 'Mixture Valuation'}
            </p>
            <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
              ₹{metrics.totalValuation.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
            </p>
          </div>
          <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400">
            <FiDollarSign className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white dark:bg-[#181616] p-3 rounded-xl border border-stone-200 dark:border-stone-800">
        <div className="relative w-full sm:w-80">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={language === 'ml' ? 'കൂട്ടുകൾ തിരയുക...' : 'Search special mixtures...'}
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-xs font-medium outline-hidden focus:ring-2 focus:ring-pulari-primary"
          />
          <FiSearch className="absolute left-3 top-2.5 text-stone-400 w-4 h-4" />
        </div>

        <div className="flex items-center gap-1.5 self-end sm:self-auto text-xs font-bold">
          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
              statusFilter === 'all'
                ? 'bg-pulari-primary text-white'
                : 'text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800'
            }`}
          >
            {language === 'ml' ? 'എല്ലാം' : 'All'}
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('active')}
            className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
              statusFilter === 'active'
                ? 'bg-pulari-primary text-white'
                : 'text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800'
            }`}
          >
            {language === 'ml' ? 'സജീവം' : 'Active'}
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('low_stock')}
            className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
              statusFilter === 'low_stock'
                ? 'bg-pulari-primary text-white'
                : 'text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800'
            }`}
          >
            {language === 'ml' ? 'സ്റ്റോക്ക് കുറവ്' : 'Low Stock'}
          </button>
        </div>
      </div>

      {/* Catalogue Table */}
      <div className="bg-white dark:bg-[#181616] rounded-2xl border border-stone-200 dark:border-stone-800 shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-stone-400">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-pulari-primary border-t-transparent mx-auto mb-2" />
            <span>{t.loading}</span>
          </div>
        ) : filteredMixtures.length === 0 ? (
          <div className="p-12 text-center text-stone-400 text-sm">
            {language === 'ml' ? 'കൂട്ടുകൾ കണ്ടെത്താനായില്ല' : 'No matching special mixtures found'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-stone-50 dark:bg-stone-900/40 border-b border-stone-200 dark:border-stone-800 text-stone-500 dark:text-stone-400 font-bold uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3.5">{language === 'ml' ? 'കൂട്ടിന്റെ പേര്' : 'Mixture Name'}</th>
                  <th className="px-5 py-3.5">{language === 'ml' ? 'നിലവിലെ സ്റ്റോക്ക്' : 'Current Stock'}</th>
                  <th className="px-5 py-3.5">{language === 'ml' ? 'ശരാശരി ചിലവ്' : 'Avg Unit Cost'}</th>
                  <th className="px-5 py-3.5">{language === 'ml' ? 'റെസിപ്പി / കൂട്ട്' : 'Recipe (BOM)'}</th>
                  <th className="px-5 py-3.5">{language === 'ml' ? 'സ്റ്റാറ്റസ്' : 'Status'}</th>
                  <th className="px-5 py-3.5 text-right">{language === 'ml' ? 'പ്രവർത്തനങ്ങൾ' : 'Actions'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 dark:divide-stone-800/80 font-medium">
                {filteredMixtures.map((mix) => {
                  const isLow = mix.currentStock <= mix.minStock;
                  return (
                    <tr
                      key={mix.id}
                      className="hover:bg-stone-50/60 dark:hover:bg-stone-800/30 transition-colors"
                    >
                      <td className="px-5 py-4">
                        <div className="font-bold text-stone-900 dark:text-white text-sm">
                          {mix.name}
                        </div>
                        {mix.code && (
                          <span className="text-[10px] text-stone-400 font-mono tracking-wider">
                            {mix.code}
                          </span>
                        )}
                        {mix.notes && (
                          <p className="text-[11px] text-stone-500 dark:text-stone-400 line-clamp-1 mt-0.5">
                            {mix.notes}
                          </p>
                        )}
                      </td>

                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-black text-stone-900 dark:text-white">
                            {mix.currentStock} {mix.unit}
                          </span>
                          {isLow && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300">
                              {language === 'ml' ? 'കുറവ്' : 'Low'}
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-stone-400">
                          {language === 'ml' ? 'കുറഞ്ഞ പരിധി' : 'Min'}: {mix.minStock} {mix.unit}
                        </span>
                      </td>

                      <td className="px-5 py-4">
                        <div className="font-bold text-stone-900 dark:text-white">
                          ₹{mix.avgCostPerUnit.toFixed(2)}
                        </div>
                        <span className="text-[10px] text-stone-400">/ {mix.unit}</span>
                      </td>

                      <td className="px-5 py-4">
                        {mix.recipe ? (
                          <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-bold">
                            <FiCheckCircle className="w-3.5 h-3.5" />
                            <span>
                              {mix.recipe.items.length}{' '}
                              {language === 'ml' ? 'ചേരുവകൾ' : 'items'} (
                              {mix.recipe.expectedOutputQuantity} {mix.recipe.expectedOutputUnit})
                            </span>
                          </div>
                        ) : (
                          <span className="text-stone-400 text-xs italic">
                            {language === 'ml' ? 'ചേർത്തിട്ടില്ല' : 'Not configured'}
                          </span>
                        )}
                      </td>

                      <td className="px-5 py-4">
                        <button
                          type="button"
                          onClick={() => handleToggleActive(mix)}
                          className={`px-2.5 py-1 rounded-full text-[10px] font-bold transition-colors cursor-pointer ${
                            mix.isActive
                              ? 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300'
                              : 'bg-stone-200 dark:bg-stone-800 text-stone-500'
                          }`}
                        >
                          {mix.isActive
                            ? language === 'ml'
                              ? 'സജീവം'
                              : 'Active'
                            : language === 'ml'
                            ? 'നിഷ്ക്രിയം'
                            : 'Inactive'}
                        </button>
                      </td>

                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenRecipe(mix)}
                            className="p-1.5 rounded-lg border border-stone-200 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-600 dark:text-stone-300 transition-colors cursor-pointer"
                            title={language === 'ml' ? 'റെസിപ്പി കോൺഫിഗർ ചെയ്യുക' : 'Configure Recipe'}
                          >
                            <FiBookOpen className="w-4 h-4 text-pulari-primary dark:text-pulari-gold" />
                          </button>

                          <button
                            type="button"
                            onClick={() => setHistoryMixture(mix)}
                            className="p-1.5 rounded-lg border border-stone-200 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-600 dark:text-stone-300 transition-colors cursor-pointer"
                            title={language === 'ml' ? 'തയ്യാറാക്കൽ ചരിത്രം' : 'Preparation History'}
                          >
                            <FiClock className="w-4 h-4" />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleOpenEdit(mix)}
                            className="p-1.5 rounded-lg border border-stone-200 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-600 dark:text-stone-300 transition-colors cursor-pointer"
                            title={language === 'ml' ? 'വിവരങ്ങൾ മാറ്റുക' : 'Edit Mixture'}
                          >
                            <FiEdit2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit Mixture Details Modal with Formulation Ingredients Selector */}
      {editingMixture && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white dark:bg-[#181616] rounded-2xl max-w-2xl w-full p-5 sm:p-6 shadow-2xl border border-stone-200 dark:border-stone-800 space-y-4 my-auto animate-scale-up max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-stone-200 dark:border-stone-800 pb-3">
              <div>
                <h3 className="font-bold text-base text-stone-900 dark:text-white">
                  {editingMixture.id
                    ? language === 'ml'
                      ? 'കൂട്ട് വിവരങ്ങൾ മാറ്റുക'
                      : 'Edit Special Mixture'
                    : language === 'ml'
                    ? 'പുതിയ കൂട്ട് ചേർക്കുക'
                    : 'New Special Mixture'}
                </h3>
                <p className="text-xs text-stone-400">
                  {language === 'ml'
                    ? 'ചേരുവകൾ തിരഞ്ഞെടുത്ത് കൃത്യമായ ചിലവ് കണക്കാക്കുക'
                    : 'Select ingredients and calculate accurate unit costing'}
                </p>
              </div>
              <button
                onClick={() => setEditingMixture(null)}
                className="text-stone-400 hover:text-stone-700 cursor-pointer"
              >
                <FiX className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveMixture} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-stone-700 dark:text-stone-300 mb-1">
                  {language === 'ml' ? 'കൂട്ടിന്റെ പേര്' : 'Mixture Name'} *
                </label>
                <input
                  type="text"
                  value={editingMixture.name || ''}
                  onChange={(e) =>
                    setEditingMixture({ ...editingMixture, name: e.target.value })
                  }
                  placeholder={language === 'ml' ? 'ഉദാ: പ്ലം കേക്ക് മിക്സ്ചർ' : 'e.g. Plum Cake Mixture'}
                  className="w-full px-3 py-2 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 font-bold outline-hidden focus:ring-2 focus:ring-pulari-primary"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-stone-700 dark:text-stone-300 mb-1">
                    {language === 'ml' ? 'കോഡ്' : 'Code'}
                  </label>
                  <input
                    type="text"
                    value={editingMixture.code || ''}
                    onChange={(e) =>
                      setEditingMixture({ ...editingMixture, code: e.target.value })
                    }
                    placeholder="MIX-PLUM"
                    className="w-full px-3 py-2 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 font-mono font-bold outline-hidden focus:ring-2 focus:ring-pulari-primary"
                  />
                </div>

                <div>
                  <label className="block font-bold text-stone-700 dark:text-stone-300 mb-1">
                    {language === 'ml' ? 'അളവ് യൂണിറ്റ്' : 'Unit'} *
                  </label>
                  <select
                    value={editingMixture.unit || 'kg'}
                    onChange={(e) =>
                      setEditingMixture({ ...editingMixture, unit: e.target.value as UnitType })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 font-bold outline-hidden focus:ring-2 focus:ring-pulari-primary"
                  >
                    <option value="kg">kg (കിലോഗ്രാം)</option>
                    <option value="g">g (ഗ്രാം)</option>
                    <option value="L">L (ലിറ്റർ)</option>
                    <option value="ml">ml (മില്ലിലിറ്റർ)</option>
                    <option value="pcs">pcs (എണ്ണം)</option>
                  </select>
                </div>
              </div>

              {/* Formulation Ingredients Selection */}
              <div className="border border-stone-200 dark:border-stone-800 rounded-xl p-3.5 space-y-2.5 bg-stone-50/50 dark:bg-stone-900/30">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-black text-stone-800 dark:text-stone-200 block">
                      {language === 'ml' ? 'ചേരുവകൾ തിരഞ്ഞെടുക്കുക' : 'Select Ingredients for Mixture'}
                    </span>
                    <span className="text-[10px] text-stone-500">
                      {language === 'ml' ? 'കൃത്യമായ വിലയും അളവും സ്വയം കണക്കാക്കുന്നു' : 'Unit costs and totals calculated accurately'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (ingredients.length > 0) {
                        setRecipeItems([
                          ...recipeItems,
                          {
                            ingredientId: ingredients[0].id,
                            quantity: 1,
                            unit: ingredients[0].unit,
                          },
                        ]);
                      }
                    }}
                    className="text-xs font-bold px-2.5 py-1 rounded-lg bg-pulari-primary text-white hover:bg-pulari-primary/90 transition-all cursor-pointer shadow-2xs"
                  >
                    + {language === 'ml' ? 'ചേരുവ ചേർക്കുക' : 'Add Ingredient'}
                  </button>
                </div>

                {recipeItems.length === 0 ? (
                  <p className="text-stone-400 italic py-2 text-center text-xs">
                    {language === 'ml'
                      ? 'ചേരുവകൾ തിരഞ്ഞെടുത്തിട്ടില്ല. മുകളിലെ ബട്ടൺ അമർത്തുക.'
                      : 'No ingredients selected yet. Click above to add.'}
                  </p>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {recipeItems.map((item, idx) => {
                      const lineCost = calculateItemCost(item.ingredientId, item.quantity, item.unit);
                      return (
                        <div
                          key={idx}
                          className="flex items-center gap-2 p-2 rounded-lg bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 shadow-2xs"
                        >
                          <select
                            value={item.ingredientId}
                            onChange={(e) => {
                              const newId = e.target.value;
                              const found = ingredients.find((i) => i.id === newId);
                              const updated = [...recipeItems];
                              updated[idx] = {
                                ...updated[idx],
                                ingredientId: newId,
                                unit: found?.unit || 'kg',
                              };
                              setRecipeItems(updated);
                            }}
                            className="flex-1 px-2 py-1.5 rounded-md border border-stone-300 dark:border-stone-600 bg-stone-50 dark:bg-stone-900 font-medium text-xs"
                          >
                            {ingredients.map((ingItem) => (
                              <option key={ingItem.id} value={ingItem.id}>
                                {ingItem.name} (₹{ingItem.avgCostPerUnit}/{ingItem.unit})
                              </option>
                            ))}
                          </select>

                          <div className="flex items-center gap-1 w-28">
                            <input
                              type="number"
                              step="0.01"
                              min="0.01"
                              value={item.quantity || ''}
                              onChange={(e) => {
                                const val = parseFloat(e.target.value) || 0;
                                const updated = [...recipeItems];
                                updated[idx] = { ...updated[idx], quantity: val };
                                setRecipeItems(updated);
                              }}
                              className="w-16 px-1.5 py-1 rounded-md border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-900 text-right font-bold text-xs"
                              required
                            />
                            <select
                              value={item.unit}
                              onChange={(e) => {
                                const updated = [...recipeItems];
                                updated[idx] = { ...updated[idx], unit: e.target.value as UnitType };
                                setRecipeItems(updated);
                              }}
                              className="text-[11px] font-semibold bg-transparent border-0"
                            >
                              <option value="kg">kg</option>
                              <option value="g">g</option>
                              <option value="L">L</option>
                              <option value="ml">ml</option>
                              <option value="pcs">pcs</option>
                            </select>
                          </div>

                          <span className="w-16 text-right font-bold text-stone-700 dark:text-stone-300 font-mono text-xs">
                            ₹{lineCost.toFixed(1)}
                          </span>

                          <button
                            type="button"
                            onClick={() => setRecipeItems(recipeItems.filter((_, i) => i !== idx))}
                            className="p-1 text-stone-400 hover:text-red-500 cursor-pointer"
                          >
                            <FiTrash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Output yield & Calculations Box */}
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div>
                    <label className="block font-bold text-stone-700 dark:text-stone-300 mb-1 text-[11px]">
                      {language === 'ml' ? 'പ്രതീക്ഷിക്കുന്ന ഔട്ട്പുട്ട്' : 'Expected Output Yield'} *
                    </label>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        step="0.01"
                        min="0.1"
                        value={recipeExpectedQty || ''}
                        onChange={(e) => setRecipeExpectedQty(parseFloat(e.target.value) || 0)}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 font-bold text-xs"
                        required
                      />
                      <span className="text-stone-500 font-bold">{editingMixture.unit || 'kg'}</span>
                    </div>
                  </div>

                  <div className="p-2.5 rounded-xl bg-pulari-primary/5 dark:bg-pulari-gold/5 border border-pulari-primary/20 dark:border-pulari-gold/20 flex flex-col justify-center text-right">
                    <span className="text-[10px] text-stone-500 dark:text-stone-400 font-bold">
                      {language === 'ml' ? 'കൃത്യമായ യൂണിറ്റ് വില' : 'Accurate Cost Per Unit'}
                    </span>
                    <span className="text-sm font-black text-pulari-primary dark:text-pulari-gold font-mono">
                      ₹{recipeCostEstimate.costPerUnit.toFixed(2)} / {editingMixture.unit || 'kg'}
                    </span>
                    <span className="text-[9px] text-stone-400">
                      Total: ₹{recipeCostEstimate.totalCost.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-stone-700 dark:text-stone-300 mb-1">
                    {language === 'ml' ? 'നിലവിലെ സ്റ്റോക്ക്' : 'Current Stock'}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={editingMixture.currentStock ?? 0}
                    onChange={(e) =>
                      setEditingMixture({
                        ...editingMixture,
                        currentStock: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 font-bold outline-hidden focus:ring-2 focus:ring-pulari-primary"
                  />
                </div>

                <div>
                  <label className="block font-bold text-stone-700 dark:text-stone-300 mb-1">
                    {language === 'ml' ? 'കുറഞ്ഞ പരിധി' : 'Min Stock Threshold'}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={editingMixture.minStock ?? 5}
                    onChange={(e) =>
                      setEditingMixture({
                        ...editingMixture,
                        minStock: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 font-bold outline-hidden focus:ring-2 focus:ring-pulari-primary"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-stone-700 dark:text-stone-300 mb-1">
                  {language === 'ml' ? 'കുറിപ്പ്' : 'Notes'}
                </label>
                <input
                  type="text"
                  value={editingMixture.notes || ''}
                  onChange={(e) =>
                    setEditingMixture({ ...editingMixture, notes: e.target.value })
                  }
                  placeholder={language === 'ml' ? 'വിവരണം...' : 'Description or instructions...'}
                  className="w-full px-3 py-2 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 outline-hidden focus:ring-2 focus:ring-pulari-primary font-medium"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-stone-200 dark:border-stone-800">
                <button
                  type="button"
                  onClick={() => setEditingMixture(null)}
                  disabled={saving}
                  className="px-3.5 py-2 rounded-xl border border-stone-300 dark:border-stone-700 font-bold cursor-pointer"
                >
                  {t.cancel}
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 rounded-xl bg-pulari-primary text-white font-bold hover:bg-pulari-primary/90 transition-colors cursor-pointer"
                >
                  {saving ? t.loading : t.save}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Recipe Builder Modal (BOM Formulation for Special Mixture) */}
      {recipeMixture && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white dark:bg-[#181616] rounded-2xl max-w-2xl w-full p-5 sm:p-6 shadow-2xl border border-stone-200 dark:border-stone-800 space-y-4 my-auto overflow-hidden animate-scale-up">
            <div className="flex items-center justify-between border-b border-stone-200 dark:border-stone-800 pb-3">
              <div>
                <h3 className="font-black text-base sm:text-lg text-stone-900 dark:text-white">
                  {language === 'ml' ? 'കൂട്ടിന്റെ ഫോർമുലേഷൻ (BOM)' : 'Mixture Recipe & BOM'}
                </h3>
                <p className="text-xs text-pulari-primary dark:text-pulari-gold font-bold">
                  {recipeMixture.name}
                </p>
              </div>
              <button
                onClick={() => setRecipeMixture(null)}
                className="text-stone-400 hover:text-stone-700 cursor-pointer"
              >
                <FiX className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveRecipe} className="space-y-4 text-xs">
              {/* Expected Output Yield */}
              <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-stone-50 dark:bg-stone-900/40 border border-stone-200 dark:border-stone-800">
                <div>
                  <label className="block font-bold text-stone-700 dark:text-stone-300 mb-1">
                    {language === 'ml' ? 'പ്രതീക്ഷിക്കുന്ന ഔട്ട്പുട്ട് അളവ്' : 'Expected Output Yield'} *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.1"
                    value={recipeExpectedQty || ''}
                    onChange={(e) => setRecipeExpectedQty(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 font-black text-stone-900 dark:text-white"
                    required
                  />
                </div>

                <div>
                  <label className="block font-bold text-stone-700 dark:text-stone-300 mb-1">
                    {language === 'ml' ? 'ഔട്ട്പുട്ട് യൂണിറ്റ്' : 'Output Unit'}
                  </label>
                  <select
                    value={recipeExpectedUnit}
                    onChange={(e) => setRecipeExpectedUnit(e.target.value as UnitType)}
                    className="w-full px-3 py-2 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 font-bold"
                  >
                    <option value="kg">kg</option>
                    <option value="g">g</option>
                    <option value="L">L</option>
                    <option value="ml">ml</option>
                    <option value="pcs">pcs</option>
                  </select>
                </div>
              </div>

              {/* Recipe Items (Raw Ingredients list) */}
              <div className="border border-stone-200 dark:border-stone-800 rounded-xl p-3.5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-black text-stone-800 dark:text-stone-200">
                    {language === 'ml' ? 'ആവശ്യമായ അസംസ്കൃത ചേരുവകൾ' : 'Required Raw Ingredients'}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      if (ingredients.length > 0) {
                        setRecipeItems([
                          ...recipeItems,
                          {
                            ingredientId: ingredients[0].id,
                            quantity: 1,
                            unit: ingredients[0].unit,
                          },
                        ]);
                      }
                    }}
                    className="text-xs font-bold text-pulari-primary dark:text-pulari-gold hover:underline cursor-pointer"
                  >
                    + {language === 'ml' ? 'ചേരുവ ചേർക്കുക' : 'Add Ingredient'}
                  </button>
                </div>

                {recipeItems.length === 0 ? (
                  <p className="text-stone-400 italic py-3 text-center">
                    {language === 'ml'
                      ? 'ചേരുവകൾ ചേർത്തിട്ടില്ല. മുകളിലെ ബട്ടൺ അമർത്തി ചേർക്കുക.'
                      : 'No ingredients added yet. Click above to add.'}
                  </p>
                ) : (
                  <div className="space-y-2 max-h-56 overflow-y-auto">
                    {recipeItems.map((item, idx) => {
                      const ing = ingredients.find((i) => i.id === item.ingredientId);
                      const lineCost = (ing?.avgCostPerUnit || 0) * item.quantity;
                      return (
                        <div
                          key={idx}
                          className="flex items-center gap-2 p-2 rounded-lg bg-stone-50 dark:bg-stone-800/80 border border-stone-200 dark:border-stone-700"
                        >
                          <select
                            value={item.ingredientId}
                            onChange={(e) => {
                              const newId = e.target.value;
                              const found = ingredients.find((i) => i.id === newId);
                              const updated = [...recipeItems];
                              updated[idx] = {
                                ...updated[idx],
                                ingredientId: newId,
                                unit: found?.unit || 'kg',
                              };
                              setRecipeItems(updated);
                            }}
                            className="flex-1 px-2 py-1.5 rounded-md border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-800 font-medium"
                          >
                            {ingredients.map((ingItem) => (
                              <option key={ingItem.id} value={ingItem.id}>
                                {ingItem.name} (₹{ingItem.avgCostPerUnit}/{ingItem.unit})
                              </option>
                            ))}
                          </select>

                          <div className="flex items-center gap-1 w-24">
                            <input
                              type="number"
                              step="0.01"
                              min="0.01"
                              value={item.quantity || ''}
                              onChange={(e) => {
                                const val = parseFloat(e.target.value) || 0;
                                const updated = [...recipeItems];
                                updated[idx] = { ...updated[idx], quantity: val };
                                setRecipeItems(updated);
                              }}
                              className="w-full px-2 py-1.5 rounded-md border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-800 text-right font-bold"
                              required
                            />
                            <span className="text-stone-500">{item.unit}</span>
                          </div>

                          <span className="w-16 text-right font-bold text-stone-700 dark:text-stone-300">
                            ₹{lineCost.toFixed(1)}
                          </span>

                          <button
                            type="button"
                            onClick={() => setRecipeItems(recipeItems.filter((_, i) => i !== idx))}
                            className="p-1 text-stone-400 hover:text-red-500 cursor-pointer"
                          >
                            <FiTrash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Live Cost Estimate Preview */}
              <div className="p-3.5 rounded-xl bg-pulari-primary/5 dark:bg-pulari-gold/5 border border-pulari-primary/20 dark:border-pulari-gold/20 flex items-center justify-between">
                <div>
                  <span className="font-bold text-stone-600 dark:text-stone-300 block">
                    {language === 'ml' ? 'പ്രതീക്ഷിത ചിലവ്' : 'Estimated Cost Estimate'}
                  </span>
                  <span className="text-[11px] text-stone-500">
                    {language === 'ml' ? 'ചേരുവകളുടെ വില അടിസ്ഥാനമാക്കി' : 'Based on current ingredient prices'}
                  </span>
                </div>
                <div className="text-right">
                  <div className="text-base font-black text-pulari-primary dark:text-pulari-gold">
                    ₹{recipeCostEstimate.totalCost.toFixed(2)}
                  </div>
                  <div className="text-[11px] font-bold text-stone-600 dark:text-stone-300">
                    ₹{recipeCostEstimate.costPerUnit.toFixed(2)} / {recipeExpectedUnit}
                  </div>
                </div>
              </div>

              {/* Instructions */}
              <div>
                <label className="block font-bold text-stone-700 dark:text-stone-300 mb-1">
                  {language === 'ml' ? 'തയ്യാറാക്കൽ നിർദ്ദേശങ്ങൾ' : 'Preparation Instructions'}
                </label>
                <textarea
                  rows={2}
                  value={recipeInstructions}
                  onChange={(e) => setRecipeInstructions(e.target.value)}
                  placeholder={language === 'ml' ? 'പാചക നിർദ്ദേശങ്ങൾ...' : 'Step-by-step instructions...'}
                  className="w-full px-3 py-2 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 font-medium"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-stone-200 dark:border-stone-800">
                <button
                  type="button"
                  onClick={() => setRecipeMixture(null)}
                  disabled={saving}
                  className="px-3.5 py-2 rounded-xl border border-stone-300 dark:border-stone-700 font-bold cursor-pointer"
                >
                  {t.cancel}
                </button>
                <button
                  type="submit"
                  disabled={saving || recipeItems.length === 0}
                  className="px-5 py-2 rounded-xl bg-pulari-primary text-white font-bold hover:bg-pulari-primary/90 transition-colors cursor-pointer disabled:opacity-50"
                >
                  {saving ? t.loading : language === 'ml' ? 'റെസിപ്പി സേവ് ചെയ്യുക' : 'Save BOM Recipe'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* History Modal */}
      {historyMixture && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-[#181616] rounded-2xl max-w-xl w-full p-5 shadow-2xl border border-stone-200 dark:border-stone-800 space-y-4 animate-scale-up">
            <div className="flex items-center justify-between border-b border-stone-200 dark:border-stone-800 pb-3">
              <div>
                <h3 className="font-bold text-base text-stone-900 dark:text-white">
                  {language === 'ml' ? 'തയ്യാറാക്കൽ ചരിത്രം' : 'Preparation History'}
                </h3>
                <p className="text-xs text-pulari-primary dark:text-pulari-gold font-bold">
                  {historyMixture.name}
                </p>
              </div>
              <button
                onClick={() => setHistoryMixture(null)}
                className="text-stone-400 hover:text-stone-700 cursor-pointer"
              >
                <FiX className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2 max-h-72 overflow-y-auto">
              {batches.filter((b) => b.mixtureId === historyMixture.id).length === 0 ? (
                <p className="text-xs text-stone-400 text-center py-6">
                  {language === 'ml' ? 'ബാച്ചുകൾ ലഭ്യമല്ല' : 'No batches found for this mixture'}
                </p>
              ) : (
                batches
                  .filter((b) => b.mixtureId === historyMixture.id)
                  .map((b) => (
                    <div
                      key={b.id}
                      className="p-3 rounded-xl border border-stone-200 dark:border-stone-800 flex items-center justify-between text-xs"
                    >
                      <div>
                        <div className="font-mono font-bold text-stone-900 dark:text-white">
                          {b.batchNumber}
                        </div>
                        <div className="text-stone-500 text-[11px] mt-0.5">
                          {b.preparationDate} | {b.operatorName}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-black text-stone-900 dark:text-white">
                          {b.actualQuantity} {b.unit}
                        </div>
                        <div className="text-[11px] text-stone-400">
                          ₹{b.totalIngredientCost.toFixed(2)} (₹{b.costPerUnit.toFixed(2)}/{b.unit})
                        </div>
                      </div>
                    </div>
                  ))
              )}
            </div>

            <div className="pt-2 text-right">
              <button
                type="button"
                onClick={() => setHistoryMixture(null)}
                className="px-4 py-2 rounded-xl border border-stone-300 dark:border-stone-700 font-bold text-xs cursor-pointer"
              >
                {t.close}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
