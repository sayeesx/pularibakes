import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Ingredient } from '../../types';
import { useLanguage } from '../../context/LanguageContext';
import { useApp } from '../../context/AppContext';
import {
  TbX,
  TbSearch,
  TbUpload,
  TbDownload,
  TbCheck,
  TbRefresh,
  TbBuildingStore,
  TbAlertTriangle,
} from 'react-icons/tb';
import { parsePurchasesExcel, downloadPurchasesTemplate } from '../../lib/excelImport';

interface RecordPurchaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const RecordPurchaseModal: React.FC<RecordPurchaseModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { language, t } = useLanguage();
  const { repo, staffName, addToast } = useApp();

  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isParsingExcel, setIsParsingExcel] = useState<boolean>(false);
  const [excelSummary, setExcelSummary] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form states: purchase amounts and unit costs for each ingredient
  const [purchaseAmounts, setPurchaseAmounts] = useState<Record<string, string>>({});
  const [purchaseCosts, setPurchaseCosts] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!isOpen) return;

    let mounted = true;
    setLoading(true);
    setExcelSummary(null);

    repo.listIngredients(false)
      .then((data) => {
        if (!mounted) return;
        // Filter out operational wages
        const valid = data.filter((i) => !i.name.includes('കൂലി') && !i.name.includes('wages'));
        setIngredients(valid);

        const initialCosts: Record<string, string> = {};
        const initialAmounts: Record<string, string> = {};
        valid.forEach((ing) => {
          initialCosts[ing.id] = ing.avgCostPerUnit > 0 ? String(ing.avgCostPerUnit) : '';
          initialAmounts[ing.id] = '';
        });
        setPurchaseCosts(initialCosts);
        setPurchaseAmounts(initialAmounts);
        setSearchTerm('');
      })
      .catch((err) => {
        console.error('Failed to load ingredients for purchase:', err);
        addToast(err?.message || 'Failed to load ingredients', 'error');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [isOpen, repo, addToast]);

  const filteredIngredients = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return ingredients;
    return ingredients.filter((ing) => ing.name.toLowerCase().includes(q));
  }, [ingredients, searchTerm]);

  const handleAmountChange = (id: string, val: string) => {
    setPurchaseAmounts((prev) => ({ ...prev, [id]: val }));
  };

  const handleCostChange = (id: string, val: string) => {
    setPurchaseCosts((prev) => ({ ...prev, [id]: val }));
  };

  const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsParsingExcel(true);
    setExcelSummary(null);

    try {
      const { matched, unmatched } = await parsePurchasesExcel(file, ingredients);

      if (matched.length === 0) {
        addToast(
          language === 'ml'
            ? 'എക്സലിൽ നിന്ന് പർച്ചേസ് വിവരങ്ങൾ കണ്ടെത്താൻ കഴിഞ്ഞില്ല'
            : 'No matching ingredient purchases found in Excel',
          'warning'
        );
        setIsParsingExcel(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }

      setPurchaseAmounts((prev) => {
        const copy = { ...prev };
        matched.forEach((m) => {
          copy[m.ingredientId] = String(m.amount);
        });
        return copy;
      });

      setPurchaseCosts((prev) => {
        const copy = { ...prev };
        matched.forEach((m) => {
          if (m.costPerUnit > 0) {
            copy[m.ingredientId] = String(m.costPerUnit);
          }
        });
        return copy;
      });

      const summary = language === 'ml'
        ? `${matched.length} ചേരുവകളുടെ വിവരങ്ങൾ എക്സലിൽ നിന്ന് ഉൾപ്പെടുത്തി${
            unmatched.length > 0 ? ` (${unmatched.length} എണ്ണം തിരിച്ചറിഞ്ഞില്ല)` : ''
          }`
        : `${matched.length} ingredients loaded from Excel${
            unmatched.length > 0 ? ` (${unmatched.length} unrecognized)` : ''
          }`;
      setExcelSummary(summary);
      addToast(summary, 'success');
    } catch (err: any) {
      console.error('Excel parse failed:', err);
      addToast(
        language === 'ml'
          ? `എക്സൽ പരിശോധന പരാജയപ്പെട്ടു: ${err?.message || 'Error'}`
          : `Excel check failed: ${err?.message || 'Error'}`,
        'error'
      );
    } finally {
      setIsParsingExcel(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSave = async () => {
    const purchases: Array<{ ingredient: Ingredient; amount: number; costPerUnit: number }> = [];

    for (const ing of ingredients) {
      const amount = Number(purchaseAmounts[ing.id]) || 0;
      const costPerUnit = Number(purchaseCosts[ing.id]) || ing.avgCostPerUnit || 0;
      if (amount > 0) {
        purchases.push({ ingredient: ing, amount, costPerUnit });
      }
    }

    if (purchases.length === 0) {
      addToast(
        language === 'ml'
          ? 'വാങ്ങിയ അളവ് നൽകിയിട്ടില്ല'
          : 'No purchase amounts entered',
        'warning'
      );
      return;
    }

    setIsSaving(true);
    try {
      for (const p of purchases) {
        await repo.adjustStock({
          ingredientId: p.ingredient.id,
          quantityDelta: p.amount,
          coverUnitCost: p.costPerUnit,
          movementType: 'purchase',
          reason: 'Raw material purchase entry',
          operatorName: staffName || 'Pantry Staff',
        });
      }

      addToast(
        language === 'ml'
          ? `${purchases.length} ചേരുവകളുടെ പർച്ചേസ് വിജയകരമായി രേഖപ്പെടുത്തി`
          : `${purchases.length} purchases recorded successfully`,
        'success'
      );
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Purchase saving failed:', err);
      addToast(err?.message || 'Failed to record purchases', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs overflow-y-auto animate-fade-in">
          <div className="bg-white dark:bg-[#181616] rounded-2xl max-w-2xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-stone-200 dark:border-stone-800 my-auto overflow-hidden">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-4 border-b border-stone-200 dark:border-stone-800 bg-stone-50/60 dark:bg-stone-900/40 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 shrink-0">
                  <TbBuildingStore className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-stone-900 dark:text-stone-100">
                    {language === 'ml' ? 'പർച്ചേസ് രേഖപ്പെടുത്തുക' : 'Record Purchases'}
                  </h2>
                  <p className="text-xs text-stone-500 dark:text-stone-400">
                    {language === 'ml'
                      ? 'വാങ്ങിയ ചേരുവകളും അവയുടെ നിരക്കും രേഖപ്പെടുത്തുക'
                      : 'Record raw ingredient purchases and update stock'}
                  </p>
                </div>
              </div>

              {/* Excel Action Buttons */}
              <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx, .xls, .csv"
                  className="hidden"
                  onChange={handleExcelUpload}
                />

                <button
                  type="button"
                  onClick={() => downloadPurchasesTemplate(ingredients)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-[#1E1B1B] text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-[#282323] text-xs font-bold transition-colors cursor-pointer shadow-2xs"
                  title="Download sample template"
                >
                  <TbDownload className="w-3.5 h-3.5 text-stone-400" />
                  <span>{language === 'ml' ? 'മാതൃക' : 'Template'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isParsingExcel}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all cursor-pointer shadow-sm disabled:opacity-50"
                  title="Upload Excel purchase list"
                >
                  {isParsingExcel ? (
                    <>
                      <TbRefresh className="w-3.5 h-3.5 animate-spin" />
                      <span>{language === 'ml' ? 'വായിക്കുന്നു...' : 'Parsing...'}</span>
                    </>
                  ) : (
                    <>
                      <TbUpload className="w-3.5 h-3.5" />
                      <span>{language === 'ml' ? 'എക്സൽ അപ്‌ലോഡ്' : 'Upload Excel'}</span>
                    </>
                  )}
                </button>

                <button
                  onClick={onClose}
                  className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors cursor-pointer ml-1"
                >
                  <TbX className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Excel Summary Banner */}
            {excelSummary && (
              <div className="px-5 py-2.5 bg-emerald-50 dark:bg-emerald-950/40 border-b border-emerald-100 dark:border-emerald-900/40 text-xs text-emerald-800 dark:text-emerald-300 flex items-center justify-between">
                <span className="font-bold flex items-center gap-1.5">
                  <TbCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                  {excelSummary}
                </span>
                <span className="text-[11px] text-emerald-600 font-medium hidden sm:inline">
                  പരിശോധിച്ച് സേവ് ചെയ്യുക
                </span>
              </div>
            )}

            {/* Search Filter */}
            <div className="px-5 pt-3 pb-2 border-b border-stone-100 dark:border-stone-800/80">
              <div className="relative">
                <TbSearch className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder={language === 'ml' ? 'ചേരുവ തിരയുക...' : 'Search ingredient...'}
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50/50 dark:bg-stone-800/50 text-xs text-stone-900 dark:text-stone-100 outline-hidden focus:ring-2 focus:ring-emerald-500 font-medium"
                />
              </div>
            </div>

            {/* Table */}
            <div className="flex-1 overflow-y-auto px-5 py-3 relative">
              {loading ? (
                <div className="py-12 flex flex-col items-center justify-center text-stone-400 space-y-2">
                  <TbRefresh className="w-6 h-6 animate-spin text-emerald-600" />
                  <span className="text-xs">{t.loading}</span>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <div className="grid grid-cols-12 gap-2 px-2 py-1.5 text-[10px] font-bold text-stone-400 uppercase tracking-wider border-b border-stone-100 dark:border-stone-800">
                    <div className="col-span-5">{language === 'ml' ? 'ചേരുവ' : 'Ingredient'}</div>
                    <div className="col-span-2 text-right">{language === 'ml' ? 'സ്റ്റോക്ക്' : 'Stock'}</div>
                    <div className="col-span-3 text-right">{language === 'ml' ? 'വാങ്ങിയ അളവ്' : 'Quantity'}</div>
                    <div className="col-span-2 text-right">{language === 'ml' ? 'നിരക്ക് ₹' : 'Cost ₹'}</div>
                  </div>

                  {filteredIngredients.map((ing) => (
                    <div
                      key={ing.id}
                      className="grid grid-cols-12 gap-2 items-center px-2 py-2 rounded-xl hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors text-xs"
                    >
                      <div className="col-span-5 min-w-0">
                        <p className="font-bold text-stone-900 dark:text-stone-100 truncate">
                          {ing.name}
                        </p>
                        <p className="text-[10px] text-stone-400">{ing.unit}</p>
                      </div>

                      <div className="col-span-2 text-right font-semibold text-stone-500">
                        {ing.currentStock.toFixed(1)}
                      </div>

                      <div className="col-span-3">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={purchaseAmounts[ing.id] || ''}
                          onChange={(e) => handleAmountChange(ing.id, e.target.value)}
                          placeholder="0"
                          className={`w-full px-2 py-1.5 rounded-lg border text-xs font-bold text-right outline-hidden focus:ring-2 focus:ring-emerald-500 ${
                            Number(purchaseAmounts[ing.id]) > 0
                              ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20 text-emerald-900 dark:text-emerald-200'
                              : 'border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100'
                          }`}
                        />
                      </div>

                      <div className="col-span-2">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={purchaseCosts[ing.id] || ''}
                          onChange={(e) => handleCostChange(ing.id, e.target.value)}
                          placeholder={String(ing.avgCostPerUnit || 0)}
                          className="w-full px-2 py-1.5 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-xs font-medium text-right text-stone-700 dark:text-stone-300 outline-hidden focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>
                    </div>
                  ))}

                  {filteredIngredients.length === 0 && (
                    <p className="text-center text-xs text-stone-400 py-8">
                      {language === 'ml' ? 'ചേരുവകൾ ഒന്നും കണ്ടെത്തിയില്ല' : 'No ingredients found'}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-4 border-t border-stone-200 dark:border-stone-800 flex items-center justify-end gap-3 shrink-0">
              <button
                type="button"
                onClick={onClose}
                disabled={isSaving}
                className="px-4 py-2.5 rounded-xl border border-stone-300 dark:border-stone-700 font-bold text-xs text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors cursor-pointer"
              >
                {t.cancel}
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving || isParsingExcel}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isSaving ? (
                  <>
                    <TbRefresh className="w-4 h-4 animate-spin" />
                    <span>{t.loading}</span>
                  </>
                ) : (
                  <>
                    <TbCheck className="w-4 h-4 stroke-[3]" />
                    <span>{language === 'ml' ? 'പർച്ചേസ് സേവ് ചെയ്യുക' : 'Save Purchases'}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
};
