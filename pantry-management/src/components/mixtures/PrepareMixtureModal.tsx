import React, { useState, useEffect, useMemo } from 'react';
import { X, Check, AlertTriangle, ChefHat, Scale, Calendar, User, Info, Plus, Trash2 } from 'lucide-react';
import { getRepository } from '../../services';
import { SpecialMixture, Ingredient, UnitType } from '../../types';
import { useLanguage } from '../../context/LanguageContext';
import { useApp } from '../../context/AppContext';

interface PrepareMixtureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  preSelectedMixtureId?: string;
}

export const PrepareMixtureModal: React.FC<PrepareMixtureModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  preSelectedMixtureId,
}) => {
  const { language, t } = useLanguage();
  const { staffName, addToast } = useApp();
  const repo = getRepository();

  const [mixtures, setMixtures] = useState<SpecialMixture[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Form state
  const [selectedMixtureId, setSelectedMixtureId] = useState<string>('');
  const [preparationDate, setPreparationDate] = useState<string>(
    () => new Date().toISOString().split('T')[0]
  );
  const [expiryDate, setExpiryDate] = useState<string>('');
  const [plannedQuantity, setPlannedQuantity] = useState<number>(5);
  const [actualQuantity, setActualQuantity] = useState<number>(5);
  const [operatorName, setOperatorName] = useState<string>(staffName || 'Head Baker');
  const [notes, setNotes] = useState<string>('');

  // Consumed ingredients rows: { ingredientId, expectedQuantity, actualQuantity, unit }
  const [consumedRows, setConsumedRows] = useState<
    Array<{
      ingredientId: string;
      expectedQuantity: number;
      actualQuantity: number;
      unit: UnitType;
    }>
  >([]);

  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    setLoading(true);

    Promise.all([repo.listSpecialMixtures(false), repo.listIngredients(false)])
      .then(([mixList, ingList]) => {
        if (!isMounted) return;
        setMixtures(mixList);
        setIngredients(ingList);

        const targetId = preSelectedMixtureId || (mixList.length > 0 ? mixList[0].id : '');
        setSelectedMixtureId(targetId);

        // Preload recipe if available
        const currentMix = mixList.find((m) => m.id === targetId);
        if (currentMix?.recipe && currentMix.recipe.items.length > 0) {
          const baseRatio = currentMix.recipe.expectedOutputQuantity > 0 ? 5 / currentMix.recipe.expectedOutputQuantity : 1;
          const rows = currentMix.recipe.items.map((item: any) => ({
            ingredientId: item.ingredientId,
            expectedQuantity: Number((item.quantity * baseRatio).toFixed(3)),
            actualQuantity: Number((item.quantity * baseRatio).toFixed(3)),
            unit: item.unit,
          }));
          setConsumedRows(rows);
        } else {
          setConsumedRows([]);
        }
      })
      .catch((err) => {
        console.error('Failed to load mixtures or ingredients:', err);
        addToast(err.message || 'Failed to load catalogue', 'error');
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, preSelectedMixtureId]);

  // Update consumed ingredients when mixture changes
  const handleMixtureChange = (mixtureId: string) => {
    setSelectedMixtureId(mixtureId);
    const mix = mixtures.find((m) => m.id === mixtureId);
    if (!mix) return;

    if (mix.recipe && mix.recipe.items.length > 0) {
      const baseExpected = mix.recipe.expectedOutputQuantity || 1;
      const ratio = plannedQuantity / baseExpected;
      const rows = mix.recipe.items.map((item) => {
        const scaled = Number((item.quantity * ratio).toFixed(3));
        return {
          ingredientId: item.ingredientId,
          expectedQuantity: scaled,
          actualQuantity: scaled,
          unit: item.unit,
        };
      });
      setConsumedRows(rows);
    } else {
      setConsumedRows([]);
    }
  };

  const handlePlannedQtyChange = (qty: number) => {
    setPlannedQuantity(qty);
    setActualQuantity(qty);

    const mix = mixtures.find((m) => m.id === selectedMixtureId);
    if (mix?.recipe && mix.recipe.items.length > 0) {
      const baseExpected = mix.recipe.expectedOutputQuantity || 1;
      const ratio = qty / baseExpected;
      const rows = mix.recipe.items.map((item) => {
        const scaled = Number((item.quantity * ratio).toFixed(3));
        return {
          ingredientId: item.ingredientId,
          expectedQuantity: scaled,
          actualQuantity: scaled,
          unit: item.unit,
        };
      });
      setConsumedRows(rows);
    }
  };

  const updateActualIngredientQty = (idx: number, val: number) => {
    setConsumedRows((prev) => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], actualQuantity: Math.max(0, val) };
      return updated;
    });
  };

  const addIngredientRow = () => {
    if (ingredients.length === 0) return;
    setConsumedRows((prev) => [
      ...prev,
      {
        ingredientId: ingredients[0].id,
        expectedQuantity: 1,
        actualQuantity: 1,
        unit: ingredients[0].unit,
      },
    ]);
  };

  const removeIngredientRow = (idx: number) => {
    setConsumedRows((prev) => prev.filter((_, i) => i !== idx));
  };

  const selectedMixture = useMemo(
    () => mixtures.find((m) => m.id === selectedMixtureId),
    [mixtures, selectedMixtureId]
  );

  // Validate stock sufficiency for each consumed raw ingredient
  const stockIssues = useMemo(() => {
    const issues: string[] = [];
    consumedRows.forEach((row) => {
      const ing = ingredients.find((i) => i.id === row.ingredientId);
      if (ing && ing.currentStock < row.actualQuantity) {
        issues.push(
          `${ing.name}: ${language === 'ml' ? 'ആവശ്യം' : 'Needed'} ${row.actualQuantity} ${row.unit}, ${language === 'ml' ? 'ലഭ്യം' : 'Available'} ${ing.currentStock} ${ing.unit}`
        );
      }
    });
    return issues;
  }, [consumedRows, ingredients, language]);

  // Total cost calculation
  const totalIngredientCost = useMemo(() => {
    return consumedRows.reduce((acc, row) => {
      const ing = ingredients.find((i) => i.id === row.ingredientId);
      const costPerUnit = ing?.avgCostPerUnit || 0;
      return acc + (row.actualQuantity * costPerUnit);
    }, 0);
  }, [consumedRows, ingredients]);

  const costPerUnitYield = useMemo(() => {
    if (actualQuantity <= 0) return 0;
    return totalIngredientCost / actualQuantity;
  }, [totalIngredientCost, actualQuantity]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMixtureId) return;

    if (actualQuantity <= 0) {
      addToast(
        language === 'ml' ? 'യഥാർത്ഥ അളവ് 0-ൽ കൂടുതലായിരിക്കണം' : 'Actual quantity must be greater than 0',
        'error'
      );
      return;
    }

    if (stockIssues.length > 0) {
      addToast(
        language === 'ml' ? 'ആവശ്യത്തിന് സ്റ്റോക്കില്ലാത്ത ചേരുവകൾ ഉണ്ട്' : 'Insufficient stock for some ingredients',
        'error'
      );
      return;
    }

    setSubmitting(true);
    try {
      await repo.prepareSpecialMixture({
        mixtureId: selectedMixtureId,
        preparationDate,
        expiryDate: expiryDate || undefined,
        plannedQuantity,
        actualQuantity,
        unit: selectedMixture?.unit || 'kg',
        operatorName: operatorName.trim() || 'Cook',
        notes: notes.trim() || undefined,
        ingredientsConsumed: consumedRows.map((r) => ({
          ingredientId: r.ingredientId,
          expectedQuantity: r.expectedQuantity,
          actualQuantity: r.actualQuantity,
          unit: r.unit,
        })),
      });

      addToast(
        language === 'ml' ? 'മിശ്രിതം വിജയകരമായി തയ്യാറാക്കി സ്റ്റോക്കിൽ ചേർത്തു' : 'Mixture prepared and added to stock successfully',
        'success'
      );
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Preparation failed:', err);
      addToast(err.message || 'Failed to prepare mixture', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs overflow-y-auto animate-fade-in">
      <div className="bg-white dark:bg-[#181616] rounded-2xl max-w-xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-stone-200 dark:border-stone-800 my-auto overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-200 dark:border-stone-800 bg-stone-50/60 dark:bg-stone-900/40">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-pulari-primary/10 text-pulari-primary dark:text-pulari-gold shrink-0">
              <ChefHat className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-stone-900 dark:text-stone-100">
                {language === 'ml' ? 'പ്രത്യേക കൂട്ട് തയ്യാറാക്കൽ' : 'Prepare Special Mixture'}
              </h2>
              <p className="text-xs text-stone-500 dark:text-stone-400">
                {language === 'ml'
                  ? 'ചേരുവകൾ കുറച്ച് പുതിയ കൂട്ട് സ്റ്റോക്കിലേക്ക് ചേർക്കുക'
                  : 'Deduct ingredients and produce intermediate mixture'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Form */}
        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-4 text-sm flex-1">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center text-stone-400 space-y-2">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-pulari-primary border-t-transparent" />
              <span>{t.loading}</span>
            </div>
          ) : (
            <>
              {/* Mixture Selection */}
              <div>
                <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1.5">
                  {language === 'ml' ? 'തയ്യാറാക്കേണ്ട കൂട്ട് തിരഞ്ഞെടുക്കുക' : 'Select Special Mixture'} *
                </label>
                <select
                  value={selectedMixtureId}
                  onChange={(e) => handleMixtureChange(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 font-bold focus:ring-2 focus:ring-pulari-primary outline-hidden"
                  required
                >
                  {mixtures.map((mix) => (
                    <option key={mix.id} value={mix.id}>
                      {mix.name} ({mix.currentStock} {mix.unit} {language === 'ml' ? 'സ്റ്റോക്കുണ്ട്' : 'in stock'})
                    </option>
                  ))}
                </select>
                {selectedMixture && (
                  <div className="mt-1.5 flex items-center gap-2 text-xs text-stone-500 dark:text-stone-400">
                    <Info className="w-3.5 h-3.5 text-pulari-primary dark:text-pulari-gold shrink-0" />
                    <span>
                      {language === 'ml' ? 'നിലവിലെ സ്റ്റോക്ക്' : 'Current Stock'}:{' '}
                      <strong className="text-stone-800 dark:text-stone-200">
                        {selectedMixture.currentStock} {selectedMixture.unit}
                      </strong>{' '}
                      | {language === 'ml' ? 'ശരാശരി ചിലവ്' : 'Avg Cost'}: ₹{selectedMixture.avgCostPerUnit.toFixed(2)}/{selectedMixture.unit}
                    </span>
                  </div>
                )}
              </div>

              {/* Quantities Row */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1.5">
                    {language === 'ml' ? 'ഉദ്ദേശിച്ച അളവ്' : 'Planned Quantity'} ({selectedMixture?.unit || 'kg'})
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.01"
                      min="0.1"
                      value={plannedQuantity || ''}
                      onChange={(e) => handlePlannedQtyChange(parseFloat(e.target.value) || 0)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 font-bold text-stone-900 dark:text-stone-100 outline-hidden focus:ring-2 focus:ring-pulari-primary"
                      required
                    />
                    <Scale className="absolute right-3 top-3 w-4 h-4 text-stone-400 pointer-events-none" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1.5">
                    {language === 'ml' ? 'യഥാർത്ഥ അളവ്' : 'Actual Output Yield'} ({selectedMixture?.unit || 'kg'}) *
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.01"
                      min="0.1"
                      value={actualQuantity || ''}
                      onChange={(e) => setActualQuantity(parseFloat(e.target.value) || 0)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 font-bold text-stone-900 dark:text-stone-100 outline-hidden focus:ring-2 focus:ring-pulari-primary"
                      required
                    />
                    <Scale className="absolute right-3 top-3 w-4 h-4 text-stone-400 pointer-events-none" />
                  </div>
                </div>
              </div>

              {/* Date & Operator */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1.5">
                    {language === 'ml' ? 'തയ്യാറാക്കിയ തീയതി' : 'Preparation Date'}
                  </label>
                  <div className="relative">
                    <input
                      type="date"
                      value={preparationDate}
                      onChange={(e) => setPreparationDate(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 outline-hidden focus:ring-2 focus:ring-pulari-primary font-medium"
                      required
                    />
                    <Calendar className="absolute right-3 top-3 w-4 h-4 text-stone-400 pointer-events-none" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1.5">
                    {language === 'ml' ? 'പാചകക്കാരൻ / ഓപ്പറേറ്റർ' : 'Cook / Operator'}
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={operatorName}
                      onChange={(e) => setOperatorName(e.target.value)}
                      placeholder={language === 'ml' ? 'പേര് നൽകുക' : 'Operator name'}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 outline-hidden focus:ring-2 focus:ring-pulari-primary font-medium"
                      required
                    />
                    <User className="absolute right-3 top-3 w-4 h-4 text-stone-400 pointer-events-none" />
                  </div>
                </div>
              </div>

              {/* Required Raw Ingredients Table */}
              <div className="border border-stone-200 dark:border-stone-800 rounded-xl p-3.5 bg-stone-50/50 dark:bg-stone-900/30 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-stone-800 dark:text-stone-200">
                    {language === 'ml' ? 'ഉപയോഗിക്കുന്ന ചേരുവകൾ' : 'Raw Ingredients to Deduct'}
                  </span>
                  <button
                    type="button"
                    onClick={addIngredientRow}
                    className="flex items-center gap-1 text-xs font-bold text-pulari-primary dark:text-pulari-gold hover:underline cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5 stroke-[3]" />
                    <span>{language === 'ml' ? 'ചേരുവ ചേർക്കുക' : 'Add Item'}</span>
                  </button>
                </div>

                {consumedRows.length === 0 ? (
                  <p className="text-xs text-stone-500 italic py-2">
                    {language === 'ml'
                      ? 'ഈ കൂട്ടിന് ചേരുവകൾ ക്രമീകരിച്ചിട്ടില്ല. ചേരുവകൾ സ്വമേധയാ ചേർക്കാം.'
                      : 'No ingredients in recipe. Add manually if needed.'}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {/* Header labels for rows */}
                    <div className="grid grid-cols-12 gap-2 text-[10px] font-bold text-stone-400 uppercase tracking-wider px-1">
                      <div className="col-span-6">{language === 'ml' ? 'ചേരുവ' : 'Ingredient'}</div>
                      <div className="col-span-3 text-right">{language === 'ml' ? 'സ്റ്റോക്ക്' : 'Stock'}</div>
                      <div className="col-span-3 text-right">{language === 'ml' ? 'ഉപയോഗം' : 'Qty'}</div>
                    </div>

                    {consumedRows.map((row, idx) => {
                      const ing = ingredients.find((i) => i.id === row.ingredientId);
                      const isShort = ing && ing.currentStock < row.actualQuantity;
                      return (
                        <div
                          key={idx}
                          className={`flex items-center gap-2 p-2 rounded-xl border text-xs transition-colors ${
                            isShort
                              ? 'border-red-300 bg-red-50/80 dark:border-red-900/50 dark:bg-red-950/20'
                              : 'border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-800/80'
                          }`}
                        >
                          <select
                            value={row.ingredientId}
                            onChange={(e) => {
                              const newId = e.target.value;
                              const selected = ingredients.find((i) => i.id === newId);
                              setConsumedRows((prev) => {
                                const copy = [...prev];
                                copy[idx] = {
                                  ...copy[idx],
                                  ingredientId: newId,
                                  unit: selected?.unit || 'kg',
                                };
                                return copy;
                              });
                            }}
                            className="flex-1 min-w-0 px-2 py-1.5 rounded-lg border border-stone-200 dark:border-stone-700 bg-transparent font-medium truncate"
                          >
                            {ingredients.map((ingItem) => (
                              <option key={ingItem.id} value={ingItem.id}>
                                {ingItem.name}
                              </option>
                            ))}
                          </select>

                          <div className="text-[11px] font-semibold text-stone-500 shrink-0 w-16 text-right">
                            {ing ? `${ing.currentStock} ${ing.unit}` : '-'}
                          </div>

                          <div className="flex items-center gap-1 w-24 shrink-0">
                            <input
                              type="number"
                              step="0.001"
                              min="0"
                              value={row.actualQuantity || ''}
                              onChange={(e) => updateActualIngredientQty(idx, parseFloat(e.target.value) || 0)}
                              className="w-full px-2 py-1.5 rounded-lg border border-stone-200 dark:border-stone-700 bg-transparent text-right font-bold text-stone-900 dark:text-stone-100"
                            />
                            <span className="text-stone-500 text-[11px] font-medium">{row.unit}</span>
                          </div>

                          <button
                            type="button"
                            onClick={() => removeIngredientRow(idx)}
                            className="text-stone-400 hover:text-red-500 p-1 rounded transition-colors cursor-pointer shrink-0"
                            title={t.delete}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Live Cost Summary preview */}
                {consumedRows.length > 0 && (
                  <div className="pt-2 border-t border-stone-200 dark:border-stone-800 flex items-center justify-between text-xs">
                    <span className="text-stone-500 dark:text-stone-400">
                      {language === 'ml' ? 'കണക്കാക്കിയ ചിലവ്' : 'Estimated Cost'}:
                    </span>
                    <span className="font-bold text-stone-900 dark:text-stone-100">
                      ₹{totalIngredientCost.toFixed(2)}{' '}
                      <span className="text-[11px] text-stone-400 font-normal">
                        (≈ ₹{costPerUnitYield.toFixed(2)}/{selectedMixture?.unit || 'kg'})
                      </span>
                    </span>
                  </div>
                )}

                {/* Stock Shortage Warning */}
                {stockIssues.length > 0 && (
                  <div className="p-2.5 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 flex items-start gap-2 text-xs text-red-700 dark:text-red-400">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold">
                        {language === 'ml' ? 'സ്റ്റോക്ക് തികയാതെ വരുന്നു:' : 'Insufficient stock:'}
                      </p>
                      <ul className="list-disc list-inside mt-0.5 space-y-0.5">
                        {stockIssues.map((issue, i) => (
                          <li key={i}>{issue}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1.5">
                  {language === 'ml' ? 'കുറിപ്പ് (ഓപ്ഷണൽ)' : 'Notes (Optional)'}
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={language === 'ml' ? 'പ്രത്യേക നിർദ്ദേശങ്ങൾ...' : 'Special notes...'}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 outline-hidden focus:ring-2 focus:ring-pulari-primary font-medium"
                />
              </div>
            </>
          )}

          {/* Footer Action Buttons */}
          <div className="pt-3 border-t border-stone-200 dark:border-stone-800 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2.5 rounded-xl border border-stone-300 dark:border-stone-700 font-bold text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors cursor-pointer"
            >
              {t.cancel}
            </button>
            <button
              type="submit"
              disabled={submitting || loading || stockIssues.length > 0}
              className="px-5 py-2.5 rounded-xl bg-pulari-primary text-white font-bold hover:bg-pulari-primary/90 transition-all flex items-center gap-2 cursor-pointer shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                  <span>{t.loading}</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4 stroke-[3]" />
                  <span>{language === 'ml' ? 'കൂട്ട് തയ്യാറാക്കുക' : 'Confirm Preparation'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
