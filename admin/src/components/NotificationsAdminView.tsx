import React, { useState, useMemo } from 'react';
import { Ingredient, Product, ProductionRun, AuditLog } from '../types';
import {
  FiPrinter,
  FiRefreshCw,
  FiArrowRight,
  FiX,
  FiCheck,
} from 'react-icons/fi';
import { PrintPurchaseListModal } from './PrintPurchaseListModal';
import { useLockBodyScroll } from '../hooks/useLockBodyScroll';

interface NotificationsAdminViewProps {
  ingredients: Ingredient[];
  products: Product[];
  productionRuns: ProductionRun[];
  auditLogs?: AuditLog[];
  dismissedIds?: Set<string>;
  onDismiss?: (id: string) => void;
  onDismissAll?: (ids: string[]) => void;
  onRestore?: () => void;
  onNavigateTab: (tab: any) => void;
  onRefresh: () => void;
}

export type NotificationFilter = 'all' | 'critical' | 'stock' | 'batches' | 'recipes';

export interface AdminNotification {
  id: string;
  type: 'critical_stock' | 'low_stock' | 'recipe_missing' | 'batch_variance';
  severity: 'critical' | 'warning' | 'info';
  title: string;
  subtitle?: string;
  description: string;
  timestamp?: string;
  referenceId?: string;
  actionTab?: 'ingredients' | 'recipes' | 'products' | 'movements';
  actionLabel?: string;
  meta?: {
    current?: number;
    required?: number;
    unit?: string;
    deficit?: number;
  };
}

