import React, { useState, useEffect } from 'react';
import { Recipe, Product, Ingredient, RecipeItem, PacketType, RecipePacket } from '../types';
import {
  FiPlus,
  FiTrash2,
  FiEdit2,
  FiBookOpen,
  FiDollarSign,
  FiLayers,
  FiPackage,
  FiCheck,
} from 'react-icons/fi';
import { saveRecipe, deleteRecipe, fetchPacketTypes } from '../services/supabase';
import { ThemeSelect } from './ThemeSelect';
import { ManagePacketTypesModal } from './ManagePacketTypesModal';
import { useLockBodyScroll } from '../hooks/useLockBodyScroll';
import { createPortal } from 'react-dom';
import { useFeedback } from '../context/FeedbackContext';

interface RecipesAdminViewProps {
  recipes: Recipe[];
  products: Product[];
  ingredients: Ingredient[];
  onRefresh: () => void;
}

export const RecipesAdminView: React.FC<RecipesAdminViewProps> = ({
  recipes,
  products,
  ingredients,
  onRefresh,
}) => {
  const { showToast, confirm } = useFeedback();
  const [modalOpen, setModalOpen] = useState(false);
  const [managePacketsOpen, setManagePacketsOpen] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState<Recipe | null>(null);

  // Packet types catalogue
  const [availablePacketTypes, setAvailablePacketTypes] = useState<PacketType[]>([]);

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

  useLockBodyScroll(modalOpen || managePacketsOpen);

  // Form states
  const [productId, setProductId] = useState('');
  const [baseOutputQuantity, setBaseOutputQuantity] = useState<number | string>(10);
  const [baseOutputUnit, setBaseOutputUnit] = useState<string>('kg');
  const [instructions, setInstructions] = useState('');
  const [recipeItems, setRecipeItems] = useState<Array<{ ingredientId: string; quantity: number; unit: string }>>([]);
  const [recipePackets, setRecipePackets] = useState<Array<{ packetTypeId?: string; packetName: string; costPerPacket: number; bundleCost?: number; bundleQuantity?: number }>>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const openCreateModal = () => {
    setEditingRecipe(null);
    setProductId(products[0]?.id || '');
    setBaseOutputQuantity(10);
    setBaseOutputUnit('kg');
    setInstructions('');
    setRecipeItems([
      { ingredientId: ingredients[0]?.id || '', quantity: 1, unit: ingredients[0]?.unit || 'kg' },
    ]);
    setRecipePackets([]);
    setModalOpen(true);
  };

  const openEditModal = (r: Recipe) => {
    setEditingRecipe(r);
    setProductId(r.productId);
    setBaseOutputQuantity(r.baseOutputQuantity);
    setBaseOutputUnit(r.baseOutputUnit);
    setInstructions(r.instructions || '');
    setRecipeItems(
      r.items.map((it) => ({
        ingredientId: it.ingredientId,
        quantity: it.quantity,
        unit: it.unit,
      }))
    );
    setRecipePackets(
      (r.packets || []).map((p) => ({
        packetTypeId: p.packetTypeId,
        packetName: p.packetName,
        costPerPacket: p.costPerPacket,
        bundleCost: p.bundleCost,
        bundleQuantity: p.bundleQuantity,
      }))
    );
    setModalOpen(true);
  };

  const handleAddItemRow = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setRecipeItems((prev) => {
      const usedIds = new Set(prev.map((item) => item.ingredientId));
      const nextAvailable = ingredients.find((ing) => !usedIds.has(ing.id)) || ingredients[0];
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

  const handleRemoveItemRow = (idx: number) => {
    setRecipeItems(recipeItems.filter((_, i) => i !== idx));
  };

  const handleItemChange = (idx: number, field: string, value: any) => {
    const updated = [...recipeItems];
    if (field === 'ingredientId') {
      const found = ingredients.find((i) => i.id === value);
      updated[idx] = {
        ...updated[idx],
        ingredientId: value,
        unit: found?.unit || updated[idx].unit,
      };
    } else {
      updated[idx] = { ...updated[idx], [field]: value };
    }
    setRecipeItems(updated);
  };

  // Packet rows handlers
  const handleAddPacketRow = () => {
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

  const handleTogglePacketType = (pt: PacketType) => {
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

  const handleSelectAllPackets = () => {
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

  const handleDeselectAllPackets = () => {
    setRecipePackets([]);
  };

  const handleRemovePacketRow = (idx: number) => {
    setRecipePackets(recipePackets.filter((_, i) => i !== idx));
  };

  const handlePacketSelect = (idx: number, packetTypeId: string) => {
    const found = availablePacketTypes.find((pt) => pt.id === packetTypeId);
    const updated = [...recipePackets];
    updated[idx] = {
      ...updated[idx],
      packetTypeId,
      packetName: found?.name || updated[idx].packetName,
      costPerPacket: found?.costPerPacket ?? updated[idx].costPerPacket,
      bundleCost: found?.bundleCost ?? updated[idx].bundleCost,
      bundleQuantity: found?.bundleQuantity ?? updated[idx].bundleQuantity,
    };
    setRecipePackets(updated);
  };

  const handlePacketChange = (idx: number, field: string, value: any) => {
    const updated = [...recipePackets];
    updated[idx] = { ...updated[idx], [field]: value };
    setRecipePackets(updated);
  };

  const calculateTotalBatchCost = () => {
    return recipeItems.reduce((acc, row) => {
      const ing = ingredients.find((i) => i.id === row.ingredientId);
      const unitCost = ing?.avgCostPerUnit || 0;
      return acc + (row.quantity * unitCost);
    }, 0);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!productId) {
      showToast('ഉൽപ്പന്നം തിരഞ്ഞെടുക്കുക', 'warning');
      return;
    }
    if (recipeItems.length === 0) {
      showToast('കുറഞ്ഞത് ഒരു ചേരുവയെങ്കിലും ചേർക്കുക', 'warning');
      return;
    }

    setIsSubmitting(true);
    try {
      await saveRecipe(
        {
          id: editingRecipe?.id,
          productId,
          baseOutputQuantity: Number(baseOutputQuantity) || 1,
          baseOutputUnit,
          instructions,
        },
        recipeItems.map((item) => ({
          ...item,
          quantity: Number(item.quantity) || 0,
        })),
        recipePackets
      );
      showToast('പാചകക്കുറിപ്പ് വിജയകരമായി സൂക്ഷിച്ചു', 'success');
      setModalOpen(false);
      onRefresh();
    } catch (err: any) {
      showToast(`പാചകക്കുറിപ്പ് സംരക്ഷിക്കുന്നതിൽ പിഴവ്: ${err?.message || 'Error saving recipe'}`, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (r: Recipe) => {
    const confirmed = await confirm({
      title: 'പാചകക്കുറിപ്പ് നീക്കം ചെയ്യണോ?',
      message: `"${r.productName}" ന്റെ പാചകക്കുറിപ്പ് നീക്കം ചെയ്യണോ? ഈ പ്രവർത്തനം പഴയപടിയാക്കാൻ കഴിയില്ല.`,
      confirmLabel: 'ഡിലീറ്റ് ചെയ്യുക',
      cancelLabel: 'റദ്ദാക്കുക',
      isDestructive: true,
    });
    if (!confirmed) return;

    try {
      await deleteRecipe(r.id);
      showToast('പാചകക്കുറിപ്പ് വിജയകരമായി നീക്കം ചെയ്തു', 'success');
      onRefresh();
    } catch (err: any) {
      showToast(`ഡിലീറ്റ് പരാജയപ്പെട്ടു: ${err?.message || 'Error deleting recipe'}`, 'error');
    }
  };

  return (
    <div className="space-y-6">
      {/* Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-end gap-3 pb-2 border-b border-stone-200 dark:border-[#2E2828]">
        <button
          type="button"
          onClick={() => setManagePacketsOpen(true)}
          className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-orange-50 hover:bg-orange-100 dark:bg-orange-950/40 dark:hover:bg-orange-900/50 text-epso-orange border border-orange-200 dark:border-orange-800/60 font-bold text-xs shadow-xs press-apple transition-colors font-malayalam cursor-pointer"
        >
          <FiPackage className="w-4 h-4" />
          <span>പാക്കറ്റ് തരങ്ങളും ചിലവും (Packet Types & Costs)</span>
        </button>

        <button
          type="button"
          onClick={openCreateModal}
          className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-epso-red hover:bg-epso-red-hover dark:bg-amber-500 dark:hover:bg-amber-600 text-white dark:text-stone-950 font-bold text-xs shadow-sm press-apple transition-colors cursor-pointer"
        >
          <FiPlus className="w-4 h-4" />
          <span>New Recipe</span>
        </button>
      </div>

      {/* Recipes Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {recipes.map((r) => {
          const batchCost = r.items.reduce((acc, it) => acc + (it.cost || 0), 0);
          const costPerUnit = r.baseOutputQuantity > 0 ? batchCost / r.baseOutputQuantity : 0;

          return (
            <div
              key={r.id}
              className="p-5 rounded-2xl bg-white dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#2E2828] shadow-apple-card dark:shadow-apple-card-dark flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div>
                    <h3 className="text-base font-bold text-stone-900 dark:text-white font-malayalam">
                      {r.productName}
                    </h3>
                    <span className="text-xs text-stone-500 dark:text-stone-400 font-malayalam">
                      ബാച്ച് ഔട്ട്പുട്ട്: {r.baseOutputQuantity} {r.baseOutputUnit}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-bold text-stone-900 dark:text-white flex items-center justify-end">
                      ₹{batchCost.toFixed(1)} / ബാച്ച്
                    </span>
                    <span className="text-[10px] text-stone-400 dark:text-stone-500 block">
                      (₹{costPerUnit.toFixed(1)} / {r.baseOutputUnit})
                    </span>
                  </div>
                </div>

                {/* Items List */}
                <div className="p-3 bg-stone-50 dark:bg-[#141212] rounded-xl border border-stone-100 dark:border-[#282323] my-3">
                  <span className="text-[11px] font-bold text-stone-500 dark:text-stone-400 font-malayalam block mb-1.5">
                    ചേരുവകൾ ({r.items.length} എണ്ണം):
                  </span>
                  <div className="space-y-1 text-xs divide-y divide-stone-200/50 dark:divide-[#282323]/50">
                    {r.items.map((it) => (
                      <div key={it.id} className="flex items-center justify-between py-1">
                        <span className="text-stone-800 dark:text-stone-200 font-malayalam">
                          {it.ingredientName}
                        </span>
                        <span className="font-mono font-semibold text-stone-600 dark:text-stone-400">
                          {it.quantity} {it.unit}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Assigned Packets List */}
                {r.packets && r.packets.length > 0 && (
                  <div className="p-3 bg-orange-50/50 dark:bg-orange-950/20 rounded-xl border border-orange-200/60 dark:border-orange-900/40 my-3">
                    <span className="text-[11px] font-bold text-epso-orange dark:text-amber-400 font-malayalam flex items-center gap-1.5 mb-1.5">
                      <FiPackage className="w-3.5 h-3.5" />
                      <span>പാക്കറ്റുകൾ ({r.packets.length} എണ്ണം):</span>
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {r.packets.map((pkt, pIdx) => (
                        <span
                          key={pIdx}
                          className="inline-flex items-center gap-1.5 bg-white dark:bg-[#141212] border border-orange-200/80 dark:border-orange-900/50 px-2.5 py-1 rounded-lg text-xs font-semibold text-stone-800 dark:text-stone-200 shadow-2xs"
                        >
                          <span className="font-bold">{pkt.packetName}</span>
                          <span className="text-epso-red dark:text-amber-400 font-mono font-black">
                            ₹{Number(pkt.costPerPacket || 0).toFixed(2)}
                          </span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {r.instructions && (
                  <p className="text-xs text-stone-500 dark:text-stone-400 italic font-malayalam mb-3">
                    നിർദ്ദേശങ്ങൾ: {r.instructions}
                  </p>
                )}
              </div>

              {/* Action buttons */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-stone-100 dark:border-[#282323]">
                <button
                  onClick={() => openEditModal(r)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-stone-100 dark:bg-[#282323] text-stone-700 dark:text-stone-300 text-xs font-bold font-malayalam hover:bg-stone-200 transition-colors"
                >
                  <FiEdit2 className="w-3.5 h-3.5" />
                  <span>തിരുത്തുക (Edit)</span>
                </button>
                <button
                  onClick={() => handleDelete(r)}
                  className="p-1.5 rounded-xl text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
                  title="ഡിലീറ്റ് ചെയ്യുക"
                >
                  <FiTrash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {recipes.length === 0 && (
        <div className="py-12 text-center text-xs text-stone-400 dark:text-stone-500 font-malayalam">
          പാചകക്കുറിപ്പുകൾ ചേർത്തിട്ടില്ല (No recipes found)
        </div>
      )}

      {/* Modal: Create/Edit Recipe */}
      {modalOpen && createPortal(
        <div className="fixed inset-0 z-[9999] overflow-hidden">
          {/* Edge-to-edge backdrop covering entire screen */}
          <div
            className="fixed inset-0 w-full h-full bg-black/65 backdrop-blur-md animate-apple-backdrop"
            onClick={() => !isSubmitting && setModalOpen(false)}
          />

          <div className="fixed inset-0 flex items-center justify-center p-3 sm:p-5 relative z-10 pointer-events-none">
            <div className="w-full max-w-4xl max-h-[90vh] flex flex-col bg-white dark:bg-[#1E1B1B] rounded-3xl border border-stone-200 dark:border-[#2E2828] shadow-apple-modal animate-apple-modal google-modal pointer-events-auto overflow-hidden">
              <div className="p-5 pb-3 border-b border-stone-200 dark:border-[#2E2828] shrink-0">
                <h2 className="text-xl font-bold text-stone-900 dark:text-white font-malayalam mb-1">
                  {editingRecipe ? 'പാചകക്കുറിപ്പ് തിരുത്തുക (Edit)' : 'പുതിയ പാചകക്കുറിപ്പ് (New Recipe)'}
                </h2>
                <p className="text-xs text-stone-500 dark:text-stone-400 font-malayalam">
                  ഉൽപ്പന്നവും ചേരുവകളുടെ കൃത്യമായ അനുപാതവും
                </p>
              </div>

              <form onSubmit={handleSubmit} id="recipesAdminForm" className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
                <div>
                  <ThemeSelect
                    label="സ്നാക്ക് ഉൽപ്പന്നം (Product) *"
                    value={productId}
                    onChange={(val) => setProductId(val)}
                    options={products.map((p) => ({
                      value: p.id,
                      label: `${p.name} (${p.unit})`,
                    }))}
                    searchable={true}
                    placeholder="ഉൽപ്പന്നം തിരഞ്ഞെടുക്കുക..."
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-stone-700 dark:text-stone-300 font-malayalam mb-1">
                      ഔട്ട്പുട്ട് അളവ് (Base Output Qty)
                    </label>
                    <input
                      type="number"
                      step="any"
                      min="0.1"
                      required
                      value={baseOutputQuantity}
                      onChange={(e) => setBaseOutputQuantity(e.target.value === '' ? '' : parseFloat(e.target.value))}
                      onFocus={(e) => e.target.select()}
                      className="w-full google-input font-bold text-sm"
                    />
                  </div>

                  <div>
                    <ThemeSelect
                      label="ഔട്ട്പുട്ട് യൂണിറ്റ് (Unit)"
                      value={baseOutputUnit}
                      onChange={(val) => setBaseOutputUnit(val)}
                      options={[
                        { value: 'kg', label: 'kg (കിലോഗ്രാം)' },
                        { value: 'packs', label: 'packs (പാക്കറ്റുകൾ)' },
                        { value: 'pcs', label: 'pcs (എണ്ണം)' },
                        { value: 'g', label: 'g (ഗ്രാം)' },
                        { value: 'L', label: 'L (ലിറ്റർ)' },
                      ]}
                    />
                  </div>
                </div>

                {/* Recipe Items Section */}
                <div className="p-3.5 rounded-2xl bg-stone-50 dark:bg-[#141212] border border-stone-200 dark:border-[#2E2828] space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-stone-900 dark:text-white font-malayalam">
                      ചേരുവകളുടെ ലിസ്റ്റ് (Ingredients) *
                    </span>
                    <button
                      type="button"
                      onClick={handleAddItemRow}
                      className="flex items-center gap-1 text-[11px] text-epso-red dark:text-amber-400 font-bold hover:underline cursor-pointer"
                    >
                      <FiPlus className="w-3.5 h-3.5" />
                      <span>ചേരുവ ചേർക്കുക</span>
                    </button>
                  </div>

                  {/* Scrollable ingredients container - does NOT expand modal height */}
                  <div className="space-y-2 max-h-[36vh] sm:max-h-[40vh] overflow-y-auto pr-1.5 p-1 rounded-xl bg-white/60 dark:bg-[#1E1B1B]/60 border border-stone-200/60 dark:border-[#282323]">
                    {recipeItems.map((item, idx) => {
                      const ingOptions = ingredients.map((ing) => ({
                        value: ing.id,
                        label: ing.name,
                        badge: `${ing.unit} • ₹${ing.avgCostPerUnit || 0}/${ing.unit}`,
                      }));

                      return (
                        <div key={idx} className="flex items-center gap-2 p-2 rounded-xl bg-stone-50 dark:bg-[#141212] border border-stone-200 dark:border-[#282323]">
                          <div className="flex-1 min-w-[140px]">
                            <ThemeSelect
                              value={item.ingredientId}
                              onChange={(val) => handleItemChange(idx, 'ingredientId', val)}
                              options={ingOptions}
                              searchable={true}
                              placeholder="ചേരുവ തിരഞ്ഞെടുക്കുക..."
                            />
                          </div>

                          <input
                            type="number"
                            step="any"
                            min="0.001"
                            placeholder="അളവ്"
                            value={item.quantity === 0 ? '' : item.quantity}
                            onChange={(e) => handleItemChange(idx, 'quantity', e.target.value === '' ? 0 : parseFloat(e.target.value))}
                            onFocus={(e) => e.target.select()}
                            className="w-20 p-2.5 rounded-xl border border-stone-200 dark:border-[#2E2828] bg-white dark:bg-[#1E1B1B] text-stone-900 dark:text-white text-xs font-mono focus:outline-none"
                          />

                          <span className="text-stone-400 text-xs w-8 text-center">{item.unit}</span>

                          {recipeItems.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveItemRow(idx)}
                              className="p-1 text-red-500 hover:text-red-700 cursor-pointer"
                            >
                              <FiTrash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Real-time batch cost estimate */}
                  <div className="mt-2 pt-2 border-t border-stone-200 dark:border-[#2E2828] flex items-center justify-between text-xs">
                    <span className="text-stone-500 dark:text-stone-400 font-malayalam">
                      ഏകദേശ ബാച്ച് ചേരുവ ചിലവ് (Est. Ingredients Cost):
                    </span>
                    <span className="font-extrabold text-stone-900 dark:text-white">
                      ₹{calculateTotalBatchCost().toFixed(2)}
                    </span>
                  </div>
                </div>

                {/* Universal Packets Notice (Not fixed to recipe) */}
                <div className="p-3.5 rounded-2xl bg-amber-500/10 dark:bg-amber-950/20 border border-amber-500/20 text-xs">
                  <div className="flex items-center gap-2">
                    <FiPackage className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                    <span className="font-bold text-stone-900 dark:text-white font-malayalam">
                      പാക്കറ്റുകൾ (Universal Packets)
                    </span>
                  </div>
                  <p className="text-[11px] text-stone-600 dark:text-stone-300 font-malayalam mt-1">
                    പാക്കറ്റുകൾ റെസിപ്പിയിൽ ഫിക്സ് ചെയ്ത് വെക്കേണ്ടതില്ല. പ്രൊഡക്ഷൻ സമയത്ത് കുക്കിന് കാറ്റലോഗിലെ ഏത് പാക്കറ്റും അളവുകൾക്കനുസരിച്ച് തിരഞ്ഞെടുക്കാം.
                  </p>
                </div>

                <div>
                  <label className="block font-bold text-stone-700 dark:text-stone-300 font-malayalam mb-1">
                    നിർമ്മാണ നിർദ്ദേശങ്ങൾ (Instructions)
                  </label>
                  <textarea
                    rows={2}
                    value={instructions}
                    onChange={(e) => setInstructions(e.target.value)}
                    placeholder="ഉദാ: ചേരുവകൾ കൃത്യമായി ഇളക്കി ചേർക്കുക..."
                    className="w-full p-2.5 rounded-xl border border-stone-200 dark:border-[#2E2828] bg-stone-50 dark:bg-[#141212] text-stone-900 dark:text-white focus:outline-none font-malayalam"
                  />
                </div>
              </form>

              {/* Pinned Footer */}
              <div className="p-4 px-5 border-t border-stone-100 dark:border-[#2E2828] bg-stone-50/80 dark:bg-[#1A1616]/80 backdrop-blur-sm shrink-0 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-[#282323] font-bold font-malayalam cursor-pointer"
                >
                  റദ്ദാക്കുക (Cancel)
                </button>
                <button
                  type="submit"
                  form="recipesAdminForm"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-xl bg-epso-red hover:bg-epso-red-hover dark:bg-amber-500 dark:hover:bg-amber-600 text-white dark:text-stone-950 font-bold shadow-sm press-apple font-malayalam cursor-pointer"
                >
                  {isSubmitting ? 'സൂക്ഷിക്കുന്നു...' : 'സൂക്ഷിക്കുക (Save)'}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Packet Types Management Modal */}
      <ManagePacketTypesModal
        isOpen={managePacketsOpen}
        onClose={() => setManagePacketsOpen(false)}
        onUpdated={() => {
          loadPacketCatalog();
          onRefresh();
        }}
      />
    </div>
  );
};
