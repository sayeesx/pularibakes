import React, { useState, useMemo, useEffect } from 'react';
import { Ingredient, IngredientCategory, UnitType, StockMovement, Product, PackagingItem, PacketType } from '../types';
import {
  FiPlus,
  FiSearch,
  FiEdit2,
  FiTrash2,
  FiAlertTriangle,
  FiRepeat,
  FiCheckCircle,
  FiXCircle,
  FiDollarSign,
  FiLayers,
  FiPrinter,
  FiShoppingBag,
  FiPackage,
  FiBox,
  FiCheck,
  FiX,
} from 'react-icons/fi';
import {
  saveIngredient,
  deleteIngredient,
  adjustIngredientStock,
  fetchPackagingItems,
  savePackagingItem,
  deletePackagingItem,
  adjustPackagingItemStock,
  fetchPacketTypes,
} from '../services/supabase';
import { PrintPurchaseListModal } from './PrintPurchaseListModal';
import { AddPurchaseModal } from './AddPurchaseModal';
import { ManagePacketTypesModal } from './ManagePacketTypesModal';
import { IngredientDetailModal } from './IngredientDetailModal';
import { useLockBodyScroll } from '../hooks/useLockBodyScroll';
import { createPortal } from 'react-dom';
import { ThemeSelect } from './ThemeSelect';
import { useFeedback } from '../context/FeedbackContext';

interface IngredientsAdminViewProps {
  ingredients: Ingredient[];
  products?: Product[];
  stockMovements?: StockMovement[];
  onRefresh: () => void;
}

