import React, { useState, useEffect } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Ingredient } from '../../types';
import { useApp } from '../../context/AppContext';
import { useLanguage } from '../../context/LanguageContext';
import { TbAlertTriangle, TbMinus, TbPlus } from 'react-icons/tb';

interface StockAdjustmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  ingredients: Ingredient[];
  preselectedIngredientId?: string;
  defaultAction?: 'usage' | 'wastage' | 'correction';
  onSuccess: () => void;
}

export const StockAdjustmentModal: React.FC<StockAdjustmentModalProps> = ({
  isOpen,
  onClose,
  ingredients,
  preselectedIngredientId,
  defaultAction = 'usage',
  onSuccess,
}) => {
  const { repo, role, staffName, addToast } = useApp();
  const { language } = useLanguage();

  const [selectedId, setSelectedId] = useState<string>('');
  // Explicit direction: true for deduct (-), false for add (+)
  const [isDeduct, setIsDeduct] = useState<boolean>(true);
  const [actionCategory, setActionCategory] = useState<'usage' | 'wastage' | 'correction'>('usage');
  const [quantity, setQuantity] = useState<number | string>(1);
  const [reason, setReason] = useState<string>('');
  const [customNotes, setCustomNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (defaultAction === 'correction') {
      setActionCategory('correction');
      setIsDeduct(true);
    } else if (defaultAction === 'wastage') {
      setActionCategory('wastage');
      setIsDeduct(true);
    } else {
      setActionCategory('usage');
      setIsDeduct(true);
    }
  }, [defaultAction, isOpen]);

  useEffect(() => {
    if (preselectedIngredientId) {
      setSelectedId(preselectedIngredientId);
    } else if (ingredients.length > 0 && !selectedId) {
      setSelectedId(ingredients[0].id);
    }
  }, [preselectedIngredientId, ingredients, isOpen]);

  const selectedIngredient = ingredients.find((i) => i.id === selectedId);
  const currentStock = selectedIngredient ? selectedIngredient.currentStock : 0;
  const isOutOfStock = currentStock <= 0;
  const isExcessiveDeduction = isDeduct && Number(quantity) > currentStock;
  const projectedBalance = isDeduct
    ? Number((currentStock - (Number(quantity) || 0)).toFixed(3))
    : Number((currentStock + (Number(quantity) || 0)).toFixed(3));

  const reasonPresets = {
    deduct: [
      language === 'ml' ? 'ഉൽപ്പാദന ആവശ്യങ്ങൾ' : 'Production / Kitchen Usage',
      language === 'ml' ? 'കേടുപാടുകൾ / വേസ്റ്റേജ്' : 'Damaged / Spoiled Material',
      language === 'ml' ? 'ഈർപ്പം / പൂപ്പൽ കേടുപാട്' : 'Moisture / Storage Damage',
      language === 'ml' ? 'ഭൗതിക സ്റ്റോക്ക് കുറവ് തിരുത്തൽ' : 'Physical Stock Audit Shortage',
      language === 'ml' ? 'സാമ്പിൾ അല്ലെങ്കിൽ ലാബ് ടെസ്റ്റിംഗ്' : 'Lab / Tasting Sample',
    ],
    add: [
      language === 'ml' ? 'പുതിയ പർച്ചേസ് ഇൻവാർഡ്' : 'New Purchase Inward',
      language === 'ml' ? 'ഓഡിറ്റ് അധികം തിരുത്തൽ' : 'Physical Stock Audit Excess',
      language === 'ml' ? 'മറ്റ് ഇൻവാർഡ് ബാലൻസ്' : 'Direct Stock Inward',
    ],
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedIngredient) return;

    if (Number(quantity) <= 0) {
      addToast(
        language === 'ml' ? 'ശരിയായ അളവ് നൽകുക (പൂജ്യത്തിൽ കൂടുതൽ)' : 'Quantity must be greater than zero',
        'error'
      );
      return;
    }

    // Critical check: if stock is 0 and trying to deduct, block with Malayalam warning
    if (isDeduct && isOutOfStock) {
      addToast(
        language === 'ml'
          ? 'മുന്നറിയിപ്പ്: സ്റ്റോക്ക് 0 ആണ്! നെഗറ്റീവ് ആകാൻ കഴിയില്ല.'
          : 'Warning: Current stock is 0! Stock cannot be negative.',
        'error'
      );
      return;
    }

    const qtyNum = Number(quantity) || 0;
    if (qtyNum <= 0) {
      addToast(
        language === 'ml' ? 'ദയവായി സാധുവായ അളവ് നൽകുക' : 'Please enter a valid quantity',
        'error'
      );
      return;
    }

    // Critical check: cannot deduct more than current stock
    if (isDeduct && qtyNum > currentStock) {
      addToast(
        language === 'ml'
          ? `മുന്നറിയിപ്പ്: നിലവിലെ സ്റ്റോക്കിൽ (${currentStock} ${selectedIngredient.unit}) കൂടുതൽ കുറയ്ക്കാൻ കഴിയില്ല.`
          : `Warning: Cannot deduct more than available balance (${currentStock} ${selectedIngredient.unit}).`,
        'error'
      );
      return;
    }

    const defaultReason = isDeduct ? reasonPresets.deduct[0] : reasonPresets.add[0];
    const fullReason = `${reason || defaultReason}${customNotes.trim() ? ` - ${customNotes.trim()}` : ''}`;

    try {
      setIsSubmitting(true);
      const operator = staffName || (role === 'owner' ? 'Factory Owner' : 'Production Staff');
      // Deduct strictly applies negative delta, Add strictly applies positive delta
      const delta = isDeduct ? -Math.abs(qtyNum) : Math.abs(qtyNum);

      await repo.adjustStock({
        ingredientId: selectedIngredient.id,
        quantityDelta: delta,
        reason: fullReason,
        operatorName: operator,
      });

      addToast(
        language === 'ml'
          ? `${selectedIngredient.name}: ${quantity} ${selectedIngredient.unit} ${isDeduct ? 'കുറച്ചു' : 'കൂട്ടി'}. പുതിയ സ്റ്റോക്ക്: ${Math.max(0, projectedBalance)} ${selectedIngredient.unit}`
          : `${isDeduct ? 'Deducted' : 'Added'} ${quantity} ${selectedIngredient.unit} of ${selectedIngredient.name}. New balance: ${Math.max(0, projectedBalance)} ${selectedIngredient.unit}`,
        'success'
      );
      onSuccess();
      onClose();
    } catch (err: any) {
      addToast(
        err?.message || (language === 'ml' ? 'സ്റ്റോക്ക് മാറ്റം രേഖപ്പെടുത്താൻ കഴിഞ്ഞില്ല' : 'Failed to record adjustment'),
        'error'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        language === 'ml'
          ? isDeduct
            ? 'സ്റ്റോക്ക് കുറയ്ക്കുക'
            : 'സ്റ്റോക്ക് ചേർക്കുക'
          : isDeduct
          ? 'Deduct Material Stock'
          : 'Add Inward Material Stock'
      }
      description={
        language === 'ml'
          ? 'എല്ലാ മാറ്റങ്ങളും ഓഡിറ്റ് സ്റ്റോക്ക് ലെഡ്ജറിൽ കൃത്യമായി രേഖപ്പെടുത്തും.'
          : 'All deductions and additions create an auditable transaction ledger entry.'
      }
      maxWidth="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Ingredient Picker */}
        <Select
          label={language === 'ml' ? 'ചേരുവ തിരഞ്ഞെടുക്കുക' : 'Select Raw Material'}
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          options={ingredients.map((i) => ({
            value: i.id,
            label: `${i.name} (നിലവിൽ: ${i.currentStock} ${i.unit})`,
          }))}
        />

        {/* Direction Toggle: Deduct (-) vs Add (+) */}
        <div>
          <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1.5 font-malayalam">
            {language === 'ml' ? 'മാറ്റത്തിന്റെ സ്വഭാവം' : 'Adjustment Direction'}
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setIsDeduct(true)}
              className={`py-2.5 px-3 rounded-xl font-extrabold text-xs flex items-center justify-center gap-1.5 border transition-all cursor-pointer press-apple ${
                isDeduct
                  ? 'bg-red-600 text-white border-red-600 shadow-sm'
                  : 'bg-stone-50 dark:bg-[#1E1B1B] text-stone-700 dark:text-stone-300 border-charcoal-border dark:border-[#2E2828] hover:bg-stone-100'
              }`}
            >
              <TbMinus className="w-4 h-4 stroke-[3]" />
              <span>{language === 'ml' ? 'കുറയ്ക്കുക' : 'Deduct (Outward)'}</span>
            </button>
            <button
              type="button"
              onClick={() => setIsDeduct(false)}
              className={`py-2.5 px-3 rounded-xl font-extrabold text-xs flex items-center justify-center gap-1.5 border transition-all cursor-pointer press-apple ${
                !isDeduct
                  ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                  : 'bg-stone-50 dark:bg-[#1E1B1B] text-stone-700 dark:text-stone-300 border-charcoal-border dark:border-[#2E2828] hover:bg-stone-100'
              }`}
            >
              <TbPlus className="w-4 h-4 stroke-[3]" />
              <span>{language === 'ml' ? 'കൂട്ടുക' : 'Add (Inward)'}</span>
            </button>
          </div>
        </div>

        {/* Stock Zero Warning Banner in Malayalam */}
        {selectedIngredient && isDeduct && isOutOfStock && (
          <div className="p-3.5 rounded-xl bg-red-100 dark:bg-red-950/60 border border-red-300 dark:border-red-900/60 flex items-start gap-2.5 text-xs text-red-900 dark:text-red-200">
            <TbAlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-extrabold font-malayalam leading-tight">
                {language === 'ml'
                  ? 'മുന്നറിയിപ്പ്: ഈ ചേരുവയുടെ സ്റ്റോക്ക് 0 ആണ്!'
                  : 'Warning: Current stock is 0!'}
              </p>
              <p className="font-medium font-malayalam mt-0.5">
                {language === 'ml'
                  ? 'സ്റ്റോക്ക് പൂജ്യമായതിനാൽ കുറയ്ക്കാൻ സാധ്യമല്ല. സ്റ്റോക്ക് നെഗറ്റീവ് ആകാൻ പാടില്ല.'
                  : 'Cannot deduct because balance is zero. Negative stock is not permitted.'}
              </p>
            </div>
          </div>
        )}

        {/* Excessive Deduction Warning Banner in Malayalam */}
        {selectedIngredient && isDeduct && !isOutOfStock && isExcessiveDeduction && (
          <div className="p-3.5 rounded-xl bg-amber-100 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-900/60 flex items-start gap-2.5 text-xs text-amber-900 dark:text-amber-200">
            <TbAlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-extrabold font-malayalam leading-tight">
                {language === 'ml'
                  ? 'മുന്നറിയിപ്പ്: ലഭ്യമായ സ്റ്റോക്കിൽ കൂടുതൽ കുറയ്ക്കാൻ കഴിയില്ല!'
                  : 'Warning: Cannot deduct more than available balance!'}
              </p>
              <p className="font-medium font-malayalam mt-0.5">
                {language === 'ml'
                  ? `നിലവിലെ സ്റ്റോക്ക് ${currentStock} ${selectedIngredient.unit} ആണ്. നെഗറ്റീവ് സ്റ്റോക്ക് ഒഴിവാക്കാൻ അളവ് കുറയ്ക്കുക.`
                  : `Available stock is ${currentStock} ${selectedIngredient.unit}. Please reduce quantity to avoid negative stock.`}
              </p>
            </div>
          </div>
        )}

        {/* Quantity Input */}
        <div>
          <Input
            label={
              language === 'ml'
                ? isDeduct
                  ? 'കുറയ്ക്കേണ്ട അളവ്'
                  : 'ചേർക്കേണ്ട അളവ്'
                : isDeduct
                ? 'Quantity to Deduct'
                : 'Quantity to Add'
            }
            type="number"
            step="any"
            min="0.001"
            max={isDeduct && selectedIngredient ? selectedIngredient.currentStock : undefined}
            required
            value={quantity === 0 ? '' : quantity}
            onChange={(e) => setQuantity(e.target.value === '' ? '' : parseFloat(e.target.value))}
            rightAddon={selectedIngredient?.unit || 'unit'}
          />
        </div>

        {/* Reason Selector */}
        <Select
          label={language === 'ml' ? 'കാരണം' : 'Reason'}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          options={(isDeduct ? reasonPresets.deduct : reasonPresets.add).map((r) => ({
            value: r,
            label: r,
          }))}
        />

        {/* Custom Notes */}
        <Input
          label={language === 'ml' ? 'കൂടുതൽ വിവരങ്ങൾ' : 'Additional Notes (Optional)'}
          placeholder={
            language === 'ml'
              ? 'ഉദാ: പെട്ടി തകരാർ, ഈർപ്പം തട്ടിയത്...'
              : 'e.g. Bin 2 opened bag, moisture absorption...'
          }
          value={customNotes}
          onChange={(e) => setCustomNotes(e.target.value)}
        />

        {/* Balance Preview */}
        {selectedIngredient && (
          <div className="p-3 bg-stone-50 dark:bg-[#141212] rounded-xl border border-charcoal-border dark:border-[#2E2828] text-xs space-y-1 transition-colors">
            <div className="flex justify-between text-stone-500 dark:text-stone-400">
              <span>{language === 'ml' ? 'നിലവിലെ സ്റ്റോക്ക്:' : 'Current Stock:'}</span>
              <span className="font-bold text-stone-800 dark:text-stone-200">
                {currentStock} {selectedIngredient.unit}
              </span>
            </div>
            <div className="flex justify-between border-t border-charcoal-border/50 dark:border-[#282323] pt-1">
              <span className="font-medium text-charcoal dark:text-stone-300">
                {language === 'ml' ? 'മാറ്റത്തിനു ശേഷമുള്ള സ്റ്റോക്ക്:' : 'Projected Stock Balance:'}
              </span>
              <span
                className={`font-black ${
                  projectedBalance < 0
                    ? 'text-red-600 dark:text-red-400'
                    : 'text-stone-900 dark:text-white'
                }`}
              >
                {Math.max(0, projectedBalance)} {selectedIngredient.unit}
              </span>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center gap-3 pt-3 border-t border-charcoal-border/70">
          <Button type="button" variant="secondary" fullWidth onClick={onClose}>
            {language === 'ml' ? 'റദ്ദാക്കുക' : 'Cancel'}
          </Button>
          <Button
            type="submit"
            variant={isDeduct ? 'danger' : 'primary'}
            fullWidth
            isLoading={isSubmitting}
            disabled={isDeduct && (isOutOfStock || isExcessiveDeduction)}
          >
            {language === 'ml'
              ? isDeduct
                ? 'കുറയ്ക്കുക'
                : 'ചേർക്കുക'
              : isDeduct
              ? 'Record Deduction'
              : 'Record Addition'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
