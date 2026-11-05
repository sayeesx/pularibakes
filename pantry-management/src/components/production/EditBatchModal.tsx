import React, { useState, useEffect } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { ProductionRun, ConsumedIngredientItem } from '../../types';
import { useApp } from '../../context/AppContext';
import { useLanguage } from '../../context/LanguageContext';
import { TbPencil, TbPackage, TbCheck, TbX, TbAlertCircle } from 'react-icons/tb';

interface EditBatchModalProps {
  isOpen: boolean;
  onClose: () => void;
  run: ProductionRun | null;
  onSuccess: (updatedRun: ProductionRun) => void;
}

export const EditBatchModal: React.FC<EditBatchModalProps> = ({
  isOpen,
  onClose,
  run,
  onSuccess,
}) => {
  const { repo, addToast, staffName } = useApp();
  const { language } = useLanguage();

  const [actualQuantity, setActualQuantity] = useState<number>(0);
  const [operatorName, setOperatorName] = useState<string>('');
  const [productionDate, setProductionDate] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [ingredients, setIngredients] = useState<ConsumedIngredientItem[]>([]);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  useEffect(() => {
    if (run) {
      setActualQuantity(run.actualQuantity || 0);
      setOperatorName(run.operatorName || staffName || '');
      setProductionDate(run.productionDate || new Date().toISOString().split('T')[0]);
      setNotes(run.notes || '');
      setIngredients(
        (run.ingredientsConsumed || []).map((ing) => ({
          ...ing,
        }))
      );
    }
  }, [run, staffName, isOpen]);

  if (!run) return null;

  const handleIngredientQuantityChange = (idx: number, newQty: number) => {
    setIngredients((prev) => {
      const copy = [...prev];
      copy[idx] = {
        ...copy[idx],
        actualQuantity: Math.max(0, newQty),
      };
      return copy;
    });
  };

  const handleAdjustQuantity = (delta: number) => {
    setActualQuantity((prev) => Math.max(0.1, Number((prev + delta).toFixed(2))));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (actualQuantity <= 0) {
      addToast(
        language === 'ml'
          ? 'സാധുവായ അളവ് നൽകുക'
          : 'Please enter a valid output quantity',
        'warning'
      );
      return;
    }

    try {
      setIsSubmitting(true);
      const updated = await repo.updateProductionRun({
        runId: run.id,
        actualQuantity,
        plannedQuantity: run.plannedQuantity,
        productionDate,
        operatorName: operatorName.trim() || staffName || 'Kitchen Staff',
        notes: notes.trim() || undefined,
        ingredientsConsumed: ingredients.map((i) => ({
          ingredientId: i.ingredientId,
          expectedQuantity: i.expectedQuantity,
          actualQuantity: i.actualQuantity,
          unit: i.unit,
          unitCost: i.unitCost,
          totalCost: (i.unitCost || 0) * i.actualQuantity,
        })),
      });

      addToast(
        language === 'ml'
          ? `ബാച്ച് #${run.runNumber} വിവരങ്ങൾ വിജയകരമായി മാറ്റി`
          : `Batch #${run.runNumber} updated successfully`,
        'success'
      );

      onSuccess(updated);
      onClose();
    } catch (err: any) {
      console.error('Failed to update batch', err);
      addToast(err?.message || 'Failed to update batch', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2.5">
          <span className="p-2.5 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
            <TbPencil className="w-5 h-5 stroke-[2.5]" />
          </span>
          <div>
            <h2 className="text-base sm:text-lg font-black text-stone-900 dark:text-white leading-tight font-malayalam">
              {language === 'ml' ? 'ബാച്ച് തിരുത്തുക' : 'Edit Batch'}
            </h2>
            <p className="text-xs text-stone-500 dark:text-stone-400 font-medium font-malayalam">
              {run.productName}
            </p>
          </div>
        </div>
      }
      description={
        language === 'ml'
          ? 'ബാച്ചിന്റെ അളവോ ചേരുവകളോ മാറ്റുമ്പോൾ സ്റ്റോക്കും കണക്കുകളും സ്വയമേവ ക്രമീകരിക്കപ്പെടും.'
          : 'Modifying batch output or consumed ingredients will automatically adjust inventory balances.'
      }
      maxWidth="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Output Quantity with quick step adjustments */}
        <div className="p-3.5 bg-stone-50 dark:bg-[#141212] rounded-2xl border border-charcoal-border dark:border-[#2E2828] space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-black text-stone-900 dark:text-white uppercase tracking-wider font-malayalam">
              {language === 'ml' ? 'ഉൽപ്പാദന അളവ്' : 'Output Quantity'} ({run.unit})
            </label>
            <span className="text-xs text-stone-400 font-mono">
              Orig: {run.actualQuantity} {run.unit}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => handleAdjustQuantity(-5)}
                className="px-2.5 py-2 rounded-xl bg-stone-200 dark:bg-[#252020] hover:bg-stone-300 dark:hover:bg-[#2c2626] text-stone-800 dark:text-stone-200 text-xs font-black transition-all press-apple cursor-pointer"
              >
                -5
              </button>
              <button
                type="button"
                onClick={() => handleAdjustQuantity(-1)}
                className="px-2.5 py-2 rounded-xl bg-stone-200 dark:bg-[#252020] hover:bg-stone-300 dark:hover:bg-[#2c2626] text-stone-800 dark:text-stone-200 text-xs font-black transition-all press-apple cursor-pointer"
              >
                -1
              </button>
            </div>

            <div className="flex-1">
              <input
                type="number"
                step="any"
                min="0.01"
                required
                value={actualQuantity === 0 ? '' : actualQuantity}
                onChange={(e) => setActualQuantity(parseFloat(e.target.value) || 0)}
                className="w-full text-center text-lg font-black bg-white dark:bg-[#1E1B1B] text-stone-900 dark:text-white border border-charcoal-border dark:border-[#2E2828] rounded-xl py-2 px-3 focus:ring-2 focus:ring-epso-red focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => handleAdjustQuantity(+1)}
                className="px-2.5 py-2 rounded-xl bg-stone-200 dark:bg-[#252020] hover:bg-stone-300 dark:hover:bg-[#2c2626] text-stone-800 dark:text-stone-200 text-xs font-black transition-all press-apple cursor-pointer"
              >
                +1
              </button>
              <button
                type="button"
                onClick={() => handleAdjustQuantity(+5)}
                className="px-2.5 py-2 rounded-xl bg-stone-200 dark:bg-[#252020] hover:bg-stone-300 dark:hover:bg-[#2c2626] text-stone-800 dark:text-stone-200 text-xs font-black transition-all press-apple cursor-pointer"
              >
                +5
              </button>
            </div>
          </div>
        </div>

        {/* Date and Operator row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input
            label={language === 'ml' ? 'പ്രൊഡക്ഷൻ തീയതി' : 'Production Date'}
            type="date"
            required
            value={productionDate}
            onChange={(e) => setProductionDate(e.target.value)}
          />

          <Input
            label={language === 'ml' ? 'ഓപ്പറേറ്റർ പേര്' : 'Operator Name'}
            type="text"
            required
            value={operatorName}
            onChange={(e) => setOperatorName(e.target.value)}
            placeholder="Staff Name"
          />
        </div>

        {/* Notes */}
        <Input
          label={language === 'ml' ? 'കുറിപ്പ്' : 'Batch Notes (Optional)'}
          placeholder={language === 'ml' ? 'ഉദാ: വേവിച്ചതിൽ വന്ന മാറ്റങ്ങൾ...' : 'e.g. Changes made, consistency notes...'}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />

        {/* Consumed Ingredients Adjustment Section */}
        {ingredients.length > 0 && (
          <div className="space-y-2 pt-1">
            <label className="text-xs font-black text-stone-900 dark:text-white uppercase tracking-wider font-malayalam block">
              {language === 'ml' ? 'ഉപയോഗിച്ച ചേരുവകൾ' : 'Ingredients Consumed'}
            </label>

            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {ingredients.map((ing, idx) => (
                <div
                  key={ing.ingredientId || idx}
                  className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-stone-50 dark:bg-[#141212] border border-charcoal-border dark:border-[#2E2828] text-xs"
                >
                  <div className="flex-1 min-w-0">
                    <span className="font-extrabold text-stone-900 dark:text-white block truncate font-malayalam">
                      {ing.ingredientName}
                    </span>
                    <span className="text-[10px] text-stone-400 font-mono">
                      Expected: {ing.expectedQuantity} {ing.unit}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={ing.actualQuantity === 0 ? '' : ing.actualQuantity}
                      onChange={(e) =>
                        handleIngredientQuantityChange(idx, parseFloat(e.target.value) || 0)
                      }
                      className="w-20 text-center font-bold font-mono bg-white dark:bg-[#1E1B1B] text-stone-900 dark:text-white border border-charcoal-border dark:border-[#2E2828] rounded-lg py-1 px-2 focus:ring-1 focus:ring-epso-red focus:outline-none"
                    />
                    <span className="text-stone-500 font-semibold text-[11px] w-6">
                      {ing.unit}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-charcoal-border/50 dark:border-[#2E2828]/50">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={isSubmitting}
          >
            {language === 'ml' ? 'റദ്ദാക്കുക' : 'Cancel'}
          </Button>

          <Button
            type="submit"
            variant="primary"
            isLoading={isSubmitting}
            className="bg-amber-600 hover:bg-amber-700 text-white font-extrabold"
          >
            <TbCheck className="w-4 h-4 stroke-[2.5]" />
            <span>{language === 'ml' ? 'സൂക്ഷിക്കുക' : 'Save Changes'}</span>
          </Button>
        </div>
      </form>
    </Modal>
  );
};
