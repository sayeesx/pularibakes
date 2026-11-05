import React, { useState, useEffect } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Recipe, RecipeIngredient, Ingredient, Product, UnitType, PacketType, RecipePacket } from '../../types';
import { useApp } from '../../context/AppContext';
import { useLanguage } from '../../context/LanguageContext';
import { TbPlus, TbTrash, TbPackage } from 'react-icons/tb';

interface RecipeFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  recipeToEdit?: Recipe | null;
  products: Product[];
  ingredients: Ingredient[];
  preselectedProductId?: string;
  onSuccess: () => void;
}

export const RecipeFormModal: React.FC<RecipeFormModalProps> = ({
  isOpen,
  onClose,
  recipeToEdit,
  products,
  ingredients,
  preselectedProductId,
  onSuccess,
}) => {
  const { repo, addToast } = useApp();
  const { language } = useLanguage();
  const [productId, setProductId] = useState('');
  const [baseOutputQuantity, setBaseOutputQuantity] = useState<number | string>(10);
  const [baseOutputUnit, setBaseOutputUnit] = useState<UnitType>('kg');
  const [notes, setNotes] = useState('');
  const [instructions, setInstructions] = useState('');
  const [recipeIngredients, setRecipeIngredients] = useState<RecipeIngredient[]>([]);
  const [recipePackets, setRecipePackets] = useState<RecipePacket[]>([]);
  const [availablePacketTypes, setAvailablePacketTypes] = useState<PacketType[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    repo.listPacketTypes().then((types) => {
      setAvailablePacketTypes(types || []);
    }).catch(() => {
      setAvailablePacketTypes([]);
    });
  }, [repo]);

  useEffect(() => {
    if (recipeToEdit) {
      setProductId(recipeToEdit.productId);
      setBaseOutputQuantity(recipeToEdit.baseOutputQuantity);
      setBaseOutputUnit(recipeToEdit.baseOutputUnit);
      setNotes(recipeToEdit.notes || '');
      setInstructions(recipeToEdit.instructions || '');
      setRecipeIngredients([...recipeToEdit.ingredients]);
      setRecipePackets(
        (recipeToEdit.packets || []).map((p) => ({
          packetTypeId: p.packetTypeId,
          packetName: p.packetName,
          costPerPacket: p.costPerPacket || 0,
          bundleCost: p.bundleCost,
          bundleQuantity: p.bundleQuantity,
        }))
      );
    } else {
      const initialProductId = preselectedProductId || products[0]?.id || '';
      const prod = products.find((p) => p.id === initialProductId);
      setProductId(initialProductId);
      setBaseOutputQuantity(10);
      setBaseOutputUnit(prod?.unit || 'kg');
      setNotes('');
      setInstructions('');
      setRecipePackets([]);
      setRecipeIngredients(
        ingredients.length > 0
          ? [
              {
                ingredientId: ingredients[0].id,
                ingredientName: ingredients[0].name,
                quantity: 1,
                unit: ingredients[0].unit,
              },
            ]
          : []
      );
    }
  }, [recipeToEdit, products, ingredients, preselectedProductId, isOpen]);

  const handleAddIngredient = () => {
    if (ingredients.length === 0) return;
    const defaultIng = ingredients[0];
    setRecipeIngredients([
      ...recipeIngredients,
      {
        ingredientId: defaultIng.id,
        ingredientName: defaultIng.name,
        quantity: 1,
        unit: defaultIng.unit,
      },
    ]);
  };

  const handleRemoveIngredient = (idx: number) => {
    setRecipeIngredients(recipeIngredients.filter((_, i) => i !== idx));
  };

  const handleIngredientChange = (idx: number, ingredientId: string) => {
    const selected = ingredients.find((i) => i.id === ingredientId);
    if (!selected) return;

    const copy = [...recipeIngredients];
    copy[idx] = {
      ...copy[idx],
      ingredientId: selected.id,
      ingredientName: selected.name,
      unit: selected.unit,
    };
    setRecipeIngredients(copy);
  };

  const handleQuantityChange = (idx: number, qty: number) => {
    const copy = [...recipeIngredients];
    copy[idx] = {
      ...copy[idx],
      quantity: Math.max(0.01, qty),
    };
    setRecipeIngredients(copy);
  };

  // Recipe Packet Rows Handlers
  const handleAddRecipePacketRow = () => {
    const firstPkt = availablePacketTypes[0];
    setRecipePackets([
      ...recipePackets,
      {
        packetTypeId: firstPkt?.id,
        packetName: firstPkt?.name || 'Standard Packet',
        costPerPacket: firstPkt?.costPerPacket || 0,
        bundleCost: firstPkt?.bundleCost || 0,
        bundleQuantity: firstPkt?.bundleQuantity || 100,
      },
    ]);
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

  const handleRecipePacketCostChange = (index: number, cost: number) => {
    const updated = [...recipePackets];
    updated[index] = { ...updated[index], costPerPacket: cost };
    setRecipePackets(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const product = products.find((p) => p.id === productId);
    if (!product) {
      addToast(
        language === 'ml' ? 'ഉൽപ്പന്നം തിരഞ്ഞെടുക്കുക' : 'Please select a valid product',
        'error'
      );
      return;
    }
    if (recipeIngredients.length === 0) {
      addToast(
        language === 'ml' ? 'കുറഞ്ഞത് ഒരു ചേരുവയെങ്കിലും ചേർക്കുക' : 'Recipe must contain at least one ingredient',
        'error'
      );
      return;
    }

    try {
      setIsSubmitting(true);
      if (recipeToEdit) {
        await repo.saveRecipe({
          id: recipeToEdit.id,
          productId: recipeToEdit.productId,
          productName: recipeToEdit.productName,
          version: recipeToEdit.version + 1,
          baseOutputQuantity: Number(baseOutputQuantity) || 1,
          baseOutputUnit,
          ingredients: recipeIngredients,
          packets: [],
          notes: notes.trim() || undefined,
          instructions: instructions.trim() || undefined,
          isActive: true,
        });
        addToast(
          language === 'ml'
            ? `${product.name} റെസിപ്പി വിജയകരമായി അപ്ഡേറ്റ് ചെയ്തു!`
            : `Updated recipe formulation for ${product.name}`,
          'success'
        );
      } else {
        await repo.saveRecipe({
          productId: product.id,
          productName: product.name,
          version: 1,
          baseOutputQuantity: Number(baseOutputQuantity) || 1,
          baseOutputUnit,
          ingredients: recipeIngredients,
          packets: [],
          notes: notes.trim() || undefined,
          instructions: instructions.trim() || undefined,
          isActive: true,
        });
        addToast(
          language === 'ml'
            ? `${product.name} ചേരുവകൾ വിജയകരമായി ക്രമീകരിച്ചു!`
            : `Created new recipe for ${product.name}`,
          'success'
        );
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      addToast(err?.message || (language === 'ml' ? 'റെസിപ്പി സേവ് ചെയ്യാൻ കഴിഞ്ഞില്ല' : 'Failed to save recipe'), 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        recipeToEdit
          ? (language === 'ml' ? `റെസിപ്പി തിരുത്തുക (v${recipeToEdit.version})` : `Edit Recipe (v${recipeToEdit.version})`)
          : (language === 'ml' ? 'റെസിപ്പി ചേരുവകൾ ക്രമീകരിക്കുക' : 'Create Recipe Formulation')
      }
      description={
        language === 'ml'
          ? 'ഉൽപ്പന്ന നിർമ്മാണത്തിന് ആവശ്യമായ ചേരുവകളുടെ കൃത്യമായ അനുപാതം ചേർക്കുക. പ്രൊഡക്ഷൻ സമയത്ത് ഇത് സ്വയം ലോഡ് ആകും.'
          : 'Define the bill of materials (BOM) per standard batch output.'
      }
      maxWidth="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Select
          label={language === 'ml' ? 'ഉൽപ്പന്നം' : 'Product'}
          value={productId}
          disabled={Boolean(recipeToEdit)}
          onChange={(e) => setProductId(e.target.value)}
          options={products.map((p) => ({ value: p.id, label: p.name }))}
        />

        <div className="grid grid-cols-2 gap-3">
          <Input
            label={language === 'ml' ? 'സ്റ്റാൻഡേർഡ് ഉൽപ്പാദന അളവ്' : 'Base Batch Output'}
            type="number"
            step="any"
            min="0.01"
            required
            value={baseOutputQuantity === 0 ? '' : baseOutputQuantity}
            onChange={(e) => setBaseOutputQuantity(e.target.value === '' ? '' : parseFloat(e.target.value))}
          />

          <Select
            label={language === 'ml' ? 'യൂണിറ്റ്' : 'Base Unit'}
            value={baseOutputUnit}
            onChange={(e) => setBaseOutputUnit(e.target.value as UnitType)}
            options={[
              { value: 'kg', label: language === 'ml' ? 'കിലോഗ്രാം' : 'Kilograms' },
              { value: 'packs', label: language === 'ml' ? 'പാക്കറ്റ്' : 'Packs' },
              { value: 'pcs', label: language === 'ml' ? 'എണ്ണം' : 'Pieces' },
              { value: 'g', label: language === 'ml' ? 'ഗ്രാം' : 'Gram' },
              { value: 'L', label: language === 'ml' ? 'ലിറ്റർ' : 'Liter' },
            ]}
          />
        </div>

        {/* Recipe Ingredients dynamic builder */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-extrabold text-stone-900 dark:text-white uppercase tracking-wider">
              {language === 'ml'
                ? `ആവശ്യമായ ചേരുവകൾ (${baseOutputQuantity} ${baseOutputUnit}-ന്)`
                : `Required Ingredients per ${baseOutputQuantity} ${baseOutputUnit}`}
            </label>
            <button
              type="button"
              onClick={handleAddIngredient}
              className="flex items-center gap-1 bg-gradient-to-r from-epso-red to-epso-orange text-white hover:bg-epso-red-hover text-xs font-bold px-3 py-1.5 rounded-xl transition-all active:scale-95 press-apple cursor-pointer shadow-xs"
            >
              <TbPlus className="w-3.5 h-3.5" />
              <span>{language === 'ml' ? '+ ചേരുവ ചേർക്കുക' : 'Add Ingredient'}</span>
            </button>
          </div>

          <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
            {recipeIngredients.map((item, idx) => (
              <div
                key={idx}
                className="flex items-center gap-2 p-2 bg-stone-50 dark:bg-[#141212] rounded-2xl border border-charcoal-border dark:border-[#2E2828] transition-colors"
              >
                <div className="flex-1">
                  <Select
                    value={item.ingredientId}
                    onChange={(e) => handleIngredientChange(idx, e.target.value)}
                    options={ingredients.map((ing) => ({
                      value: ing.id,
                      label: `${ing.name} (${ing.unit})`,
                    }))}
                  />
                </div>

                <div className="w-24">
                  <input
                    type="number"
                    step="any"
                    min="0.001"
                    value={item.quantity === 0 ? '' : item.quantity}
                    onChange={(e) => handleQuantityChange(idx, e.target.value === '' ? 0 : parseFloat(e.target.value))}
                    onFocus={(e) => e.target.select()}
                    className="w-full text-xs font-black bg-white dark:bg-[#1E1B1B] text-stone-900 dark:text-white border border-charcoal-border dark:border-[#2E2828] rounded-xl p-2.5 text-center focus:ring-1 focus:ring-epso-red focus:outline-none min-h-[44px]"
                  />
                </div>

                <span className="text-xs font-bold text-stone-500 dark:text-stone-400 w-8 text-center">
                  {item.unit}
                </span>

                <button
                  type="button"
                  onClick={() => handleRemoveIngredient(idx)}
                  className="p-2 text-stone-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-[#282323] rounded-lg transition-colors press-apple cursor-pointer"
                  title="Remove item"
                >
                  <TbTrash className="w-4 h-4" />
                </button>
              </div>
            ))}

            {recipeIngredients.length === 0 && (
              <div className="text-center py-6 border border-dashed border-charcoal-border dark:border-[#2E2828] rounded-xl text-stone-400 text-xs">
                {language === 'ml'
                  ? 'ചേരുവകൾ ഒന്നും ചേർത്തിട്ടില്ല. മുകളിലെ ബട്ടൺ ഉപയോഗിച്ച് ചേർക്കുക.'
                  : 'No ingredients added. Click Add Ingredient above.'}
              </div>
            )}
          </div>
        </div>

        {/* Recipe Packets Section */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <label className="text-xs font-extrabold text-stone-900 dark:text-white uppercase tracking-wider flex items-center gap-1.5 font-malayalam">
                <TbPackage className="w-4 h-4 text-epso-orange" />
                <span>
                  {language === 'ml'
                    ? `പാക്കറ്റുകൾ (${recipePackets.length} എണ്ണം)`
                    : `Recipe Packets (${recipePackets.length})`}
                </span>
              </label>
              <p className="text-[10px] text-stone-400 font-malayalam">
                {language === 'ml'
                  ? 'പ്രൊഡക്ഷൻ പാക്കിംഗിൽ ഈ ഉൽപ്പന്നത്തിന് ഇവ മാത്രമേ കാണിക്കൂ'
                  : 'Only these packets will be shown in batch packing for this product'}
              </p>
            </div>
            <button
              type="button"
              onClick={handleAddRecipePacketRow}
              className="flex items-center gap-1 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white text-xs font-bold px-3 py-1.5 rounded-xl transition-all active:scale-95 press-apple cursor-pointer shadow-xs"
            >
              <TbPlus className="w-3.5 h-3.5" />
              <span>{language === 'ml' ? '+ പാക്കറ്റ് ചേർക്കുക' : '+ Add Packet'}</span>
            </button>
          </div>

          <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
            {recipePackets.map((pkt, idx) => (
              <div
                key={idx}
                className="flex items-center gap-2 p-2 bg-stone-50 dark:bg-[#141212] rounded-2xl border border-charcoal-border dark:border-[#2E2828] transition-colors"
              >
                <div className="flex-1">
                  <Select
                    value={pkt.packetTypeId || ''}
                    onChange={(e) => handleRecipePacketSelect(idx, e.target.value)}
                    options={
                      availablePacketTypes.length > 0
                        ? availablePacketTypes.map((pt) => ({
                            value: pt.id,
                            label: `${pt.name} (₹${(pt.costPerPacket || 0).toFixed(2)}/pkt)`,
                          }))
                        : [{ value: '', label: pkt.packetName }]
                    }
                  />
                </div>

                <div className="flex items-center gap-1 bg-white dark:bg-[#1E1B1B] px-2.5 py-1.5 rounded-xl border border-charcoal-border dark:border-[#2E2828]">
                  <span className="text-[10px] text-stone-400 font-bold">₹/pkt:</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={pkt.costPerPacket === 0 ? '' : pkt.costPerPacket}
                    onChange={(e) =>
                      handleRecipePacketCostChange(idx, parseFloat(e.target.value) || 0)
                    }
                    className="w-16 p-1 bg-transparent text-stone-900 dark:text-white text-xs font-mono font-bold text-right outline-none"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => handleRemoveRecipePacketRow(idx)}
                  className="p-2 text-stone-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-[#282323] rounded-lg transition-colors press-apple cursor-pointer"
                  title="Remove packet"
                >
                  <TbTrash className="w-4 h-4" />
                </button>
              </div>
            ))}

            {recipePackets.length === 0 && (
              <div className="text-center py-4 border border-dashed border-charcoal-border dark:border-[#2E2828] rounded-xl text-stone-400 text-xs font-malayalam">
                {language === 'ml'
                  ? 'പാക്കറ്റുകൾ നൽകിയിട്ടില്ല. മുകളിലെ ബട്ടൺ ഉപയോഗിച്ച് ചേർക്കുക.'
                  : 'No packets configured. Click + Add Packet above to assign packet types.'}
              </div>
            )}
          </div>
        </div>

        <Input
          label={language === 'ml' ? 'പ്രത്യേക കുറിപ്പുകൾ' : 'Process & Seasoning Notes (Optional)'}
          placeholder={language === 'ml' ? 'ഉദാ: വറുക്കുന്ന താപനില, പ്രത്യേക മസാല അനുപാതം...' : 'e.g. Frying temperature, seasoning ratio'}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />

        <div className="flex items-center gap-3 pt-3 border-t border-charcoal-border/70">
          <Button type="button" variant="secondary" fullWidth onClick={onClose}>
            {language === 'ml' ? 'റദ്ദാക്കുക' : 'Cancel'}
          </Button>
          <Button type="submit" variant="primary" fullWidth isLoading={isSubmitting}>
            {recipeToEdit
              ? (language === 'ml' ? 'സൂക്ഷിക്കുക' : 'Save Changes')
              : (language === 'ml' ? 'റെസിപ്പി സൂക്ഷിക്കുക' : 'Save Recipe')}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