export const NotificationsAdminView: React.FC<NotificationsAdminViewProps> = ({
  ingredients,
  products,
  productionRuns,
  dismissedIds: externalDismissedIds,
  onDismiss,
  onDismissAll,
  onRestore,
  onNavigateTab,
  onRefresh,
}) => {
  const [filter, setFilter] = useState<NotificationFilter>('all');
  const [localDismissedIds, setLocalDismissedIds] = useState<Set<string>>(new Set());
  const [purchaseListModalOpen, setPurchaseListModalOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const activeDismissed = externalDismissedIds || localDismissedIds;

  useLockBodyScroll(purchaseListModalOpen);

  // Generate dynamic real-time notifications
  const notifications = useMemo<AdminNotification[]>(() => {
    const list: AdminNotification[] = [];

    // 1. Ingredients Critical & Low Stock
    ingredients.forEach((ing) => {
      if (!ing.isActive) return;

      if (ing.currentStock <= 0) {
        list.push({
          id: `stock-zero-${ing.id}`,
          type: 'critical_stock',
          severity: 'critical',
          title: ing.name,
          subtitle: 'സ്റ്റോക്ക് തീർന്നു',
          description: `നിലവിലെ സ്റ്റോക്ക് 0 ${ing.unit} ആണ്. മിനിമം പരിധി ${ing.minStock} ${ing.unit}.`,
          timestamp: ing.updatedAt || 'Now',
          referenceId: ing.id,
          actionTab: 'ingredients',
          actionLabel: 'സ്റ്റോക്ക് ചേർക്കുക',
          meta: {
            current: 0,
            required: ing.minStock,
            unit: ing.unit,
            deficit: ing.minStock,
          },
        });
      } else if (ing.minStock > 0 && ing.currentStock <= ing.minStock) {
        const deficit = Number((ing.minStock - ing.currentStock).toFixed(2));
        list.push({
          id: `stock-low-${ing.id}`,
          type: 'low_stock',
          severity: 'warning',
          title: ing.name,
          subtitle: 'കുറഞ്ഞ സ്റ്റോക്ക്',
          description: `സ്റ്റോക്ക് ${ing.currentStock} ${ing.unit} ആയി കുറഞ്ഞു (മിനിമം പരിധി ${ing.minStock} ${ing.unit}).`,
          timestamp: ing.updatedAt || 'Now',
          referenceId: ing.id,
          actionTab: 'ingredients',
          actionLabel: 'സ്റ്റോക്ക് മാറ്റുക',
          meta: {
            current: ing.currentStock,
            required: ing.minStock,
            unit: ing.unit,
            deficit,
          },
        });
      }
    });

    // 2. Products without recipes
    products.forEach((prod) => {
      if (prod.isActive && !prod.recipeId) {
        list.push({
          id: `recipe-missing-${prod.id}`,
          type: 'recipe_missing',
          severity: 'info',
          title: prod.name,
          subtitle: 'റെസിപ്പി ചേർത്തിട്ടില്ല',
          description: 'ഈ ഉൽപ്പന്നത്തിന് റെസിപ്പി നിർവചിച്ചിട്ടില്ല.',
          referenceId: prod.id,
          actionTab: 'recipes',
          actionLabel: 'റെസിപ്പി ചേർക്കുക',
        });
      }
    });

    // 3. Batch Output Discrepancies or Cancellations
    productionRuns.slice(0, 15).forEach((run) => {
      if (run.status === 'cancelled') {
        list.push({
          id: `batch-cancel-${run.id}`,
          type: 'batch_variance',
          severity: 'warning',
          title: `${run.productName} (#${run.runNumber})`,
          subtitle: 'റദ്ദാക്കിയ ബാച്ച്',
          description: `${run.operatorName} റദ്ദാക്കി. കാരണം: ${run.cancellationReason || run.notes || 'നൽകിയിട്ടില്ല'}.`,
          timestamp: run.productionDate,
          referenceId: run.id,
          actionTab: 'movements',
          actionLabel: 'പരിശോധിക്കുക',
        });
      } else if (run.plannedQuantity > 0 && run.actualQuantity < run.plannedQuantity * 0.85) {
        const shortKg = Number((run.plannedQuantity - run.actualQuantity).toFixed(1));
        list.push({
          id: `batch-short-${run.id}`,
          type: 'batch_variance',
          severity: 'warning',
          title: `${run.productName} (#${run.runNumber})`,
          subtitle: 'ഉൽപ്പാദനം കുറവ്',
          description: `ലക്ഷ്യത്തേക്കാൾ ${shortKg} ${run.unit} കുറവാണ് ലഭിച്ചത് (യഥാർത്ഥ അളവ്: ${run.actualQuantity}/${run.plannedQuantity} ${run.unit}).`,
          timestamp: run.productionDate,
          referenceId: run.id,
          actionTab: 'movements',
          actionLabel: 'പരിശോധിക്കുക',
        });
      }
    });

    return list;
  }, [ingredients, products, productionRuns]);

  const activeNotifications = useMemo(() => {
    return notifications.filter((n) => !activeDismissed.has(n.id));
  }, [notifications, activeDismissed]);

  const criticalCount = activeNotifications.filter((n) => n.severity === 'critical').length;
  const lowStockCount = activeNotifications.filter((n) => n.type === 'low_stock').length;
  const batchCount = activeNotifications.filter((n) => n.type === 'batch_variance').length;
  const recipeCount = activeNotifications.filter((n) => n.type === 'recipe_missing').length;

  const filteredNotifications = useMemo(() => {
    return activeNotifications.filter((n) => {
      if (filter === 'critical') return n.severity === 'critical';
      if (filter === 'stock') return n.type === 'critical_stock' || n.type === 'low_stock';
      if (filter === 'batches') return n.type === 'batch_variance';
      if (filter === 'recipes') return n.type === 'recipe_missing';
      return true;
    });
  }, [activeNotifications, filter]);

  const handleDismiss = (id: string) => {
    if (onDismiss) {
      onDismiss(id);
    } else {
      setLocalDismissedIds((prev) => new Set(prev).add(id));
    }
  };

  const handleDismissAll = () => {
    const ids = activeNotifications.map((n) => n.id);
    if (onDismissAll) {
      onDismissAll(ids);
    } else {
      setLocalDismissedIds((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.add(id));
        return next;
      });
    }
  };

  return (
    <div className="space-y-5 max-w-4xl pb-16">
      {/* Top Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-end gap-3 pb-3 border-b border-stone-200 dark:border-[#2E2828]">

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setPurchaseListModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border border-amber-300 dark:border-amber-800/80 bg-amber-50/80 dark:bg-amber-950/30 text-amber-900 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-950/60 transition-colors cursor-pointer font-malayalam"
            title="പർച്ചേസ് ലിസ്റ്റ് പ്രിന്റ് ചെയ്യുക"
          >
            <FiPrinter className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
            <span>പർച്ചേസ് ലിസ്റ്റ്</span>
          </button>

          {activeDismissed.size > 0 && onRestore && (
            <button
              onClick={onRestore}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-[#282323] transition-colors cursor-pointer font-malayalam"
            >
              ഒഴിവാക്കിയവ പുനഃസ്ഥാപിക്കുക ({activeDismissed.size})
            </button>
          )}

          {filteredNotifications.length > 0 && (
            <button
              onClick={handleDismissAll}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-[#282323] transition-colors cursor-pointer font-malayalam"
            >
              എല്ലാം ക്ലിയർ ചെയ്യുക
            </button>
          )}

          <button
            onClick={async () => {
              setIsRefreshing(true);
              try {
                await onRefresh();
              } finally {
                setTimeout(() => setIsRefreshing(false), 400);
              }
            }}
            disabled={isRefreshing}
            className="p-2 rounded-xl text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-[#282323] transition-colors cursor-pointer disabled:opacity-50"
            title="Refresh alerts"
          >
            <FiRefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Sleek Minimal Tab Filter Bar */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
        {[
          { id: 'all', label: 'എല്ലാം', count: activeNotifications.length },
          { id: 'critical', label: 'അടിയന്തിരം', count: criticalCount, isCritical: true },
          { id: 'stock', label: 'കുറഞ്ഞ സ്റ്റോക്ക്', count: lowStockCount, isWarning: true },
          { id: 'batches', label: 'ബാച്ചുകൾ', count: batchCount },
          { id: 'recipes', label: 'റെസിപ്പികൾ', count: recipeCount },
        ].map((tab) => {
          const isActive = filter === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setFilter(tab.id as NotificationFilter)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer font-malayalam ${
                isActive
                  ? 'bg-stone-900 text-white dark:bg-white dark:text-stone-900 shadow-2xs'
                  : 'bg-white dark:bg-[#1E1B1B] text-stone-600 dark:text-stone-400 border border-stone-200 dark:border-[#2E2828] hover:bg-stone-50 dark:hover:bg-[#252020]'
              }`}
            >
              {tab.isCritical && tab.count > 0 && (
                <span className="w-2 h-2 rounded-full bg-red-500" />
              )}
              {tab.isWarning && tab.count > 0 && (
                <span className="w-2 h-2 rounded-full bg-amber-500" />
              )}
              <span>{tab.label}</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                  isActive
                    ? 'bg-stone-700 text-white dark:bg-stone-200 dark:text-stone-900'
                    : 'bg-stone-100 dark:bg-[#282323] text-stone-500 dark:text-stone-400'
                }`}
              >
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Clean, Premium Notification List */}
      <div className="space-y-2.5">
        {filteredNotifications.length === 0 ? (
          <div className="py-16 text-center rounded-2xl bg-white dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#2E2828]">
            <div className="w-10 h-10 mx-auto rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-2">
              <FiCheck className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold text-stone-900 dark:text-white font-malayalam">
              എല്ലാം കൃത്യമാണ്
            </h3>
            <p className="text-xs text-stone-400 font-malayalam mt-0.5">
              നിലവിൽ പ്രശ്നങ്ങളോ അലേർട്ടുകളോ ഇല്ല
            </p>
          </div>
        ) : (
          filteredNotifications.map((n) => {
            const isCritical = n.severity === 'critical';
            const isWarning = n.severity === 'warning';

            return (
              <div
                key={n.id}
                className="group relative p-4 rounded-2xl bg-white dark:bg-[#1E1B1B] border border-stone-200/90 dark:border-[#2E2828] hover:border-stone-300 dark:hover:border-stone-700 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-apple-card dark:shadow-none"
              >
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  {/* Subtle Severity Indicator Pill */}
                  <div className="mt-1 shrink-0">
                    <span
                      className={`w-2.5 h-2.5 rounded-full block ${
                        isCritical
                          ? 'bg-red-500 ring-4 ring-red-50 dark:ring-red-950/40'
                          : isWarning
                          ? 'bg-amber-500 ring-4 ring-amber-50 dark:ring-amber-950/40'
                          : 'bg-blue-500 ring-4 ring-blue-50 dark:ring-blue-950/40'
                      }`}
                    />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="text-sm font-bold text-stone-900 dark:text-white font-malayalam">
                        {n.title}
                      </h4>
                      {n.subtitle && (
                        <span className="text-[11px] font-medium text-stone-400 font-malayalam">
                          • {n.subtitle}
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-stone-500 dark:text-stone-400 font-malayalam mt-0.5">
                      {n.description}
                    </p>

                    {/* Compact tabular meta metrics in Malayalam */}
                    {n.meta && (
                      <div className="flex items-center gap-2 mt-2 flex-wrap text-[11px] font-malayalam">
                        <span className="px-2 py-0.5 rounded-md bg-stone-100 dark:bg-[#282323] text-stone-600 dark:text-stone-300 font-medium">
                          ഇപ്പോഴത്തെ സ്റ്റോക്ക്: <strong className="text-stone-900 dark:text-white font-bold">{n.meta.current} {n.meta.unit}</strong>
                        </span>
                        <span className="px-2 py-0.5 rounded-md bg-stone-100 dark:bg-[#282323] text-stone-600 dark:text-stone-300 font-medium">
                          മിനിമം പരിധി: <strong className="text-stone-900 dark:text-white font-bold">{n.meta.required} {n.meta.unit}</strong>
                        </span>
                        {n.meta.deficit !== undefined && n.meta.deficit > 0 && (
                          <span className="px-2 py-0.5 rounded-md bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 font-bold">
                            കുറവ്: {n.meta.deficit} {n.meta.unit}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Right Actions: Direct Link + Dismiss */}
                <div className="flex items-center justify-end gap-2 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-stone-100 dark:border-[#282323]">
                  {n.actionTab && (
                    <button
                      onClick={() => onNavigateTab(n.actionTab)}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold bg-stone-100 hover:bg-stone-200 dark:bg-[#282323] dark:hover:bg-[#332c2c] text-stone-800 dark:text-stone-200 transition-colors press-apple cursor-pointer"
                    >
                      <span>{n.actionLabel || 'View'}</span>
                      <FiArrowRight className="w-3 h-3 text-stone-400" />
                    </button>
                  )}

                  <button
                    onClick={() => handleDismiss(n.id)}
                    className="p-1.5 rounded-lg text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-[#282323] transition-colors cursor-pointer"
                    title="Dismiss notification"
                  >
                    <FiX className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Printable Purchase List Modal */}
      <PrintPurchaseListModal
        isOpen={purchaseListModalOpen}
        onClose={() => setPurchaseListModalOpen(false)}
        ingredients={ingredients}
      />
    </div>
  );
};
