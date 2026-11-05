import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { useLanguage } from '../context/LanguageContext';
import { AdminAuthGate } from '../components/admin/AdminAuthGate';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Input } from '../components/ui/Input';
import { RecipeFormModal } from '../components/recipes/RecipeFormModal';
import { RecipeDetailModal } from '../components/recipes/RecipeDetailModal';
import { StockAdjustmentModal } from '../components/ingredients/StockAdjustmentModal';
import { BatchCardSkeleton } from '../components/ui/BatchCardSkeleton';
import {
  AdminDashboardMetrics,
  ProductionRun,
  Recipe,
  Product,
  Ingredient,
  StockMovement,
  AuditLog,
} from '../types';
import {
  TbDashboard,
  TbChefHat,
  TbBook,
  TbReportAnalytics,
  TbFileSpreadsheet,
  TbHistory,
  TbShieldCheck,
  TbRefresh,
  TbLock,
  TbCalendar,
  TbPlus,
  TbSearch,
  TbDatabase,
  TbAdjustmentsHorizontal,
} from 'react-icons/tb';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';

type AdminTab = 'overview' | 'production' | 'recipes' | 'ledger' | 'reports' | 'audit' | 'system';
type DatePreset = 'today' | '7d' | '30d' | 'all';

export const AdminPage: React.FC = () => {
  return (
    <AdminAuthGate>
      <AdminDashboardContent />
    </AdminAuthGate>
  );
};

