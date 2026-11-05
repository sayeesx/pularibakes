import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { useLanguage } from '../context/LanguageContext';
import { useTheme } from '../context/ThemeContext';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { BatchCardSkeleton } from '../components/ui/BatchCardSkeleton';
import { StartProductionModal } from '../components/production/StartProductionModal';
import { DailyOilModal } from '../components/production/DailyOilModal';
import { BatchPackingModal } from '../components/production/BatchPackingModal';
import { BatchWeighingModal } from '../components/production/BatchWeighingModal';
import { BasicIngredientsSelectorModal } from '../components/production/BasicIngredientsSelectorModal';
import { BasicIngredientMeasurementModal } from '../components/production/BasicIngredientMeasurementModal';
import { BatchDetailModal } from '../components/production/BatchDetailModal';
import { Modal } from '../components/ui/Modal';
import { Product, Recipe, Ingredient, ProductionRun, PackingRecord, DailyClosing } from '../types';
import {
  TbSearch,
  TbPlus,
  TbHistory,
  TbTrash,
  TbDroplet,
  TbPackage,
  TbAlertTriangle,
  TbCheck,
  TbAlertCircle,
  TbPencil,
  TbToolsKitchen2,
  TbChevronRight,
  TbScale,
} from 'react-icons/tb';

// Smooth Rolling Warning Message (transitions vertically every 2.8s without horizontal projection distortion)
const Rotating3DWarning: React.FC<{ items: string[] }> = ({ items }) => {
  const [index, setIndex] = useState<number>(0);
  const [animating, setAnimating] = useState<boolean>(false);

  useEffect(() => {
    if (items.length <= 1) return;
    const interval = setInterval(() => {
      setAnimating(true);
      setTimeout(() => {
        setIndex((prev) => (prev + 1) % items.length);
        setAnimating(false);
      }, 500);
    }, 2800);
    return () => clearInterval(interval);
  }, [items.length]);

  if (items.length === 0) return null;

  const currentItem = items[index % items.length];
  const nextItem = items[(index + 1) % items.length];

  return (
    <div className="relative h-6 w-full overflow-hidden select-none">
      <div
        className="relative w-full h-full"
        style={{
          transition: animating ? 'transform 500ms cubic-bezier(0.4, 0, 0.2, 1)' : 'none',
          transform: animating ? 'translateY(-100%)' : 'translateY(0%)',
        }}
      >
        <div className="h-6 flex items-center pl-1">
          <p className="font-extrabold text-amber-950 dark:text-amber-200 text-[11px] sm:text-xs truncate font-malayalam leading-tight">
            {currentItem}
          </p>
        </div>
        <div className="h-6 flex items-center pl-1">
          <p className="font-extrabold text-amber-950 dark:text-amber-200 text-[11px] sm:text-xs truncate font-malayalam leading-tight">
            {nextItem}
          </p>
        </div>
      </div>
    </div>
  );
};

