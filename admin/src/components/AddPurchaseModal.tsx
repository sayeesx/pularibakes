import React, { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Ingredient } from '../types';
import { FiX, FiSearch, FiSave, FiRefreshCw, FiUpload, FiDownload, FiCheckCircle } from 'react-icons/fi';
import { bulkPurchaseIngredients } from '../services/supabase';
import { useFeedback } from '../context/FeedbackContext';
import { parsePurchasesExcel, downloadPurchasesTemplate } from '../utils/excelImport';

interface AddPurchaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  ingredients: Ingredient[];
  onRefresh: () => void;
}

export const AddPurchaseModal: React.FC<AddPurchaseModalProps> = ({
  isOpen,
  onClose,
  ingredients,
  onRefresh,
}) => {
  const { showToast } = useFeedback();
  const [searchTerm, setSearchTerm] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isParsingExcel, setIsParsingExcel] = useState(false);
  const [excelSummary, setExcelSummary] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Track purchase amounts and costs for each ingredient
  const [purchaseAmounts, setPurchaseAmounts] = useState<Record<string, string>>({});
  const [purchaseCosts, setPurchaseCosts] = useState<Record<string, string>>({});

  // Filter out wages
  const validIngredients = useMemo(() => {
    return ingredients.filter((ing) => {
      const n = (ing.name || '').trim().toLowerCase();
      return (
        n !== 'കൂലി' &&
        n !== 'കൂലി പാക്കിങ്' &&
        n !== 'കൂലി പാക്കിംഗ്' &&
        !n.startsWith('കൂലി') &&
        n !== 'wages' &&
        n !== 'packing wages'
      );
    });
  }, [ingredients]);

  // Initialize costs from existing avg_cost_per_unit when modal opens
  useEffect(() => {
    if (isOpen) {
      const initialCosts: Record<string, string> = {};
      const initialAmounts: Record<string, string> = {};
      validIngredients.forEach((ing) => {
        if (ing.isActive) {
          initialCosts[ing.id] = ing.avgCostPerUnit > 0 ? String(ing.avgCostPerUnit) : '';
          initialAmounts[ing.id] = '';
        }
      });
      setPurchaseCosts(initialCosts);
      setPurchaseAmounts(initialAmounts);
      setSearchTerm('');
      setExcelSummary(null);
    }
  }, [isOpen, validIngredients]);

  const activeIngredients = useMemo(() => {
    return validIngredients
      .filter((ing) => ing.isActive)
      .filter((ing) => {
        if (!searchTerm.trim()) return true;
        return ing.name.toLowerCase().includes(searchTerm.toLowerCase());
      });
  }, [validIngredients, searchTerm]);

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
      const { matched, unmatched } = await parsePurchasesExcel(file, validIngredients);

      if (matched.length === 0) {
        showToast('എക്സലിൽ നിന്ന് പർച്ചേസ് വിവരങ്ങൾ കണ്ടെത്താൻ കഴിഞ്ഞില്ല (No matching ingredient purchases found)', 'warning');
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

      const summary = `${matched.length} ചേരുവകളുടെ വിവരങ്ങൾ എക്സലിൽ നിന്ന് ഉൾപ്പെടുത്തി${
        unmatched.length > 0 ? ` (${unmatched.length} എണ്ണം തിരിച്ചറിഞ്ഞില്ല)` : ''
      }`;
      setExcelSummary(summary);
      showToast(summary, 'success');
    } catch (err: any) {
      console.error('Excel parse failed:', err);
      showToast(`എക്സൽ പരിശോധന പരാജയപ്പെട്ടു: ${err?.message || 'Invalid format'}`, 'error');
    } finally {
      setIsParsingExcel(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSave = async () => {
    const purchases: Array<{ ingredientId: string; amount: number; costPerUnit: number }> = [];

    for (const ing of validIngredients) {
      const amount = Number(purchaseAmounts[ing.id]) || 0;
      const costPerUnit = Number(purchaseCosts[ing.id]) || ing.avgCostPerUnit || 0;
      if (amount > 0) {
        purchases.push({ ingredientId: ing.id, amount, costPerUnit });
      }
    }

    if (purchases.length === 0) {
      showToast('വാങ്ങിയ അളവ് നൽകിയിട്ടില്ല (No purchase amounts entered)', 'warning');
      return;
    }

    setIsSaving(true);
    try {
      await bulkPurchaseIngredients(purchases);
      showToast('പർച്ചേസ് വിജയകരമായി രേഖപ്പെടുത്തി', 'success');
      onRefresh();
      setIsSaving(false);
      onClose();
    } catch (err: any) {
      showToast(`പർച്ചേസ് പരാജയപ്പെട്ടു: ${err?.message || 'Unknown error'}`, 'error');
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {createPortal(
        <div className="fixed inset-0 z-[9999] w-screen h-screen min-h-screen flex items-end sm:items-center justify-center bg-black/65 backdrop-blur-md p-0 sm:p-4 overflow-y-auto animate-apple-backdrop">
          <div className="w-full md:w-[75vw] md:max-w-5xl max-h-[92vh] sm:max-h-[88vh] bg-white dark:bg-[#181515] rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-stone-200/50 dark:border-[#2E2828] animate-apple-modal google-modal my-auto">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-4 border-b border-stone-200 dark:border-[#2E2828] shrink-0">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <h3 className="text-sm font-black text-stone-900 dark:text-white font-malayalam whitespace-nowrap">
                  പർച്ചേസ് രേഖപ്പെടുത്തുക
                </h3>

                <div className="relative flex-1 max-w-xs">
                  <FiSearch className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="ചേരുവ തിരയുക..."
                    className="w-full pl-9 pr-3 py-2 rounded-xl border border-stone-200 dark:border-[#2E2828] bg-stone-50 dark:bg-[#1E1B1B] text-xs text-stone-900 dark:text-white placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-epso-red/20 dark:focus:ring-amber-500/20 font-malayalam"
                  />
                </div>
              </div>

              {/* Excel Upload & Download Actions */}
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
                  onClick={() => downloadPurchasesTemplate(validIngredients)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-[#1E1B1B] text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-[#282323] text-xs font-bold transition-colors cursor-pointer"
                  title="മാതൃകാ എക്സൽ ഫയൽ ഡൗൺലോഡ് ചെയ്യുക"
                >
                  <FiDownload className="w-3.5 h-3.5 text-stone-500" />
                  <span className="hidden sm:inline">മാതൃക</span>
                  <span>Template</span>
                </button>

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isParsingExcel}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors cursor-pointer shadow-xs disabled:opacity-50"
                  title="എക്സൽ ഫയൽ വഴി വിവരങ്ങൾ ചേർക്കുക"
                >
                  {isParsingExcel ? (
                    <>
                      <FiRefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>വായിക്കുന്നു...</span>
                    </>
                  ) : (
                    <>
                      <FiUpload className="w-3.5 h-3.5" />
                      <span>Upload Excel</span>
                    </>
                  )}
                </button>

                <button
                  onClick={onClose}
                  className="w-8 h-8 rounded-full flex items-center justify-center bg-stone-100 dark:bg-[#282323] text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 transition-colors cursor-pointer ml-1"
                >
                  <FiX className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Excel Upload Banner Message */}
            {excelSummary && (
              <div className="px-5 py-2.5 bg-emerald-50 dark:bg-emerald-950/40 border-b border-emerald-100 dark:border-emerald-900/40 text-xs text-emerald-800 dark:text-emerald-300 flex items-center justify-between">
                <span className="flex items-center gap-1.5 font-bold">
                  <FiCheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                  {excelSummary}
                </span>
                <span className="text-[11px] text-emerald-600 font-medium">
                  താഴെയുള്ള ലിസ്റ്റിൽ മാറ്റങ്ങൾ പരിശോധിച്ച് സേവ് ചെയ്യുക
                </span>
              </div>
            )}

            {/* Table */}
            <div className="flex-1 overflow-y-auto px-5 py-3 relative">
              {isParsingExcel && (
                <div className="absolute inset-0 bg-white/80 dark:bg-[#181515]/80 backdrop-blur-xs flex flex-col items-center justify-center z-20 space-y-2">
                  <FiRefreshCw className="w-8 h-8 animate-spin text-emerald-600" />
                  <p className="text-xs font-bold text-stone-700 dark:text-stone-300 font-malayalam">
                    എക്സൽ ഫയൽ വായിച്ച് വിവരങ്ങൾ വേർതിരിക്കുന്നു...
                  </p>
                </div>
              )}

              <div className="space-y-1">
                {/* Table Header */}
                <div className="grid grid-cols-[1fr_80px_90px_80px] gap-2 px-2 py-1.5 text-[10px] font-bold text-stone-500 dark:text-stone-400 uppercase tracking-wider border-b border-stone-100 dark:border-[#2E2828] font-malayalam">
                  <span>ചേരുവ (Item)</span>
                  <span className="text-right">സ്റ്റോക്ക്</span>
                  <span className="text-right">വാങ്ങിയ അളവ്</span>
                  <span className="text-right">₹/യൂണിറ്റ്</span>
                </div>

                {activeIngredients.map((ing) => (
                  <div
                    key={ing.id}
                    className="grid grid-cols-[1fr_80px_90px_80px] gap-2 items-center px-2 py-2 rounded-xl hover:bg-stone-50 dark:hover:bg-[#1E1B1B] transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-stone-800 dark:text-stone-200 truncate font-malayalam">
                        {ing.name}
                      </p>
                      <p className="text-[10px] text-stone-400 dark:text-stone-500 font-mono">{ing.unit}</p>
                    </div>
                    <p
                      className={`text-xs font-bold text-right font-mono ${
                        ing.currentStock <= 0
                          ? 'text-red-500'
                          : ing.currentStock <= ing.minStock
                          ? 'text-amber-500'
                          : 'text-stone-600 dark:text-stone-300'
                      }`}
                    >
                      {ing.currentStock.toFixed(1)}
                    </p>
                    <input
                      type="number"
                      value={purchaseAmounts[ing.id] || ''}
                      onChange={(e) => handleAmountChange(ing.id, e.target.value)}
                      min="0"
                      step="0.01"
                      placeholder="0"
                      className={`w-full px-2 py-1.5 rounded-xl border text-xs font-bold text-right font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/30 ${
                        Number(purchaseAmounts[ing.id]) > 0
                          ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20 text-emerald-900 dark:text-emerald-200'
                          : 'border-stone-200 dark:border-[#2E2828] bg-white dark:bg-[#1A1616] text-stone-900 dark:text-white'
                      }`}
                    />
                    <input
                      type="number"
                      value={purchaseCosts[ing.id] || ''}
                      onChange={(e) => handleCostChange(ing.id, e.target.value)}
                      min="0"
                      step="0.01"
                      placeholder={String(ing.avgCostPerUnit || 0)}
                      className="w-full px-1.5 py-1.5 rounded-xl border border-stone-200 dark:border-[#2E2828] bg-white dark:bg-[#1A1616] text-[10px] font-bold text-right font-mono text-stone-700 dark:text-stone-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                    />
                  </div>
                ))}

                {activeIngredients.length === 0 && (
                  <p className="text-center text-xs text-stone-400 py-8 font-malayalam">
                    ചേരുവകൾ ഒന്നും കണ്ടെത്തിയില്ല.
                  </p>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 py-4 border-t border-stone-200 dark:border-[#2E2828] shrink-0">
              <button
                onClick={handleSave}
                disabled={isSaving || isParsingExcel}
                className="w-full py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-600 text-white font-black text-sm shadow-md press-apple transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2 font-malayalam"
              >
                {isSaving ? (
                  <>
                    <FiRefreshCw className="w-4 h-4 animate-spin text-white" />
                    <span>സേവ് ചെയ്യുന്നു...</span>
                  </>
                ) : (
                  <>
                    <FiSave className="w-4 h-4" />
                    <span>പർച്ചേസ് സേവ് ചെയ്യുക</span>
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