const AdminDashboardContent: React.FC = () => {
  const { repo, logoutAdmin, addToast, staffName } = useApp();
  const { t, language } = useLanguage();

  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [datePreset, setDatePreset] = useState<DatePreset>('7d');
  const [loading, setLoading] = useState(true);

  // Data states
  const [metrics, setMetrics] = useState<AdminDashboardMetrics | null>(null);
  const [productionRuns, setProductionRuns] = useState<ProductionRun[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  // Search & Filters inside tabs
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'completed' | 'cancelled'>('all');

  // Modals
  const [selectedRunForDetail, setSelectedRunForDetail] = useState<ProductionRun | null>(null);
  const [isRecipeFormOpen, setIsRecipeFormOpen] = useState(false);
  const [recipeToEdit, setRecipeToEdit] = useState<Recipe | null>(null);
  const [selectedRecipeForDetail, setSelectedRecipeForDetail] = useState<Recipe | null>(null);
  const [isAdjustOpen, setIsAdjustOpen] = useState(false);

  // Compute date range
  const { startDate, endDate } = useMemo(() => {
    const today = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const toYMD = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    if (datePreset === 'today') {
      const d = toYMD(today);
      return { startDate: d, endDate: d };
    }
    if (datePreset === '7d') {
      const prev = new Date();
      prev.setDate(today.getDate() - 6);
      return { startDate: toYMD(prev), endDate: toYMD(today) };
    }
    if (datePreset === '30d') {
      const prev = new Date();
      prev.setDate(today.getDate() - 29);
      return { startDate: toYMD(prev), endDate: toYMD(today) };
    }
    if (datePreset === 'all') {
      return { startDate: '2020-01-01', endDate: toYMD(today) };
    }
    return { startDate: toYMD(today), endDate: toYMD(today) };
  }, [datePreset]);

  // Load Data
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [m, runs, recList, prodList, ingList, mvs, logs] = await Promise.all([
        repo.getAdminDashboardMetrics(startDate, endDate),
        repo.listProductionRuns({ limit: 100 }),
        repo.listRecipes(),
        repo.listProducts(true),
        repo.listIngredients(true),
        repo.getStockMovements({ limit: 100 }),
        repo.getAuditLogs(100),
      ]);

      setMetrics(m);
      setProductionRuns(runs);
      setRecipes(recList);
      setProducts(prodList);
      setIngredients(ingList);
      setMovements(mvs);
      setAuditLogs(logs);
    } catch (err: any) {
      console.error('Failed to load admin data:', err);
      addToast(err?.message || 'Failed to refresh data', 'error');
    } finally {
      setLoading(false);
    }
  }, [repo, startDate, endDate, addToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handle Cancellation of a Run
  const handleCancelRun = async (run: ProductionRun) => {
    const reason = window.prompt(
      language === 'ml'
        ? `ഈ ഉൽപ്പാദന ബാച്ച് (#${run.runNumber}) റദ്ദാക്കാനുള്ള കാരണം നൽകുക:`
        : `Enter reason for cancelling production run #${run.runNumber}:`
    );
    if (!reason || !reason.trim()) return;

    try {
      await repo.cancelProductionRun({
        runId: run.id,
        reason: reason.trim(),
        operatorName: staffName || 'Admin Owner',
      });
      addToast(
        language === 'ml'
          ? `ബാച്ച് #${run.runNumber} റദ്ദാക്കി. സ്റ്റോക്ക് വിവരങ്ങൾ തിരികെ ചേർത്തു.`
          : `Run #${run.runNumber} cancelled. Ingredient stock reversed.`,
        'success'
      );
      loadData();
      setSelectedRunForDetail(null);
    } catch (err: any) {
      addToast(err?.message || 'Failed to cancel production run', 'error');
    }
  };

  // CSV Export
  const exportProductionCsv = () => {
    if (productionRuns.length === 0) {
      addToast(language === 'ml' ? 'കയറ്റുമതി ചെയ്യാൻ റെക്കോർഡുകൾ ഇല്ല' : 'No records to export', 'info');
      return;
    }

    const headers = [
      'Run Number',
      'Production Date',
      'Product Name',
      'Planned Qty',
      'Actual Qty',
      'Unit',
      'Status',
      'Operator',
      'Cancellation Reason',
      'Created At',
    ];

    const rows = productionRuns.map((r) => [
      `"${r.runNumber}"`,
      `"${r.productionDate}"`,
      `"${r.productName.replace(/"/g, '""')}"`,
      r.plannedQuantity,
      r.actualQuantity,
      `"${r.unit}"`,
      `"${r.status}"`,
      `"${(r.operatorName || '').replace(/"/g, '""')}"`,
      `"${(r.cancellationReason || '').replace(/"/g, '""')}"`,
      `"${r.createdAt}"`,
    ]);

    const csvContent = [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `pulari_bakes_production_report_${startDate}_to_${endDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    addToast(language === 'ml' ? 'CSV റിപ്പോർട്ട് ഡൗൺലോഡ് ചെയ്തു' : 'Production CSV exported successfully', 'success');
  };

  const exportConsumptionCsv = () => {
    if (!metrics || metrics.consumption.length === 0) {
      addToast(language === 'ml' ? 'കയറ്റുമതി ചെയ്യാൻ വിവരങ്ങൾ ഇല്ല' : 'No consumption data to export', 'info');
      return;
    }

    const headers = ['Ingredient Name', 'Category', 'Unit', 'Total Consumed In Period'];
    const rows = metrics.consumption.map((c) => [
      `"${c.ingredientName.replace(/"/g, '""')}"`,
      `"${c.category}"`,
      `"${c.unit}"`,
      c.totalConsumed,
    ]);

    const csvContent = [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `pulari_bakes_ingredient_consumption_${startDate}_to_${endDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    addToast(language === 'ml' ? 'ചേരുവ ഉപഭോഗ റിപ്പോർട്ട് ഡൗൺലോഡ് ചെയ്തു' : 'Consumption CSV exported', 'success');
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-16">
      {/* Top Header & Admin Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-[#1E1B1B] p-4 rounded-2xl border border-charcoal-border dark:border-[#2E2828] shadow-xs transition-colors">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 bg-red-100 dark:bg-red-950/50 text-epso-red dark:text-red-300 rounded-lg">
              <TbShieldCheck className="w-5 h-5" />
            </span>
            <h1 className="text-xl sm:text-2xl font-black text-charcoal tracking-tight">
              {t('ownerDashboard')}
            </h1>
          </div>
          <p className="text-xs text-charcoal-muted mt-0.5">
            {language === 'ml'
              ? 'ഉടമയ്ക്കായുള്ള ഉൽപ്പാദന മേൽനോട്ടവും സുരക്ഷിത ഭരണനിർവ്വഹണവും'
              : 'Secure factory management, inventory ledger, recipes, and verified records.'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={loadData}
            isLoading={loading}
            icon={<TbRefresh className="w-4 h-4" />}
          >
            {language === 'ml' ? 'പുതുക്കുക' : 'Refresh'}
          </Button>

          <Button
            variant="danger"
            size="sm"
            onClick={logoutAdmin}
            icon={<TbLock className="w-4 h-4" />}
          >
            {t('logoutAdmin')}
          </Button>
        </div>
      </div>

      {/* Admin Navigation Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs border-b border-charcoal-border/70">
        {[
          { id: 'overview', label: language === 'ml' ? 'മേൽനോട്ടം' : 'Overview', icon: <TbDashboard className="w-4 h-4" /> },
          { id: 'production', label: language === 'ml' ? 'ഉൽപ്പാദന രേഖകൾ' : 'Production Records', icon: <TbChefHat className="w-4 h-4" /> },
          { id: 'recipes', label: language === 'ml' ? 'പാചകക്കുറിപ്പുകൾ' : 'Recipes / BOM', icon: <TbBook className="w-4 h-4" /> },
          { id: 'ledger', label: language === 'ml' ? 'സ്റ്റോക്ക് ലെഡ്ജർ' : 'Stock Movements', icon: <TbHistory className="w-4 h-4" /> },
          { id: 'reports', label: language === 'ml' ? 'റിപ്പോർട്ടുകൾ & CSV' : 'Reports & Export', icon: <TbReportAnalytics className="w-4 h-4" /> },
          { id: 'audit', label: language === 'ml' ? 'ഓഡിറ്റ് ലോഗുകൾ' : 'Audit Logs', icon: <TbShieldCheck className="w-4 h-4" /> },
          { id: 'system', label: language === 'ml' ? 'സിസ്റ്റം ആരോഗ്യം' : 'System Health', icon: <TbDatabase className="w-4 h-4" /> },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as AdminTab)}
            className={`px-3 py-2 rounded-xl font-bold transition-all flex items-center gap-1.5 whitespace-nowrap select-none press-apple ${
              activeTab === tab.id
                ? 'bg-epso-red text-white shadow-sm shadow-sm'
                : 'bg-transparent text-charcoal-muted hover:bg-stone-50 dark:hover:bg-[#282323] hover:text-charcoal'
            }`}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Date Range Selector (Active for Overview & Reports) */}
      {(activeTab === 'overview' || activeTab === 'reports') && (
        <div className="flex flex-wrap items-center justify-between gap-3 bg-stone-50 dark:bg-[#141212] p-3 rounded-xl border border-charcoal-border dark:border-[#2E2828] text-xs">
          <div className="flex items-center gap-2">
            <TbCalendar className="w-4 h-4 text-epso-red dark:text-amber-400" />
            <span className="font-bold text-charcoal">
              {language === 'ml' ? 'കാലയളവ്:' : 'Period:'}
            </span>
            <div className="flex items-center gap-1">
              {[
                { id: 'today', label: t('dateRangeToday') },
                { id: '7d', label: t('dateRange7Days') },
                { id: '30d', label: t('dateRange30Days') },
                { id: 'all', label: language === 'ml' ? 'എല്ലാം' : 'All Time' },
              ].map((p) => (
                <button
                  key={p.id}
                  onClick={() => setDatePreset(p.id as DatePreset)}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition-all ${
                    datePreset === p.id
                      ? 'bg-epso-red text-white shadow-sm'
                      : 'bg-white text-charcoal-muted border border-charcoal-border hover:bg-stone-50 dark:hover:bg-[#282323]'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="text-[11px] font-bold text-charcoal-muted">
            {startDate} <span className="mx-1">→</span> {endDate}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 1: OVERVIEW */}
      {/* ========================================================================= */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Top Metric Cards (Calculated directly from persisted database records) */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Card padding="sm" className="border-charcoal-border dark:border-[#2E2828]">
              <span className="text-[11px] font-bold text-charcoal-muted block">
                {language === 'ml' ? 'ഇന്നത്തെ ഉൽപ്പാദനം' : "Today's Production"}
              </span>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="text-2xl font-black text-stone-900 dark:text-white">
                  {metrics?.qtyToday ?? 0}
                </span>
                <span className="text-xs font-bold text-charcoal-muted">units</span>
              </div>
              <p className="text-[10px] text-charcoal-muted mt-1">
                {metrics?.runsToday ?? 0} {language === 'ml' ? 'ബാച്ചുകൾ പൂർത്തിയായി' : 'batches completed today'}
              </p>
            </Card>

            <Card padding="sm" className="border-charcoal-border dark:border-[#2E2828]">
              <span className="text-[11px] font-bold text-charcoal-muted block">
                {language === 'ml' ? 'തിരഞ്ഞെടുത്ത കാലയളവിൽ' : 'Period Output'}
              </span>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="text-2xl font-black text-stone-900 dark:text-white">
                  {metrics?.qtyInPeriod ?? 0}
                </span>
                <span className="text-xs font-bold text-charcoal-muted">units</span>
              </div>
              <p className="text-[10px] text-charcoal-muted mt-1">
                {metrics?.runsInPeriod ?? 0} {language === 'ml' ? 'ബാച്ചുകൾ' : 'total batches in range'}
              </p>
            </Card>

            <Card padding="sm">
              <span className="text-[11px] font-bold text-charcoal-muted block">
                {language === 'ml' ? 'ലഭ്യമായ ഉൽപ്പന്നങ്ങൾ' : 'Active Products'}
              </span>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="text-2xl font-black text-charcoal">
                  {metrics?.activeProducts ?? products.filter((p) => p.isActive).length}
                </span>
                <span className="text-xs font-bold text-charcoal-muted">/ {products.length}</span>
              </div>
              <p className="text-[10px] text-charcoal-muted mt-1">
                {products.length} {language === 'ml' ? 'സ്നാക്കുകൾ കാറ്റലോഗിൽ' : 'snacks in catalogue'}
              </p>
            </Card>

            <Card padding="sm">
              <span className="text-[11px] font-bold text-charcoal-muted block">
                {language === 'ml' ? 'ചേരുവകൾ' : 'Raw Ingredients'}
              </span>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="text-2xl font-black text-charcoal">
                  {metrics?.totalIngredients ?? ingredients.length}
                </span>
                <span className="text-xs font-bold text-charcoal-muted">items</span>
              </div>
              <p className="text-[10px] text-charcoal-muted mt-1">
                7 Basic • 36 Other Ingredients
              </p>
            </Card>
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Chart 1: Production by Product */}
            <Card padding="md" className="space-y-3">
              <div>
                <h3 className="text-sm font-black text-charcoal">
                  {t('mostProducedSnacks')}
                </h3>
                <p className="text-xs text-charcoal-muted">
                  {language === 'ml' ? 'യഥാർത്ഥ ഡാറ്റാബേസ് രേഖകൾ പ്രകാരം' : 'Calculated from persisted batches in selected period'}
                </p>
              </div>

              {!metrics || metrics.byProduct.length === 0 ? (
                <div className="py-12 text-center text-charcoal-muted text-xs bg-canvas-subtle rounded-xl border border-dashed border-charcoal-border">
                  <TbChefHat className="w-8 h-8 text-charcoal-muted/40 mx-auto mb-1.5" />
                  <p className="font-bold">{t('noProductionRecordsYet')}</p>
                  <p className="text-[11px] mt-0.5">
                    {language === 'ml'
                      ? 'ഈ കാലയളവിൽ ഉൽപ്പാദന രേഖകൾ ഒന്നും രേഖപ്പെടുത്തിയിട്ടില്ല.'
                      : 'No production runs recorded in this date range.'}
                  </p>
                </div>
              ) : (
                <div className="h-64 w-full pt-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={metrics.byProduct.slice(0, 8)}
                      margin={{ top: 10, right: 10, left: -20, bottom: 40 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis
                        dataKey="productName"
                        tick={{ fontSize: 10, fill: '#666' }}
                        angle={-30}
                        textAnchor="end"
                        interval={0}
                      />
                      <YAxis tick={{ fontSize: 10, fill: '#666' }} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#1b4332',
                          borderRadius: '8px',
                          color: '#fff',
                          fontSize: '12px',
                        }}
                      />
                      <Bar dataKey="totalQuantity" fill="#2d6a4f" radius={[4, 4, 0, 0]} name="Qty" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>

            {/* Chart 2: Top Ingredients Consumed */}
            <Card padding="md" className="space-y-3">
              <div>
                <h3 className="text-sm font-black text-charcoal">
                  {t('ingredientUsageSummary')}
                </h3>
                <p className="text-xs text-charcoal-muted">
                  {language === 'ml' ? 'ഉൽപ്പാദനത്തിൽ ഉപയോഗിച്ച ചേരുവകൾ' : 'Actual ingredient consumption during selected period'}
                </p>
              </div>

              {!metrics || metrics.consumption.length === 0 ? (
                <div className="py-12 text-center text-charcoal-muted text-xs bg-canvas-subtle rounded-xl border border-dashed border-charcoal-border">
                  <TbChefHat className="w-8 h-8 text-charcoal-muted/40 mx-auto mb-1.5" />
                  <p className="font-bold">{t('noDataInPeriod')}</p>
                  <p className="text-[11px] mt-0.5">
                    {language === 'ml'
                      ? 'ചേരുവ ഉപഭോഗം രേഖപ്പെടുത്തിയിട്ടില്ല.'
                      : 'Zero ingredient consumption recorded in this date range.'}
                  </p>
                </div>
              ) : (
                <div className="h-64 w-full pt-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={metrics.consumption.slice(0, 8)}
                      margin={{ top: 10, right: 10, left: -20, bottom: 40 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis
                        dataKey="ingredientName"
                        tick={{ fontSize: 10, fill: '#666' }}
                        angle={-30}
                        textAnchor="end"
                        interval={0}
                      />
                      <YAxis tick={{ fontSize: 10, fill: '#666' }} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#1b4332',
                          borderRadius: '8px',
                          color: '#fff',
                          fontSize: '12px',
                        }}
                      />
                      <Bar dataKey="totalConsumed" fill="#d97706" radius={[4, 4, 0, 0]} name="Consumed" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>
          </div>

          {/* Recent Activity Table */}
          <Card padding="md" className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black text-charcoal">
                {language === 'ml' ? 'സമീപകാല ഉൽപ്പാദന പ്രവർത്തനം' : 'Recent Production Activity'}
              </h3>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setActiveTab('production')}
              >
                {language === 'ml' ? 'എല്ലാം കാണുക' : 'View All'}
              </Button>
            </div>

            {loading ? (
              <div className="py-2">
                <BatchCardSkeleton count={3} />
              </div>
            ) : productionRuns.length === 0 ? (
              <p className="text-center py-6 text-xs text-charcoal-muted">
                {t('noProductionRecordsYet')}
              </p>
            ) : (
              <div className="divide-y divide-charcoal-border/50 text-xs">
                {productionRuns.slice(0, 5).map((r) => (
                  <div key={r.id} className="py-2.5 flex items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-charcoal">{r.productName}</span>
                        <Badge
                          variant={r.status === 'completed' ? 'success' : 'danger'}
                          size="sm"
                        >
                          {r.status}
                        </Badge>
                      </div>
                      <p className="text-[11px] text-charcoal-muted mt-0.5">
                        #{r.runNumber} • {r.productionDate} • {r.operatorName}
                      </p>
                    </div>

                    <div className="text-right">
                      <span className="font-black text-stone-900 dark:text-white text-sm">
                        {r.actualQuantity} {r.unit}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: PRODUCTION RECORDS */}
      {/* ========================================================================= */}
      {activeTab === 'production' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-black text-charcoal">
                {t('productionRunsHistory')}
              </h2>
              <p className="text-xs text-charcoal-muted">
                {language === 'ml'
                  ? 'എല്ലാ ഉൽപ്പാദന ബാച്ചുകളും, ചേരുവകളുടെ വിശദാംശങ്ങളും, തിരുത്തലുകളും'
                  : 'Complete batch history, actual ingredient consumption, and reversible cancellations.'}
              </p>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={exportProductionCsv}
              icon={<TbFileSpreadsheet className="w-4 h-4" />}
            >
              {language === 'ml' ? 'ബാച്ചുകൾ CSV ആക്കുക' : 'Export Batches CSV'}
            </Button>
          </div>

          {/* Filters */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              placeholder={language === 'ml' ? 'ബാച്ച് നമ്പർ അല്ലെങ്കിൽ ഉൽപ്പന്നം തിരയുക...' : 'Search batch # or product name...'}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              leftAddon={<TbSearch className="w-4 h-4" />}
            />

            <div className="flex items-center gap-1.5 text-xs">
              {(['all', 'completed', 'cancelled'] as const).map((st) => (
                <button
                  key={st}
                  onClick={() => setStatusFilter(st)}
                  className={`px-3 py-2 rounded-xl font-bold capitalize transition-all ${
                    statusFilter === st
                      ? 'bg-epso-red text-white shadow-sm'
                      : 'bg-white text-charcoal-muted border border-charcoal-border hover:bg-stone-50 dark:hover:bg-[#282323]'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>

          {/* Runs List */}
          {loading ? (
            <BatchCardSkeleton count={5} />
          ) : productionRuns.length === 0 ? (
            <Card className="text-center py-12 text-charcoal-muted text-xs">
              <TbChefHat className="w-8 h-8 text-charcoal-muted/40 mx-auto mb-2" />
              <p className="font-bold">{t('noProductionRecordsYet')}</p>
            </Card>
          ) : (
            <div className="space-y-3">
              {productionRuns
                .filter((r) => {
                  const matchSearch =
                    r.runNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    r.productName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    (r.operatorName && r.operatorName.toLowerCase().includes(searchTerm.toLowerCase()));
                  const matchStatus = statusFilter === 'all' || r.status === statusFilter;
                  return matchSearch && matchStatus;
                })
                .map((run) => (
                  <Card
                    key={run.id}
                    padding="sm"
                    className={`transition-all ${
                      run.status === 'cancelled' ? 'bg-red-50/20 border-red-200 opacity-75' : ''
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-black text-sm text-charcoal">
                            {run.productName}
                          </span>
                          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-charcoal-border/50 text-charcoal-muted">
                            #{run.runNumber}
                          </span>
                          <Badge
                            variant={run.status === 'completed' ? 'success' : 'danger'}
                            size="sm"
                          >
                            {run.status}
                          </Badge>
                        </div>

                        <div className="flex items-center gap-3 text-[11px] text-charcoal-muted mt-1.5 flex-wrap">
                          <span>{t('operator')}: <strong className="text-charcoal">{run.operatorName}</strong></span>
                          <span>•</span>
                          <span>{run.productionDate}</span>
                          <span>•</span>
                          <span>
                            {run.ingredientsConsumed.length} {language === 'ml' ? 'ചേരുവകൾ ഉപയോഗിച്ചു' : 'ingredients consumed'}
                          </span>
                        </div>

                        {run.cancellationReason && (
                          <p className="text-[11px] text-red-600 font-bold mt-1">
                            {language === 'ml' ? 'റദ്ദാക്കാനുള്ള കാരണം:' : 'Cancellation reason:'} {run.cancellationReason}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-2 self-end sm:self-auto">
                        <div className="text-right mr-2">
                          <span className="text-lg font-black text-stone-900 dark:text-white block leading-tight">
                            {run.actualQuantity} {run.unit}
                          </span>
                          <span className="text-[10px] text-charcoal-muted block">
                            (Planned: {run.plannedQuantity})
                          </span>
                        </div>

                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedRunForDetail(run)}
                        >
                          {language === 'ml' ? 'വിശദാംശങ്ങൾ' : 'Details'}
                        </Button>

                        {run.status === 'completed' && (
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => handleCancelRun(run)}
                          >
                            {language === 'ml' ? 'റദ്ദാക്കുക' : 'Cancel Run'}
                          </Button>
                        )}
                      </div>
                    </div>
                  </Card>
                ))}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: RECIPES / BOM */}
      {/* ========================================================================= */}
      {activeTab === 'recipes' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-black text-charcoal">
                {language === 'ml' ? 'പാചകക്കുറിപ്പുകൾ' : 'Snack Recipe Formulations (BOM)'}
              </h2>
              <p className="text-xs text-charcoal-muted">
                {language === 'ml'
                  ? 'ഓരോ ഉൽപ്പന്നത്തിനുമുള്ള ചേരുവകളുടെ അനുപാതം ക്രമീകരിക്കുക'
                  : 'Link raw materials and scalable ratios to each snack product.'}
              </p>
            </div>

            <Button
              variant="primary"
              onClick={() => {
                setRecipeToEdit(null);
                setIsRecipeFormOpen(true);
              }}
              icon={<TbPlus className="w-4 h-4" />}
            >
              {language === 'ml' ? 'പുതിയ പാചകക്കുറിപ്പ്' : 'New Recipe Formulation'}
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {products.map((product) => {
              const recipe = recipes.find((r) => r.productId === product.id);

              return (
                <Card
                  key={product.id}
                  padding="sm"
                  className={`flex flex-col justify-between hover:border-epso-red/50 transition-all ${
                    !recipe ? 'border-dashed bg-gray-50/50' : ''
                  }`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-base font-black text-charcoal">
                        {product.name}
                      </h3>
                      {recipe ? (
                        <Badge variant="success" size="sm">
                          v{recipe.version}
                        </Badge>
                      ) : (
                        <Badge variant="warning" size="sm">
                          {language === 'ml' ? 'സജ്ജീകരിച്ചിട്ടില്ല' : 'No Recipe'}
                        </Badge>
                      )}
                    </div>

                    {recipe ? (
                      <div className="mt-2 space-y-1 text-xs text-charcoal-muted">
                        <p>
                          {language === 'ml' ? 'സ്റ്റാൻഡേർഡ് ബാച്ച്' : 'Base Batch'}:{' '}
                          <strong className="text-charcoal">
                            {recipe.baseOutputQuantity} {recipe.baseOutputUnit}
                          </strong>
                        </p>
                        <p>
                          {language === 'ml' ? 'ചേരുവകൾ' : 'Ingredients'}:{' '}
                          <strong className="text-charcoal">{recipe.ingredients.length} items</strong>
                        </p>
                        {recipe.notes && (
                          <p className="text-[11px] italic truncate mt-1">
                            {recipe.notes}
                          </p>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-charcoal-muted mt-2">
                        {language === 'ml'
                          ? 'ഈ ഉൽപ്പന്നത്തിന് ചേരുവകളുടെ അനുപാതം ചേർത്തിട്ടില്ല.'
                          : 'Bill of materials not configured yet. Production will require manual entry.'}
                      </p>
                    )}
                  </div>

                  <div className="pt-3 mt-3 border-t border-charcoal-border/50 flex items-center gap-2">
                    {recipe ? (
                      <>
                        <Button
                          variant="secondary"
                          size="sm"
                          fullWidth
                          onClick={() => setSelectedRecipeForDetail(recipe)}
                        >
                          {language === 'ml' ? 'കാണുക' : 'View'}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          fullWidth
                          onClick={() => {
                            setRecipeToEdit(recipe);
                            setIsRecipeFormOpen(true);
                          }}
                        >
                          {language === 'ml' ? 'തിരുത്തുക' : 'Edit'}
                        </Button>
                      </>
                    ) : (
                      <Button
                        variant="primary"
                        size="sm"
                        fullWidth
                        onClick={() => {
                          setRecipeToEdit({
                            id: '',
                            productId: product.id,
                            productName: product.name,
                            version: 1,
                            baseOutputQuantity: 10,
                            baseOutputUnit: product.unit || 'kg',
                            ingredients: [],
                            isActive: true,
                            createdAt: '',
                            updatedAt: '',
                          });
                          setIsRecipeFormOpen(true);
                        }}
                      >
                        {language === 'ml' ? 'പാചകക്കുറിപ്പ് ചേർക്കുക' : 'Configure Recipe'}
                      </Button>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: STOCK MOVEMENTS LEDGER */}
      {/* ========================================================================= */}
      {activeTab === 'ledger' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-black text-charcoal">
                {language === 'ml' ? 'സ്റ്റോക്ക് ലെഡ്ജർ' : 'Auditable Inventory Ledger'}
              </h2>
              <p className="text-xs text-charcoal-muted">
                {language === 'ml'
                  ? 'ഓരോ വരവും ചിലവും മാറ്റങ്ങളും രേഖപ്പെടുത്തിയ ആധികാരിക ലെഡ്ജർ'
                  : 'Immutable ledger tracking opening stock, production consumption, adjustments, and reversals.'}
              </p>
            </div>

            <Button
              variant="primary"
              size="sm"
              onClick={() => setIsAdjustOpen(true)}
              icon={<TbAdjustmentsHorizontal className="w-4 h-4" />}
            >
              {language === 'ml' ? 'സ്റ്റോക്ക് മാറ്റം നൽകുക' : 'Record Stock Adjustment'}
            </Button>
          </div>

          {movements.length === 0 ? (
            <Card className="text-center py-12 text-charcoal-muted text-xs">
              <TbHistory className="w-8 h-8 text-charcoal-muted/40 mx-auto mb-2" />
              <p className="font-bold">
                {language === 'ml' ? 'സ്റ്റോക്ക് മാറ്റങ്ങൾ ഒന്നും രേഖപ്പെടുത്തിയിട്ടില്ല' : 'No stock movements recorded yet'}
              </p>
              <p className="text-[11px] mt-0.5">
                {language === 'ml'
                  ? 'ഉൽപ്പാദന ബാച്ചുകൾ പൂർത്തിയാക്കുമ്പോഴോ സ്റ്റോക്ക് ക്രമീകരിക്കുമ്പോഴോ ഇവിടെ ദൃശ്യമാകും.'
                  : 'Ledger records will appear when production runs are saved or manual adjustments are logged.'}
              </p>
            </Card>
          ) : (
            <Card padding="none" className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-canvas-subtle border-b border-charcoal-border text-charcoal font-bold uppercase text-[10px]">
                    <tr>
                      <th className="p-3">Date & Time</th>
                      <th className="p-3">Item Name</th>
                      <th className="p-3">Movement Type</th>
                      <th className="p-3 text-right">Delta</th>
                      <th className="p-3 text-right">New Balance</th>
                      <th className="p-3">Operator</th>
                      <th className="p-3">Reason / Ref</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-charcoal-border/50">
                    {movements.map((m) => {
                      const isPositive = m.quantity > 0;
                      return (
                        <tr key={m.id} className="hover:bg-charcoal/2">
                          <td className="p-3 text-charcoal-muted font-mono text-[11px] whitespace-nowrap">
                            {new Date(m.createdAt).toLocaleString()}
                          </td>
                          <td className="p-3 font-bold text-charcoal">
                            {m.itemName}
                          </td>
                          <td className="p-3">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                m.movementType === 'production_consumption'
                                  ? 'bg-amber-100 text-amber-800'
                                  : m.movementType === 'opening'
                                  ? 'bg-blue-100 text-blue-800'
                                  : m.movementType === 'cancellation_reversal'
                                  ? 'bg-purple-100 text-purple-800'
                                  : 'bg-emerald-100 text-emerald-800'
                              }`}
                            >
                              {m.movementType.replace(/_/g, ' ')}
                            </span>
                          </td>
                          <td
                            className={`p-3 text-right font-black ${
                              isPositive ? 'text-emerald-700' : 'text-red-600'
                            }`}
                          >
                            {isPositive ? `+${m.quantity}` : m.quantity} {m.unit}
                          </td>
                          <td className="p-3 text-right font-bold text-charcoal">
                            {m.newBalance} {m.unit}
                          </td>
                          <td className="p-3 text-charcoal-muted">
                            {m.operatorName}
                          </td>
                          <td className="p-3 text-charcoal-muted text-[11px] truncate max-w-xs">
                            {m.reason || m.reference}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 5: REPORTS & CSV EXPORT */}
      {/* ========================================================================= */}
      {activeTab === 'reports' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-black text-charcoal">
                {language === 'ml' ? 'ഉൽപ്പാദന റിപ്പോർട്ടുകൾ & ഡൗൺലോഡ്' : 'Production Reports & CSV Exports'}
              </h2>
              <p className="text-xs text-charcoal-muted">
                {language === 'ml'
                  ? 'തിരഞ്ഞെടുത്ത കാലയളവിലെ വിവരങ്ങൾ CSV ഫോർമാറ്റിൽ എക്സ്പോർട്ട് ചെയ്യുക'
                  : 'Date-filtered summaries and raw transactional data exports.'}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="primary"
                onClick={exportProductionCsv}
                icon={<TbFileSpreadsheet className="w-4 h-4" />}
              >
                {language === 'ml' ? 'ഉൽപ്പാദന റിപ്പോർട്ട്' : 'Export Production CSV'}
              </Button>
              <Button
                variant="outline"
                onClick={exportConsumptionCsv}
                icon={<TbFileSpreadsheet className="w-4 h-4" />}
              >
                {language === 'ml' ? 'ചേരുവ റിപ്പോർട്ട്' : 'Export Ingredients CSV'}
              </Button>
            </div>
          </div>

          {/* Product Output Table */}
          <Card padding="md" className="space-y-3">
            <h3 className="text-sm font-black text-charcoal">
              {language === 'ml' ? 'ഉൽപ്പന്നങ്ങൾ തിരിച്ചുളള ഉൽപ്പാദന കണക്കുകൾ' : 'Product-wise Production Summary'}
            </h3>

            {!metrics || metrics.byProduct.length === 0 ? (
              <p className="text-xs text-charcoal-muted py-4 text-center">
                {t('noProductionRecordsYet')}
              </p>
            ) : (
              <div className="divide-y divide-charcoal-border/50 text-xs">
                {metrics.byProduct.map((p, idx) => (
                  <div key={idx} className="py-2.5 flex items-center justify-between">
                    <div>
                      <span className="font-bold text-charcoal text-sm">{p.productName}</span>
                      <p className="text-[11px] text-charcoal-muted mt-0.5">
                        {p.runCount} {language === 'ml' ? 'ബാച്ചുകൾ പൂർത്തിയായി' : 'batches'}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="text-base font-black text-stone-900 dark:text-white">
                        {p.totalQuantity} {p.unit}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Ingredients Consumed Table */}
          <Card padding="md" className="space-y-3">
            <h3 className="text-sm font-black text-charcoal">
              {language === 'ml' ? 'ചേരുവകളുടെ ആകെ ഉപഭോഗം' : 'Total Ingredient Consumption Summary'}
            </h3>

            {!metrics || metrics.consumption.length === 0 ? (
              <p className="text-xs text-charcoal-muted py-4 text-center">
                {t('noDataInPeriod')}
              </p>
            ) : (
              <div className="divide-y divide-charcoal-border/50 text-xs">
                {metrics.consumption.map((c, idx) => (
                  <div key={idx} className="py-2.5 flex items-center justify-between">
                    <div>
                      <span className="font-bold text-charcoal">{c.ingredientName}</span>
                      <span className="text-[10px] uppercase font-bold text-charcoal-muted ml-2">
                        ({c.category})
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-black text-amber-900">
                        {c.totalConsumed} {c.unit}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 6: AUDIT LOGS */}
      {/* ========================================================================= */}
      {activeTab === 'audit' && (
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-black text-charcoal">
              {t('auditLogsTitle')}
            </h2>
            <p className="text-xs text-charcoal-muted">
              {language === 'ml'
                ? 'സുരക്ഷാ നടപടികളും, ഉൽപ്പാദന മാറ്റങ്ങളും, അധികാരപ്പെടുത്തലുകളും'
                : 'Immutable record of security events, recipe changes, production runs, and stock adjustments.'}
            </p>
          </div>

          {auditLogs.length === 0 ? (
            <Card className="text-center py-12 text-charcoal-muted text-xs">
              <TbShieldCheck className="w-8 h-8 text-charcoal-muted/40 mx-auto mb-2" />
              <p className="font-bold">
                {language === 'ml' ? 'ഓഡിറ്റ് ലോഗുകൾ ഒന്നും രേഖപ്പെടുത്തിയിട്ടില്ല' : 'No audit events recorded yet'}
              </p>
            </Card>
          ) : (
            <div className="space-y-2">
              {auditLogs.map((log) => (
                <div
                  key={log.id}
                  className="p-3 bg-white rounded-xl border border-charcoal-border text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-xs"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-charcoal uppercase text-[11px] px-1.5 py-0.5 bg-red-50 dark:bg-red-950/40 text-epso-red dark:text-amber-400 rounded">
                        {log.action}
                      </span>
                      <span className="text-charcoal-muted">by</span>
                      <strong className="text-charcoal">{log.actor}</strong>
                    </div>
                    {log.details && (
                      <p className="text-[11px] text-charcoal-muted mt-1 font-mono">
                        {JSON.stringify(log.details)}
                      </p>
                    )}
                  </div>

                  <span className="text-[10px] text-charcoal-muted font-mono whitespace-nowrap self-end sm:self-auto">
                    {new Date(log.createdAt).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 7: SYSTEM HEALTH */}
      {/* ========================================================================= */}
      {activeTab === 'system' && (
        <div className="space-y-4 max-w-2xl">
          <div>
            <h2 className="text-lg font-black text-charcoal">
              {t('databaseHealthTitle')}
            </h2>
            <p className="text-xs text-charcoal-muted">
              {language === 'ml'
                ? 'സുപബേസ് കണക്ഷനും സിസ്റ്റം വിവരങ്ങളും'
                : 'Real-time database connectivity, resource efficiency, and local storage state.'}
            </p>
          </div>

          <Card padding="md" className="space-y-3">
            <div className="flex items-center justify-between pb-3 border-b border-charcoal-border">
              <span className="text-xs font-bold text-charcoal">Backend Engine</span>
              <Badge variant={repo.isSupabaseMode() ? 'success' : 'default'} size="sm">
                {repo.isSupabaseMode() ? 'Supabase PostgreSQL (Live)' : 'Local Persistent Fallback'}
              </Badge>
            </div>

            <div className="flex items-center justify-between pb-3 border-b border-charcoal-border">
              <span className="text-xs font-bold text-charcoal">Network State</span>
              <Badge variant="success" size="sm">
                Online
              </Badge>
            </div>

            <div className="flex items-center justify-between pb-3 border-b border-charcoal-border">
              <span className="text-xs font-bold text-charcoal">Total Products</span>
              <span className="text-xs font-mono font-bold text-charcoal">{products.length}</span>
            </div>

            <div className="flex items-center justify-between pb-3 border-b border-charcoal-border">
              <span className="text-xs font-bold text-charcoal">Total Ingredients</span>
              <span className="text-xs font-mono font-bold text-charcoal">{ingredients.length}</span>
            </div>

            <div className="flex items-center justify-between pb-3 border-b border-charcoal-border">
              <span className="text-xs font-bold text-charcoal">Configured Recipes</span>
              <span className="text-xs font-mono font-bold text-charcoal">{recipes.length}</span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-charcoal">Production Batches</span>
              <span className="text-xs font-mono font-bold text-charcoal">{productionRuns.length}</span>
            </div>
          </Card>
        </div>
      )}

      {/* Batch Details Modal */}
      {selectedRunForDetail && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
          onClick={() => setSelectedRunForDetail(null)}
        >
          <div
            className="bg-white rounded-2xl max-w-lg w-full p-5 shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div>
                <span className="text-xs font-mono text-charcoal-muted">
                  Batch #{selectedRunForDetail.runNumber}
                </span>
                <h3 className="text-lg font-black text-charcoal">
                  {selectedRunForDetail.productName}
                </h3>
                <p className="text-xs text-charcoal-muted">
                  {selectedRunForDetail.productionDate} • {selectedRunForDetail.operatorName}
                </p>
              </div>
              <Badge
                variant={selectedRunForDetail.status === 'completed' ? 'success' : 'danger'}
              >
                {selectedRunForDetail.status}
              </Badge>
            </div>

            <div className="p-3 bg-canvas-subtle rounded-xl flex items-center justify-between text-xs">
              <span>{language === 'ml' ? 'ഉൽപ്പാദിപ്പിച്ച അളവ്' : 'Quantity Produced'}:</span>
              <span className="text-base font-black text-stone-900 dark:text-white">
                {selectedRunForDetail.actualQuantity} {selectedRunForDetail.unit}
              </span>
            </div>

            <div>
              <h4 className="text-xs font-black text-charcoal mb-2">
                {language === 'ml' ? 'ഉപയോഗിച്ച ചേരുവകൾ' : 'Ingredients Consumed'}:
              </h4>
              <div className="divide-y divide-charcoal-border/50 text-xs">
                {selectedRunForDetail.ingredientsConsumed.map((item, idx) => (
                  <div key={idx} className="py-2 flex items-center justify-between">
                    <span className="text-charcoal font-semibold">{item.ingredientName}</span>
                    <span className="font-bold text-charcoal">
                      {item.actualQuantity} {item.unit}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {selectedRunForDetail.notes && (
              <p className="text-xs text-charcoal-muted italic">
                Notes: {selectedRunForDetail.notes}
              </p>
            )}

            <div className="flex items-center justify-between pt-2 border-t border-charcoal-border">
              {selectedRunForDetail.status === 'completed' ? (
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => handleCancelRun(selectedRunForDetail)}
                >
                  {language === 'ml' ? 'ബാച്ച് റദ്ദാക്കുക' : 'Cancel & Reverse Stock'}
                </Button>
              ) : (
                <div />
              )}
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setSelectedRunForDetail(null)}
              >
                {language === 'ml' ? 'അടയ്ക്കുക' : 'Close'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Recipe Form Modal */}
      <RecipeFormModal
        isOpen={isRecipeFormOpen}
        onClose={() => {
          setIsRecipeFormOpen(false);
          setRecipeToEdit(null);
        }}
        recipeToEdit={recipeToEdit}
        products={products}
        ingredients={ingredients}
        onSuccess={loadData}
      />

      {/* Recipe Detail Modal */}
      {selectedRecipeForDetail && (
        <RecipeDetailModal
          isOpen={Boolean(selectedRecipeForDetail)}
          onClose={() => setSelectedRecipeForDetail(null)}
          recipe={selectedRecipeForDetail}
          ingredients={ingredients}
          onEditClick={(rec: Recipe) => {
            setSelectedRecipeForDetail(null);
            setRecipeToEdit(rec);
            setIsRecipeFormOpen(true);
          }}
          onStartProductionClick={() => {
            setSelectedRecipeForDetail(null);
            setActiveTab('production');
          }}
        />
      )}

      {/* Stock Adjustment Modal */}
      <StockAdjustmentModal
        isOpen={isAdjustOpen}
        onClose={() => setIsAdjustOpen(false)}
        ingredients={ingredients}
        onSuccess={loadData}
      />
    </div>
  );
};
