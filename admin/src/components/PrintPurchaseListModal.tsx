import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Ingredient } from '../types';
import {
  FiPrinter,
  FiX,
  FiCheckSquare,
  FiSquare,
  FiAlertTriangle,
  FiCopy,
  FiCheck,
  FiSearch,
  FiPackage,
  FiCheckCircle,
} from 'react-icons/fi';
import { useLockBodyScroll } from '../hooks/useLockBodyScroll';
import { useFeedback } from '../context/FeedbackContext';

interface PrintPurchaseListModalProps {
  isOpen: boolean;
  onClose: () => void;
  ingredients: Ingredient[];
}

export const PrintPurchaseListModal: React.FC<PrintPurchaseListModalProps> = ({
  isOpen,
  onClose,
  ingredients,
}) => {
  const { showToast } = useFeedback();
  useLockBodyScroll(isOpen);
  const [filterMode, setFilterMode] = useState<'stock_out' | 'all'>('stock_out');
  const [searchTerm, setSearchTerm] = useState('');
  const [vendorName, setVendorName] = useState('');
  const [copied, setCopied] = useState(false);

  // Optional print column checkboxes (Default false as requested: only Items, Qty, Unit)
  const [showCategory, setShowCategory] = useState(false);
  const [showCurrentStock, setShowCurrentStock] = useState(false);
  const [showRemarks, setShowRemarks] = useState(false);

  // 14 items per page formatting for clean print layout
  const itemsPerPage = 14;

  // Set of selected ingredient IDs to print
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Custom order quantities per ingredient id
  const [orderQuantities, setOrderQuantities] = useState<Record<string, number>>({});

  // Custom remarks per ingredient id
  const [remarks, setRemarks] = useState<Record<string, string>>({});

  // Identify stock-out or low-stock items
  const stockOutIngredients = useMemo(() => {
    return ingredients.filter(
      (ing) => ing.isActive && (ing.currentStock <= (ing.minStock || 0) || ing.currentStock <= 0)
    );
  }, [ingredients]);

  // Initialize selections when modal opens or when stockOutIngredients change
  useEffect(() => {
    if (isOpen) {
      const initialSelected = new Set<string>();
      const initialQtys: Record<string, number> = {};

      ingredients.forEach((ing) => {
        const isLow = ing.isActive && (ing.currentStock <= (ing.minStock || 0) || ing.currentStock <= 0);
        if (isLow) {
          initialSelected.add(ing.id);
        }

        // Suggested purchase qty calculation
        let suggestedQty = 5;
        if (ing.currentStock <= 0) {
          suggestedQty = Math.max(1, ing.minStock > 0 ? ing.minStock * 2 : 10);
        } else if (ing.currentStock < ing.minStock) {
          suggestedQty = Math.max(1, ing.minStock * 2 - ing.currentStock);
        } else {
          suggestedQty = Math.max(1, ing.minStock || 5);
        }

        initialQtys[ing.id] = suggestedQty;
      });

      setSelectedIds(initialSelected);
      setOrderQuantities(initialQtys);
    }
  }, [isOpen, ingredients]);

  // Filtered ingredients to display in the modal table
  const displayedIngredients = useMemo(() => {
    return ingredients
      .filter((ing) => {
        if (!ing.isActive) return false;
        if (filterMode === 'stock_out') {
          return ing.currentStock <= (ing.minStock || 0) || ing.currentStock <= 0;
        }
        return true;
      })
      .filter((ing) => {
        if (!searchTerm.trim()) return true;
        const q = searchTerm.toLowerCase();
        return ing.name.toLowerCase().includes(q) || ing.category.toLowerCase().includes(q);
      });
  }, [ingredients, filterMode, searchTerm]);

  // List of selected ingredients for calculation and printing
  const selectedIngredients = useMemo(() => {
    return ingredients.filter((ing) => selectedIds.has(ing.id));
  }, [ingredients, selectedIds]);

  // Calculate estimated total cost
  const totalEstimatedCost = useMemo(() => {
    return selectedIngredients.reduce((acc, ing) => {
      const qty = orderQuantities[ing.id] || 0;
      const unitCost = ing.avgCostPerUnit || 0;
      return acc + qty * unitCost;
    }, 0);
  }, [selectedIngredients, orderQuantities]);

  // Chunk selected ingredients into pages of exactly 14 items
  const printPages = useMemo(() => {
    const chunks: Ingredient[][] = [];
    for (let i = 0; i < selectedIngredients.length; i += itemsPerPage) {
      chunks.push(selectedIngredients.slice(i, i + itemsPerPage));
    }
    return chunks.length > 0 ? chunks : [[]];
  }, [selectedIngredients, itemsPerPage]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectAll = () => {
    const all = new Set(displayedIngredients.map((i) => i.id));
    setSelectedIds((prev) => new Set([...Array.from(prev), ...Array.from(all)]));
  };

  const deselectAll = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      displayedIngredients.forEach((i) => next.delete(i.id));
      return next;
    });
  };

  const handleQtyChange = (id: string, val: number) => {
    setOrderQuantities((prev) => ({
      ...prev,
      [id]: Math.max(0.1, Number(val) || 0),
    }));
  };

  const handleRemarkChange = (id: string, text: string) => {
    setRemarks((prev) => ({
      ...prev,
      [id]: text,
    }));
  };

  const handlePrint = () => {
    if (selectedIngredients.length === 0) {
      showToast('ദയവായി പ്രിന്റ് ചെയ്യുന്നതിനായി കുറഞ്ഞത് ഒരു ഇനമെങ്കിലും ടിക്ക് ചെയ്യുക.', 'warning');
      return;
    }
    window.print();
  };

  const handleCopyWhatsapp = () => {
    if (selectedIngredients.length === 0) return;

    const today = new Date().toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });

    let text = `🛒 *PULARI BAKES - PURCHASE LIST* (${today})\n`;
    if (vendorName.trim()) {
      text += `🏪 Supplier / Store: ${vendorName.trim()}\n`;
    }
    text += `------------------------------------\n`;

    selectedIngredients.forEach((ing, index) => {
      const qty = orderQuantities[ing.id] || ing.minStock || 1;
      const remark = remarks[ing.id] ? ` (${remarks[ing.id]})` : '';
      text += `${index + 1}. *${ing.name}* : ${qty} ${ing.unit}${remark}\n`;
      if (showCurrentStock) {
        text += `   (Current Stock: ${ing.currentStock} ${ing.unit})\n`;
      }
    });

    text += `------------------------------------\n`;
    text += `Total Items: ${selectedIngredients.length}\n`;
    if (totalEstimatedCost > 0) {
      text += `Est. Total Cost: ₹${totalEstimatedCost.toLocaleString('en-IN')}\n`;
    }

    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Print CSS block embedded cleanly with 14 items page break */}
      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          #epso-printable-purchase-sheet, #epso-printable-purchase-sheet * {
            visibility: visible !important;
          }
          #epso-printable-purchase-sheet {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 12px 16px !important;
            background: #ffffff !important;
            color: #000000 !important;
            display: block !important;
            z-index: 99999 !important;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
          }
          .epso-print-page {
            page-break-after: always !important;
            break-after: page !important;
            min-height: 98vh;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
          }
          .epso-print-page:last-child {
            page-break-after: auto !important;
            break-after: auto !important;
          }
          .no-print-area {
            display: none !important;
          }
          @page {
            size: A4 portrait;
            margin: 10mm 12mm;
          }
        }
      `}</style>

      {/* Screen Interactive Modal */}
      {createPortal(
        <div className="fixed inset-0 z-[9999] w-screen h-screen min-h-screen flex items-center justify-center p-3 sm:p-4 bg-black/65 backdrop-blur-md overflow-y-auto no-print-area animate-apple-backdrop">
          <div className="relative w-full md:w-[70vw] md:max-w-6xl bg-white dark:bg-[#1E1B1B] rounded-2xl border border-stone-200 dark:border-[#2E2828] shadow-2xl overflow-hidden flex flex-col max-h-[92vh] animate-apple-modal google-modal my-auto">
          {/* Modal Header */}
          <div className="p-4 sm:p-5 border-b border-stone-200 dark:border-[#2E2828] flex items-center justify-between gap-3 bg-stone-50/50 dark:bg-[#181515]">
            <div className="flex items-center gap-3">
              <img
                src="/epso-swirl-transparent.png"
                alt="EPSO Brand Icon"
                className="w-10 h-10 object-contain"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = '/pwa-512x512.png';
                }}
              />
              <div>
                <h2 className="text-base sm:text-lg font-black text-stone-900 dark:text-white flex items-center gap-2">
                  <span>Purchase & Reorder List</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 font-bold">
                    {stockOutIngredients.length} Low/0 Stock
                  </span>
                </h2>
                <p className="text-xs text-stone-500 dark:text-stone-400 font-malayalam mt-0.5">
                  സ്റ്റോക്ക് ഔട്ട് ആകാൻ പോകുന്ന ചേരുവകളുടെ പർച്ചേസ് ലിസ്റ്റ് പ്രിന്റ് ചെയ്യുക
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-2 rounded-xl text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-[#282323] transition-colors cursor-pointer"
            >
              <FiX className="w-5 h-5" />
            </button>
          </div>

          {/* Controls Strip */}
          <div className="p-4 border-b border-stone-200 dark:border-[#2E2828] bg-white dark:bg-[#1E1B1B] space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              {/* Category / Filter Switch */}
              <div className="flex items-center gap-1.5 p-1 bg-stone-100 dark:bg-[#161414] rounded-xl border border-stone-200 dark:border-[#2E2828] text-xs">
                <button
                  type="button"
                  onClick={() => setFilterMode('stock_out')}
                  className={`px-3 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                    filterMode === 'stock_out'
                      ? 'bg-white dark:bg-stone-800 text-epso-red dark:text-amber-400 shadow-2xs'
                      : 'text-stone-500 hover:text-stone-800 dark:hover:text-stone-200'
                  }`}
                >
                  <FiAlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                  <span>About to Stock Out ({stockOutIngredients.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setFilterMode('all')}
                  className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                    filterMode === 'all'
                      ? 'bg-white dark:bg-stone-800 text-epso-red dark:text-amber-400 shadow-2xs'
                      : 'text-stone-500 hover:text-stone-800 dark:hover:text-stone-200'
                  }`}
                >
                  All Items ({ingredients.length})
                </button>
              </div>

              {/* Search & Bulk Select */}
              <div className="flex items-center gap-2">
                <div className="relative">
                  <FiSearch className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search item..."
                    className="pl-8 pr-3 py-1.5 text-xs bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-lg text-stone-800 dark:text-stone-200 focus:outline-none focus:ring-1 focus:ring-epso-orange"
                  />
                </div>

                <button
                  type="button"
                  onClick={selectAll}
                  className="px-2.5 py-1.5 text-xs font-bold rounded-lg border border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors cursor-pointer"
                >
                  Select All
                </button>
                <button
                  type="button"
                  onClick={deselectAll}
                  className="px-2.5 py-1.5 text-xs font-bold rounded-lg border border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors cursor-pointer"
                >
                  Deselect All
                </button>
              </div>
            </div>


            {/* Optional Supplier Name & Summary */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <div className="flex items-center gap-2 flex-1 min-w-[240px]">
                <span className="text-xs font-semibold text-stone-500 dark:text-stone-400 whitespace-nowrap">
                  Store / Vendor:
                </span>
                <input
                  type="text"
                  value={vendorName}
                  onChange={(e) => setVendorName(e.target.value)}
                  placeholder="e.g. City Wholesale / Local Merchant (optional)"
                  className="flex-1 px-2.5 py-1 text-xs bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-lg text-stone-800 dark:text-stone-200 focus:outline-none focus:ring-1 focus:ring-epso-orange"
                />
              </div>

              <div className="flex items-center gap-3 text-xs">
                <span className="font-semibold text-stone-600 dark:text-stone-300">
                  Selected:{' '}
                  <strong className="text-epso-red dark:text-amber-400">
                    {selectedIngredients.length}
                  </strong>{' '}
                  items
                </span>
                {totalEstimatedCost > 0 && (
                  <span className="font-semibold text-stone-600 dark:text-stone-300">
                    Est. Budget:{' '}
                    <strong className="text-emerald-600 dark:text-emerald-400">
                      ₹{totalEstimatedCost.toLocaleString('en-IN')}
                    </strong>
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Interactive Checklist Table */}
          <div className="flex-1 overflow-y-auto p-4">
            {displayedIngredients.length === 0 ? (
              <div className="text-center py-12 text-stone-400 font-malayalam text-xs space-y-1">
                <FiPackage className="w-8 h-8 mx-auto text-stone-300 dark:text-stone-600" />
                <p>ലിസ്റ്റിൽ കാണിക്കാൻ ഇനങ്ങൾ ഒന്നും കണ്ടെത്തിയില്ല</p>
              </div>
            ) : (
              <div className="border border-stone-200 dark:border-[#2E2828] rounded-xl overflow-hidden divide-y divide-stone-200 dark:divide-[#2E2828]">
                {/* Table Header: Items (replacing ചേരുവ) */}
                <div className="bg-stone-50 dark:bg-[#161414] px-3 py-2 text-[11px] font-bold text-stone-500 dark:text-stone-400 uppercase tracking-wider grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-1 text-center">Print</div>
                  <div className="col-span-4">Items</div>
                  <div className="col-span-2 text-right">Current Stock</div>
                  <div className="col-span-2 text-right">Min Stock</div>
                  <div className="col-span-3 text-center">Purchase Qty to Buy</div>
                </div>

                {/* Table Rows */}
                {displayedIngredients.map((ing) => {
                  const isChecked = selectedIds.has(ing.id);
                  const isDepleted = ing.currentStock <= 0;
                  const isLow = ing.minStock > 0 && ing.currentStock <= ing.minStock;
                  const qty = orderQuantities[ing.id] ?? 5;
                  const remark = remarks[ing.id] || '';

                  return (
                    <div
                      key={ing.id}
                      className={`px-3 py-2.5 grid grid-cols-12 gap-2 items-center transition-colors text-xs ${
                        isChecked
                          ? 'bg-white dark:bg-[#1E1B1B] hover:bg-stone-50 dark:hover:bg-[#252020]'
                          : 'bg-stone-50/50 dark:bg-[#181515] opacity-60'
                      }`}
                    >
                      {/* Checkbox */}
                      <div className="col-span-1 flex justify-center">
                        <button
                          type="button"
                          onClick={() => toggleSelect(ing.id)}
                          className="cursor-pointer text-stone-600 dark:text-stone-300 hover:text-epso-red transition-colors p-1"
                          title={isChecked ? 'Untick from print list' : 'Tick to include in print list'}
                        >
                          {isChecked ? (
                            <FiCheckSquare className="w-5 h-5 text-epso-red dark:text-amber-400" />
                          ) : (
                            <FiSquare className="w-5 h-5 text-stone-400" />
                          )}
                        </button>
                      </div>

                      {/* Items Name */}
                      <div className="col-span-4 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="font-bold text-stone-900 dark:text-white font-malayalam truncate text-xs sm:text-sm">
                            {ing.name}
                          </p>
                          {isDepleted ? (
                            <span className="text-[9px] px-1.5 py-0.2 rounded font-black bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300">
                              0 Stock
                            </span>
                          ) : isLow ? (
                            <span className="text-[9px] px-1.5 py-0.2 rounded font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                              Low
                            </span>
                          ) : null}
                        </div>
                        <span className="text-[10px] text-stone-400">
                          {ing.category === 'basic' ? 'Basic' : 'Other'} • Unit: {ing.unit}
                        </span>
                      </div>

                      {/* Current Stock */}
                      <div className="col-span-2 text-right">
                        <span
                          className={`font-black ${
                            isDepleted
                              ? 'text-red-600 dark:text-red-400'
                              : isLow
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-stone-800 dark:text-stone-200'
                          }`}
                        >
                          {ing.currentStock}
                        </span>
                        <span className="text-[10px] text-stone-400 ml-1">{ing.unit}</span>
                      </div>

                      {/* Min Stock */}
                      <div className="col-span-2 text-right">
                        <span className="font-semibold text-stone-600 dark:text-stone-400">
                          {ing.minStock || 0}
                        </span>
                        <span className="text-[10px] text-stone-400 ml-1">{ing.unit}</span>
                      </div>

                      {/* Editable Order Quantity Input & Remark */}
                      <div className="col-span-3 flex items-center justify-end gap-1.5">
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            min="0.001"
                            step="any"
                            value={qty}
                            disabled={!isChecked}
                            onChange={(e) => handleQtyChange(ing.id, parseFloat(e.target.value))}
                            className="w-16 px-2 py-1 text-xs text-right font-bold bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700 rounded-lg text-stone-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-epso-orange disabled:opacity-40"
                          />
                          <span className="text-xs font-bold text-stone-500 w-6">{ing.unit}</span>
                        </div>
                        {showRemarks && (
                          <input
                            type="text"
                            value={remark}
                            placeholder="Note..."
                            disabled={!isChecked}
                            onChange={(e) => handleRemarkChange(ing.id, e.target.value)}
                            className="w-24 px-2 py-1 text-[11px] bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700 rounded-lg text-stone-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-epso-orange disabled:opacity-40"
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Modal Footer with Actions */}
          <div className="p-4 border-t border-stone-200 dark:border-[#2E2828] bg-stone-50/70 dark:bg-[#181515] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="text-xs text-stone-500 dark:text-stone-400">
              <span>Selected for print: </span>
              <strong className="text-stone-900 dark:text-white font-bold">
                {selectedIngredients.length}
              </strong>{' '}
              of {ingredients.length} items ({printPages.length} print page{printPages.length > 1 ? 's' : ''})
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCopyWhatsapp}
                disabled={selectedIngredients.length === 0}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-700 text-xs font-bold transition-all disabled:opacity-40 cursor-pointer"
                title="Copy formatted purchase list for WhatsApp/SMS"
              >
                {copied ? (
                  <>
                    <FiCheck className="w-4 h-4 text-emerald-500" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <FiCopy className="w-4 h-4 text-stone-500" />
                    <span>Copy for WhatsApp</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handlePrint}
                disabled={selectedIngredients.length === 0}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-epso-red hover:bg-epso-red-hover dark:bg-amber-500 dark:hover:bg-amber-600 text-white dark:text-stone-950 font-bold text-xs shadow-md press-apple transition-all disabled:opacity-40 cursor-pointer"
              >
                <FiPrinter className="w-4 h-4" />
                <span>Print Purchase List ({selectedIngredients.length})</span>
              </button>
            </div>
          </div>
        </div>
      </div>,
      document.body
    )}

      {/* Hidden Pure Printable Sheet (Paginated at exactly 14 items per page) */}
      <div id="epso-printable-purchase-sheet" style={{ display: 'none' }}>
        {printPages.map((pageItems, pageIdx) => {
          const isLastPage = pageIdx === printPages.length - 1;
          const startIdx = pageIdx * itemsPerPage;

          return (
            <div key={pageIdx} className="epso-print-page">
              <div>
                {/* Print Header */}
                <div style={{ borderBottom: '2px solid #000000', paddingBottom: '10px', marginBottom: '14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                      <img
                        src="/epso-swirl-transparent.png"
                        alt="Pulari Bakes Icon"
                        style={{ width: '48px', height: '48px', objectFit: 'contain' }}
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = '/pwa-512x512.png';
                        }}
                      />
                      <div>
                        <h1 style={{ fontSize: '20px', fontWeight: '900', margin: '0 0 3px 0', letterSpacing: '-0.5px' }}>
                          PULARI BAKES
                        </h1>
                        <h2 style={{ fontSize: '13px', fontWeight: 'bold', margin: '0', color: '#222222' }}>
                          PANTRY PURCHASE LIST (പർച്ചേസ് ലിസ്റ്റ്)
                        </h2>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', fontSize: '11px', color: '#333333' }}>
                      <div><strong>Date:</strong> {new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
                      <div><strong>Time:</strong> {new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</div>
                      {vendorName.trim() && <div><strong>Store / Vendor:</strong> {vendorName.trim()}</div>}
                      <div style={{ marginTop: '2px', fontWeight: 'bold' }}>
                        Page {pageIdx + 1} of {printPages.length}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Print Table (14 rows per page) */}
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', marginBottom: '16px' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f2f2f2', borderBottom: '1.5px solid #000000', textAlign: 'left' }}>
                      <th style={{ padding: '8px 6px', border: '1px solid #cccccc', width: '32px', textAlign: 'center' }}>#</th>
                      <th style={{ padding: '8px 10px', border: '1px solid #cccccc' }}>Items</th>
                      {showCategory && (
                        <th style={{ padding: '8px 8px', border: '1px solid #cccccc', width: '75px', textAlign: 'center' }}>
                          വിഭാഗം
                        </th>
                      )}
                      {showCurrentStock && (
                        <th style={{ padding: '8px 8px', border: '1px solid #cccccc', width: '90px', textAlign: 'right' }}>
                          നിലവിലെ stock
                        </th>
                      )}
                      <th style={{ padding: '8px 10px', border: '1px solid #cccccc', width: '120px', textAlign: 'right', fontWeight: 'bold' }}>
                        വാങ്ങേണ്ട അളവ്
                      </th>
                      <th style={{ padding: '8px 8px', border: '1px solid #cccccc', width: '55px', textAlign: 'center' }}>
                        യൂണിറ്റ്
                      </th>
                      {showRemarks && (
                        <th style={{ padding: '8px 10px', border: '1px solid #cccccc', width: '120px' }}>
                          കുറിപ്പുകൾ
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {pageItems.map((ing, idx) => {
                      const overallIdx = startIdx + idx + 1;
                      const qty = orderQuantities[ing.id] ?? ing.minStock ?? 1;
                      const remark = remarks[ing.id] || '';

                      return (
                        <tr key={ing.id} style={{ borderBottom: '1px solid #dddddd' }}>
                          <td style={{ padding: '7px 6px', border: '1px solid #dddddd', textAlign: 'center' }}>{overallIdx}</td>
                          <td style={{ padding: '7px 10px', border: '1px solid #dddddd', fontWeight: 'bold' }}>
                            {ing.name}
                          </td>
                          {showCategory && (
                            <td style={{ padding: '7px 8px', border: '1px solid #dddddd', textAlign: 'center', fontSize: '10px' }}>
                              {ing.category === 'basic' ? 'Basic' : 'Other'}
                            </td>
                          )}
                          {showCurrentStock && (
                            <td style={{ padding: '7px 8px', border: '1px solid #dddddd', textAlign: 'right' }}>
                              {ing.currentStock} {ing.unit}
                            </td>
                          )}
                          <td style={{ padding: '7px 10px', border: '1px solid #dddddd', textAlign: 'right', fontWeight: '900', fontSize: '13px' }}>
                            {qty}
                          </td>
                          <td style={{ padding: '7px 8px', border: '1px solid #dddddd', textAlign: 'center', fontWeight: 'bold' }}>
                            {ing.unit}
                          </td>
                          {showRemarks && (
                            <td style={{ padding: '7px 10px', border: '1px solid #dddddd', fontStyle: 'italic', fontSize: '11px' }}>
                              {remark}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Print Summary & Signatures (Displayed on the last page) */}
              {isLastPage && (
                <div style={{ marginTop: 'auto', paddingTop: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', borderTop: '1px dashed #666666', paddingTop: '8px', marginBottom: '24px' }}>
                    <div>
                      <strong>Total Items to Purchase:</strong> {selectedIngredients.length}
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px', fontSize: '11px', paddingTop: '12px', borderTop: '1px solid #dddddd' }}>
                    <div>
                      <div><strong>Prepared by:</strong></div>
                      <div style={{ marginTop: '26px' }}>Admin / Kitchen Manager</div>
                    </div>
                    <div>
                      <div><strong>Purchased by:</strong></div>
                      <div style={{ marginTop: '26px' }}>___________________________</div>
                    </div>
                    <div>
                      <div><strong>Received & Verified by:</strong></div>
                      <div style={{ marginTop: '26px' }}>___________________________</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
};
