import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Product, UnitType, Ingredient, Recipe, PacketType, RecipePacket } from '../types';
import {
  FiPlus,
  FiSearch,
  FiEdit2,
  FiTrash2,
  FiPackage,
  FiDollarSign,
  FiCheckCircle,
  FiXCircle,
  FiAlertCircle,
  FiLayers,
  FiPrinter,
  FiBookOpen,
  FiX,
  FiCheck,
  FiArrowRight,
  FiArrowLeft,
  FiSliders,
  FiArrowUp,
  FiArrowDown,
  FiUpload,
  FiDownload,
  FiRefreshCw,
} from 'react-icons/fi';
import { saveProduct, deleteProduct, saveRecipe, deleteRecipe, fetchPacketTypes, adjustProductStock } from '../services/supabase';
import { PrintPurchaseListModal } from './PrintPurchaseListModal';
import { useLockBodyScroll } from '../hooks/useLockBodyScroll';
import { createPortal } from 'react-dom';
import { ThemeSelect } from './ThemeSelect';
import { useFeedback } from '../context/FeedbackContext';
import { parseProductsExcel, downloadProductsTemplate } from '../utils/excelImport';

interface ProductsAdminViewProps {
  products: Product[];
  ingredients?: Ingredient[];
  recipes?: Recipe[];
  onRefresh: () => void;
}

export const isExcludedRecipeIngredient = (ing: { name?: string; category?: string }) => {
  const n = (ing.name || '').trim().toLowerCase();
  const c = (ing.category || '').trim().toLowerCase();

  // Basic categories and operational wages
  if (c === 'basic' || c === 'packaging' || c === 'wages') return true;

  // Basic ingredient names and operational costs
  return (
    n.includes('കൂലി') ||
    n.includes('wage') ||
    n.includes('salary') ||
    n.includes('ഓയിൽ') ||
    n.includes('oil') ||
    n.includes('സൺഫ്ലവർ') ||
    n.includes('വെളിച്ചെണ്ണ') ||
    n.includes('ഉപ്പ്') ||
    (n.includes('salt') && !n.includes('black salt')) ||
    n.includes('അണ്ടി തോട്') ||
    n.includes('തോട്') ||
    n.includes('കവർ') ||
    n.includes('cover') ||
    n.includes('പാക്കിങ്') ||
    n.includes('packing') ||
    n.includes('കറിവേപ്പില') ||
    n.includes('curry leaves') ||
    n.includes('വിറക്') ||
    n.includes('firewood')
  );
};

export const isDailySharedBasic = (name: string) => isExcludedRecipeIngredient({ name });