export const ProductionPage: React.FC = () => {
  const { repo, dataVersion, triggerRefresh, addToast, staffName, isStartProductionOpen, setIsStartProductionOpen } = useApp();
  const { t, language } = useLanguage();
  const { isDark } = useTheme();

  const [runs, setRuns] = useState<ProductionRun[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [todayOilClosing, setTodayOilClosing] = useState<DailyClosing | null>(null);
  const [yesterdayOilClosing, setYesterdayOilClosing] = useState<DailyClosing | null>(null);
  const [packingRecords, setPackingRecords] = useState<PackingRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Timezone-safe local date calculation
  const getLocalDateStr = (offsetDays = 0) => {
    const d = new Date();
    if (offsetDays !== 0) d.setDate(d.getDate() + offsetDays);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Format YYYY-MM-DD or ISO string to DD-MM-YYYY
  const formatBatchDate = (dStr: string) => {
    if (!dStr) return '';
    const clean = dStr.split('T')[0];
    const parts = clean.split('-');
    if (parts.length === 3) {
      const [y, m, d] = parts;
      return `${d}-${m}-${y}`;
    }
    return clean;
  };

  const isKitchenStaffDefault = (name?: string) => {
    if (!name) return true;
    const lower = name.toLowerCase().trim();
    return (
      lower.includes('kitchen staff') ||
      lower.includes('production team') ||
      name.includes('പ്രൊഡക്ഷൻ ടീം') ||
      lower === 'staff'
    );
  };

  const todayStr = useMemo(() => getLocalDateStr(0), []);
  const yesterdayStr = useMemo(() => getLocalDateStr(-1), []);
  const utcTodayStr = useMemo(() => new Date().toISOString().split('T')[0], []);
  const utcYesterdayStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().split('T')[0];
  }, []);

  const isTodayDate = useCallback((date: string) => {
    return date === todayStr || (todayStr !== utcTodayStr && date === utcTodayStr);
  }, [todayStr, utcTodayStr]);

  const isYesterdayDate = useCallback((date: string) => {
    return date === yesterdayStr || (yesterdayStr !== utcYesterdayStr && date === utcYesterdayStr);
  }, [yesterdayStr, utcYesterdayStr]);

  // Filters - Default to 'today' so home page specifically shows today's batches
  const [searchTerm, setSearchTerm] = useState<string>('');
  type ProductionFilter = 'today' | 'yesterday' | 'completed' | 'cancelled' | 'all';
  const [activeFilter, setActiveFilter] = useState<ProductionFilter>('today');

  // Modals
  const [oilModalDate, setOilModalDate] = useState<string>(todayStr);
  const [runToDelete, setRunToDelete] = useState<ProductionRun | null>(null);
  const [runToEdit, setRunToEdit] = useState<ProductionRun | null>(null);
  const [isBasicSelectorOpen, setIsBasicSelectorOpen] = useState<boolean>(false);
  const [measuringBasicIngredient, setMeasuringBasicIngredient] = useState<Ingredient | null>(null);
  const [restockChoice, setRestockChoice] = useState<'yes' | 'no'>('yes');
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [isOpeningNewBatch, setIsOpeningNewBatch] = useState<boolean>(false);
  const [isDailyOilModalOpen, setIsDailyOilModalOpen] = useState<boolean>(false);
  const [batchForPacking, setBatchForPacking] = useState<ProductionRun | null>(null);
  const [batchForWeighing, setBatchForWeighing] = useState<ProductionRun | null>(null);
  const [isPostCreationPrompt, setIsPostCreationPrompt] = useState<boolean>(false);
  const [selectedBatchForDetail, setSelectedBatchForDetail] = useState<ProductionRun | null>(null);

  // Basic ingredients tracking state (Salt, Cashew shell, Chippli, Curry leaves)
  const [recordedBasics, setRecordedBasics] = useState<Record<string, string[]>>(() => {
    try {
      const todaySaved = JSON.parse(localStorage.getItem(`pulari_basic_${todayStr}`) || '[]');
      const yestSaved = JSON.parse(localStorage.getItem(`pulari_basic_${yesterdayStr}`) || '[]');
      return { [todayStr]: todaySaved, [yesterdayStr]: yestSaved };
    } catch {
      return {};
    }
  });

  const markBasicAsRecorded = useCallback((date: string, ingredientOrKey: Ingredient | string) => {
    let key = '';
    if (typeof ingredientOrKey === 'string') {
      key = ingredientOrKey;
    } else {
      const name = ingredientOrKey.name.toLowerCase();
      if (name.includes('ഓയിൽ') || name.includes('oil')) key = 'oil';
      else if (name.includes('ഉപ്പ്') || name.includes('salt')) key = 'salt';
      else if (name.includes('അണ്ടി തോട്') || name.includes('തോട്') || name.includes('shell') || name.includes('cashew')) key = 'cashew_shell';
      else if (name.includes('ചിപ്പ്ളി') || name.includes('chippli')) key = 'chippli';
      else if (name.includes('കറിവേപ്പില') || name.includes('curry')) key = 'curry_leaves';
    }

    if (key) {
      setRecordedBasics((prev) => {
        const cur = prev[date] || [];
        if (!cur.includes(key)) {
          const updated = [...cur, key];
          try {
            localStorage.setItem(`pulari_basic_${date}`, JSON.stringify(updated));
          } catch {}
          return { ...prev, [date]: updated };
        }
        return prev;
      });
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        setLoading((prev) => (runs.length === 0 ? true : prev));
        const [rList, pList, recList, iList, oilCloseToday, oilCloseYesterday, packList, movements] = await Promise.all([
          repo.listProductionRuns({ limit: 60 }),
          repo.listProducts(false),
          repo.listRecipes(),
          repo.listIngredients(false),
          repo.getDailyClosing(todayStr).catch(() => null),
          repo.getDailyClosing(yesterdayStr).catch(() => null),
          repo.listPackingRecords({ limit: 100 }).catch(() => []),
          repo.getStockMovements({ limit: 100 }).catch(() => []),
        ]);
        if (mounted) {
          setRuns(rList);
          setProducts(pList);
          setRecipes(recList);
          setIngredients(iList);
          setTodayOilClosing(oilCloseToday);
          setYesterdayOilClosing(oilCloseYesterday);
          setPackingRecords(packList || []);

          if (movements && movements.length > 0) {
            const detectedToday: string[] = [];
            const detectedYesterday: string[] = [];

            for (const m of movements) {
              const mDate = m.createdAt ? m.createdAt.split('T')[0] : '';
              let mLocalDate = '';
              try {
                if (m.createdAt) {
                  mLocalDate = new Date(m.createdAt).toLocaleDateString('en-CA');
                }
              } catch {}
              const r = (m.reason || '').toLowerCase();
              const n = (m.itemName || '').toLowerCase();

              let key = '';
              if (n.includes('ഓയിൽ') || n.includes('oil')) key = 'oil';
              else if (n.includes('ഉപ്പ്') || n.includes('salt')) key = 'salt';
              else if (n.includes('അണ്ടി തോട്') || n.includes('തോട്') || n.includes('shell') || n.includes('cashew')) key = 'cashew_shell';
              else if (n.includes('ചിപ്പ്ളി') || n.includes('chippli')) key = 'chippli';
              else if (n.includes('കറിവേപ്പില') || n.includes('curry')) key = 'curry_leaves';

              if (key) {
                if (mDate === todayStr || mLocalDate === todayStr || r.includes(todayStr) || isTodayDate(mDate)) {
                  if (!detectedToday.includes(key)) detectedToday.push(key);
                }
                if (mDate === yesterdayStr || mLocalDate === yesterdayStr || r.includes(yesterdayStr) || isYesterdayDate(mDate)) {
                  if (!detectedYesterday.includes(key)) detectedYesterday.push(key);
                }
              }
            }

            setRecordedBasics((prev) => {
              const mergedToday = Array.from(new Set([...(prev[todayStr] || []), ...detectedToday]));
              const mergedYesterday = Array.from(new Set([...(prev[yesterdayStr] || []), ...detectedYesterday]));
              return { ...prev, [todayStr]: mergedToday, [yesterdayStr]: mergedYesterday };
            });
          }
        }
      } catch (err: any) {
        console.error('Error loading production data', err);
        addToast(err?.message || 'Failed to load production data', 'error');
      } finally {
        if (mounted) setLoading(false);
      }
    };

    load();
    return () => {
      mounted = false;
    };
  }, [repo, dataVersion, addToast, todayStr, yesterdayStr]);

  // Helper to count packed packets for a batch
  const getBatchPacketsCount = useCallback((run: ProductionRun) => {
    const batchPackings = packingRecords.filter(
      (p) =>
        p.productionRunId
          ? p.productionRunId === run.id
          : Boolean(p.notes && p.notes.includes(run.runNumber))
    );
    return batchPackings.reduce((sum, p) => sum + (p.packetsPacked || 0), 0);
  }, [packingRecords]);

  // Helper to verify if oil has been logged
  const hasRecordedOil = useCallback((closing: DailyClosing | null) => {
    if (!closing) return false;
    return (
      Number(closing.oilConsumed || 0) > 0 ||
      Number(closing.oilClosingBalance || 0) > 0 ||
      closing.status === 'closed'
    );
  }, []);

  // Today runs and warning detection
  const todayRuns = useMemo(
    () => runs.filter((r) => isTodayDate(r.productionDate)),
    [runs, isTodayDate]
  );
  const todayRunsCount = todayRuns.length;
  const todayActiveRuns = useMemo(
    () => todayRuns.filter((r) => r.status !== 'cancelled'),
    [todayRuns]
  );
  const todayMissingPackets = useMemo(
    () => todayActiveRuns.filter((r) => getBatchPacketsCount(r) === 0),
    [todayActiveRuns, getBatchPacketsCount]
  );
  const todayMissingOil = useMemo(
    () => todayActiveRuns.length > 0 && !hasRecordedOil(todayOilClosing),
    [todayActiveRuns, hasRecordedOil, todayOilClosing]
  );

  // Yesterday runs and warning detection
  const yesterdayRuns = useMemo(
    () => runs.filter((r) => isYesterdayDate(r.productionDate)),
    [runs, isYesterdayDate]
  );
  const yesterdayRunsCount = yesterdayRuns.length;
  const yesterdayActiveRuns = useMemo(
    () => yesterdayRuns.filter((r) => r.status !== 'cancelled'),
    [yesterdayRuns]
  );
  const yesterdayMissingPackets = useMemo(
    () => yesterdayActiveRuns.filter((r) => getBatchPacketsCount(r) === 0),
    [yesterdayActiveRuns, getBatchPacketsCount]
  );
  const yesterdayMissingOil = useMemo(
    () => yesterdayActiveRuns.length > 0 && !hasRecordedOil(yesterdayOilClosing),
    [yesterdayActiveRuns, hasRecordedOil, yesterdayOilClosing]
  );

  // Missing basic ingredients for the active filter date
  const isYesterday = activeFilter === 'yesterday';
  const activeDate = isYesterday ? yesterdayStr : todayStr;
  const activeClosing = isYesterday ? yesterdayOilClosing : todayOilClosing;
  const recordedKeysForActiveDate = recordedBasics[activeDate] || [];

  const isOilRecordedForActiveDate = hasRecordedOil(activeClosing) || recordedKeysForActiveDate.includes('oil');
  const hasPendingBasicsForActiveDate = useMemo(() => {
    const isSalt = recordedKeysForActiveDate.includes('salt');
    const isCashew = recordedKeysForActiveDate.includes('cashew_shell');
    const isChippli = recordedKeysForActiveDate.includes('chippli') || recordedKeysForActiveDate.includes('chippli_powder');
    const isCurry = recordedKeysForActiveDate.includes('curry_leaves');
    return !isOilRecordedForActiveDate || !isSalt || !isCashew || !isChippli || !isCurry;
  }, [isOilRecordedForActiveDate, recordedKeysForActiveDate]);

  const missingBasicItems = useMemo(() => {
    const activeDateRuns = runs.filter((r) =>
      isYesterday ? isYesterdayDate(r.productionDate) : isTodayDate(r.productionDate)
    ).filter((r) => r.status !== 'cancelled');

    if (activeDateRuns.length === 0) return [];

    const list: string[] = [];
    const isOilRecorded = hasRecordedOil(activeClosing) || recordedKeysForActiveDate.includes('oil');

    if (!isOilRecorded) {
      list.push(
        language === 'ml'
          ? (isYesterday ? 'ഇന്നലത്തെ ഓയിൽ ഉപയോഗം രേഖപ്പെടുത്തിയിട്ടില്ല' : 'ഇന്നത്തെ ഓയിൽ ഉപയോഗം രേഖപ്പെടുത്തിയിട്ടില്ല')
          : (isYesterday ? "Yesterday's oil has not been recorded" : "Today's oil has not been recorded")
      );
    }
    if (!recordedKeysForActiveDate.includes('salt')) {
      list.push(
        language === 'ml'
          ? (isYesterday ? 'ഇന്നലത്തെ ഉപ്പ് രേഖപ്പെടുത്തിയിട്ടില്ല' : 'ഇന്നത്തെ ഉപ്പ് രേഖപ്പെടുത്തിയിട്ടില്ല')
          : (isYesterday ? "Yesterday's salt has not been recorded" : "Today's salt has not been recorded")
      );
    }
    if (!recordedKeysForActiveDate.includes('cashew_shell')) {
      list.push(
        language === 'ml'
          ? (isYesterday ? 'ഇന്നലത്തെ അണ്ടി തോട് രേഖപ്പെടുത്തിയിട്ടില്ല' : 'ഇന്നത്തെ അണ്ടി തോട് രേഖപ്പെടുത്തിയിട്ടില്ല')
          : (isYesterday ? "Yesterday's cashew shell has not been recorded" : "Today's cashew shell has not been recorded")
      );
    }
    if (!recordedKeysForActiveDate.includes('chippli')) {
      list.push(
        language === 'ml'
          ? (isYesterday ? 'ഇന്നലത്തെ ചിപ്പ്ളി പൊടി രേഖപ്പെടുത്തിയിട്ടില്ല' : 'ഇന്നത്തെ ചിപ്പ്ളി പൊടി രേഖപ്പെടുത്തിയിട്ടില്ല')
          : (isYesterday ? "Yesterday's chippli powder has not been recorded" : "Today's chippli powder has not been recorded")
      );
    }
    if (!recordedKeysForActiveDate.includes('curry_leaves')) {
      list.push(
        language === 'ml'
          ? (isYesterday ? 'ഇന്നലത്തെ കറിവേപ്പില രേഖപ്പെടുത്തിയിട്ടില്ല' : 'ഇന്നത്തെ കറിവേപ്പില രേഖപ്പെടുത്തിയിട്ടില്ല')
          : (isYesterday ? "Yesterday's curry leaves have not been recorded" : "Today's curry leaves have not been recorded")
      );
    }

    return list;
  }, [runs, activeClosing, isYesterday, isYesterdayDate, isTodayDate, recordedKeysForActiveDate, language, hasRecordedOil]);

  const todayHasWarning = todayMissingPackets.length > 0 || (activeFilter === 'today' ? missingBasicItems.length > 0 : todayMissingOil);
  const yesterdayHasWarning = yesterdayMissingPackets.length > 0 || (activeFilter === 'yesterday' ? missingBasicItems.length > 0 : yesterdayMissingOil);

  const filteredRuns = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    const list = runs.filter((r) => {
      const matchSearch =
        !q ||
        r.runNumber.toLowerCase().includes(q) ||
        r.productName.toLowerCase().includes(q) ||
        r.operatorName.toLowerCase().includes(q);

      if (!matchSearch) return false;

      if (activeFilter === 'today') {
        return isTodayDate(r.productionDate);
      }

      if (activeFilter === 'yesterday') {
        return isYesterdayDate(r.productionDate);
      }

      if (activeFilter === 'completed') {
        return r.status === 'completed';
      }

      if (activeFilter === 'cancelled') {
        return r.status === 'cancelled';
      }

      // 'all' = Show all production runs
      return true;
    });

    // Always sort deleted batches (status === 'cancelled') to the very bottom
    return list.sort((a, b) => {
      const aDeleted = a.status === 'cancelled' ? 1 : 0;
      const bDeleted = b.status === 'cancelled' ? 1 : 0;
      if (aDeleted !== bDeleted) {
        return aDeleted - bDeleted;
      }
      const timeA = new Date(a.createdAt || a.productionDate || 0).getTime();
      const timeB = new Date(b.createdAt || b.productionDate || 0).getTime();
      return timeB - timeA;
    });
  }, [runs, searchTerm, activeFilter, isTodayDate, isYesterdayDate]);

  // Batch number in chronological ascending order (Batch 1, 2, 3...)
  const batchNumberMap = useMemo(() => {
    const map = new Map<string, number>();
    const byDate: Record<string, ProductionRun[]> = {};
    runs.forEach((r) => {
      const d = r.productionDate || 'default';
      if (!byDate[d]) byDate[d] = [];
      byDate[d].push(r);
    });

    Object.values(byDate).forEach((dateRuns) => {
      const sorted = [...dateRuns].sort((a, b) => {
        const timeA = new Date(a.createdAt || a.productionDate).getTime();
        const timeB = new Date(b.createdAt || b.productionDate).getTime();
        if (timeA !== timeB) return timeA - timeB;
        return a.runNumber.localeCompare(b.runNumber);
      });
      sorted.forEach((r, idx) => {
        map.set(r.id, idx + 1);
      });
    });
    return map;
  }, [runs]);

  // Show batch cards at top where packets are yet to be added, in ascending batch order
  const sortedRuns = useMemo(() => {
    const isPacketsPending = (run: ProductionRun) => {
      if (run.status === 'cancelled') return false;
      const rec = recipes.find((r) => r.id === run.recipeId || r.productId === run.productId);
      const assigned = rec?.packets && rec.packets.length > 0 ? rec.packets : [];
      if (assigned.length === 0) return true;
      const packings = packingRecords.filter((p) =>
        p.productionRunId ? p.productionRunId === run.id : Boolean(p.notes && p.notes.includes(run.runNumber))
      );
      const packedSet = new Set(packings.filter((p) => (p.packetsPacked || 0) > 0).map((p) => p.packetSize));
      return !assigned.every((p) => packedSet.has(p.packetName));
    };

    return [...filteredRuns].sort((a, b) => {
      // 1. Cancelled/deleted items always move to the very bottom
      const aCancelled = a.status === 'cancelled';
      const bCancelled = b.status === 'cancelled';
      if (aCancelled !== bCancelled) {
        return aCancelled ? 1 : -1;
      }

      // If both are cancelled, sort descending (newest cancelled first)
      if (aCancelled && bCancelled) {
        const timeA = new Date(a.createdAt || a.productionDate || 0).getTime();
        const timeB = new Date(b.createdAt || b.productionDate || 0).getTime();
        if (timeA !== timeB) return timeB - timeA;
        const numA = batchNumberMap.get(a.id) || 0;
        const numB = batchNumberMap.get(b.id) || 0;
        return numB - numA;
      }

      // 2. Active batches where packets are yet to be added go to top
      const aPending = isPacketsPending(a);
      const bPending = isPacketsPending(b);
      if (aPending && !bPending) return -1;
      if (!aPending && bPending) return 1;

      // 3. All completed / active production show in descending order on top (newest first)
      const timeA = new Date(a.createdAt || a.productionDate || 0).getTime();
      const timeB = new Date(b.createdAt || b.productionDate || 0).getTime();
      if (timeA !== timeB) return timeB - timeA;

      const numA = batchNumberMap.get(a.id) || 0;
      const numB = batchNumberMap.get(b.id) || 0;
      return numB - numA;
    });
  }, [filteredRuns, recipes, packingRecords, batchNumberMap]);


  const handleDeleteRun = async (restock: boolean) => {
    if (!runToDelete) return;
    try {
      setIsDeleting(true);
      await repo.deleteProductionRun({
        runId: runToDelete.id,
        restock,
        operatorName: staffName,
        reason: restock ? 'restocked' : 'wastage',
      });

      // Update local state to show run as deleted/cancelled in grey with restock or wastage
      setRuns((prev) =>
        prev.map((r) =>
          r.id === runToDelete.id
            ? {
                ...r,
                status: 'cancelled' as const,
                cancellationReason: restock ? 'restocked' : 'wastage',
                cancelledAt: new Date().toISOString(),
                cancelledBy: staffName,
              }
            : r
        )
      );

      // Refresh live ingredients stock immediately
      try {
        const freshIngredients = await repo.listIngredients(false);
        if (freshIngredients && freshIngredients.length > 0) {
          setIngredients(freshIngredients);
        }
      } catch (e) {
        console.error('Error refreshing live ingredient stock', e);
      }

      addToast(
        restock
          ? language === 'ml'
            ? `${runToDelete.productName} ബാച്ച് ഒഴിവാക്കി, ചേരുവകൾ സ്റ്റോക്കിലേക്ക് മാറ്റി`
            : `Batch deleted & ingredients restocked (${runToDelete.productName})`
          : language === 'ml'
            ? `${runToDelete.productName} ബാച്ച് വേസ്റ്റേജ് ആയി ഒഴിവാക്കി`
            : `Batch deleted as wastage (${runToDelete.productName})`,
        'success'
      );

      setRunToDelete(null);
      setRestockChoice('yes');
      triggerRefresh();
    } catch (err: any) {
      console.error('Error deleting run', err);
      addToast(err?.message || 'Failed to delete production run', 'error');
    } finally {
      setIsDeleting(false);
    }
  };



  const handleOpenNewBatch = () => {
    setIsStartProductionOpen(true);
    // Background refresh without blocking modal opening
    Promise.all([
      repo.listRecipes(),
      repo.listProducts(false),
      repo.listIngredients(false),
    ]).then(([freshRecipes, freshProducts, freshIngredients]) => {
      if (freshRecipes && freshRecipes.length > 0) setRecipes(freshRecipes);
      if (freshProducts && freshProducts.length > 0) setProducts(freshProducts);
      if (freshIngredients && freshIngredients.length > 0) setIngredients(freshIngredients);
    }).catch((err) => console.error('Failed to pre-fetch recipes:', err));
  };

  const handleEditBatch = (run: ProductionRun) => {
    setRunToEdit(run);
    Promise.all([
      repo.listRecipes(),
      repo.listProducts(false),
      repo.listIngredients(false),
    ]).then(([freshRecipes, freshProducts, freshIngredients]) => {
      if (freshRecipes && freshRecipes.length > 0) setRecipes(freshRecipes);
      if (freshProducts && freshProducts.length > 0) setProducts(freshProducts);
      if (freshIngredients && freshIngredients.length > 0) setIngredients(freshIngredients);
    }).catch((err) => console.error('Failed to pre-fetch recipes:', err));
  };

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      {/* Sleek header bar with prominent Epso logo */}
      <div className="flex items-center justify-between gap-2 pt-1 flex-wrap sm:flex-nowrap">
        <div className="flex items-center">
          <img
            src={isDark ? '/epso-logo-dark.png' : '/epso-logo-light.png'}
            alt="Pulari Bakes Logo"
            className="h-[52px] sm:h-[64px] w-auto object-contain transition-opacity duration-200 select-none"
          />
        </div>

        <div className="flex items-center gap-2">
          {/* Add Basic ingredients button */}
          <button
            onClick={() => {
              setOilModalDate(activeFilter === 'yesterday' ? yesterdayStr : todayStr);
              setIsBasicSelectorOpen(true);
            }}
            className={`flex items-center gap-1.5 text-xs font-bold px-3 py-2.5 rounded-xl transition-all active:scale-95 press-apple cursor-pointer relative ${
              hasPendingBasicsForActiveDate
                ? 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-800 dark:text-amber-200 border-2 border-amber-500/60 shadow-xs'
                : 'bg-stone-500/10 hover:bg-stone-500/20 text-stone-700 dark:text-stone-300 border border-stone-500/20'
            }`}
            title={language === 'ml' ? 'ബേസിക് ചേരുവകൾ ചേർക്കുക' : 'Add Basic Ingredients'}
          >
            {hasPendingBasicsForActiveDate ? (
              <TbAlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
            ) : (
              <TbToolsKitchen2 className="w-4 h-4 text-stone-600 dark:text-stone-400 shrink-0" />
            )}
            <span>{language === 'ml' ? 'ബേസിക് ചേർക്കുക' : 'Add Basic'}</span>
            {hasPendingBasicsForActiveDate && (
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
              </span>
            )}
          </button>

          <button
            onClick={handleOpenNewBatch}
            disabled={isOpeningNewBatch}
            className="flex items-center gap-1.5 bg-gradient-to-r from-epso-red to-epso-orange hover:bg-epso-red-hover text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-md transition-all active:scale-95 press-apple select-none cursor-pointer"
          >
            {isOpeningNewBatch ? (
              <svg
                className="animate-spin h-4 w-4 text-white"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            ) : (
              <TbPlus className="w-4 h-4 stroke-[3]" />
            )}
            <span>{language === 'ml' ? 'പുതിയ ബാച്ച്' : 'New Batch'}</span>
          </button>
        </div>
      </div>

      {/* Production History & Operational Search */}
      <div className="space-y-3 pt-1">
        <div className="flex items-center justify-between gap-3">
          {/* Quick status tabs including dedicated Yesterday filter with warning */}
          <div className="flex items-center gap-1.5 text-xs bg-stone-100 dark:bg-[#1E1B1B] p-1 rounded-xl border border-charcoal-border/40 dark:border-[#2E2828] overflow-x-auto no-scrollbar">
            {/* Today Tab */}
            <button
              type="button"
              onClick={() => setActiveFilter('today')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all press-apple cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                activeFilter === 'today'
                  ? 'bg-white dark:bg-[#282323] text-stone-900 dark:text-white shadow-xs'
                  : 'text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200'
              }`}
            >
              <span>{language === 'ml' ? `ഇന്ന് (${todayRunsCount})` : `Today (${todayRunsCount})`}</span>
              {todayHasWarning && (
                <span
                  className="w-2 h-2 rounded-full bg-amber-500 animate-pulse shrink-0"
                  title={language === 'ml' ? 'പാക്കറ്റുകൾ അല്ലെങ്കിൽ ഓയിൽ ബാക്കിയുണ്ട്' : 'Missing packets or oil'}
                />
              )}
            </button>

            {/* Yesterday Tab */}
            <button
              type="button"
              onClick={() => setActiveFilter('yesterday')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all press-apple cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                activeFilter === 'yesterday'
                  ? 'bg-white dark:bg-[#282323] text-stone-900 dark:text-white shadow-xs'
                  : 'text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200'
              }`}
            >
              <span>{language === 'ml' ? `ഇന്നലെ (${yesterdayRunsCount})` : `Yesterday (${yesterdayRunsCount})`}</span>
              {yesterdayHasWarning && (
                <span
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/40 text-[10px] font-black shrink-0"
                  title={language === 'ml' ? 'ഇന്നലത്തെ ബാച്ചുകളിൽ പാക്കറ്റുകൾ അല്ലെങ്കിൽ ഓയിൽ ബാക്കിയുണ്ട്' : 'Missing packets or oil'}
                >
                  <TbAlertTriangle className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                  <span>!</span>
                </span>
              )}
            </button>

            {/* Completed Tab */}
            <button
              type="button"
              onClick={() => setActiveFilter('completed')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all press-apple cursor-pointer whitespace-nowrap ${
                activeFilter === 'completed'
                  ? 'bg-white dark:bg-[#282323] text-stone-900 dark:text-white shadow-xs'
                  : 'text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200'
              }`}
            >
              {t.runStatusCompleted}
            </button>

            {/* Cancelled Tab */}
            <button
              type="button"
              onClick={() => setActiveFilter('cancelled')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all press-apple cursor-pointer whitespace-nowrap ${
                activeFilter === 'cancelled'
                  ? 'bg-white dark:bg-[#282323] text-stone-900 dark:text-white shadow-xs'
                  : 'text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200'
              }`}
            >
              {t.runStatusCancelled}
            </button>

            {/* All Tab */}
            <button
              type="button"
              onClick={() => setActiveFilter('all')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all press-apple cursor-pointer whitespace-nowrap ${
                activeFilter === 'all'
                  ? 'bg-white dark:bg-[#282323] text-stone-900 dark:text-white shadow-xs'
                  : 'text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200'
              }`}
            >
              {language === 'ml' ? `എല്ലാം (${runs.length})` : `All (${runs.length})`}
            </button>
          </div>
        </div>

        {/* Search */}
        <Input
          placeholder="Search by run #, snack product name, or operator..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          leftAddon={<TbSearch className="w-4 h-4 text-stone-400" />}
        />

        {/* Actionable 3D Rotating Warning Banner for Basic Ingredients: clickable card that acts directly as Add Basic */}
        {(activeFilter === 'today' || activeFilter === 'yesterday') && missingBasicItems.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setOilModalDate(activeFilter === 'yesterday' ? yesterdayStr : todayStr);
              setIsBasicSelectorOpen(true);
            }}
            className="w-full text-left bg-amber-50/90 hover:bg-amber-100/90 dark:bg-amber-950/50 dark:hover:bg-amber-950/70 border border-amber-300 dark:border-amber-800/60 hover:border-amber-400 dark:hover:border-amber-700 rounded-xl px-3 sm:px-3.5 py-2 text-xs flex items-center justify-between gap-2.5 transition-all active:scale-[0.99] shadow-2xs cursor-pointer group select-none"
            title={language === 'ml' ? 'ബേസിക് ചേരുവകൾ ചേർക്കുക' : 'Add Basic Ingredients'}
          >
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <span className="shrink-0 text-sm select-none inline-flex items-center justify-center">⚠️</span>
              <div className="min-w-0 flex-1 overflow-hidden">
                <Rotating3DWarning items={missingBasicItems} />
              </div>
            </div>

            <div className="flex items-center shrink-0 pl-1 text-amber-700 dark:text-amber-300">
              <TbChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5 text-amber-600 dark:text-amber-400" />
            </div>
          </button>
        )}

        {/* Loading state: skeleton shimmer effect */}
        {loading && (
          <div className="py-2">
            <BatchCardSkeleton count={4} />
          </div>
        )}

        {/* Honest Empty State when no records exist */}
        {!loading && sortedRuns.length === 0 && (
          <div className="bg-white dark:bg-[#1E1B1B] rounded-2xl border border-charcoal-border dark:border-[#2E2828] p-8 sm:p-12 text-center space-y-3 transition-colors">
            <div className="w-14 h-14 bg-stone-100 dark:bg-[#282323] text-stone-400 dark:text-stone-500 rounded-2xl flex items-center justify-center mx-auto">
              <TbHistory className="w-7 h-7" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-extrabold text-stone-900 dark:text-white">
                {activeFilter === 'yesterday'
                  ? (language === 'ml' ? 'ഇന്നലെ ബാച്ചുകൾ ഒന്നും ചേർത്തിട്ടില്ല' : 'No batches recorded for yesterday')
                  : activeFilter === 'today'
                  ? (language === 'ml' ? 'ഇന്ന് ബാച്ചുകൾ ഒന്നും ആരംഭിച്ചിട്ടില്ല' : 'No batches recorded for today yet')
                  : t.noProductionRecordsYet}
              </h3>
              <p className="text-xs text-stone-500 dark:text-stone-400 max-w-sm mx-auto">
                {activeFilter === 'yesterday'
                  ? (language === 'ml'
                      ? 'ഇന്നലത്തെ തീയതിയിൽ യാതൊരു പ്രൊഡക്ഷൻ റണ്ണും കണ്ടെത്താനായില്ല.'
                      : 'No production runs were logged for yesterday.')
                  : (language === 'ml'
                      ? 'പ്രൊഡക്ഷൻ രേഖപ്പെടുത്താൻ താഴെയുള്ള "പുതിയ ബാച്ച്" ബട്ടൺ ഉപയോഗിക്കുക.'
                      : 'Click the "Start Production" button below to log your first production run.')}
              </p>
            </div>
            {activeFilter !== 'yesterday' && (
              <Button
                variant="primary"
                size="sm"
                onClick={handleOpenNewBatch}
                disabled={isOpeningNewBatch}
                icon={isOpeningNewBatch ? <LoadingSpinner size="sm" /> : <TbPlus className="w-4 h-4" />}
              >
                {t.startProduction}
              </Button>
            )}
          </div>
        )}

        {/* Runs List */}
        {!loading && sortedRuns.length > 0 && (
          <div className="space-y-2.5">
            {sortedRuns.map((run) => {
              const isCompleted = run.status === 'completed';
              const isDeleted = run.status === 'cancelled';
              const isRestocked = isDeleted && (run.cancellationReason?.toLowerCase().includes('restock') ?? false);

              const batchRecipe = recipes.find((r) => r.id === run.recipeId || r.productId === run.productId);
              const assignedPackets = batchRecipe?.packets && batchRecipe.packets.length > 0 ? batchRecipe.packets : [];
              const totalExpectedPackets = assignedPackets.length;

              const batchPackings = packingRecords.filter(
                (p) =>
                  p.productionRunId
                    ? p.productionRunId === run.id
                    : Boolean(p.notes && p.notes.includes(run.runNumber))
              );

              // Group packets by packetSize to eliminate duplicate badges on cards
              const packingsGroupMap = new Map<string, number>();
              batchPackings.forEach((p) => {
                packingsGroupMap.set(
                  p.packetSize,
                  (packingsGroupMap.get(p.packetSize) || 0) + (p.packetsPacked || 0)
                );
              });
              const groupedBatchPackings = Array.from(packingsGroupMap.entries()).map(
                ([packetSize, packetsPacked]) => ({ packetSize, packetsPacked })
              );

              const totalPacketsPacked = batchPackings.reduce((sum, p) => sum + (p.packetsPacked || 0), 0);
              const hasPackedPackets = totalPacketsPacked > 0;

              // Adding packets is compulsory (cook can pick any packets, not fixed to recipes):
              const isAllPacketsAdded = hasPackedPackets;
              const isWarningYellow = !hasPackedPackets;
              const batchOrderNumber = batchNumberMap.get(run.id) ?? 1;
              const hasProducedWeight = Boolean(run.actualQuantity && run.actualQuantity > 0);
              const isBatchCompleted = hasProducedWeight && hasPackedPackets;

              return (
                <Card
                  key={run.id}
                  padding="none"
                  onClick={() => setSelectedBatchForDetail(run)}
                  className={`transition-all select-none overflow-hidden cursor-pointer press-apple ${
                    isDeleted
                      ? 'bg-stone-100/70 dark:bg-[#181515] !border-stone-200 dark:!border-[#282323] opacity-75'
                      : '!border-orange-500/40 dark:!border-orange-500/45 hover:!border-orange-500 dark:hover:!border-orange-400 shadow-2xs hover:shadow-md'
                  }`}
                >
                  {/* Status Banner on Top of Card: Full Width, Orange Background, White Text, Integrated into Card */}
                  <div className="w-full bg-gradient-to-r from-orange-600 via-orange-500 to-amber-500 dark:from-orange-700 dark:via-orange-600 dark:to-amber-600 text-white font-extrabold text-xs px-4 py-2 sm:px-5 sm:py-2.5 flex items-center justify-between tracking-wide shadow-2xs">
                    <div className="flex items-center gap-2 font-malayalam whitespace-nowrap min-w-0">
                      {isDeleted ? (
                        <>
                          <TbAlertCircle className="w-4 h-4 text-white/90 shrink-0" />
                          <span className="whitespace-nowrap">{language === 'ml' ? 'ബാച്ച് ഒഴിവാക്കി' : 'Batch Cancelled'}</span>
                        </>
                      ) : isBatchCompleted ? (
                        <>
                          <span className="w-4 h-4 rounded-full bg-emerald-500 text-white flex items-center justify-center shrink-0 shadow-xs">
                            <TbCheck className="w-3 h-3 stroke-[3.5]" />
                          </span>
                          <span className="font-extrabold whitespace-nowrap">{language === 'ml' ? 'ബാച്ച് പൂർത്തിയായി' : 'Completed'}</span>
                        </>
                      ) : hasProducedWeight && !isAllPacketsAdded ? (
                        <div
                          onClick={(e) => {
                            e.stopPropagation();
                            setBatchForPacking(run);
                          }}
                          className="flex items-center gap-1.5 cursor-pointer hover:underline"
                          title={language === 'ml' ? 'പാക്കറ്റുകൾ ചേർക്കാൻ ക്ലിക്ക് ചെയ്യുക' : 'Click to add packets'}
                        >
                          <TbAlertTriangle className="w-4 h-4 text-amber-100 shrink-0" />
                          <span className="font-extrabold whitespace-nowrap">{language === 'ml' ? 'പാക്കറ്റുകൾ ചേർക്കുക' : 'Add Packets'}</span>
                        </div>
                      ) : hasPackedPackets && !hasProducedWeight ? (
                        <>
                          <TbAlertTriangle className="w-4 h-4 text-amber-100 shrink-0" />
                          <span className="font-extrabold whitespace-nowrap">{language === 'ml' ? 'തൂക്കം നൽകുക' : 'Set Produced Weight'}</span>
                        </>
                      ) : (
                        <>
                          <TbAlertTriangle className="w-4 h-4 text-amber-100 shrink-0" />
                          <span className="font-extrabold whitespace-nowrap">{language === 'ml' ? 'ബാച്ച് ആരംഭിച്ചു' : 'Batch Started'}</span>
                        </>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {!isBatchCompleted && !isDeleted && (
                        <span className="text-[10px] bg-black/25 px-2.5 py-0.5 rounded-full font-bold font-mono whitespace-nowrap shrink-0">
                          {hasProducedWeight ? (language === 'ml' ? 'പാക്കറ്റ് ബാക്കി' : 'Packets Pending') : (language === 'ml' ? 'തൂക്കം ബാക്കി' : 'Weight Pending')}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Card Content Body */}
                  <div className="p-4 sm:p-5 pt-3 sm:pt-3 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div
                          className={`w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center font-black text-xl sm:text-2xl shrink-0 tabular-nums shadow-xs ${
                            isDeleted
                              ? 'bg-stone-200/80 dark:bg-[#282323] text-stone-400 dark:text-stone-500 line-through'
                              : isAllPacketsAdded
                              ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                              : 'bg-yellow-100 dark:bg-yellow-950/60 text-yellow-800 dark:text-yellow-300 ring-2 ring-yellow-400/40'
                          }`}
                          title={`Batch #${batchOrderNumber}`}
                        >
                          {batchOrderNumber}
                        </div>
                        <div>
                          <h4
                            className={`text-sm sm:text-base font-extrabold leading-tight font-malayalam ${
                              isDeleted ? 'text-stone-400 dark:text-stone-500 line-through' : 'text-stone-900 dark:text-white'
                            }`}
                          >
                            {run.productName}
                          </h4>
                          <p className="text-[11px] font-semibold text-stone-500 dark:text-stone-400 mt-1">
                            {formatBatchDate(run.productionDate)}
                            {!isKitchenStaffDefault(run.operatorName) ? ` • ${run.operatorName}` : ''}
                          </p>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        {run.actualQuantity > 0 ? (
                          <>
                            <span
                              className={`text-base font-black ${
                                isDeleted ? 'text-stone-400 dark:text-stone-500 line-through' : 'text-stone-900 dark:text-white'
                              }`}
                            >
                              {run.actualQuantity} {run.unit}
                            </span>
                            <p className="text-[10px] font-semibold text-stone-400">output</p>
                          </>
                        ) : (
                          <div className="flex flex-col items-end">
                            <span className="text-[11px] font-extrabold text-amber-700 dark:text-amber-300 bg-amber-100/80 dark:bg-amber-950/70 border border-amber-300 dark:border-amber-800 px-2 py-0.5 rounded-lg font-malayalam">
                              {language === 'ml' ? 'തൂക്കിയിട്ടില്ല' : 'Unweighed'}
                            </span>
                            <p className="text-[10px] font-bold text-amber-600 dark:text-amber-400 font-malayalam mt-0.5">
                              {language === 'ml' ? 'സ്കെയിൽ വഴി നൽകുക' : 'Set weight via scale'}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Deletion Info if deleted */}
                    {isDeleted && (
                      <div className="text-xs text-stone-500 dark:text-stone-400 bg-stone-200/50 dark:bg-[#141212] p-2.5 rounded-lg border border-charcoal-border/50 dark:border-[#2E2828] flex items-center justify-between">
                        <span className="flex items-center gap-1.5 font-malayalam">
                          <TbAlertCircle className={`w-4 h-4 shrink-0 ${isRestocked ? 'text-emerald-500' : 'text-amber-500'}`} />
                          <span>
                            {language === 'ml' ? 'ബാച്ച് ഒഴിവാക്കി:' : 'Batch Deleted:'}{' '}
                            <strong className="font-semibold text-stone-700 dark:text-stone-300">
                              {isRestocked
                                ? (language === 'ml' ? 'സ്റ്റോക്ക് തിരികെ ചേർത്തു' : 'Ingredients Restocked')
                                : (language === 'ml' ? 'വേസ്റ്റേജ് ആയി രേഖപ്പെടുത്തി' : 'Marked as Wastage')}
                            </strong>
                          </span>
                        </span>
                      </div>
                    )}

                    {/* Notes if recorded and not deleted */}
                    {!isDeleted && run.notes && (
                      <p className="text-xs text-stone-500 dark:text-stone-400 italic">"{run.notes}"</p>
                    )}

                    {/* Packed packets summary for this batch - Click to Adjust */}
                    {!isDeleted && batchPackings.length > 0 && (
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          setBatchForPacking(run);
                        }}
                        className="bg-stone-50 dark:bg-[#141212] hover:bg-orange-50/70 dark:hover:bg-[#201a18] rounded-xl p-2.5 text-xs border border-charcoal-border/70 dark:border-[#2E2828] hover:border-orange-400 dark:hover:border-orange-500/60 space-y-1.5 cursor-pointer transition-all group shadow-2xs"
                        title={language === 'ml' ? 'പാക്കറ്റുകൾ തിരുത്താൻ ക്ലിക്ക് ചെയ്യുക (Adjust Packets)' : 'Click to adjust packets'}
                      >
                        <div className="flex items-center justify-between text-[11px] font-bold text-stone-700 dark:text-stone-300">
                          <span className="flex items-center gap-1.5">
                            <TbPackage className="w-3.5 h-3.5 text-epso-orange group-hover:scale-110 transition-transform" />
                            {language === 'ml' ? 'പാക്ക് ചെയ്തവ' : 'Packed Quantities'}:
                          </span>
                          <span className="flex items-center gap-1 text-epso-orange dark:text-amber-400 font-extrabold text-[11px]">
                            <TbPencil className="w-3 h-3 stroke-[2.5]" />
                            <span>{language === 'ml' ? 'മാറ്റുക / Adjust' : 'Adjust'}</span>
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {groupedBatchPackings.map((pkg) => (
                            <span
                              key={pkg.packetSize}
                              className="inline-flex items-center gap-1 bg-white dark:bg-[#1E1B1B] text-stone-800 dark:text-stone-200 border border-charcoal-border/60 dark:border-[#2E2828] px-2 py-0.5 rounded-md font-semibold text-[11px]"
                            >
                              <span className="font-bold text-epso-red">{pkg.packetSize}:</span>
                              <span>{pkg.packetsPacked} pkts</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Actions Bar: Centered 4 Action Buttons OR Deleted Status Badge */}
                    <div className="pt-2 border-t border-charcoal-border/40 dark:border-[#2E2828]/60 w-full">
                      {isDeleted ? (
                        <div className="flex items-center justify-center w-full py-1">
                          {isRestocked ? (
                            <span className="text-[11px] font-bold px-3 py-1 rounded-full border bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800 flex items-center gap-1.5 font-malayalam">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                              <span>{language === 'ml' ? 'ബാച്ച് ഒഴിവാക്കി (സ്റ്റോക്ക് പുനഃസ്ഥാപിച്ചു)' : 'Deleted (Restocked)'}</span>
                            </span>
                          ) : (
                            <span className="text-[11px] font-bold px-3 py-1 rounded-full border bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-800/60 flex items-center gap-1.5 font-malayalam">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                              <span>{language === 'ml' ? 'ബാച്ച് ഒഴിവാക്കി (പാഴായി രേഖപ്പെടുത്തി)' : 'Deleted (Wastage)'}</span>
                            </span>
                          )}
                        </div>
                      ) : (
                        <div className="flex items-center justify-center gap-2 sm:gap-2.5 w-full">
                          {/* 1. Add Packet Icon Box - Warning Yellow when no packets added (compulsory) */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setBatchForPacking(run);
                            }}
                            className={`relative w-11 h-11 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center transition-all press-apple cursor-pointer shadow-xs shrink-0 ${
                              isWarningYellow
                                ? 'bg-yellow-100 hover:bg-yellow-200 dark:bg-yellow-950/60 dark:hover:bg-yellow-900/70 text-yellow-800 dark:text-yellow-200 border-2 border-yellow-400 dark:border-yellow-600/80 ring-2 ring-yellow-400/40'
                                : 'bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:hover:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/50'
                            }`}
                            title={
                              isWarningYellow
                                ? language === 'ml'
                                  ? 'പാക്കറ്റുകൾ ചേർക്കൽ നിർബന്ധമാണ്'
                                  : 'Adding packets is compulsory'
                                : language === 'ml'
                                ? `${totalPacketsPacked} പാക്കറ്റുകൾ ചേർത്തു (തിരുത്താൻ ക്ലിക്ക് ചെയ്യുക)`
                                : `${totalPacketsPacked} packets added (Click to adjust)`
                            }
                            aria-label={
                              hasPackedPackets
                                ? (language === 'ml' ? 'പാക്കറ്റുകൾ തിരുത്തുക' : 'Adjust Packets')
                                : (language === 'ml' ? 'പാക്കറ്റുകൾ ചേർക്കുക' : 'Add Packets')
                            }
                          >
                            <TbPackage className="w-5 h-5 stroke-[2.2]" />
                            {isWarningYellow ? (
                              <span
                                className="absolute -top-1.5 -right-1.5 px-1 min-w-[18px] h-4 rounded-full bg-yellow-500 text-stone-950 text-[10px] font-black flex items-center justify-center shadow-sm ring-2 ring-white dark:ring-[#1E1B1B] leading-none select-none"
                                title={language === 'ml' ? 'പാക്കറ്റുകൾ ചേർക്കൽ നിർബന്ധമാണ്' : 'Adding packets is compulsory'}
                              >
                                !
                              </span>
                            ) : (
                              <span
                                className="absolute -top-1.5 -right-1.5 px-1 min-w-[18px] h-4 rounded-full bg-emerald-500 text-white text-[10px] font-black flex items-center justify-center shadow-sm ring-2 ring-white dark:ring-[#1E1B1B] leading-none select-none font-mono"
                                title={`${totalPacketsPacked} packets added`}
                              >
                                {totalPacketsPacked}
                              </span>
                            )}
                          </button>

                          {/* 2. Weigh Produced KG (Weighing Scale) & Set Production Quantity Display */}
                          {(() => {
                            const isProducedMissing = !run.actualQuantity || run.actualQuantity <= 0;
                            return (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setIsPostCreationPrompt(false);
                                  setBatchForWeighing(run);
                                }}
                                className={`relative h-11 sm:h-12 px-3 sm:px-3.5 rounded-xl flex items-center gap-2 font-bold text-xs transition-all press-apple cursor-pointer shadow-xs shrink-0 ${
                                  isProducedMissing
                                    ? 'bg-yellow-100 hover:bg-yellow-200 dark:bg-yellow-950/60 dark:hover:bg-yellow-900/70 text-yellow-900 dark:text-yellow-200 border-2 border-yellow-400 dark:border-yellow-600/80 ring-2 ring-yellow-400/40'
                                    : 'bg-orange-50 hover:bg-orange-100 dark:bg-orange-950/30 dark:hover:bg-orange-900/50 text-orange-700 dark:text-orange-300 border border-orange-200 dark:border-orange-900/50'
                                }`}
                                title={language === 'ml' ? 'തൂക്കം നൽകുക' : 'Set Production Quantity'}
                                aria-label={language === 'ml' ? 'തൂക്കം നൽകുക' : 'Set Production Quantity'}
                              >
                                <TbScale className="w-5 h-5 stroke-[2.2] text-orange-600 dark:text-orange-400 shrink-0" />
                                <span className="font-mono text-sm font-extrabold whitespace-nowrap">
                                  {run.actualQuantity > 0 ? `${run.actualQuantity} ${run.unit}` : (language === 'ml' ? 'തൂക്കം നൽകുക' : 'Set Qty')}
                                </span>
                                {isProducedMissing && (
                                  <span
                                    className="absolute -top-1.5 -right-1.5 px-1 min-w-[18px] h-4 rounded-full bg-yellow-500 text-stone-950 text-[10px] font-black flex items-center justify-center shadow-sm ring-2 ring-white dark:ring-[#1E1B1B] leading-none select-none"
                                    title={language === 'ml' ? 'ഉത്പാദന അളവ് നൽകിയിട്ടില്ല' : 'Production quantity not entered'}
                                  >
                                    !
                                  </span>
                                )}
                              </button>
                            );
                          })()}

                          {/* 3. Edit Batch Icon Box - Disabled and greyed out after recording produced weight */}
                          {hasProducedWeight ? (
                            <button
                              type="button"
                              disabled
                              onClick={(e) => e.stopPropagation()}
                              className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-stone-100 dark:bg-[#1E1B1B] text-stone-300 dark:text-stone-600 border border-stone-200 dark:border-stone-800 flex items-center justify-center cursor-not-allowed select-none shrink-0"
                              title={language === 'ml' ? 'തൂക്കം രേഖപ്പെടുത്തിയതിനാൽ തിരുത്താനാകില്ല' : 'Cannot edit after recording produced weight'}
                              aria-label="Edit Batch Disabled"
                            >
                              <TbPencil className="w-5 h-5 stroke-[2.2]" />
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEditBatch(run);
                              }}
                              className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/30 dark:hover:bg-amber-900/50 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-900/50 flex items-center justify-center transition-all press-apple cursor-pointer shadow-xs shrink-0"
                              title={language === 'ml' ? 'ബാച്ച് തിരുത്തുക' : 'Edit Batch'}
                              aria-label="Edit Batch"
                            >
                              <TbPencil className="w-5 h-5 stroke-[2.2]" />
                            </button>
                          )}

                          {/* 4. Delete Batch Icon Box: Grey & disabled if batch is completed, red & clickable otherwise */}
                          {isAllPacketsAdded || hasPackedPackets ? (
                            <button
                              type="button"
                              disabled
                              onClick={(e) => e.stopPropagation()}
                              className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-stone-100 dark:bg-[#1E1B1B] text-stone-300 dark:text-stone-600 border border-stone-200 dark:border-stone-800 flex items-center justify-center cursor-not-allowed select-none shrink-0"
                              title={language === 'ml' ? 'പൂർത്തിയായ ബാച്ച് ഒഴിവാക്കാനാകില്ല' : 'Completed batch cannot be deleted'}
                              aria-label="Delete Batch Disabled"
                            >
                              <TbTrash className="w-5 h-5 stroke-[2.2]" />
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setRestockChoice('yes');
                                setRunToDelete(run);
                              }}
                              className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-red-50 hover:bg-red-100 dark:bg-red-950/30 dark:hover:bg-red-900/50 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900/50 flex items-center justify-center transition-all press-apple cursor-pointer shadow-xs shrink-0"
                              title={language === 'ml' ? 'ബാച്ച് ഒഴിവാക്കുക' : 'Delete Batch'}
                              aria-label="Delete Batch"
                            >
                              <TbTrash className="w-5 h-5 stroke-[2.2]" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Production Wizard Modal */}
      <StartProductionModal
        isOpen={isStartProductionOpen || Boolean(runToEdit)}
        onClose={() => {
          setIsStartProductionOpen(false);
          setRunToEdit(null);
        }}
        runToEdit={runToEdit}
        products={products}
        recipes={recipes}
        ingredients={ingredients}
        isLoadingProducts={loading}
        onSuccess={async (savedRun) => {
          if (savedRun) {
            setRuns((prev) => {
              const exists = prev.some((r) => r.id === savedRun.id);
              if (exists) {
                return prev.map((r) => (r.id === savedRun.id ? { ...r, ...savedRun } : r));
              }
              return [savedRun, ...prev];
            });

          }
          setIsStartProductionOpen(false);
          setRunToEdit(null);
          try {
            const freshIngredients = await repo.listIngredients(false);
            if (freshIngredients && freshIngredients.length > 0) {
              setIngredients(freshIngredients);
            }
          } catch (e) {
            console.error('Error refreshing live ingredient stock', e);
          }
          triggerRefresh();
        }}
      />

      {/* Delete Batch Modal with Restock vs Wastage Option */}
      <Modal
        isOpen={!!runToDelete}
        onClose={() => {
          if (!isDeleting) {
            setRunToDelete(null);
            setRestockChoice('yes');
          }
        }}
        title={
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-red-100 dark:bg-red-950/50 text-red-600 dark:text-red-400">
              <TbTrash className="w-5 h-5 stroke-[2.2]" />
            </span>
            <div>
              <h3 className="text-base font-extrabold text-stone-900 dark:text-white leading-tight font-malayalam">
                {language === 'ml' ? 'ബാച്ച് ഒഴിവാക്കുക' : 'Delete Production Batch'}
              </h3>
              {runToDelete && (
                <p className="text-xs text-stone-500 dark:text-stone-400 font-medium font-malayalam">
                  {runToDelete.productName} ({runToDelete.actualQuantity} {runToDelete.unit})
                </p>
              )}
            </div>
          </div>
        }
        size="md"
      >
        {runToDelete && (
          <div className="space-y-4 py-1">
            {/* Batch Info Card - NO #PRD- NUMBER */}
            <div className="p-3 bg-stone-100/80 dark:bg-[#252020] rounded-xl flex items-center justify-between">
              <div>
                <h4 className="text-sm font-extrabold text-stone-900 dark:text-white font-malayalam">
                  {runToDelete.productName}
                </h4>
                <p className="text-[11px] font-semibold text-stone-500 dark:text-stone-400 mt-0.5">
                  {formatBatchDate(runToDelete.productionDate)}
                  {!isKitchenStaffDefault(runToDelete.operatorName) ? ` • ${runToDelete.operatorName}` : ''}
                </p>
              </div>
              <div className="text-right">
                <span className="text-base font-black text-stone-900 dark:text-white font-sans">
                  {runToDelete.actualQuantity} {runToDelete.unit}
                </span>
                <p className="text-[10px] font-bold text-stone-400">output</p>
              </div>
            </div>

            {/* Restock Question */}
            <div className="space-y-2">
              <label className="text-xs font-black text-stone-900 dark:text-white font-malayalam uppercase tracking-wider block">
                {language === 'ml'
                  ? 'ചേരുവകൾ വീണ്ടും സ്റ്റോക്കിലേക്ക് ചേർക്കണോ?'
                  : 'Do you wish to restock the ingredients?'}
              </label>

              {/* Option 1: Yes, Restock Ingredients */}
              <div
                onClick={() => setRestockChoice('yes')}
                className={`p-3 rounded-xl border-2 cursor-pointer transition-all flex items-start gap-3 select-none ${
                  restockChoice === 'yes'
                    ? 'border-emerald-500 bg-emerald-50/60 dark:bg-emerald-950/30'
                    : 'border-stone-200 dark:border-[#2E2828] bg-white dark:bg-[#1E1B1B] hover:border-emerald-400/50'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 ${
                    restockChoice === 'yes'
                      ? 'border-emerald-500 bg-emerald-500 text-white'
                      : 'border-stone-300 dark:border-stone-600 bg-transparent'
                  }`}
                >
                  {restockChoice === 'yes' && <TbCheck className="w-3.5 h-3.5 stroke-[3]" />}
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-extrabold text-stone-900 dark:text-white font-malayalam block">
                    {language === 'ml' ? 'അതെ, ചേരുവകൾ സ്റ്റോക്കിലേക്ക് ചേർക്കുക' : 'Yes, Restock Ingredients'}
                  </span>
                  <span className="text-[11px] text-stone-500 dark:text-stone-400 font-medium font-malayalam block mt-0.5">
                    {language === 'ml'
                      ? 'ചേരുവകൾ തിരികെ സ്റ്റോക്കിലേക്ക് ചേർക്കും, എന്നാൽ നിർമ്മിച്ച ഉൽപ്പന്നം സ്റ്റോക്കിൽ നിന്നും കുറയ്ക്കും.'
                      : 'Ingredient stock will be restored, and produced product will be deducted.'}
                  </span>
                </div>
              </div>

              {/* Option 2: No, Mark as Wastage */}
              <div
                onClick={() => setRestockChoice('no')}
                className={`p-3 rounded-xl border-2 cursor-pointer transition-all flex items-start gap-3 select-none ${
                  restockChoice === 'no'
                    ? 'border-amber-500 bg-amber-50/60 dark:bg-amber-950/30'
                    : 'border-stone-200 dark:border-[#2E2828] bg-white dark:bg-[#1E1B1B] hover:border-amber-400/50'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 ${
                    restockChoice === 'no'
                      ? 'border-amber-500 bg-amber-500 text-white'
                      : 'border-stone-300 dark:border-stone-600 bg-transparent'
                  }`}
                >
                  {restockChoice === 'no' && <TbCheck className="w-3.5 h-3.5 stroke-[3]" />}
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-extrabold text-stone-900 dark:text-white font-malayalam block">
                    {language === 'ml' ? 'അല്ല, വേസ്റ്റേജ് ആയി രേഖപ്പെടുത്തുക' : 'No, Mark as Wastage'}
                  </span>
                  <span className="text-[11px] text-stone-500 dark:text-stone-400 font-medium font-malayalam block mt-0.5">
                    {language === 'ml'
                      ? 'ചേരുവകൾ വേസ്റ്റേജ് ആയി പോകും, സ്റ്റോക്കിലേക്ക് ചേർക്കില്ല.'
                      : 'Items will go to wastage, not added back to stock.'}
                  </span>
                </div>
              </div>
            </div>

            {/* Prominent Warning Banner if 'No' (Wastage) is selected */}
            {restockChoice === 'no' && (
              <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700/60 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2.5 animate-in fade-in duration-150">
                <TbAlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-black block font-malayalam">
                    {language === 'ml' ? 'മുന്നറിയിപ്പ്: സാധനങ്ങൾ വേസ്റ്റേജ് ആയി രേഖപ്പെടുത്തും!' : 'Warning: Items will go to wastage!'}
                  </span>
                  <span className="font-semibold text-[11px] opacity-90 font-malayalam block mt-0.5">
                    {language === 'ml'
                      ? 'ഉപയോഗിച്ച ചേരുവകളോ നിർമ്മിച്ച ഉൽപ്പന്നമോ സ്റ്റോക്കിലേക്ക് തിരികെ ലഭിക്കില്ല.'
                      : 'Neither ingredients nor produced product will be added back to stock.'}
                  </span>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-charcoal-border/50 dark:border-[#2E2828]/50">
              <Button
                variant="ghost"
                onClick={() => {
                  setRunToDelete(null);
                  setRestockChoice('yes');
                }}
                disabled={isDeleting}
                className="font-bold px-4"
              >
                {language === 'ml' ? 'റദ്ദാക്കുക' : 'Cancel'}
              </Button>

              <Button
                variant={restockChoice === 'yes' ? 'primary' : 'danger'}
                onClick={() => handleDeleteRun(restockChoice === 'yes')}
                isLoading={isDeleting}
                className="font-bold px-6 shadow-sm"
              >
                {restockChoice === 'yes'
                  ? language === 'ml'
                    ? 'റീസ്റ്റോക്ക് ചെയ്ത് ഒഴിവാക്കുക'
                    : 'Delete & Restock'
                  : language === 'ml'
                  ? 'വേസ്റ്റേജായി ഒഴിവാക്കുക'
                  : 'Delete as Wastage'}
              </Button>
            </div>
          </div>
        )}
      </Modal>
      {/* Daily Oil Modal */}
      <DailyOilModal
        isOpen={isDailyOilModalOpen}
        initialDate={oilModalDate}
        onClose={() => setIsDailyOilModalOpen(false)}
        onSuccess={() => {
          markBasicAsRecorded(oilModalDate, 'oil');
          triggerRefresh();
        }}
      />

      {/* Batch Packing Modal */}
      <BatchPackingModal
        isOpen={!!batchForPacking}
        batch={batchForPacking}
        recipes={recipes}
        initialPackings={
          batchForPacking
            ? packingRecords.filter((p) =>
                p.productionRunId
                  ? p.productionRunId === batchForPacking.id
                  : Boolean(p.notes && p.notes.includes(batchForPacking.runNumber))
              )
            : []
        }
        onClose={() => setBatchForPacking(null)}
        onSuccess={() => {
          triggerRefresh();
        }}
      />

      {/* Batch Weighing Scale Modal (Produced KG) */}
      <BatchWeighingModal
        isOpen={!!batchForWeighing}
        batch={batchForWeighing}
        isPostCreationPrompt={isPostCreationPrompt}
        onClose={() => {
          setBatchForWeighing(null);
          setIsPostCreationPrompt(false);
        }}
        onSuccess={(updated) => {
          if (updated) {
            setRuns((prev) => prev.map((r) => (r.id === updated.id ? { ...r, ...updated } : r)));
          }
          triggerRefresh();
        }}
        onOpenPacking={(b) => {
          setBatchForWeighing(null);
          setIsPostCreationPrompt(false);
          setBatchForPacking(b);
        }}
      />

      {/* Basic Ingredients Selector Modal */}
      <BasicIngredientsSelectorModal
        isOpen={isBasicSelectorOpen}
        onClose={() => setIsBasicSelectorOpen(false)}
        ingredients={ingredients}
        recordedKeys={recordedBasics[oilModalDate] || []}
        isOilRecorded={
          oilModalDate === yesterdayStr
            ? hasRecordedOil(yesterdayOilClosing) || (recordedBasics[yesterdayStr] || []).includes('oil')
            : hasRecordedOil(todayOilClosing) || (recordedBasics[todayStr] || []).includes('oil')
        }
        onSelectOil={() => {
          setIsDailyOilModalOpen(true);
        }}
        onSelectBasicIngredient={(ing) => {
          setMeasuringBasicIngredient(ing);
        }}
      />

      {/* Basic Ingredient Measurement Modal (25kg ruler + grams) */}
      <BasicIngredientMeasurementModal
        isOpen={Boolean(measuringBasicIngredient)}
        onClose={() => setMeasuringBasicIngredient(null)}
        ingredient={measuringBasicIngredient}
        targetDate={oilModalDate}
        onSuccess={async () => {
          if (measuringBasicIngredient) {
            markBasicAsRecorded(oilModalDate, measuringBasicIngredient);
          }
          try {
            const freshIngredients = await repo.listIngredients(false);
            if (freshIngredients && freshIngredients.length > 0) {
              setIngredients(freshIngredients);
            }
          } catch (e) {
            console.error('Error refreshing ingredients after measurement', e);
          }
          triggerRefresh();
        }}
      />

      {/* Batch Details Modal (view ingredients, packets, basic calculations, close button) */}
      <BatchDetailModal
        isOpen={Boolean(selectedBatchForDetail)}
        onClose={() => setSelectedBatchForDetail(null)}
        batch={selectedBatchForDetail}
        batchOrderNumber={selectedBatchForDetail ? (batchNumberMap.get(selectedBatchForDetail.id) ?? 1) : 1}
        packingRecords={packingRecords}
        dailyClosing={
          selectedBatchForDetail
            ? isTodayDate(selectedBatchForDetail.productionDate)
              ? todayOilClosing
              : isYesterdayDate(selectedBatchForDetail.productionDate)
              ? yesterdayOilClosing
              : null
            : null
        }
        totalDailyProductionKg={
          selectedBatchForDetail
            ? runs
                .filter((r) => r.productionDate === selectedBatchForDetail.productionDate && r.status !== 'cancelled')
                .reduce((sum, r) => sum + (r.actualQuantity || r.plannedQuantity || 0), 0)
            : 0
        }
        recipe={recipes.find(
          (r) =>
            r.id === selectedBatchForDetail?.recipeId ||
            r.productId === selectedBatchForDetail?.productId
        )}
      />
    </div>
  );
};