export const IngredientsAdminView: React.FC<IngredientsAdminViewProps> = ({
  ingredients,
  products = [],
  stockMovements = [],
  onRefresh,
}) => {
  const { showToast, confirm } = useFeedback();

  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState<'all' | 'basic' | 'other' | 'low_stock'>('all');

  // Modals
  const [formModalOpen, setFormModalOpen] = useState(false);
  const [adjustModalOpen, setAdjustModalOpen] = useState(false);
  const [purchaseListModalOpen, setPurchaseListModalOpen] = useState(false);
  const [addPurchaseModalOpen, setAddPurchaseModalOpen] = useState(false);
  const [selectedIngredient, setSelectedIngredient] = useState<Ingredient | null>(null);
  const [detailIngredient, setDetailIngredient] = useState<Ingredient | null>(null);

  // Tab state: Raw Ingredients vs Packet Types (persisted across reloads)
  const [activeIngredientTab, setActiveIngredientTab] = useState<'ingredients' | 'packets'>(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const sub = params.get('subtab');
      if (sub === 'packets') return 'packets';
      const saved = localStorage.getItem('pulari_admin_ingredients_active_subtab');
      if (saved === 'packets') return 'packets';
    } catch {
      // ignore
    }
    return 'ingredients';
  });

  const handleSelectSubTab = (tab: 'ingredients' | 'packets') => {
    setActiveIngredientTab(tab);
    try {
      localStorage.setItem('pulari_admin_ingredients_active_subtab', tab);
      const url = new URL(window.location.href);
      if (tab === 'packets') {
        url.searchParams.set('subtab', 'packets');
      } else {
        url.searchParams.delete('subtab');
      }
      window.history.replaceState({ tab: 'ingredients', subtab: tab }, '', url.toString());
    } catch {
      // ignore
    }
  };

  const handleOpenDetailIngredient = (ing: Ingredient) => {
    setDetailIngredient(ing);
    try {
      localStorage.setItem('pulari_admin_selected_ingredient_id', ing.id);
      const url = new URL(window.location.href);
      url.searchParams.set('tab', 'ingredients');
      url.searchParams.set('ingredientId', ing.id);
      window.history.replaceState({ tab: 'ingredients', ingredientId: ing.id }, '', url.toString());
    } catch {
      // ignore
    }
  };

  const handleCloseDetailIngredient = () => {
    setDetailIngredient(null);
    try {
      localStorage.removeItem('pulari_admin_selected_ingredient_id');
      const url = new URL(window.location.href);
      url.searchParams.delete('ingredientId');
      window.history.replaceState({ tab: 'ingredients' }, '', url.toString());
    } catch {
      // ignore
    }
  };

  // Restore detailIngredient on reload or when ingredients update
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const savedId = params.get('ingredientId') || localStorage.getItem('pulari_admin_selected_ingredient_id');
      if (savedId && ingredients.length > 0) {
        const found = ingredients.find((i) => i.id === savedId);
        if (found) {
          setDetailIngredient(found);
        }
      }
    } catch {
      // ignore
    }
  }, [ingredients]);

  // Packaging / Packet Types states
  const [packagingItems, setPackagingItems] = useState<PackagingItem[]>([]);
  const [packetTypes, setPacketTypes] = useState<PacketType[]>([]);
  const [loadingPackaging, setLoadingPackaging] = useState<boolean>(false);
  const [managePacketsOpen, setManagePacketsOpen] = useState<boolean>(false);
  const [selectedPacketTypeForEdit, setSelectedPacketTypeForEdit] = useState<PacketType | null>(null);
  const [packetModalOpen, setPacketModalOpen] = useState(false);
  const [selectedPackagingItem, setSelectedPackagingItem] = useState<PackagingItem | null>(null);
  const [packProductId, setPackProductId] = useState<string>('');
  const [packSizeLabel, setPackSizeLabel] = useState<string>('100g');
  const [packSizeGrams, setPackSizeGrams] = useState<number | string>(100);
  const [packCurrentStock, setPackCurrentStock] = useState<number | string>(500);
  const [packUnitCost, setPackUnitCost] = useState<number | string>(1.5);
  const [packLabourRate, setPackLabourRate] = useState<number | string>(1.0);
  const [packIsActive, setPackIsActive] = useState<boolean>(true);
  const [packSearch, setPackSearch] = useState<string>('');

  // Packaging Stock Adjust modal
  const [packAdjustModalOpen, setPackAdjustModalOpen] = useState(false);
  const [packAdjustItem, setPackAdjustItem] = useState<PackagingItem | null>(null);
  const [packAdjustDelta, setPackAdjustDelta] = useState<number | string>(100);
  const [packAdjustReason, setPackAdjustReason] = useState<string>('പുതിയ കവർ പർച്ചേസ് (New Covers Inward)');
  const [packAdjustIsAdd, setPackAdjustIsAdd] = useState<boolean>(true);

  useLockBodyScroll(
    formModalOpen ||
    adjustModalOpen ||
    purchaseListModalOpen ||
    addPurchaseModalOpen ||
    packetModalOpen ||
    packAdjustModalOpen ||
    managePacketsOpen
  );

  const loadPackagingItems = async () => {
    setLoadingPackaging(true);
    try {
      const [items, types] = await Promise.all([
        fetchPackagingItems(),
        fetchPacketTypes(),
      ]);
      setPackagingItems(items);
      setPacketTypes(types);
    } catch (err) {
      console.error('Failed to load packaging items:', err);
    } finally {
      setLoadingPackaging(false);
    }
  };

  useEffect(() => {
    loadPackagingItems();
  }, []);

  const openCreatePacketModal = () => {
    setSelectedPackagingItem(null);
    setPackProductId(products.length > 0 ? products[0].id : '');
    setPackSizeLabel('100g');
    setPackSizeGrams(100);
    setPackCurrentStock(500);
    setPackUnitCost(1.5);
    setPackLabourRate(1.0);
    setPackIsActive(true);
    setPacketModalOpen(true);
  };

  const openEditPacketModal = (item: PackagingItem) => {
    setSelectedPackagingItem(item);
    setPackProductId(item.productId);
    setPackSizeLabel(item.sizeLabel);
    setPackSizeGrams(item.sizeGrams);
    setPackCurrentStock(item.currentStock);
    setPackUnitCost(item.unitCost);
    setPackLabourRate(item.packingLabourRate);
    setPackIsActive(item.isActive);
    setPacketModalOpen(true);
  };

  const openPackAdjustModal = (item: PackagingItem) => {
    setPackAdjustItem(item);
    setPackAdjustDelta(100);
    setPackAdjustReason('പുതിയ കവർ പർച്ചേസ് (New Covers Inward)');
    setPackAdjustIsAdd(true);
    setPackAdjustModalOpen(true);
  };

  const handlePacketSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!packProductId || !packSizeLabel.trim()) {
      showToast('ഉൽപ്പന്നവും പാക്കറ്റ് അളവും തിരഞ്ഞെടുക്കണം (Please select product and size)', 'warning');
      return;
    }

    setIsSubmitting(true);
    try {
      await savePackagingItem({
        id: selectedPackagingItem?.id,
        productId: packProductId,
        sizeLabel: packSizeLabel.trim(),
        sizeGrams: Number(packSizeGrams) || 100,
        currentStock: Number(packCurrentStock) || 0,
        unitCost: Number(packUnitCost) || 0,
        packingLabourRate: Number(packLabourRate) || 1.0,
        isActive: packIsActive,
      });
      showToast('പാക്കറ്റ് വിജയകരമായി സൂക്ഷിച്ചു', 'success');
      setPacketModalOpen(false);
      loadPackagingItems();
      onRefresh();
    } catch (err: any) {
      showToast(`പാക്കറ്റ് സേവ് ചെയ്യുന്നതിൽ പിഴവ്: ${err?.message || 'Error'}`, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePackAdjustSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const deltaAmount = Number(packAdjustDelta) || 0;
    if (!packAdjustItem || deltaAmount <= 0) return;

    if (!packAdjustIsAdd && packAdjustItem.currentStock <= 0) {
      showToast('മുന്നറിയിപ്പ്: കവർ സ്റ്റോക്ക് 0 ആണ്!', 'warning');
      return;
    }

    if (!packAdjustIsAdd && deltaAmount > packAdjustItem.currentStock) {
      showToast(`മുന്നറിയിപ്പ്: ലഭ്യമായ സ്റ്റോക്കിൽ (${packAdjustItem.currentStock} pcs) കൂടുതൽ കുറയ്ക്കാൻ കഴിയില്ല!`, 'warning');
      return;
    }

    setIsSubmitting(true);
    try {
      const delta = packAdjustIsAdd ? deltaAmount : -deltaAmount;
      await adjustPackagingItemStock(packAdjustItem.id, delta, packAdjustReason);
      showToast('കവർ സ്റ്റോക്ക് വിജയകരമായി മാറ്റി', 'success');
      setPackAdjustModalOpen(false);
      loadPackagingItems();
      onRefresh();
    } catch (err: any) {
      showToast(`കവർ സ്റ്റോക്ക് മാറ്റുന്നതിൽ പിഴവ്: ${err?.message || 'Error'}`, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeletePackaging = async (item: PackagingItem) => {
    const confirmed = await confirm({
      title: 'പാക്കറ്റ് ടൈപ്പ് നീക്കം ചെയ്യണോ?',
      message: `"${item.productName || 'Product'} - ${item.sizeLabel}" പാക്കറ്റ് ടൈപ്പ് ഡാറ്റാബേസിൽ നിന്ന് പൂർണ്ണമായി നീക്കം ചെയ്യണോ?`,
      confirmLabel: 'ഡിലീറ്റ് ചെയ്യുക',
      cancelLabel: 'റദ്ദാക്കുക',
      isDestructive: true,
    });
    if (!confirmed) return;

    try {
      await deletePackagingItem(item.id);
      showToast('പാക്കറ്റ് ടൈപ്പ് ഡാറ്റാബേസിൽ നിന്ന് നീക്കം ചെയ്തു', 'success');
      loadPackagingItems();
      onRefresh();
    } catch (err: any) {
      showToast(`ഡിലീറ്റ് പരാജയപ്പെട്ടു: ${err?.message}`, 'error');
    }
  };

  // Form states
  const [name, setName] = useState('');
  const [category, setCategory] = useState<IngredientCategory>('other');
  const [unit, setUnit] = useState<UnitType>('kg');
  const [currentStock, setCurrentStock] = useState<number>(0);
  const [minStock, setMinStock] = useState<number | string>(0);
  const [avgCostPerUnit, setAvgCostPerUnit] = useState<number | string>(0);
  const [notes, setNotes] = useState('');
  const [isActive, setIsActive] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Stock Adjust states
  const [adjustDelta, setAdjustDelta] = useState<number | string>(0);
  const [adjustReason, setAdjustReason] = useState<string>('പുതിയ പർച്ചേസ് (Purchase Inward)');
  const [adjustIsAdd, setAdjustIsAdd] = useState<boolean>(true);

  const openCreateModal = () => {
    setSelectedIngredient(null);
    setName('');
    setCategory('other');
    setUnit('kg');
    setCurrentStock(0);
    setMinStock(5);
    setAvgCostPerUnit(0);
    setNotes('');
    setIsActive(true);
    setFormModalOpen(true);
  };

  const openEditModal = (ing: Ingredient) => {
    setSelectedIngredient(ing);
    setName(ing.name);
    setCategory(ing.category);
    setUnit(ing.unit);
    setCurrentStock(ing.currentStock);
    setMinStock(ing.minStock);
    setAvgCostPerUnit(ing.avgCostPerUnit);
    setNotes(ing.notes || '');
    setIsActive(ing.isActive);
    setFormModalOpen(true);
  };

  const openAdjustModal = (ing: Ingredient) => {
    setSelectedIngredient(ing);
    setAdjustDelta(0);
    setAdjustReason('പുതിയ പർച്ചേസ് (Purchase Inward)');
    setAdjustIsAdd(true);
    setAdjustModalOpen(true);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsSubmitting(true);
    try {
      await saveIngredient({
        id: selectedIngredient?.id,
        name: name.trim(),
        category,
        unit,
        currentStock: Number(currentStock) || 0,
        minStock: Number(minStock) || 0,
        avgCostPerUnit: Number(avgCostPerUnit) || 0,
        notes: notes.trim() || undefined,
        isActive,
      });
      showToast('ചേരുവ വിജയകരമായി സൂക്ഷിച്ചു', 'success');
      setFormModalOpen(false);
      onRefresh();
    } catch (err: any) {
      showToast(`ചേരുവ സൂക്ഷിക്കുന്നതിൽ പിഴവ്: ${err?.message || 'Error'}`, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAdjustSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const deltaAmount = Number(adjustDelta) || 0;
    if (!selectedIngredient || deltaAmount <= 0) return;

    if (!adjustIsAdd && selectedIngredient.currentStock <= 0) {
      showToast('മുന്നറിയിപ്പ്: സ്റ്റോക്ക് 0 ആണ്! നെഗറ്റീവ് ആകാൻ കഴിയില്ല.', 'warning');
      return;
    }

    if (!adjustIsAdd && deltaAmount > selectedIngredient.currentStock) {
      showToast(`മുന്നറിയിപ്പ്: ലഭ്യമായ സ്റ്റോക്കിൽ (${selectedIngredient.currentStock} ${selectedIngredient.unit}) കൂടുതൽ കുറയ്ക്കാൻ കഴിയില്ല!`, 'warning');
      return;
    }

    setIsSubmitting(true);
    try {
      const delta = adjustIsAdd ? deltaAmount : -deltaAmount;
      await adjustIngredientStock(selectedIngredient.id, delta, adjustReason, 'Admin');
      showToast('സ്റ്റോക്ക് വിജയകരമായി മാറ്റി', 'success');
      setAdjustModalOpen(false);
      onRefresh();
    } catch (err: any) {
      showToast(`സ്റ്റോക്ക് മാറ്റുന്നതിൽ പിഴവ്: ${err?.message || 'Error'}`, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (ing: Ingredient) => {
    const confirmed = await confirm({
      title: 'ചേരുവ ഡിലീറ്റ് ചെയ്യണോ?',
      message: `"${ing.name}" എന്ന ചേരുവ ഡാറ്റാബേസിൽ നിന്ന് പൂർണ്ണമായി നീക്കം ചെയ്യണോ?\n(Are you sure you want to permanently delete this ingredient from the database?)`,
      confirmLabel: 'ഡാറ്റാബേസിൽ നിന്ന് ഡിലീറ്റ് ചെയ്യുക',
      cancelLabel: 'റദ്ദാക്കുക',
      isDestructive: true,
    });
    if (!confirmed) return;

    try {
      await deleteIngredient(ing.id);
      showToast(`"${ing.name}" ഡാറ്റാബേസിൽ നിന്ന് നീക്കം ചെയ്തു`, 'success');
      onRefresh();
    } catch (err: any) {
      showToast(`ഡിലീറ്റ് പരാജയപ്പെട്ടു: ${err?.message || 'Failed to delete'}`, 'error');
    }
  };

  const isExcludedItem = (itemName: string) => {
    const n = (itemName || '').trim().toLowerCase();
    return (
      n === 'കൂലി' ||
      n === 'കൂലി പാക്കിങ്' ||
      n === 'കൂലി പാക്കിംഗ്' ||
      n.startsWith('കൂലി') ||
      n === 'wages' ||
      n === 'packing wages' ||
      n === 'കവർ' ||
      n === 'cover' ||
      n.startsWith('കവർ')
    );
  };

  const visibleIngredients = useMemo(() => {
    return ingredients.filter((ing) => !isExcludedItem(ing.name));
  }, [ingredients]);

  const filteredIngredients = visibleIngredients.filter((ing) => {
    const matchSearch = ing.name.toLowerCase().includes(search.toLowerCase());
    if (!matchSearch) return false;

    if (filterCategory === 'basic') return ing.category === 'basic';
    if (filterCategory === 'other') return ing.category === 'other';
    if (filterCategory === 'low_stock') {
      return ing.isActive && ing.minStock > 0 && ing.currentStock <= ing.minStock;
    }
    return true;
  });

  const lowStockCount = visibleIngredients.filter((i) => i.isActive && i.minStock > 0 && i.currentStock <= i.minStock).length;
  const basicCount = visibleIngredients.filter((i) => i.category === 'basic').length;
  const otherCount = visibleIngredients.filter((i) => i.category === 'other').length;

  return (
    <div className="space-y-6">
      {activeIngredientTab === 'ingredients' ? (
        <>
          {/* Actions Header - Stock Out notice and all 4 buttons on the exact same line */}
          <div className="flex items-center justify-between gap-2 pb-3 border-b border-stone-200 dark:border-[#2E2828] overflow-x-auto no-scrollbar">
            {lowStockCount > 0 ? (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 text-amber-800 dark:text-amber-300 text-xs font-bold font-malayalam whitespace-nowrap shrink-0">
                <FiAlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                <span>{lowStockCount} ചേരുവകൾ കുറവാണ് (Stock Out)</span>
              </div>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2 flex-nowrap shrink-0 ml-auto">
              <button
                type="button"
                onClick={() => handleSelectSubTab('packets')}
                className="flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-[#1E1B1B] hover:bg-stone-50 dark:hover:bg-[#282323] text-stone-800 dark:text-stone-200 font-bold text-xs shadow-2xs press-apple transition-colors cursor-pointer whitespace-nowrap shrink-0"
                title="പാക്കറ്റ് തരങ്ങൾ (Packet Types & Covers)"
              >
                <FiPackage className="w-4 h-4 text-epso-orange" />
                <span>പാക്കറ്റ് തരങ്ങൾ (Packet Types & Covers)</span>
                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono bg-orange-100 dark:bg-orange-950/60 text-orange-800 dark:text-orange-300 font-bold">
                  {packetTypes.length > 0 ? packetTypes.length : packagingItems.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setAddPurchaseModalOpen(true)}
                className="flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm press-apple transition-colors cursor-pointer whitespace-nowrap shrink-0"
                title="Add purchases for ingredients in bulk"
              >
                <FiShoppingBag className="w-4 h-4" />
                <span>Add Purchase</span>
              </button>

              <button
                type="button"
                onClick={() => setPurchaseListModalOpen(true)}
                className="flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-[#1E1B1B] hover:bg-stone-50 dark:hover:bg-[#282323] text-stone-800 dark:text-stone-200 font-bold text-xs shadow-2xs press-apple transition-colors cursor-pointer whitespace-nowrap shrink-0"
                title="Print purchase list for low stock ingredients"
              >
                <FiPrinter className="w-4 h-4 text-epso-orange" />
                <span>Print Purchase List</span>
                {lowStockCount > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] font-black bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                    {lowStockCount}
                  </span>
                )}
              </button>

              <button
                onClick={openCreateModal}
                className="flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl bg-epso-red hover:bg-epso-red-hover dark:bg-amber-500 dark:hover:bg-amber-600 text-white dark:text-stone-950 font-bold text-xs shadow-sm press-apple transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <FiPlus className="w-4 h-4" />
                <span>New Ingredient</span>
              </button>
            </div>
          </div>

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <FiSearch className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search ingredient..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-stone-200 dark:border-[#2E2828] bg-white dark:bg-[#1E1B1B] text-xs text-stone-900 dark:text-white placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-epso-red/30 dark:focus:ring-amber-500/30 transition-all font-malayalam"
          />
        </div>

        {/* English Status Tabs */}
        <div className="flex items-center gap-1.5 p-1 bg-stone-100 dark:bg-[#1E1B1B] rounded-xl border border-stone-200 dark:border-[#2E2828] overflow-x-auto">
          <button
            onClick={() => setFilterCategory('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
              filterCategory === 'all'
                ? 'bg-white dark:bg-[#282323] text-stone-900 dark:text-white shadow-sm'
                : 'text-stone-500 hover:text-stone-800 dark:text-stone-400'
            }`}
          >
            All ({ingredients.length})
          </button>
          <button
            onClick={() => setFilterCategory('basic')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
              filterCategory === 'basic'
                ? 'bg-white dark:bg-[#282323] text-stone-900 dark:text-white shadow-sm'
                : 'text-stone-500 hover:text-stone-800 dark:text-stone-400'
            }`}
          >
            Basic ({basicCount})
          </button>
          <button
            onClick={() => setFilterCategory('other')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
              filterCategory === 'other'
                ? 'bg-white dark:bg-[#282323] text-stone-900 dark:text-white shadow-sm'
                : 'text-stone-500 hover:text-stone-800 dark:text-stone-400'
            }`}
          >
            Other ({otherCount})
          </button>
          <button
            onClick={() => setFilterCategory('low_stock')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1 ${
              filterCategory === 'low_stock'
                ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 shadow-sm'
                : 'text-stone-500 hover:text-stone-800 dark:text-stone-400'
            }`}
          >
            <FiAlertTriangle className="w-3.5 h-3.5 text-amber-500" />
            <span>Low Stock ({lowStockCount})</span>
          </button>
        </div>
      </div>

      {/* Ingredients Grid - Increased card widths for desktop */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        {filteredIngredients.map((ing) => {
          const isLowStock = ing.isActive && ing.minStock > 0 && ing.currentStock <= ing.minStock;

          return (
            <div
              key={ing.id}
              onClick={() => handleOpenDetailIngredient(ing)}
              className={`p-5 rounded-2xl bg-white dark:bg-[#1E1B1B] border transition-all shadow-apple-card dark:shadow-apple-card-dark flex flex-col justify-between cursor-pointer hover:border-amber-400 dark:hover:border-amber-600/70 hover:shadow-md ${
                isLowStock
                  ? 'border-amber-300 dark:border-amber-800/80 ring-1 ring-amber-300 dark:ring-amber-800'
                  : 'border-stone-200 dark:border-[#2E2828]'
              }`}
            >
              <div>
                {/* Header */}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <h3 className="text-base font-bold text-stone-900 dark:text-white font-malayalam flex items-center gap-1.5">
                      <span>{ing.name}</span>
                      {isLowStock && (
                        <span title="കുറഞ്ഞ സ്റ്റോക്ക് മുന്നറിയിപ്പ്" className="text-amber-500">
                          <FiAlertTriangle className="w-4 h-4 inline" />
                        </span>
                      )}
                    </h3>
                    <span className="text-[11px] text-stone-400 dark:text-stone-500 font-malayalam">
                      {ing.category === 'basic' ? 'പ്രധാന ചേരുവ (Basic)' : 'സഹായ ചേരുവ (Other)'}
                    </span>
                  </div>

                  <span
                    className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                      ing.isActive
                        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800'
                        : 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-400'
                    }`}
                  >
                    {ing.isActive ? (
                      <>
                        <FiCheckCircle className="w-3 h-3 text-emerald-500" />
                        <span>Active</span>
                      </>
                    ) : (
                      <>
                        <FiXCircle className="w-3 h-3 text-stone-400" />
                        <span>Inactive</span>
                      </>
                    )}
                  </span>
                </div>

                {/* Stock Stats Box */}
                <div className="p-3 bg-stone-50 dark:bg-[#141212] rounded-xl border border-stone-100 dark:border-[#282323] space-y-2 my-3 text-xs">
                  {/* Current Stock */}
                  <div className="flex items-center justify-between">
                    <span className="text-stone-500 dark:text-stone-400 font-malayalam">
                      സ്റ്റോക്ക് (Current Stock):
                    </span>
                    <span className={`font-extrabold text-sm ${isLowStock ? 'text-amber-600 dark:text-amber-400' : 'text-stone-900 dark:text-white'}`}>
                      {ing.currentStock} {ing.unit}
                    </span>
                  </div>

                  {/* Min Stock Alert */}
                  <div className="flex items-center justify-between">
                    <span className="text-stone-500 dark:text-stone-400 font-malayalam">
                      കുറഞ്ഞ പരിധി (Min Alert):
                    </span>
                    <span className="font-semibold text-stone-600 dark:text-stone-300">
                      {ing.minStock} {ing.unit}
                    </span>
                  </div>

                  {/* Avg Cost per Unit */}
                  <div className="flex items-center justify-between pt-1 border-t border-stone-200/60 dark:border-[#282323]">
                    <span className="text-stone-500 dark:text-stone-400 font-malayalam">
                      വാങ്ങൽ നിരക്ക് (Cost / Unit):
                    </span>
                    <span className="font-bold text-stone-900 dark:text-white">
                      ₹{ing.avgCostPerUnit.toLocaleString('en-IN')} / {ing.unit}
                    </span>
                  </div>

                  {/* Progress Bar: Quantity Pending from Last Stock */}
                  {(() => {
                    const lastInward = stockMovements.find(
                      (m) =>
                        (m.itemId === ing.id || m.itemName.toLowerCase() === ing.name.toLowerCase()) &&
                        (m.movementType === 'in' || m.movementType === 'purchase' || m.movementType === 'opening' || m.quantity > 0)
                    );
                    const lastStockTotal = lastInward
                      ? Math.max(Number(lastInward.newBalance) || 0, Number(lastInward.previousBalance) || 0, ing.currentStock)
                      : Math.max(ing.currentStock, (ing.minStock || 5) * 2, 10);
                    const percentRemaining =
                      lastStockTotal > 0
                        ? Math.min(100, Math.max(0, Math.round((ing.currentStock / lastStockTotal) * 100)))
                        : 0;

                    return (
                      <div className="pt-2 border-t border-stone-200/60 dark:border-[#282323] space-y-1.5">
                        <div className="flex items-center justify-between text-[11px] font-malayalam">
                          <span className="text-stone-500 dark:text-stone-400">
                            കഴിഞ്ഞ സ്റ്റോക്കിൽ ബാക്കി:
                          </span>
                          <span
                            className={`font-bold ${
                              percentRemaining > 50
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : percentRemaining > 20
                                ? 'text-amber-600 dark:text-amber-400'
                                : 'text-red-500'
                            }`}
                          >
                            {ing.currentStock} {ing.unit} ({percentRemaining}%)
                          </span>
                        </div>
                        <div className="w-full h-2 rounded-full bg-stone-200/70 dark:bg-stone-800 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-700 ${
                              percentRemaining > 50
                                ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
                                : percentRemaining > 20
                                ? 'bg-gradient-to-r from-amber-500 to-orange-400'
                                : 'bg-gradient-to-r from-red-600 to-rose-400'
                            }`}
                            style={{ width: `${percentRemaining}%` }}
                          />
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {ing.notes && (
                  <p className="text-[11px] text-stone-500 dark:text-stone-400 italic mb-3 font-malayalam">
                    കുറിപ്പ്: {ing.notes}
                  </p>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 pt-2 border-t border-stone-100 dark:border-[#282323]">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    openAdjustModal(ing);
                  }}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-400 text-xs font-bold press-apple transition-colors border border-amber-500/30"
                >
                  <FiRepeat className="w-3.5 h-3.5" />
                  <span className="font-malayalam">സ്റ്റോക്ക് മാറ്റുക</span>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    openEditModal(ing);
                  }}
                  className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-[#282323] border border-stone-200 dark:border-[#2E2828] press-apple transition-colors text-xs font-bold"
                  title="തിരുത്തുക (Edit)"
                >
                  <FiEdit2 className="w-3.5 h-3.5" />
                  <span className="font-malayalam">തിരുത്തുക</span>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(ing);
                  }}
                  className="flex items-center justify-center p-2 rounded-xl text-stone-400 hover:text-red-500 hover:bg-red-500/10 border border-stone-200 dark:border-[#2E2828] hover:border-red-500/30 press-apple transition-colors"
                  title="ഡിലീറ്റ് ചെയ്യുക (Delete from database)"
                >
                  <FiTrash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {filteredIngredients.length === 0 && (
        <div className="py-12 text-center text-xs text-stone-400 dark:text-stone-500 font-malayalam">
          ചേരുവകൾ ഒന്നും കണ്ടെത്താനായില്ല (No ingredients found)
        </div>
      )}
        </>
      ) : (
        <div className="space-y-6 font-malayalam">
          {/* Header & Quick Action */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-stone-200 dark:border-[#2E2828]">
            <div>
              <h2 className="text-base font-black text-stone-900 dark:text-white flex items-center gap-2">
                <span>പാക്കറ്റ് തരങ്ങളും കവർ സ്റ്റോക്കും</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 dark:bg-orange-950/60 text-orange-800 dark:text-orange-300 font-bold">
                  {packetTypes.length} Packet Types {packagingItems.length > 0 ? `• ${packagingItems.length} Covers` : ''}
                </span>
              </h2>
              <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                പാക്കറ്റ് തരങ്ങൾ (Packet Types Catalogue), കവറുകൾ (Pouches), കൂലി നിരക്ക്
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => handleSelectSubTab('ingredients')}
                className="flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-[#1E1B1B] hover:bg-stone-50 dark:hover:bg-[#282323] text-stone-800 dark:text-stone-200 font-bold text-xs shadow-2xs press-apple transition-colors cursor-pointer"
              >
                <FiBox className="w-4 h-4 text-amber-500" />
                <span>ചേരുവകൾ (Raw Materials)</span>
              </button>

              <button
                type="button"
                onClick={() => { setSelectedPacketTypeForEdit(null); setManagePacketsOpen(true); }}
                className="flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs shadow-sm press-apple transition-colors cursor-pointer"
                title="പാക്കറ്റ് തരങ്ങൾ മാനേജ് ചെയ്യുക / തിരുത്തുക"
              >
                <FiPackage className="w-4 h-4" />
                <span>പാക്കറ്റ് തരങ്ങൾ ({packetTypes.length})</span>
              </button>

              <button
                type="button"
                onClick={openCreatePacketModal}
                className="flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl bg-epso-red hover:bg-epso-red-hover dark:bg-amber-500 dark:hover:bg-amber-600 text-white dark:text-stone-950 font-bold text-xs shadow-sm press-apple transition-colors cursor-pointer"
              >
                <FiPlus className="w-4 h-4" />
                <span>New Cover (പുതിയ കവർ)</span>
              </button>

              <button
                type="button"
                onClick={() => handleSelectSubTab('ingredients')}
                className="flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-stone-100 hover:bg-stone-200 dark:bg-[#282323] dark:hover:bg-[#332c2c] text-stone-700 dark:text-stone-200 font-bold text-xs transition-colors cursor-pointer border border-stone-200 dark:border-stone-700 shadow-2xs ml-1"
                title="അടച്ച് ചേരുവകളിലേക്ക് തിരികെ പോകുക (Close and go back to ingredients)"
                aria-label="Close"
              >
                <FiX className="w-4 h-4" />
                <span>അടയ്ക്കുക (Close)</span>
              </button>
            </div>
          </div>

          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-2xl bg-white dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#2E2828] shadow-apple-card">
              <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block">പാക്കറ്റ് തരങ്ങൾ</span>
              <span className="text-xl font-black text-stone-900 dark:text-white font-mono">{packetTypes.length}</span>
              <span className="text-[10px] text-stone-400 block mt-0.5 font-sans">Active packet types</span>
            </div>

            <div className="p-3.5 rounded-2xl bg-white dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#2E2828] shadow-apple-card">
              <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block">ആകെ കവർ സ്റ്റോക്ക്</span>
              <span className="text-xl font-black text-epso-orange font-mono">
                {packagingItems.reduce((acc, p) => acc + (p.currentStock || 0), 0).toLocaleString('en-IN')}
              </span>
              <span className="text-[10px] text-stone-400 block mt-0.5 font-sans">Total Covers (pcs)</span>
            </div>

            <div className="p-3.5 rounded-2xl bg-white dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#2E2828] shadow-apple-card">
              <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block">കവർ സ്റ്റോക്ക് മൂല്യം</span>
              <span className="text-xl font-black text-emerald-600 dark:text-emerald-400 font-mono">
                ₹{packagingItems.reduce((acc, p) => acc + ((p.currentStock || 0) * (p.unitCost || 0)), 0).toLocaleString('en-IN')}
              </span>
              <span className="text-[10px] text-stone-400 block mt-0.5 font-sans">Inventory valuation</span>
            </div>

            <div className="p-3.5 rounded-2xl bg-white dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#2E2828] shadow-apple-card">
              <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block">കുറഞ്ഞ കവറുകൾ</span>
              <span className="text-xl font-black text-amber-500 font-mono">
                {packagingItems.filter(p => (p.currentStock || 0) <= 100).length}
              </span>
              <span className="text-[10px] text-amber-600 dark:text-amber-400 block mt-0.5 font-sans">≤ 100 pcs left</span>
            </div>
          </div>

          {/* Packet Types Catalogue Section */}
          <div className="p-4 rounded-3xl bg-white dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#2E2828] shadow-apple-card space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-black text-stone-900 dark:text-white flex items-center gap-2">
                  <FiPackage className="w-4 h-4 text-epso-orange" />
                  <span>ലഭ്യമായ പാക്കറ്റ് തരങ്ങൾ (Packet Types Catalogue)</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 dark:bg-orange-950/60 text-orange-800 dark:text-orange-300 font-bold">
                    {packetTypes.length} തരം
                  </span>
                </h3>
                <p className="text-xs text-stone-400 mt-0.5">
                  ഈ പാക്കറ്റ് തരങ്ങൾ പ്രൊഡക്ഷൻ പാക്കിംഗിലും റെസിപ്പിയിലും ലഭ്യമാണ്
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setSelectedPacketTypeForEdit(null);
                  setManagePacketsOpen(true);
                }}
                className="text-xs text-epso-orange hover:underline font-bold flex items-center gap-1 cursor-pointer"
              >
                <FiEdit2 className="w-3.5 h-3.5" />
                <span>മാനേജ് ചെയ്യുക / തിരുത്തുക</span>
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-2.5">
              {packetTypes.map((pt) => (
                <div
                  key={pt.id}
                  onClick={() => {
                    setSelectedPacketTypeForEdit(pt);
                    setManagePacketsOpen(true);
                  }}
                  className="p-3 rounded-2xl bg-stone-50 dark:bg-[#141212] border border-stone-200 dark:border-[#282323] hover:border-orange-400 dark:hover:border-orange-600 transition-all cursor-pointer group shadow-2xs select-none"
                  title="ക്ലിക്ക് ചെയ്ത് തിരുത്തുക"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span className="text-[10px] text-stone-400 font-mono">
                      ₹{(pt.costPerPacket || 0).toFixed(2)}/pkt
                    </span>
                  </div>
                  <h4 className="font-bold text-xs text-stone-900 dark:text-white truncate font-mono group-hover:text-epso-orange transition-colors">
                    {pt.name}
                  </h4>
                  <span className="text-[10px] text-stone-400 block mt-0.5 font-sans">
                    {pt.bundleCost ? `₹${pt.bundleCost}/${pt.bundleQuantity}` : 'Default'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Search Bar for Product Packaging Items */}
          <div className="flex items-center justify-between gap-3 pt-2">
            <h3 className="text-sm font-bold text-stone-800 dark:text-stone-200">
              ഉൽപ്പന്ന കവർ സ്റ്റോക്ക് (Product Packaging Cover Stock)
            </h3>
            <span className="text-xs text-stone-400">
              {packagingItems.length} Covers
            </span>
          </div>

          <div className="relative">
            <FiSearch className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400" />
            <input
              type="text"
              value={packSearch}
              onChange={(e) => setPackSearch(e.target.value)}
              placeholder="Search by packet size, product name..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-stone-200 dark:border-[#2E2828] bg-white dark:bg-[#1E1B1B] text-xs text-stone-900 dark:text-white placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-epso-red/30 transition-all font-malayalam"
            />
          </div>

          {/* Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {packagingItems
              .filter((p) => {
                if (!packSearch.trim()) return true;
                const q = packSearch.toLowerCase();
                return (
                  (p.productName || '').toLowerCase().includes(q) ||
                  p.sizeLabel.toLowerCase().includes(q)
                );
              })
              .map((item) => {
                const stock = item.currentStock || 0;
                const valuation = stock * (item.unitCost || 0);

                return (
                  <div
                    key={item.id}
                    className="p-4 rounded-2xl bg-white dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#2E2828] shadow-apple-card dark:shadow-apple-card-dark flex flex-col justify-between transition-all group"
                  >
                    <div>
                      {/* Top Header */}
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-10 h-10 rounded-xl bg-orange-100 dark:bg-orange-950/50 text-epso-orange flex items-center justify-center font-black text-sm shrink-0">
                            <FiPackage className="w-5 h-5" />
                          </div>
                          <div className="min-w-0">
                            <h3 className="font-bold text-sm text-stone-900 dark:text-white font-malayalam leading-tight truncate">
                              {item.productName || 'Product'}
                            </h3>
                            <span className="inline-block mt-0.5 px-2 py-0.5 rounded-md bg-stone-100 dark:bg-[#282323] text-stone-700 dark:text-stone-300 text-[11px] font-black font-mono">
                              {item.sizeLabel} ({item.sizeGrams}g)
                            </span>
                          </div>
                        </div>

                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${
                            stock > 200
                              ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300'
                              : stock > 50
                              ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300'
                              : 'bg-red-100 dark:bg-red-950/60 text-red-800 dark:text-red-300'
                          }`}
                        >
                          {stock > 50 ? `${stock} pcs` : `${stock} pcs Low!`}
                        </span>
                      </div>

                      {/* Detail Metrics */}
                      <div className="grid grid-cols-3 gap-2 py-2.5 px-3 rounded-xl bg-stone-50 dark:bg-[#181515] border border-stone-100 dark:border-[#282323] text-[11px] mb-3">
                        <div>
                          <span className="text-stone-400 block text-[9px] uppercase font-bold">കവർ വില</span>
                          <span className="font-black font-mono text-stone-800 dark:text-stone-200">
                            ₹{Number(item.unitCost).toFixed(2)}
                          </span>
                        </div>
                        <div>
                          <span className="text-stone-400 block text-[9px] uppercase font-bold">കൂലി നിരക്ക്</span>
                          <span className="font-black font-mono text-stone-800 dark:text-stone-200">
                            ₹{Number(item.packingLabourRate).toFixed(2)}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="text-stone-400 block text-[9px] uppercase font-bold">ആകെ മൂല്യം</span>
                          <span className="font-black font-mono text-emerald-600 dark:text-emerald-400">
                            ₹{Math.round(valuation).toLocaleString('en-IN')}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 pt-2 border-t border-stone-100 dark:border-[#282323]">
                      <button
                        type="button"
                        onClick={() => openPackAdjustModal(item)}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-400 text-xs font-bold border border-amber-500/30 transition-all cursor-pointer"
                        title="Add or deduct cover stock"
                      >
                        <FiRepeat className="w-3.5 h-3.5" />
                        <span className="font-malayalam">കവർ സ്റ്റോക്ക്</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => openEditPacketModal(item)}
                        className="p-2 rounded-xl text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-[#282323] border border-stone-200 dark:border-[#2E2828] transition-all cursor-pointer"
                        title="Edit packet type"
                      >
                        <FiEdit2 className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeletePackaging(item)}
                        className="p-2 rounded-xl text-stone-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 border border-stone-200 dark:border-[#2E2828] transition-all cursor-pointer"
                        title="Delete packet type"
                      >
                        <FiTrash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
          </div>

          {packagingItems.length === 0 && !loadingPackaging && (
            <div className="p-8 rounded-3xl bg-white dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#2E2828] text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-orange-100 dark:bg-orange-950/50 text-epso-orange flex items-center justify-center mx-auto">
                <FiPackage className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-black text-stone-900 dark:text-white">
                പാക്കറ്റ് തരങ്ങൾ ചേർത്തിട്ടില്ല (No packet types configured)
              </h3>
              <p className="text-xs text-stone-400 font-malayalam max-w-sm mx-auto">
                ഓരോ ഉൽപ്പന്നത്തിനുമുള്ള പാക്കറ്റ് സൈസുകൾ (100g, 250g, 500g, etc.) കവർ സ്റ്റോക്ക് സഹിതം ഇവിടെ ചേർക്കാം.
              </p>
              <button
                type="button"
                onClick={openCreatePacketModal}
                className="px-4 py-2 rounded-xl bg-epso-red text-white text-xs font-bold shadow-md press-apple cursor-pointer inline-flex items-center gap-1.5"
              >
                <FiPlus className="w-4 h-4" />
                <span>ആദ്യത്തെ പാക്കറ്റ് ചേർക്കുക</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Modal: Adjust Stock */}
      {adjustModalOpen && selectedIngredient && createPortal(
        <div className="fixed inset-0 z-[9999] overflow-y-auto">
          {/* Edge-to-edge backdrop */}
          <div
            className="fixed inset-0 w-full h-full bg-black/65 backdrop-blur-md animate-apple-backdrop"
            onClick={() => !isSubmitting && setAdjustModalOpen(false)}
          />

          <div className="min-h-full flex items-center justify-center p-3 sm:p-5 relative z-10 pointer-events-none">
            <div className="w-full max-w-xl bg-white dark:bg-[#1E1B1B] rounded-3xl p-6 sm:p-8 border border-stone-200 dark:border-[#2E2828] shadow-apple-modal animate-apple-modal google-modal pointer-events-auto">
              <h2 className="text-xl font-bold text-stone-900 dark:text-white font-malayalam mb-1">
                സ്റ്റോക്ക് ക്രമീകരിക്കുക (Adjust Stock)
              </h2>
              <p className="text-xs text-stone-500 dark:text-stone-400 font-malayalam mb-4">
                {selectedIngredient.name} • നിലവിലെ സ്റ്റോക്ക്: {selectedIngredient.currentStock} {selectedIngredient.unit}
              </p>

              <form onSubmit={handleAdjustSubmit} className="space-y-4 text-xs">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setAdjustIsAdd(true)}
                    className={`flex-1 py-2 rounded-xl font-bold font-malayalam border ${
                      adjustIsAdd
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                        : 'bg-stone-50 dark:bg-[#141212] text-stone-600 dark:text-stone-300 border-stone-200 dark:border-[#2E2828]'
                    }`}
                  >
                    + ഇൻവാർഡ് (Inward)
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdjustIsAdd(false)}
                    className={`flex-1 py-2 rounded-xl font-bold font-malayalam border ${
                      !adjustIsAdd
                        ? 'bg-red-600 text-white border-red-600 shadow-sm'
                        : 'bg-stone-50 dark:bg-[#141212] text-stone-600 dark:text-stone-300 border-stone-200 dark:border-[#2E2828]'
                    }`}
                  >
                    - ഔട്ട്‌വാർഡ് (Outward)
                  </button>
                </div>

                <div>
                  <label className="block font-bold text-stone-700 dark:text-stone-300 font-malayalam mb-1">
                    അളവ് ({selectedIngredient.unit}) *
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0.01"
                    required
                    value={adjustDelta === 0 ? '' : adjustDelta}
                    onChange={(e) => setAdjustDelta(e.target.value === '' ? '' : parseFloat(e.target.value))}
                    onFocus={(e) => e.target.select()}
                    placeholder={`0.00 ${selectedIngredient.unit}`}
                    className="w-full google-input text-base font-bold"
                  />
                </div>

                <div>
                  <ThemeSelect
                    label="കാരണം (Reason) *"
                    value={adjustReason}
                    onChange={(val) => setAdjustReason(val)}
                    options={[
                      { value: 'പുതിയ പർച്ചേസ് (Purchase Inward)', label: 'പുതിയ പർച്ചേസ് (Purchase Inward)' },
                      { value: 'കേടുപാടുകൾ / വേസ്റ്റേജ് (Damaged/Wastage)', label: 'കേടുപാടുകൾ / വേസ്റ്റേജ് (Damaged/Wastage)' },
                      { value: 'ഫിസിക്കൽ ഓഡിറ്റ് തിരുത്തൽ (Stock Audit Adjustment)', label: 'ഫിസിക്കൽ ഓഡിറ്റ് തിരുത്തൽ (Stock Audit Adjustment)' },
                      { value: 'സാമ്പിൾ നൽകിയത് (Free Sample)', label: 'സാമ്പിൾ നൽകിയത് (Free Sample)' },
                    ]}
                  />
                </div>

                {/* Warning when stock is 0 and trying to deduct */}
                {!adjustIsAdd && selectedIngredient.currentStock <= 0 && (
                  <div className="p-3 rounded-xl bg-red-100 dark:bg-red-950/60 border border-red-300 dark:border-red-900/60 text-xs text-red-900 dark:text-red-200 font-bold font-malayalam flex items-center gap-2">
                    <FiAlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
                    <span>മുന്നറിയിപ്പ്: സ്റ്റോക്ക് 0 ആണ്! നെഗറ്റീവ് ആക്കാൻ കഴിയില്ല.</span>
                  </div>
                )}

                <div className="p-3 rounded-xl bg-stone-50 dark:bg-[#141212] border border-stone-200 dark:border-[#2E2828] text-xs">
                  <span className="text-stone-400 font-malayalam block">പുതിയ സ്റ്റോക്ക് ബാലൻസ്:</span>
                  <span className={`text-base font-extrabold ${!adjustIsAdd && Number(adjustDelta) > selectedIngredient.currentStock ? 'text-red-600' : 'text-stone-900 dark:text-white'}`}>
                    {Math.max(0, selectedIngredient.currentStock + (adjustIsAdd ? (Number(adjustDelta) || 0) : -(Number(adjustDelta) || 0)))}{' '}
                    {selectedIngredient.unit}
                  </span>
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-stone-100 dark:border-[#2E2828]">
                  <button
                    type="button"
                    onClick={() => setAdjustModalOpen(false)}
                    className="px-4 py-2 rounded-xl text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-[#282323] font-bold font-malayalam cursor-pointer"
                  >
                    റദ്ദാക്കുക (Cancel)
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting || Number(adjustDelta) <= 0}
                    className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold shadow-sm press-apple font-malayalam cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {isSubmitting ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin shrink-0" />
                        <span>സൂക്ഷിക്കുന്നു...</span>
                      </>
                    ) : (
                      <span>അപ്ഡേറ്റ് ചെയ്യുക (Update)</span>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal: Add / Edit Ingredient */}
      {formModalOpen && createPortal(
        <div className="fixed inset-0 z-[9999] overflow-y-auto">
          {/* Edge-to-edge backdrop */}
          <div
            className="fixed inset-0 w-full h-full bg-black/65 backdrop-blur-md animate-apple-backdrop"
            onClick={() => !isSubmitting && setFormModalOpen(false)}
          />

          <div className="min-h-full flex items-center justify-center p-3 sm:p-5 relative z-10 pointer-events-none">
            <div className="w-full max-w-2xl bg-white dark:bg-[#1E1B1B] rounded-3xl p-6 sm:p-8 border border-stone-200 dark:border-[#2E2828] shadow-apple-modal animate-apple-modal google-modal pointer-events-auto">
              <h2 className="text-xl font-bold text-stone-900 dark:text-white font-malayalam mb-1">
                {selectedIngredient ? 'ചേരുവ തിരുത്തുക (Edit)' : 'പുതിയ ചേരുവ (New Ingredient)'}
              </h2>
              <p className="text-xs text-stone-500 dark:text-stone-400 font-malayalam mb-4">
                അസംസ്കൃത വസ്തുക്കളുടെ വിവരങ്ങളും നിരക്കുകളും
              </p>

              <form onSubmit={handleFormSubmit} className="space-y-4 text-xs">
                <div>
                  <label className="block font-bold text-stone-700 dark:text-stone-300 font-malayalam mb-1">
                    ചേരുവയുടെ പേര് (Name) *
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="ഉദാ: ഓയിൽ, കറിവേപ്പില"
                    className="w-full google-input text-sm font-medium font-malayalam"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <ThemeSelect
                      label="വിഭാഗം (Category)"
                      value={category}
                      onChange={(val) => setCategory(val as IngredientCategory)}
                      options={[
                        { value: 'other', label: 'Category B (Other)' },
                        { value: 'basic', label: 'Category A (Basic)' },
                      ]}
                    />
                  </div>

                  <div>
                    <ThemeSelect
                      label="യൂണിറ്റ് (Unit)"
                      value={unit}
                      onChange={(val) => setUnit(val as UnitType)}
                      options={[
                        { value: 'kg', label: 'Kilogram (kg)' },
                        { value: 'L', label: 'Liter (L)' },
                        { value: 'g', label: 'Gram (g)' },
                        { value: 'ml', label: 'Milliliter (ml)' },
                        { value: 'pcs', label: 'Pieces (എണ്ണം)' },
                        { value: 'packs', label: 'Packs (പാക്കറ്റ്)' },
                      ]}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-stone-700 dark:text-stone-300 font-malayalam mb-1">
                      കുറഞ്ഞ പരിധി (Min Alert)
                    </label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={minStock === 0 ? '' : minStock}
                      onChange={(e) => setMinStock(e.target.value === '' ? '' : parseFloat(e.target.value))}
                      onFocus={(e) => e.target.select()}
                      className="w-full google-input text-sm font-medium"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-stone-700 dark:text-stone-300 font-malayalam mb-1">
                      വാങ്ങൽ നിരക്ക് (Cost / {unit})
                    </label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={avgCostPerUnit === 0 ? '' : avgCostPerUnit}
                      onChange={(e) => setAvgCostPerUnit(e.target.value === '' ? '' : parseFloat(e.target.value))}
                      onFocus={(e) => e.target.select()}
                      className="w-full google-input text-sm font-medium"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-stone-700 dark:text-stone-300 font-malayalam mb-1">
                    കുറിപ്പ് (Notes / Supplier)
                  </label>
                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="ഉദാ: സപ്ലയർ വിവരങ്ങൾ..."
                    className="w-full google-input text-sm font-medium font-malayalam"
                  />
                </div>

                <div className="flex items-center justify-between p-3 rounded-xl bg-stone-50 dark:bg-[#141212] border border-stone-200 dark:border-[#2E2828]">
                  <span className="font-bold text-stone-900 dark:text-white font-malayalam">
                    Active (സജീവം)
                  </span>
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    className="w-5 h-5 accent-epso-red rounded cursor-pointer"
                  />
                </div>

                <div className="flex items-center justify-between gap-2 pt-3 border-t border-stone-100 dark:border-[#2E2828]">
                  {selectedIngredient ? (
                    <button
                      type="button"
                      onClick={() => {
                        if (selectedIngredient) {
                          setFormModalOpen(false);
                          handleDelete(selectedIngredient);
                        }
                      }}
                      className="px-3 py-2 rounded-xl text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 text-xs font-bold font-malayalam flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <FiTrash2 className="w-4 h-4" />
                      <span>ഡിലീറ്റ്</span>
                    </button>
                  ) : (
                    <div />
                  )}

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setFormModalOpen(false)}
                      className="px-4 py-2 rounded-xl text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-[#282323] font-bold font-malayalam cursor-pointer"
                    >
                      റദ്ദാക്കുക (Cancel)
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="px-5 py-2 rounded-xl bg-epso-red hover:bg-epso-red-hover dark:bg-amber-500 dark:hover:bg-amber-600 text-white dark:text-stone-950 font-bold shadow-sm press-apple font-malayalam flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                    >
                      {isSubmitting ? (
                        <>
                          <div className="w-3.5 h-3.5 border-2 border-white dark:border-stone-950 border-t-transparent rounded-full animate-spin shrink-0" />
                          <span>സൂക്ഷിക്കുന്നു...</span>
                        </>
                      ) : (
                        <span>സൂക്ഷിക്കുക (Save)</span>
                      )}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal: Add / Edit Packet Type */}
      {packetModalOpen && createPortal(
        <div className="fixed inset-0 z-[9999] overflow-y-auto">
          <div
            className="fixed inset-0 w-full h-full bg-black/65 backdrop-blur-md animate-apple-backdrop"
            onClick={() => !isSubmitting && setPacketModalOpen(false)}
          />

          <div className="min-h-full flex items-center justify-center p-3 sm:p-5 relative z-10 pointer-events-none">
            <div className="w-full max-w-2xl bg-white dark:bg-[#1E1B1B] rounded-3xl p-6 sm:p-8 border border-stone-200 dark:border-[#2E2828] shadow-apple-modal animate-apple-modal google-modal pointer-events-auto">
              <h2 className="text-xl font-bold text-stone-900 dark:text-white font-malayalam mb-1">
                {selectedPackagingItem ? 'പാക്കറ്റ് തരം തിരുത്തുക (Edit Packet)' : 'പുതിയ പാക്കറ്റ് തരം (New Packet Type)'}
              </h2>
              <p className="text-xs text-stone-500 dark:text-stone-400 font-malayalam mb-4">
                ഉൽപ്പന്നത്തിൻ്റെ പാക്കറ്റ് സൈസ്, കവർ സ്റ്റോക്ക് (Cover Stock), പാക്കിംഗ് കൂലി നിരക്ക്
              </p>

              <form onSubmit={handlePacketSubmit} className="space-y-4 text-xs font-malayalam">
                {/* Product Select */}
                <div>
                  <ThemeSelect
                    label="ഉൽപ്പന്നം (Product) *"
                    value={packProductId}
                    onChange={(val) => setPackProductId(val)}
                    options={products.map((p) => ({
                      value: p.id,
                      label: `${p.name} (${p.unit})`,
                    }))}
                  />
                  {products.length === 0 && (
                    <p className="text-[11px] text-amber-500 mt-1">
                      ഉൽപ്പന്നങ്ങൾ ലഭ്യമല്ല. ആദ്യം Products ടാബിൽ ഉൽപ്പന്നങ്ങൾ ചേർക്കുക.
                    </p>
                  )}
                </div>

                {/* Size Label & Grams */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-stone-700 dark:text-stone-300 mb-1">
                      പാക്കറ്റ് പേര് / അളവ് (Size Label) *
                    </label>
                    <input
                      type="text"
                      required
                      value={packSizeLabel}
                      onChange={(e) => setPackSizeLabel(e.target.value)}
                      placeholder="ഉദാ: 100g, 250g, 500g, 1kg"
                      className="w-full google-input font-mono font-bold text-sm"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-stone-700 dark:text-stone-300 mb-1">
                      ഗ്രാം തൂക്കം (Size in Grams) *
                    </label>
                    <input
                      type="number"
                      step="any"
                      min="1"
                      required
                      value={packSizeGrams === 0 ? '' : packSizeGrams}
                      onChange={(e) => setPackSizeGrams(e.target.value === '' ? '' : parseFloat(e.target.value))}
                      placeholder="100"
                      className="w-full google-input font-mono font-bold text-sm"
                    />
                  </div>
                </div>

                {/* Cover Current Stock (pcs) & Unit Cost (₹) */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-stone-700 dark:text-stone-300 mb-1">
                      കവർ സ്റ്റോക്ക് (Cover Stock in pcs) *
                    </label>
                    <input
                      type="number"
                      step="1"
                      min="0"
                      required
                      value={packCurrentStock === 0 ? '' : packCurrentStock}
                      onChange={(e) => setPackCurrentStock(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
                      placeholder="500"
                      className="w-full google-input font-mono font-bold text-sm"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-stone-700 dark:text-stone-300 mb-1">
                      കവർ ഒന്നിന് വില (Cover Cost ₹ / pc) *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      required
                      value={packUnitCost === 0 ? '' : packUnitCost}
                      onChange={(e) => setPackUnitCost(e.target.value === '' ? '' : parseFloat(e.target.value))}
                      placeholder="1.50"
                      className="w-full google-input font-mono font-bold text-sm"
                    />
                  </div>
                </div>

                {/* Labour Rate & Total Valuation */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-stone-700 dark:text-stone-300 mb-1">
                      പാക്കിംഗ് കൂലി നിരക്ക് (Labour ₹ / pc) *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      required
                      value={packLabourRate === 0 ? '' : packLabourRate}
                      onChange={(e) => setPackLabourRate(e.target.value === '' ? '' : parseFloat(e.target.value))}
                      placeholder="1.00"
                      className="w-full google-input font-mono font-bold text-sm"
                    />
                  </div>

                  <div className="p-2.5 rounded-xl bg-stone-50 dark:bg-[#141212] border border-stone-200 dark:border-[#2E2828] flex flex-col justify-center">
                    <span className="text-[10px] text-stone-400 font-bold block uppercase">കവർ ഇൻവെന്ററി മൂല്യം</span>
                    <span className="text-sm font-black text-emerald-600 dark:text-emerald-400 font-mono">
                      ₹{Math.round((Number(packCurrentStock) || 0) * (Number(packUnitCost) || 0)).toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>

                {/* Active Checkbox */}
                <div className="flex items-center justify-between p-3 rounded-xl bg-stone-50 dark:bg-[#141212] border border-stone-200 dark:border-[#2E2828]">
                  <span className="font-bold text-stone-900 dark:text-white">
                    Active (ഈ പാക്കറ്റ് സൈസ് സജീവമാണ്)
                  </span>
                  <input
                    type="checkbox"
                    checked={packIsActive}
                    onChange={(e) => setPackIsActive(e.target.checked)}
                    className="w-5 h-5 accent-epso-red rounded cursor-pointer"
                  />
                </div>

                {/* Modal Footer Buttons */}
                <div className="flex items-center justify-end gap-2 pt-3 border-t border-stone-100 dark:border-[#2E2828]">
                  <button
                    type="button"
                    onClick={() => setPacketModalOpen(false)}
                    className="px-4 py-2 rounded-xl text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-[#282323] font-bold cursor-pointer"
                  >
                    റദ്ദാക്കുക (Cancel)
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting || !packProductId}
                    className="px-5 py-2 rounded-xl bg-epso-red hover:bg-epso-red-hover dark:bg-amber-500 dark:hover:bg-amber-600 text-white dark:text-stone-950 font-bold shadow-sm press-apple flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                  >
                    {isSubmitting ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-white dark:border-stone-950 border-t-transparent rounded-full animate-spin shrink-0" />
                        <span>സൂക്ഷിക്കുന്നു...</span>
                      </>
                    ) : (
                      <span>സൂക്ഷിക്കുക (Save Packet)</span>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal: Adjust Cover Stock (Pieces) */}
      {packAdjustModalOpen && packAdjustItem && createPortal(
        <div className="fixed inset-0 z-[9999] overflow-y-auto">
          <div
            className="fixed inset-0 w-full h-full bg-black/65 backdrop-blur-md animate-apple-backdrop"
            onClick={() => !isSubmitting && setPackAdjustModalOpen(false)}
          />

          <div className="min-h-full flex items-center justify-center p-3 sm:p-5 relative z-10 pointer-events-none">
            <div className="w-full max-w-xl bg-white dark:bg-[#1E1B1B] rounded-3xl p-6 sm:p-8 border border-stone-200 dark:border-[#2E2828] shadow-apple-modal animate-apple-modal google-modal pointer-events-auto">
              <h2 className="text-xl font-bold text-stone-900 dark:text-white font-malayalam mb-1">
                കവർ സ്റ്റോക്ക് മാറ്റുക (Adjust Cover Stock)
              </h2>
              <p className="text-xs text-stone-500 dark:text-stone-400 font-malayalam mb-4">
                {packAdjustItem.productName || 'Product'} • {packAdjustItem.sizeLabel} ({packAdjustItem.sizeGrams}g) • നിലവിലെ സ്റ്റോക്ക്: <span className="font-bold font-mono text-stone-800 dark:text-stone-200">{packAdjustItem.currentStock} pcs</span>
              </p>

              <form onSubmit={handlePackAdjustSubmit} className="space-y-4 text-xs font-malayalam">
                {/* Inward / Outward Toggle */}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setPackAdjustIsAdd(true)}
                    className={`flex-1 py-2.5 rounded-xl font-bold border transition-all ${
                      packAdjustIsAdd
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                        : 'bg-stone-50 dark:bg-[#141212] text-stone-600 dark:text-stone-300 border-stone-200 dark:border-[#2E2828]'
                    }`}
                  >
                    + കവർ ഇൻവാർഡ് (Inward / Purchase)
                  </button>
                  <button
                    type="button"
                    onClick={() => setPackAdjustIsAdd(false)}
                    className={`flex-1 py-2.5 rounded-xl font-bold border transition-all ${
                      !packAdjustIsAdd
                        ? 'bg-red-600 text-white border-red-600 shadow-sm'
                        : 'bg-stone-50 dark:bg-[#141212] text-stone-600 dark:text-stone-300 border-stone-200 dark:border-[#2E2828]'
                    }`}
                  >
                    - കവർ ഔട്ട്‌വാർഡ് (Damaged / Outward)
                  </button>
                </div>

                {/* Delta quantity in pcs */}
                <div>
                  <label className="block font-bold text-stone-700 dark:text-stone-300 mb-1">
                    കവറുകളുടെ എണ്ണം (Pieces) *
                  </label>
                  <input
                    type="number"
                    step="1"
                    min="1"
                    required
                    value={packAdjustDelta === 0 ? '' : packAdjustDelta}
                    onChange={(e) => setPackAdjustDelta(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
                    onFocus={(e) => e.target.select()}
                    placeholder="100 pcs"
                    className="w-full google-input text-base font-bold font-mono"
                  />
                </div>

                {/* Reason Select */}
                <div>
                  <ThemeSelect
                    label="കാരണം (Reason) *"
                    value={packAdjustReason}
                    onChange={(val) => setPackAdjustReason(val)}
                    options={[
                      { value: 'പുതിയ കവർ പർച്ചേസ് (New Covers Inward)', label: 'പുതിയ കവർ പർച്ചേസ് (New Covers Inward)' },
                      { value: 'പ്രിന്റിംഗ് കേടുപാടുകൾ / വേസ്റ്റേജ് (Damaged/Wastage)', label: 'പ്രിന്റിംഗ് കേടുപാടുകൾ / വേസ്റ്റേജ് (Damaged/Wastage)' },
                      { value: 'ഫിസിക്കൽ ഓഡിറ്റ് തിരുത്തൽ (Physical Stock Audit)', label: 'ഫിസിക്കൽ ഓഡിറ്റ് തിരുത്തൽ (Physical Stock Audit)' },
                      { value: 'സാമ്പിൾ പാക്കിംഗ് നൽകിയത് (Free Samples / Promotional)', label: 'സാമ്പിൾ പാക്കിംഗ് നൽകിയത് (Free Samples / Promotional)' },
                    ]}
                  />
                </div>

                {/* Balance preview */}
                <div className="p-3 rounded-xl bg-stone-50 dark:bg-[#141212] border border-stone-200 dark:border-[#2E2828] flex items-center justify-between">
                  <span className="text-stone-400 font-bold">പുതിയ കവർ ബാലൻസ്:</span>
                  <span className={`text-base font-extrabold font-mono ${!packAdjustIsAdd && Number(packAdjustDelta) > packAdjustItem.currentStock ? 'text-red-600' : 'text-stone-900 dark:text-white'}`}>
                    {Math.max(0, packAdjustItem.currentStock + (packAdjustIsAdd ? (Number(packAdjustDelta) || 0) : -(Number(packAdjustDelta) || 0)))}{' '}pcs
                  </span>
                </div>

                {/* Footer Buttons */}
                <div className="flex items-center justify-end gap-2 pt-3 border-t border-stone-100 dark:border-[#2E2828]">
                  <button
                    type="button"
                    onClick={() => setPackAdjustModalOpen(false)}
                    className="px-4 py-2 rounded-xl text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-[#282323] font-bold cursor-pointer"
                  >
                    റദ്ദാക്കുക (Cancel)
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting || Number(packAdjustDelta) <= 0}
                    className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold shadow-sm press-apple flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                  >
                    {isSubmitting ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin shrink-0" />
                        <span>അപ്ഡേറ്റ് ചെയ്യുന്നു...</span>
                      </>
                    ) : (
                      <span>അപ്ഡേറ്റ് ചെയ്യുക (Update Stock)</span>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Printable Purchase & Reorder List Modal */}
      <PrintPurchaseListModal
        isOpen={purchaseListModalOpen}
        onClose={() => setPurchaseListModalOpen(false)}
        ingredients={visibleIngredients}
      />

      {/* Bulk Add Purchase Modal */}
      <AddPurchaseModal
        isOpen={addPurchaseModalOpen}
        onClose={() => setAddPurchaseModalOpen(false)}
        ingredients={visibleIngredients}
        onRefresh={onRefresh}
      />

      {/* Packet Types Manager Modal */}
      <ManagePacketTypesModal
        isOpen={managePacketsOpen}
        onClose={() => {
          setManagePacketsOpen(false);
          setSelectedPacketTypeForEdit(null);
        }}
        initialPacket={selectedPacketTypeForEdit}
        onUpdated={() => {
          loadPackagingItems();
          fetchPacketTypes(true).then((pts) => setPacketTypes(pts));
        }}
      />

      {/* Ingredient Analytics Details Modal */}
      <IngredientDetailModal
        isOpen={Boolean(detailIngredient)}
        onClose={handleCloseDetailIngredient}
        ingredient={detailIngredient}
        stockMovements={stockMovements}
        products={products}
      />
    </div>
  );
};