export const ProductsAdminView: React.FC<ProductsAdminViewProps> = ({
  products,
  ingredients = [],
  recipes = [],
  onRefresh,
}) => {
  const { showToast, confirm } = useFeedback();

  const recipeEligibleIngredients = useMemo(
    () => ingredients.filter((ing) => ing.isActive && !isExcludedRecipeIngredient(ing)),
    [ingredients]
  );

  const [search, setSearch] = useState('');
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('all');
  const excelInputRef = useRef<HTMLInputElement>(null);
  const [isImportingExcel, setIsImportingExcel] = useState(false);

  const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImportingExcel(true);
    try {
      const parsed = await parseProductsExcel(file);
      if (parsed.length === 0) {
        showToast('എക്സലിൽ സാധുവായ ഉൽപ്പന്ന വിവരങ്ങൾ കണ്ടെത്തിയില്ല', 'warning');
        setIsImportingExcel(false);
        if (excelInputRef.current) excelInputRef.current.value = '';
        return;
      }

      let count = 0;
      for (const p of parsed) {
        const existing = products.find(
          (prod) =>
            prod.name.trim().toLowerCase() === p.name.trim().toLowerCase() ||
            (p.sku && prod.sku && prod.sku.trim().toLowerCase() === p.sku.trim().toLowerCase())
        );

        await saveProduct({
          id: existing?.id,
          name: p.name,
          sku: p.sku || existing?.sku,
          unit: (p.unit as UnitType) || existing?.unit || 'kg',
          currentStock: p.currentStock,
          wholesalePrice: p.wholesalePrice,
          isActive: true,
        });
        count++;
      }

      showToast(`${count} ഉൽപ്പന്നങ്ങൾ എക്സലിൽ നിന്ന് വിജയകരമായി ചേർത്തു/പുതുക്കി`, 'success');
      onRefresh();
    } catch (err: any) {
      console.error('Failed to import products from Excel:', err);
      showToast(`എക്സൽ ഇറക്കുമതി പരാജയപ്പെട്ടു: ${err?.message || 'Error'}`, 'error');
    } finally {
      setIsImportingExcel(false);
      if (excelInputRef.current) excelInputRef.current.value = '';
    }
  };

  const [modalOpen, setModalOpen] = useState(false);
  const [purchaseListModalOpen, setPurchaseListModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeletingProductId, setIsDeletingProductId] = useState<string | null>(null);
  const [isDeletingRecipe, setIsDeletingRecipe] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Form states
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [unit, setUnit] = useState<UnitType>('kg');
  const [wholesalePrice, setWholesalePrice] = useState<number | string>(0);
  const [currentStock, setCurrentStock] = useState<number | string>(0);
  const [isActive, setIsActive] = useState<boolean>(true);

  // Recipe Modal States
  const [recipeModalOpen, setRecipeModalOpen] = useState(false);
  const [recipeProduct, setRecipeProduct] = useState<Product | null>(null);
  const [existingRecipe, setExistingRecipe] = useState<Recipe | null>(null);
  const [recipeBaseQuantity, setRecipeBaseQuantity] = useState<number | string>(10);
  const [recipeBaseUnit, setRecipeBaseUnit] = useState<string>('kg');
  const [recipeInstructions, setRecipeInstructions] = useState<string>('');
  const [recipeItems, setRecipeItems] = useState<Array<{ ingredientId: string; quantity: number; unit: string }>>([]);
  const [recipePackets, setRecipePackets] = useState<Array<{ packetTypeId?: string; packetName: string; costPerPacket: number; bundleCost?: number; bundleQuantity?: number }>>([]);
  const [availablePacketTypes, setAvailablePacketTypes] = useState<PacketType[]>([]);
  const [isSavingRecipe, setIsSavingRecipe] = useState(false);
  const [recipeError, setRecipeError] = useState('');
  const [recipeModalStep, setRecipeModalStep] = useState<1 | 2>(1);

  // Stock Adjustment Modal states
  const [stockAdjustModalOpen, setStockAdjustModalOpen] = useState(false);
  const [stockAdjustProduct, setStockAdjustProduct] = useState<Product | null>(null);
  const [stockAdjustDelta, setStockAdjustDelta] = useState<number | string>(10);
  const [stockAdjustIsAdd, setStockAdjustIsAdd] = useState<boolean>(true);
  const [stockAdjustReason, setStockAdjustReason] = useState<string>('ഉൽപ്പാദനം ചേർത്തത് (Production Stock Inward)');
  const [isAdjustingStock, setIsAdjustingStock] = useState<boolean>(false);

  const loadPacketCatalog = async () => {
    try {
      const data = await fetchPacketTypes();
      setAvailablePacketTypes(data);
    } catch (err) {
      console.error('Failed to load packet types:', err);
    }
  };

  useEffect(() => {
    loadPacketCatalog();
  }, []);

  // Lock scroll whenever any modal is open
  useLockBodyScroll(modalOpen || purchaseListModalOpen || recipeModalOpen || stockAdjustModalOpen);

  const openCreateModal = () => {
    setEditingProduct(null);
    setName('');
    setSku(`PULARI-PRD-${Math.floor(100 + Math.random() * 900)}`);
    setUnit('kg');
    setWholesalePrice(250);
    setCurrentStock(0);
    setIsActive(true);
    setErrorMsg('');
    setModalOpen(true);
  };

  const openEditModal = (p: Product) => {
    setEditingProduct(p);
    setName(p.name);
    setSku(p.sku || '');
    setUnit(p.unit);
    setWholesalePrice(p.wholesalePrice);
    setCurrentStock(p.currentStock);
    setIsActive(p.isActive);
    setErrorMsg('');
    setModalOpen(true);
  };

  const openRecipeModal = (p: Product) => {
    setRecipeProduct(p);
    setRecipeError('');
    const rec = recipes.find((r) => r.productId === p.id);
    if (rec) {
      setExistingRecipe(rec);
      setRecipeBaseQuantity(rec.baseOutputQuantity || 10);
      setRecipeBaseUnit(rec.baseOutputUnit || p.unit || 'kg');
      setRecipeInstructions(rec.instructions || '');
      setRecipeItems(
        rec.items && rec.items.length > 0
          ? rec.items.map((it) => ({
              ingredientId: it.ingredientId,
              quantity: it.quantity,
              unit: it.unit,
            }))
          : [{ ingredientId: recipeEligibleIngredients[0]?.id || '', quantity: 1, unit: recipeEligibleIngredients[0]?.unit || 'kg' }]
      );
      setRecipePackets(
        rec.packets && rec.packets.length > 0
          ? rec.packets.map((pkt) => ({
              packetTypeId: pkt.packetTypeId,
              packetName: pkt.packetName,
              costPerPacket: pkt.costPerPacket,
              bundleCost: pkt.bundleCost,
              bundleQuantity: pkt.bundleQuantity,
            }))
          : []
      );
    } else {
      setExistingRecipe(null);
      setRecipeBaseQuantity(10);
      setRecipeBaseUnit(p.unit || 'kg');
      setRecipeInstructions('');
      setRecipeItems([
        { ingredientId: recipeEligibleIngredients[0]?.id || '', quantity: 1, unit: recipeEligibleIngredients[0]?.unit || 'kg' },
      ]);
      setRecipePackets([]);
    }
    setRecipeModalStep(1);
    setRecipeError('');
    setRecipeModalOpen(true);
  };

  const handleNextToPackets = () => {
    setRecipeError('');
    if (!recipeItems || recipeItems.length === 0) {
      setRecipeError('കുറഞ്ഞത് ഒരു ചേരുവയെങ്കിലും ചേർക്കുക (Add at least 1 ingredient)');
      return;
    }
    const hasInvalid = recipeItems.some((it) => !it.ingredientId || Number(it.quantity) <= 0);
    if (hasInvalid) {
      setRecipeError('എല്ലാ ചേരുവകളുടെയും പേരും അളവും സാധുവാണെന്ന് ഉറപ്പാക്കുക (Ensure all ingredients have a name and quantity > 0)');
      return;
    }
    setRecipeModalStep(2);
  };

  const handleAddRecipeItem = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setRecipeItems((prev) => {
      const usedIds = new Set(prev.map((item) => item.ingredientId));
      const nextAvailable = recipeEligibleIngredients.find((ing) => !usedIds.has(ing.id)) || recipeEligibleIngredients[0];
      return [
        ...prev,
        {
          ingredientId: nextAvailable ? nextAvailable.id : '',
          quantity: 1,
          unit: nextAvailable ? nextAvailable.unit : 'kg',
        },
      ];
    });
  };

  const handleRemoveRecipeItem = (index: number) => {
    setRecipeItems(recipeItems.filter((_, i) => i !== index));
  };

  const handleRecipeItemChange = (index: number, field: string, value: any) => {
    const updated = [...recipeItems];
    if (field === 'ingredientId') {
      const found = ingredients.find((i) => i.id === value);
      updated[index] = {
        ...updated[index],
        ingredientId: value,
        unit: found?.unit || updated[index].unit,
      };
    } else {
      updated[index] = { ...updated[index], [field]: value };
    }
    setRecipeItems(updated);
  };

  // Recipe Packet Rows Handlers
  const handleAddRecipePacketRow = () => {
    const firstPkt = availablePacketTypes[0];
    setRecipePackets([
      ...recipePackets,
      {
        packetTypeId: firstPkt?.id,
        packetName: firstPkt?.name || '3kg HM Packet',
        costPerPacket: firstPkt?.costPerPacket || 0,
        bundleCost: firstPkt?.bundleCost || 0,
        bundleQuantity: firstPkt?.bundleQuantity || 100,
      },
    ]);
  };

  const handleToggleRecipePacket = (pt: PacketType) => {
    const isSelected = recipePackets.some(
      (p) => (p.packetTypeId && p.packetTypeId === pt.id) || p.packetName === pt.name
    );
    if (isSelected) {
      setRecipePackets(
        recipePackets.filter(
          (p) => !((p.packetTypeId && p.packetTypeId === pt.id) || p.packetName === pt.name)
        )
      );
    } else {
      setRecipePackets([
        ...recipePackets,
        {
          packetTypeId: pt.id,
          packetName: pt.name,
          costPerPacket: pt.costPerPacket || 0,
          bundleCost: pt.bundleCost || 0,
          bundleQuantity: pt.bundleQuantity || 100,
        },
      ]);
    }
  };

  const handleSelectAllRecipePackets = () => {
    const all = availablePacketTypes.map((pt) => {
      const existing = recipePackets.find((p) => p.packetTypeId === pt.id || p.packetName === pt.name);
      return existing || {
        packetTypeId: pt.id,
        packetName: pt.name,
        costPerPacket: pt.costPerPacket || 0,
        bundleCost: pt.bundleCost || 0,
        bundleQuantity: pt.bundleQuantity || 100,
      };
    });
    setRecipePackets(all);
  };

  const handleDeselectAllRecipePackets = () => {
    setRecipePackets([]);
  };

  const handleRemoveRecipePacketRow = (index: number) => {
    setRecipePackets(recipePackets.filter((_, i) => i !== index));
  };

  const handleRecipePacketSelect = (index: number, packetTypeId: string) => {
    const found = availablePacketTypes.find((pt) => pt.id === packetTypeId);
    const updated = [...recipePackets];
    updated[index] = {
      ...updated[index],
      packetTypeId,
      packetName: found?.name || updated[index].packetName,
      costPerPacket: found?.costPerPacket ?? updated[index].costPerPacket,
      bundleCost: found?.bundleCost ?? updated[index].bundleCost,
      bundleQuantity: found?.bundleQuantity ?? updated[index].bundleQuantity,
    };
    setRecipePackets(updated);
  };

  const handleRecipePacketChange = (index: number, field: string, value: any) => {
    const updated = [...recipePackets];
    updated[index] = { ...updated[index], [field]: value };
    setRecipePackets(updated);
  };

  const calculateTotalRecipeCost = () => {
    return recipeItems.reduce((acc, row) => {
      const ing = ingredients.find((i) => i.id === row.ingredientId);
      const unitCost = ing?.avgCostPerUnit || 0;
      return acc + (Number(row.quantity) || 0) * unitCost;
    }, 0);
  };

  const handleSaveRecipeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recipeProduct) return;
    if (!recipeItems || recipeItems.length === 0) {
      setRecipeError('കുറഞ്ഞത് ഒരു ചേരുവയെങ്കിലും നൽകുക (At least one ingredient is required)');
      return;
    }
    const hasInvalid = recipeItems.some((it) => !it.ingredientId || Number(it.quantity) <= 0);
    if (hasInvalid) {
      setRecipeError('എല്ലാ ചേരുവകളുടെയും പേരും അളവും സാധുവാണെന്ന് ഉറപ്പാക്കുക (Ensure all ingredients have a name and quantity > 0)');
      return;
    }

    setIsSavingRecipe(true);
    setRecipeError('');
    try {
      await saveRecipe(
        {
          id: existingRecipe?.id,
          productId: recipeProduct.id,
          baseOutputQuantity: Number(recipeBaseQuantity) || 1,
          baseOutputUnit: recipeBaseUnit,
          instructions: recipeInstructions,
        },
        recipeItems.map((it) => ({
          ingredientId: it.ingredientId,
          quantity: Number(it.quantity) || 0,
          unit: it.unit,
        })),
        recipePackets
      );
      setRecipeModalOpen(false);
      onRefresh();
    } catch (err: any) {
      setRecipeError(err?.message || 'പാചകക്കുറിപ്പ് സേവ് ചെയ്യാനായില്ല');
    } finally {
      setIsSavingRecipe(false);
    }
  };

  const handleDeleteRecipe = async () => {
    if (!existingRecipe) return;
    const confirmed = await confirm({
      title: 'പാചകക്കുറിപ്പ് നീക്കം ചെയ്യണോ?',
      message: `"${recipeProduct?.name}" ന്റെ പാചകക്കുറിപ്പ് നീക്കം ചെയ്യണോ?`,
      confirmLabel: 'ഡിലീറ്റ് ചെയ്യുക',
      cancelLabel: 'റദ്ദാക്കുക',
      isDestructive: true,
    });
    if (!confirmed) return;

    setIsDeletingRecipe(true);
    try {
      await deleteRecipe(existingRecipe.id);
      showToast('പാചകക്കുറിപ്പ് വിജയകരമായി നീക്കം ചെയ്തു', 'success');
      setRecipeModalOpen(false);
      onRefresh();
    } catch (err: any) {
      showToast(`ഡിലീറ്റ് പരാജയപ്പെട്ടു: ${err?.message || 'Error deleting recipe'}`, 'error');
    } finally {
      setIsDeletingRecipe(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setErrorMsg('ഉൽപ്പന്നത്തിന്റെ പേര് നൽകുക (Product name is required)');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg('');
    try {
      await saveProduct({
        id: editingProduct?.id,
        name: name.trim(),
        sku: sku.trim() || undefined,
        unit,
        wholesalePrice: Number(wholesalePrice) || 0,
        currentStock: Number(currentStock) || 0,
        isActive,
      });
      showToast('ഉൽപ്പന്നം വിജയകരമായി സൂക്ഷിച്ചു', 'success');
      setModalOpen(false);
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err?.message || 'ഉൽപ്പന്നം സേവ് ചെയ്യുന്നതിൽ പരാജയപ്പെട്ടു');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (p: Product) => {
    const confirmed = await confirm({
      title: 'ഉൽപ്പന്നം നീക്കം ചെയ്യണോ?',
      message: `"${p.name}" എന്ന ഉൽപ്പന്നം ഡാറ്റാബേസിൽ നിന്ന് നീക്കം ചെയ്യണോ?`,
      confirmLabel: 'ഡാറ്റാബേസിൽ നിന്ന് ഡിലീറ്റ് ചെയ്യുക',
      cancelLabel: 'റദ്ദാക്കുക',
      isDestructive: true,
    });
    if (!confirmed) return;

    setIsDeletingProductId(p.id);
    try {
      await deleteProduct(p.id);
      showToast(`"${p.name}" ഡാറ്റാബേസിൽ നിന്ന് നീക്കം ചെയ്തു`, 'success');
      onRefresh();
    } catch (err: any) {
      showToast(`ഡിലീറ്റ് പരാജയപ്പെട്ടു: ${err?.message || 'Error deleting product'}`, 'error');
    } finally {
      setIsDeletingProductId(null);
    }
  };

  const openStockAdjustModal = (p: Product) => {
    setStockAdjustProduct(p);
    setStockAdjustDelta(10);
    setStockAdjustIsAdd(true);
    setStockAdjustReason('ഉൽപ്പാദനം ചേർത്തത് (Production Stock Inward)');
    setStockAdjustModalOpen(true);
  };

  const handleStockAdjustSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stockAdjustProduct) return;
    const deltaAmount = Number(stockAdjustDelta) || 0;
    if (deltaAmount <= 0) {
      showToast('സാധുവായ അളവ് നൽകുക (Please enter a valid quantity > 0)', 'warning');
      return;
    }

    if (!stockAdjustIsAdd && stockAdjustProduct.currentStock <= 0) {
      showToast('സ്റ്റോക്ക് 0 ആണ്! നെഗറ്റീവ് ആക്കാൻ കഴിയില്ല', 'warning');
      return;
    }

    if (!stockAdjustIsAdd && deltaAmount > stockAdjustProduct.currentStock) {
      showToast(`ലഭ്യമായ സ്റ്റോക്കിൽ (${stockAdjustProduct.currentStock} ${stockAdjustProduct.unit}) കൂടുതൽ കുറയ്ക്കാൻ കഴിയില്ല!`, 'warning');
      return;
    }

    setIsAdjustingStock(true);
    try {
      const delta = stockAdjustIsAdd ? deltaAmount : -deltaAmount;
      await adjustProductStock(stockAdjustProduct.id, delta, stockAdjustReason);
      showToast('സ്റ്റോക്ക് വിജയകരമായി പുതുക്കി', 'success');
      setStockAdjustModalOpen(false);
      onRefresh();
    } catch (err: any) {
      showToast(`സ്റ്റോക്ക് മാറ്റുന്നതിൽ പിഴവ്: ${err?.message || 'Error updating product stock'}`, 'error');
    } finally {
      setIsAdjustingStock(false);
    }
  };

  const handleClearStockToZero = async () => {
    if (!stockAdjustProduct) return;
    if (stockAdjustProduct.currentStock <= 0) {
      showToast('സ്റ്റോക്ക് ഇതിനകം 0 ആണ്! (Stock is already 0)', 'info');
      return;
    }
    const confirmed = await confirm({
      title: 'സ്റ്റോക്ക് 0 ആക്കണോ?',
      message: `"${stockAdjustProduct.name}" ന്റെ നിലവിലെ സ്റ്റോക്ക് (${stockAdjustProduct.currentStock} ${stockAdjustProduct.unit}) പൂർണ്ണമായി ഡിലീറ്റ് ചെയ്യണോ?`,
      confirmLabel: 'സ്റ്റോക്ക് ക്ലിയർ ചെയ്യുക',
      cancelLabel: 'റദ്ദാക്കുക',
      isDestructive: true,
    });
    if (!confirmed) return;

    setIsAdjustingStock(true);
    try {
      await adjustProductStock(
        stockAdjustProduct.id,
        -stockAdjustProduct.currentStock,
        'സ്റ്റോക്ക് പൂർണ്ണമായി ഡിലീറ്റ് ചെയ്തു (Stock Cleared to 0)'
      );
      showToast('സ്റ്റോക്ക് വിജയകരമായി ക്ലിയർ ചെയ്തു', 'success');
      setStockAdjustModalOpen(false);
      onRefresh();
    } catch (err: any) {
      showToast(`ഡിലീറ്റ് പരാജയപ്പെട്ടു: ${err?.message || 'Error clearing stock'}`, 'error');
    } finally {
      setIsAdjustingStock(false);
    }
  };

  const filteredProducts = products.filter((p) => {
    const matchSearch =
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.sku && p.sku.toLowerCase().includes(search.toLowerCase()));

    if (!matchSearch) return false;
    if (filterActive === 'active') return p.isActive;
    if (filterActive === 'inactive') return !p.isActive;
    return true;
  });

  const activeCount = products.filter((p) => p.isActive).length;
  const inactiveCount = products.filter((p) => !p.isActive).length;

  return (
    <div className="space-y-6">
      {/* Top Action Toolbar (Tab Title Removed) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-end gap-3 pb-2 border-b border-stone-200 dark:border-[#2E2828]">
        <div className="flex items-center gap-2">
          {ingredients.length > 0 && (
            <button
              onClick={() => setPurchaseListModalOpen(true)}
              className="flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-stone-200 dark:border-[#2E2828] bg-white dark:bg-[#1E1B1B] text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-[#282323] font-bold text-xs shadow-2xs press-apple transition-colors cursor-pointer"
              title="Print purchase list for raw materials"
            >
              <FiPrinter className="w-3.5 h-3.5 text-epso-orange" />
              <span>Print Purchase List</span>
            </button>
          )}
          <input
            ref={excelInputRef}
            type="file"
            accept=".xlsx, .xls, .csv"
            className="hidden"
            onChange={handleExcelUpload}
          />

          <button
            type="button"
            onClick={() => downloadProductsTemplate(products)}
            className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-stone-200 dark:border-[#2E2828] bg-white dark:bg-[#1E1B1B] text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-[#282323] font-bold text-xs shadow-2xs press-apple transition-colors cursor-pointer"
            title="Download products Excel sample template"
          >
            <FiDownload className="w-3.5 h-3.5 text-stone-500" />
            <span>Template</span>
          </button>

          <button
            type="button"
            onClick={() => excelInputRef.current?.click()}
            disabled={isImportingExcel}
            className="flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm press-apple transition-colors cursor-pointer disabled:opacity-50"
            title="Import products catalogue from Excel"
          >
            {isImportingExcel ? (
              <>
                <FiRefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Importing...</span>
              </>
            ) : (
              <>
                <FiUpload className="w-3.5 h-3.5" />
                <span>Upload Excel</span>
              </>
            )}
          </button>
          <button
            onClick={openCreateModal}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-epso-red hover:bg-epso-red-hover dark:bg-amber-500 dark:hover:bg-amber-600 text-white dark:text-stone-950 font-bold text-xs shadow-sm press-apple transition-colors cursor-pointer"
          >
            <FiPlus className="w-4 h-4" />
            <span>New Product</span>
          </button>
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
            placeholder="Search product, SKU..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-stone-200 dark:border-[#2E2828] bg-white dark:bg-[#1E1B1B] text-xs text-stone-900 dark:text-white placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-epso-red/30 dark:focus:ring-amber-500/30 transition-all"
          />
        </div>

        {/* English Status Tabs */}
        <div className="flex items-center gap-1.5 p-1 bg-stone-100 dark:bg-[#1E1B1B] rounded-xl border border-stone-200 dark:border-[#2E2828]">
          <button
            onClick={() => setFilterActive('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              filterActive === 'all'
                ? 'bg-white dark:bg-[#282323] text-stone-900 dark:text-white shadow-sm'
                : 'text-stone-500 hover:text-stone-800 dark:text-stone-400'
            }`}
          >
            All ({products.length})
          </button>
          <button
            onClick={() => setFilterActive('active')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              filterActive === 'active'
                ? 'bg-white dark:bg-[#282323] text-stone-900 dark:text-white shadow-sm'
                : 'text-stone-500 hover:text-stone-800 dark:text-stone-400'
            }`}
          >
            Active ({activeCount})
          </button>
          <button
            onClick={() => setFilterActive('inactive')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              filterActive === 'inactive'
                ? 'bg-white dark:bg-[#282323] text-stone-900 dark:text-white shadow-sm'
                : 'text-stone-500 hover:text-stone-800 dark:text-stone-400'
            }`}
          >
            Inactive ({inactiveCount})
          </button>
        </div>
      </div>

      {/* Products Grid - Increased card widths for desktop */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        {filteredProducts.map((p) => {
          const totalValuation = p.currentStock * p.wholesalePrice;
          const productRecipe = recipes.find((r) => r.productId === p.id);

          return (
            <div
              key={p.id}
              className="p-5 rounded-2xl bg-white dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#2E2828] shadow-apple-card dark:shadow-apple-card-dark flex flex-col justify-between transition-all"
            >
              <div>
                {/* Header: Title and Status */}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <h3 className="text-base font-bold text-stone-900 dark:text-white">
                      {p.name}
                    </h3>
                    {p.sku && (
                      <span className="text-[11px] text-stone-400 dark:text-stone-500 block">
                        SKU: {p.sku}
                      </span>
                    )}
                  </div>
                  <span
                    className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                      p.isActive
                        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800'
                        : 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-400'
                    }`}
                  >
                    {p.isActive ? (
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

                {/* Details Box */}
                <div className="p-3 bg-stone-50 dark:bg-[#141212] rounded-xl border border-stone-200/80 dark:border-[#282323] space-y-2.5 my-3 text-xs">
                  {/* Current Inventory Stock Highlight */}
                  <div className="flex items-center justify-between pb-1">
                    <span className="text-stone-600 dark:text-stone-300 font-bold flex items-center gap-1.5">
                      <FiPackage className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                      <span>ഇൻവെന്ററി സ്റ്റോക്ക്:</span>
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                          p.currentStock > 0
                            ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60'
                            : 'bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-900/60'
                        }`}
                      >
                        {p.currentStock > 0 ? 'In Stock' : 'Out of Stock'}
                      </span>
                      <span className="font-black text-sm text-stone-900 dark:text-white font-mono">
                        {p.currentStock} {p.unit}
                      </span>
                    </div>
                  </div>

                  {/* Wholesale Price Highlight */}
                  <div className="flex items-center justify-between pt-1 border-t border-stone-200/60 dark:border-[#282323]">
                    <span className="text-stone-500 dark:text-stone-400">
                      മൊത്തവില (Wholesale):
                    </span>
                    <span className="font-extrabold text-sm text-epso-red dark:text-amber-400">
                      ₹{p.wholesalePrice.toLocaleString('en-IN')}
                      <span className="text-[10px] font-normal text-stone-400 ml-1">/ {p.unit}</span>
                    </span>
                  </div>

                  {/* Recipe / Ingredients Config Status */}
                  <div className="flex items-center justify-between pt-1 border-t border-stone-200/60 dark:border-[#282323]">
                    <span className="text-stone-500 dark:text-stone-400">
                      ചേരുവകൾ (Recipe):
                    </span>
                    {productRecipe && productRecipe.items && productRecipe.items.length > 0 ? (
                      <span className="font-bold text-[11px] text-amber-600 dark:text-amber-400">
                        {productRecipe.items.length} ചേരുവകൾ ({productRecipe.baseOutputQuantity} {productRecipe.baseOutputUnit || p.unit})
                      </span>
                    ) : (
                      <span className="text-[11px] text-stone-400 italic">
                        നൽകിയിട്ടില്ല
                      </span>
                    )}
                  </div>

                  {/* Stock Valuation */}
                  <div className="flex items-center justify-between pt-1 border-t border-stone-200/60 dark:border-[#282323]">
                    <span className="text-stone-500 dark:text-stone-400">
                      സ്റ്റോക്ക് മൂല്യം (Valuation):
                    </span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                      ₹{totalValuation.toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>

                {/* Direct Quick Stock Adjust Button */}
                <button
                  onClick={() => openStockAdjustModal(p)}
                  className="w-full flex items-center justify-center gap-1.5 py-2 px-3 mb-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 text-xs font-bold border border-emerald-200/70 dark:border-emerald-800/60 press-apple transition-colors cursor-pointer shadow-2xs"
                  title="സ്റ്റോക്ക് മാറ്റുക (+ Add / - Reduce / Clear)"
                >
                  <FiSliders className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>സ്റ്റോക്ക് മാറ്റുക (+ / - Stock)</span>
                </button>
              </div>

              {/* Action Buttons: Set Ingredients (Recipe), Edit, Delete */}
              <div className="flex items-center gap-2 pt-2 border-t border-stone-100 dark:border-[#282323]">
                <button
                  onClick={() => openRecipeModal(p)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 dark:hover:bg-amber-950/60 text-amber-900 dark:text-amber-300 text-xs font-bold press-apple transition-colors cursor-pointer"
                  title="ചേരുവകൾ നൽകുക (Set Ingredients / Recipe)"
                >
                  <FiBookOpen className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                  <span>ചേരുവകൾ</span>
                </button>

                <button
                  onClick={() => openEditModal(p)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl bg-stone-100 hover:bg-stone-200 dark:bg-[#282323] dark:hover:bg-[#322c2c] text-stone-800 dark:text-stone-200 text-xs font-bold press-apple transition-colors cursor-pointer"
                >
                  <FiEdit2 className="w-3.5 h-3.5" />
                  <span>തിരുത്തുക</span>
                </button>

                <button
                  onClick={() => handleDelete(p)}
                  disabled={isDeletingProductId === p.id}
                  className="p-2 rounded-xl text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 border border-transparent hover:border-red-200 dark:hover:border-red-900 press-apple transition-colors cursor-pointer disabled:opacity-50"
                  title="ഡിലീറ്റ് ചെയ്യുക"
                >
                  {isDeletingProductId === p.id ? (
                    <div className="w-4 h-4 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <FiTrash2 className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {filteredProducts.length === 0 && (
        <div className="py-12 text-center text-xs text-stone-400 dark:text-stone-500">
          ഉൽപ്പന്നങ്ങൾ ഒന്നും കണ്ടെത്താനായില്ല (No products found)
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 1: Add / Edit Product                                           */}
      {/* ===================================================================== */}
      {modalOpen && createPortal(
        <div className="fixed inset-0 z-[9999] overflow-y-auto">
          {/* Edge-to-edge backdrop covering entire screen */}
          <div
            className="fixed inset-0 w-full h-full bg-black/65 backdrop-blur-md animate-apple-backdrop"
            onClick={() => !isSubmitting && setModalOpen(false)}
          />

          <div className="min-h-full flex items-center justify-center p-3 sm:p-5 relative z-10 pointer-events-none">
            <div className="w-full max-w-2xl bg-white dark:bg-[#1E1B1B] rounded-3xl p-6 sm:p-8 border border-stone-200 dark:border-[#2E2828] shadow-apple-modal animate-apple-modal pointer-events-auto google-modal">
              <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                  <h2 className="text-xl font-bold text-stone-900 dark:text-white mb-1">
                    {editingProduct ? 'ഉൽപ്പന്നം തിരുത്തുക (Edit)' : 'പുതിയ ഉൽപ്പന്നം (New Product)'}
                  </h2>
                  <p className="text-xs sm:text-sm text-stone-500 dark:text-stone-400">
                    വിലയും സ്റ്റോക്ക് വിവരങ്ങളും രേഖപ്പെടുത്തുക
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-[#282323] transition-colors cursor-pointer shrink-0"
                  aria-label="Close"
                  title="അടയ്ക്കുക (Close)"
                >
                  <FiX className="w-5 h-5" />
                </button>
              </div>

              {errorMsg && (
                <div className="p-3 mb-4 rounded-xl bg-red-50 dark:bg-red-950/50 text-red-600 dark:text-red-400 text-xs flex items-center gap-2 border border-red-200 dark:border-red-900/60">
                  <FiAlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4 text-xs sm:text-sm">
                <div>
                  <label className="block text-xs sm:text-sm font-bold text-stone-700 dark:text-stone-300 mb-1.5">
                    പേര് (Product Name) *
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. മിക്സ്ചർ (Mixture)"
                    className="google-input"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-xs sm:text-sm font-bold text-stone-700 dark:text-stone-300 mb-1.5">
                      SKU കോഡ്
                    </label>
                    <input
                      type="text"
                      value={sku}
                      onChange={(e) => setSku(e.target.value)}
                      className="google-input font-mono"
                    />
                  </div>

                  <div>
                    <ThemeSelect
                      label="അളവ് യൂണിറ്റ് (Unit)"
                      value={unit}
                      onChange={(val) => setUnit(val as UnitType)}
                      options={[
                        { value: 'kg', label: 'kg (കിലോഗ്രാം)' },
                        { value: 'g', label: 'g (ഗ്രാം)' },
                        { value: 'pkt', label: 'pkt (പാക്കറ്റ്)' },
                        { value: 'pcs', label: 'pcs (എണ്ണം)' },
                        { value: 'box', label: 'box (ബോക്സ്)' },
                      ]}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs sm:text-sm font-bold text-stone-700 dark:text-stone-300 mb-1.5">
                    മൊത്ത വിൽപ്പന വില (Wholesale Price ₹) *
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    required
                    value={wholesalePrice === 0 ? '' : wholesalePrice}
                    onChange={(e) => setWholesalePrice(e.target.value === '' ? '' : parseFloat(e.target.value))}
                    onFocus={(e) => e.target.select()}
                    className="google-input font-mono font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs sm:text-sm font-bold text-stone-700 dark:text-stone-300 mb-1.5">
                    നിലവിലെ ഫിനിഷ്ഡ് സ്റ്റോക്ക് (Current Stock)
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={currentStock === 0 ? '' : currentStock}
                    onChange={(e) => setCurrentStock(e.target.value === '' ? '' : parseFloat(e.target.value))}
                    onFocus={(e) => e.target.select()}
                    className="google-input font-mono font-bold"
                  />
                </div>

                <div className="flex items-center justify-between p-4 rounded-2xl bg-stone-50 dark:bg-[#141212] border border-stone-200 dark:border-[#2E2828]">
                  <div>
                    <span className="font-bold text-sm text-stone-900 dark:text-white">
                      ഉൽപ്പാദനത്തിൽ സജീവം (Active)
                    </span>
                    <p className="text-xs text-stone-400 mt-0.5">
                      അടുക്കളയിൽ തിരഞ്ഞെടുക്കാൻ അനുവദിക്കുക
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={isActive}
                    onClick={() => setIsActive(!isActive)}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-epso-red/30 ${
                      isActive ? 'bg-epso-red dark:bg-amber-500' : 'bg-stone-300 dark:bg-stone-700'
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white dark:bg-stone-900 shadow-md ring-0 transition duration-200 ease-in-out ${
                        isActive ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                <div className="flex items-center justify-end gap-3 pt-3 border-t border-stone-100 dark:border-[#2E2828]">
                  <button
                    type="button"
                    onClick={() => setModalOpen(false)}
                    className="px-5 py-2.5 rounded-xl text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-[#282323] font-bold cursor-pointer"
                  >
                    റദ്ദാക്കുക (Cancel)
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-6 py-2.5 rounded-xl bg-epso-red hover:bg-epso-red-hover dark:bg-amber-500 dark:hover:bg-amber-600 text-white dark:text-stone-950 font-bold shadow-sm press-apple flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {isSubmitting ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white dark:border-stone-950 border-t-transparent rounded-full animate-spin shrink-0" />
                        <span>സൂക്ഷിക്കുന്നു...</span>
                      </>
                    ) : (
                      <span>സൂക്ഷിക്കുക (Save)</span>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ===================================================================== */}
      {/* MODAL 2: Set Ingredients / Recipe for Product                          */}
      {/* ===================================================================== */}
      {recipeModalOpen && recipeProduct && createPortal(
        <div className="fixed inset-0 z-[9999] overflow-hidden">
          {/* Edge-to-edge backdrop covering entire screen */}
          <div
            className="fixed inset-0 w-full h-full bg-black/65 backdrop-blur-md animate-apple-backdrop"
            onClick={() => !isSavingRecipe && setRecipeModalOpen(false)}
          />

          <div className="fixed inset-0 flex items-center justify-center p-3 sm:p-5 relative z-10 pointer-events-none">
            <div className="w-full md:w-[80vw] md:max-w-5xl max-h-[92vh] flex flex-col bg-white dark:bg-[#1E1B1B] rounded-3xl border border-stone-200 dark:border-[#2E2828] shadow-apple-modal animate-apple-modal pointer-events-auto overflow-hidden google-modal">
              {/* Pinned Modal Header */}
              <div className="flex items-center justify-between p-5 pb-3 border-b border-stone-200 dark:border-[#2E2828] shrink-0">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="p-2 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
                      <FiBookOpen className="w-5 h-5" />
                    </span>
                    <h2 className="text-lg font-bold text-stone-900 dark:text-white">
                      {recipeProduct.name} - ചേരുവകൾ (Recipe Ingredients)
                    </h2>
                  </div>
                  <p className="text-xs text-stone-500 dark:text-stone-400 mt-1">
                    ഈ ഉൽപ്പന്നത്തിനുള്ള അസംസ്കൃത ചേരുവകളുടെ അനുപാതം നൽകുക
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setRecipeModalOpen(false)}
                    className="w-8 h-8 rounded-full flex items-center justify-center text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-[#282323] transition-colors cursor-pointer"
                  >
                    <FiX className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {recipeError && (
                <div className="mx-5 mt-3 p-3 rounded-xl bg-red-50 dark:bg-red-950/50 text-red-600 dark:text-red-400 text-xs flex items-center gap-2 border border-red-200 dark:border-red-900/60 shrink-0">
                  <FiAlertCircle className="w-4 h-4 shrink-0" />
                  <span>{recipeError}</span>
                </div>
              )}

              {/* Scrollable Form Body */}
              <form onSubmit={handleSaveRecipeSubmit} id="recipeForm" className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
                {/* STEP 1: Ingredients List & Base Batch Output */}
                {recipeModalStep === 1 && (
                  <div className="space-y-4">
                    {/* Base Batch Output */}
                    <div className="p-4 rounded-2xl bg-stone-50 dark:bg-[#141212] border border-stone-200 dark:border-[#282323] grid grid-cols-2 gap-4">
                      <div>
                        <label className="block font-bold text-stone-700 dark:text-stone-300 mb-1">
                          ഒരു ബാച്ചിലെ ഉൽപ്പാദനം (Base Output Quantity) *
                        </label>
                        <input
                          type="number"
                          step="0.1"
                          min="0.1"
                          required
                          value={recipeBaseQuantity}
                          onChange={(e) => setRecipeBaseQuantity(e.target.value)}
                          className="w-full p-2.5 rounded-xl border border-stone-200 dark:border-[#2E2828] bg-white dark:bg-[#1E1B1B] text-stone-900 dark:text-white font-bold outline-none"
                          placeholder="e.g. 10"
                        />
                      </div>

                      <div>
                        <ThemeSelect
                          label="യൂണിറ്റ് (Unit)"
                          value={recipeBaseUnit}
                          onChange={(val) => setRecipeBaseUnit(val)}
                          options={[
                            { value: 'kg', label: 'kg (കിലോഗ്രാം)' },
                            { value: 'pkt', label: 'pkt (പാക്കറ്റ്)' },
                            { value: 'pcs', label: 'pcs (എണ്ണം)' },
                          ]}
                        />
                      </div>
                    </div>

                    {/* Recipe Ingredients Rows */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="font-bold text-stone-700 dark:text-stone-300">
                          ചേരുവകൾ (Ingredients List) *
                        </label>
                        <button
                          type="button"
                          onClick={handleAddRecipeItem}
                          className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-stone-950 font-bold text-xs flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                        >
                          <FiPlus className="w-3.5 h-3.5" />
                          <span>ചേരുവ ചേർക്കുക</span>
                        </button>
                      </div>

                      {/* Scrollable container for ingredients list */}
                      <div className="space-y-2 max-h-[48vh] overflow-y-auto pr-1.5 p-1 rounded-xl bg-stone-100/50 dark:bg-[#141212]/50 border border-stone-200/60 dark:border-[#282323]">
                        {recipeItems.map((item, idx) => {
                          const ing = ingredients.find((i) => i.id === item.ingredientId);
                          const lineCost = (Number(item.quantity) || 0) * (ing?.avgCostPerUnit || 0);

                          const ingOptions = recipeEligibleIngredients.map((ingItem: Ingredient) => ({
                            value: ingItem.id,
                            label: ingItem.name,
                            badge: `${ingItem.unit} • ₹${ingItem.avgCostPerUnit || 0}/${ingItem.unit}`,
                          }));

                          return (
                            <div
                              key={idx}
                              className="flex items-center gap-2 p-2.5 rounded-xl bg-white dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#282323] shadow-xs"
                            >
                              {/* Ingredient ThemeSelect with search */}
                              <div className="flex-1 min-w-[140px]">
                                <ThemeSelect
                                  value={item.ingredientId}
                                  onChange={(val) => handleRecipeItemChange(idx, 'ingredientId', val)}
                                  options={ingOptions}
                                  searchable={true}
                                  placeholder="ചേരുവ തിരഞ്ഞെടുക്കുക..."
                                />
                              </div>

                              {/* Quantity */}
                              <div className="w-24">
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0.01"
                                  required
                                  value={item.quantity}
                                  onChange={(e) => handleRecipeItemChange(idx, 'quantity', e.target.value)}
                                  className="w-full p-2.5 rounded-xl border border-stone-200 dark:border-[#2E2828] bg-stone-50 dark:bg-[#141212] text-stone-900 dark:text-white text-xs font-bold outline-none text-right"
                                  placeholder="Qty"
                                />
                              </div>

                              {/* Unit Badge */}
                              <div className="w-12 text-center text-xs font-bold text-stone-500">
                                {item.unit}
                              </div>

                              {/* Line Cost */}
                              <div className="w-20 text-right font-bold text-xs text-stone-700 dark:text-stone-300">
                                ₹{lineCost.toFixed(1)}
                              </div>

                              {/* Delete Button */}
                              <button
                                type="button"
                                onClick={() => handleRemoveRecipeItem(idx)}
                                disabled={recipeItems.length <= 1}
                                className="p-1.5 text-stone-400 hover:text-red-600 disabled:opacity-30 transition-colors cursor-pointer"
                              >
                                <FiTrash2 className="w-4 h-4" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

              </form>

              {/* Pinned Modal Footer */}
              <div className="p-4 px-5 border-t border-stone-100 dark:border-[#2E2828] bg-stone-50/80 dark:bg-[#1A1616]/80 backdrop-blur-sm shrink-0 flex items-center justify-between">
                {existingRecipe ? (
                  <button
                    type="button"
                    onClick={handleDeleteRecipe}
                    disabled={isDeletingRecipe}
                    className="px-3 py-2 rounded-xl text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {isDeletingRecipe ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-red-600 border-t-transparent rounded-full animate-spin shrink-0" />
                        <span>ഒഴിവാക്കുന്നു...</span>
                      </>
                    ) : (
                      <span>പാചകക്കുറിപ്പ് ഒഴിവാക്കുക</span>
                    )}
                  </button>
                ) : (
                  <div />
                )}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setRecipeModalOpen(false)}
                    disabled={isSavingRecipe}
                    className="px-4 py-2 rounded-xl text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-[#282323] font-bold cursor-pointer"
                  >
                    റദ്ദാക്കുക (Cancel)
                  </button>
                  <button
                    type="submit"
                    form="recipeForm"
                    disabled={isSavingRecipe}
                    className="px-5 py-2 rounded-xl bg-epso-red hover:bg-epso-red-hover dark:bg-amber-500 dark:hover:bg-amber-600 text-white dark:text-stone-950 font-bold shadow-sm press-apple cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {isSavingRecipe ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-white dark:border-stone-950 border-t-transparent rounded-full animate-spin shrink-0" />
                        <span>സൂക്ഷിക്കുന്നു...</span>
                      </>
                    ) : (
                      <span>പാചകക്കുറിപ്പ് സേവ് ചെയ്യുക</span>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ===================================================================== */}
      {/* MODAL 3: Adjust Product Stock (+ Add, - Reduce, Clear/Delete)          */}
      {/* ===================================================================== */}
      {stockAdjustModalOpen && stockAdjustProduct && createPortal(
        <div className="fixed inset-0 z-[9999] overflow-y-auto">
          <div
            className="fixed inset-0 w-full h-full bg-black/65 backdrop-blur-md animate-apple-backdrop"
            onClick={() => !isAdjustingStock && setStockAdjustModalOpen(false)}
          />

          <div className="min-h-full flex items-center justify-center p-3 sm:p-5 relative z-10 pointer-events-none">
            <div className="w-full max-w-lg bg-white dark:bg-[#1E1B1B] rounded-3xl p-6 sm:p-7 border border-stone-200 dark:border-[#2E2828] shadow-apple-modal animate-apple-modal pointer-events-auto google-modal">
              <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                  <h2 className="text-lg sm:text-xl font-bold text-stone-900 dark:text-white mb-1">
                    സ്റ്റോക്ക് മാറ്റുക (Adjust Stock)
                  </h2>
                  <p className="text-xs text-stone-500 dark:text-stone-400">
                    {stockAdjustProduct.name} • നിലവിലെ സ്റ്റോക്ക്:{' '}
                    <strong className="text-stone-900 dark:text-white font-mono">
                      {stockAdjustProduct.currentStock} {stockAdjustProduct.unit}
                    </strong>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setStockAdjustModalOpen(false)}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-[#282323] transition-colors cursor-pointer shrink-0"
                >
                  <FiX className="w-5 h-5" />
                </button>
              </div>

              {/* Mode Toggle: Add Stock vs Reduce Stock */}
              <div className="grid grid-cols-2 gap-2 p-1 bg-stone-100 dark:bg-[#141212] rounded-2xl mb-4 border border-stone-200 dark:border-[#282323]">
                <button
                  type="button"
                  onClick={() => {
                    setStockAdjustIsAdd(true);
                    setStockAdjustReason('ഉൽപ്പാദനം ചേർത്തത് (Production Stock Inward)');
                  }}
                  className={`py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    stockAdjustIsAdd
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-white'
                  }`}
                >
                  <FiArrowUp className="w-4 h-4" />
                  <span>സ്റ്റോക്ക് കൂട്ടുക (+ Add)</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStockAdjustIsAdd(false);
                    setStockAdjustReason('മാനുവൽ കുറവ് / ഡാമേജ് (Deduction / Spoilage)');
                  }}
                  className={`py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    !stockAdjustIsAdd
                      ? 'bg-amber-600 text-white shadow-sm'
                      : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-white'
                  }`}
                >
                  <FiArrowDown className="w-4 h-4" />
                  <span>സ്റ്റോക്ക് കുറയ്ക്കുക (- Reduce)</span>
                </button>
              </div>

              <form onSubmit={handleStockAdjustSubmit} className="space-y-4 text-xs">
                <div>
                  <label className="block font-bold text-stone-700 dark:text-stone-300 mb-1">
                    {stockAdjustIsAdd ? 'കൂട്ടേണ്ട അളവ് (Quantity to Add) *' : 'കുറയ്ക്കേണ്ട അളവ് (Quantity to Reduce) *'}
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      required
                      value={stockAdjustDelta}
                      onChange={(e) => setStockAdjustDelta(e.target.value)}
                      placeholder="e.g. 10"
                      className="w-full p-3 rounded-xl border border-stone-200 dark:border-[#2E2828] bg-white dark:bg-[#1E1B1B] text-stone-900 dark:text-white font-bold outline-none font-mono text-sm"
                    />
                    <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-stone-400 font-bold">
                      {stockAdjustProduct.unit}
                    </span>
                  </div>
                </div>

                {/* Live Preview Calculation */}
                <div className="p-3 rounded-xl bg-stone-50 dark:bg-[#141212] border border-stone-200/60 dark:border-[#282323] flex items-center justify-between font-mono text-xs">
                  <span className="text-stone-500 dark:text-stone-400 font-sans">പുതിയ സ്റ്റോക്ക് ബാലൻസ് (New Balance):</span>
                  <span className="font-extrabold text-stone-900 dark:text-white">
                    {stockAdjustIsAdd
                      ? (Number(stockAdjustProduct.currentStock) + (Number(stockAdjustDelta) || 0)).toFixed(2)
                      : Math.max(0, Number(stockAdjustProduct.currentStock) - (Number(stockAdjustDelta) || 0)).toFixed(2)}{' '}
                    {stockAdjustProduct.unit}
                  </span>
                </div>

                <div>
                  <label className="block font-bold text-stone-700 dark:text-stone-300 mb-1">
                    കാരണം (Reason) *
                  </label>
                  <input
                    type="text"
                    required
                    value={stockAdjustReason}
                    onChange={(e) => setStockAdjustReason(e.target.value)}
                    placeholder="e.g. ഉൽപ്പാദനം ചേർത്തത്, ഡാമേജ്..."
                    className="w-full p-2.5 rounded-xl border border-stone-200 dark:border-[#2E2828] bg-white dark:bg-[#1E1B1B] text-stone-900 dark:text-white outline-none"
                  />
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {[
                      'ഉൽപ്പാദനം ചേർത്തത് (Production Stock Inward)',
                      'ഡാമേജ് / കേടുപാടുകൾ (Damaged / Spoilage)',
                      'സാമ്പിൾ / നേരിട്ടുള്ള വിതരണം (Samples / Direct Sale)',
                      'സ്റ്റോക്ക് ഓഡിറ്റ് പരിശോധന (Physical Audit Correction)',
                    ].map((reasonStr) => (
                      <button
                        key={reasonStr}
                        type="button"
                        onClick={() => setStockAdjustReason(reasonStr)}
                        className="px-2 py-1 rounded-lg text-[10px] bg-stone-100 hover:bg-stone-200 dark:bg-[#282323] dark:hover:bg-[#322c2c] text-stone-600 dark:text-stone-300 cursor-pointer transition-colors"
                      >
                        {reasonStr.split('(')[0].trim()}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Footer Actions */}
                <div className="pt-3 border-t border-stone-200 dark:border-[#2E2828] flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={handleClearStockToZero}
                    disabled={isAdjustingStock || stockAdjustProduct.currentStock <= 0}
                    className="px-3 py-2.5 rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 hover:bg-red-100 dark:bg-red-950/40 dark:hover:bg-red-950/60 text-red-600 dark:text-red-400 font-bold text-xs transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    title="സ്റ്റോക്ക് പൂർണ്ണമായി ഡിലീറ്റ് ചെയ്യുക (Clear stock to 0)"
                  >
                    സ്റ്റോക്ക് ഡിലീറ്റ് (Clear 0)
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setStockAdjustModalOpen(false)}
                      disabled={isAdjustingStock}
                      className="px-4 py-2.5 rounded-xl border border-stone-200 dark:border-[#2E2828] text-stone-700 dark:text-stone-300 font-bold hover:bg-stone-50 dark:hover:bg-[#282323] transition-colors cursor-pointer"
                    >
                      റദ്ദാക്കുക (Cancel)
                    </button>
                    <button
                      type="submit"
                      disabled={isAdjustingStock}
                      className={`px-5 py-2.5 rounded-xl text-white font-bold transition-all shadow-sm cursor-pointer disabled:opacity-50 ${
                        stockAdjustIsAdd ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-amber-600 hover:bg-amber-700'
                      }`}
                    >
                      {isAdjustingStock ? 'സൂക്ഷിക്കുന്നു...' : 'സൂക്ഷിക്കുക (Save)'}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </div>,
        document.body
      )}

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
