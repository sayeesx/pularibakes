import React, { useMemo } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { ProductionRun, PackingRecord, DailyClosing, Recipe, StockMovement, Ingredient } from '../../types';
import { useLanguage } from '../../context/LanguageContext';
import { isBasicIngredientName } from '../../services/costing';
import {
  TbPackage,
  TbToolsKitchen2,
  TbScale,
  TbDroplet,
  TbSparkles,
  TbCandy,
  TbFlame,
  TbCalendar,
  TbUser,
  TbCheck,
  TbAlertTriangle,
  TbReceipt2,
} from 'react-icons/tb';

interface BatchDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  batch: ProductionRun | null;
  batchOrderNumber?: number;
  packingRecords?: PackingRecord[];
  dailyClosing?: DailyClosing | null;
  totalDailyProductionKg?: number;
  recipe?: Recipe | null;
  stockMovements?: StockMovement[];
  ingredients?: Ingredient[];
}

export const BatchDetailModal: React.FC<BatchDetailModalProps> = ({
  isOpen,
  onClose,
  batch,
  batchOrderNumber,
  packingRecords = [],
  dailyClosing,
  totalDailyProductionKg = 0,
  recipe,
  stockMovements = [],
  ingredients = [],
}) => {
  const { language } = useLanguage();

  // Filter packing records specifically for this batch
  const batchPackings = useMemo(() => {
    if (!batch) return [];
    return packingRecords.filter(
      (p) =>
        (p.productionRunId && p.productionRunId === batch.id) ||
        Boolean(p.notes && p.notes.includes(batch.runNumber))
    );
  }, [packingRecords, batch?.id, batch?.runNumber]);

  // Group packings by packet size
  const groupedPackings = useMemo(() => {
    const map = new Map<string, { packets: number; weightKg: number }>();
    batchPackings.forEach((p) => {
      const prev = map.get(p.packetSize) || { packets: 0, weightKg: 0 };
      map.set(p.packetSize, {
        packets: prev.packets + (p.packetsPacked || 0),
        weightKg: prev.weightKg + (Number(p.weightPackedKg) || 0),
      });
    });
    return Array.from(map.entries()).map(([packetSize, data]) => ({
      packetSize,
      packets: data.packets,
      weightKg: data.weightKg,
    }));
  }, [batchPackings]);

  const totalPackets = useMemo(
    () => groupedPackings.reduce((sum, g) => sum + g.packets, 0),
    [groupedPackings]
  );
  const totalPackedWeight = useMemo(
    () => groupedPackings.reduce((sum, g) => sum + g.weightKg, 0),
    [groupedPackings]
  );

  // Calculate batch production ratio for shared daily basic ingredients
  const batchWeightKg = Number(batch?.actualQuantity) || Number(batch?.plannedQuantity) || 0;
  const effectiveTotalDayKg = Math.max(batchWeightKg, Number(totalDailyProductionKg) || 0);
  const batchRatio = effectiveTotalDayKg > 0 ? Math.min(1, batchWeightKg / effectiveTotalDayKg) : 1;

  // Basic ingredients calculations
  const calculatedBasics = useMemo(() => {
    const batchWeightKg = Number(batch?.actualQuantity) || Number(batch?.plannedQuantity) || 0;
    const effectiveTotalDayKg = Math.max(batchWeightKg, Number(totalDailyProductionKg) || 0);
    const batchRatio = effectiveTotalDayKg > 0 ? Math.min(1, batchWeightKg / effectiveTotalDayKg) : 1;
    const batchDate = batch?.productionDate || (batch?.createdAt ? batch.createdAt.split('T')[0] : '');

    // 1. Oil
    let oilDailyTotal = Number(dailyClosing?.totalOilUsedKg ?? dailyClosing?.oilConsumed) || 0;

    // 2. Aggregate all basic ingredients from stock movements on this date
    // (Salt, Cashew shell fuel, Chippli, Curry leaves, Sugar, etc.)
    const itemsMap = new Map<string, {
      name: string;
      categoryKey: string;
      dailyTotalKg: number;
      batchShareKg: number;
      unit: string;
    }>();

    if (stockMovements && stockMovements.length > 0) {
      for (const m of stockMovements) {
        if ((m.quantity || 0) >= 0) continue;
        const mDate = m.createdAt ? m.createdAt.split('T')[0] : '';
        const r = (m.reason || '').toLowerCase();
        const n = (m.itemName || '').toLowerCase();

        const matchesDate = mDate === batchDate || r.includes(batchDate);
        if (!matchesDate) continue;

        const isOil = n.includes('ഓയിൽ') || n.includes('oil') || r.includes('ഓയിൽ') || r.includes('oil');
        if (isOil) {
          if (oilDailyTotal <= 0) {
            oilDailyTotal = Math.abs(Number(m.quantity) || 0);
          }
          continue;
        }

        const ing = ingredients?.find((i) => i.id === m.itemId);
        const isBasic =
          ing?.category === 'basic' ||
          isBasicIngredientName(m.itemName) ||
          isBasicIngredientName(m.reason || '') ||
          r.includes('daily basic ingredient usage') ||
          r.includes('basic');

        if (!isBasic) continue;

        const displayName = ing?.name || m.itemName || (m.reason?.match(/\(([^)]+)\)/)?.[1]) || 'Basic Ingredient';
        const qtyKg = m.unit?.toLowerCase() === 'g' ? Math.abs(m.quantity) / 1000 : Math.abs(m.quantity);

        const existing = itemsMap.get(displayName) || {
          name: displayName,
          categoryKey: n.includes('salt') || n.includes('ഉപ്പ്') || r.includes('ഉപ്പ്') ? 'salt' : n.includes('sugar') || n.includes('പഞ്ചസാര') || r.includes('പഞ്ചസാര') ? 'sugar' : 'other',
          dailyTotalKg: 0,
          batchShareKg: 0,
          unit: 'kg',
        };

        existing.dailyTotalKg += qtyKg;
        itemsMap.set(displayName, existing);
      }
    }

    // Also check dailyClosing salt/sugar fields if they were recorded in closing notes
    const saltFromClosing = Number(dailyClosing?.saltUsedKg) || 0;
    if (saltFromClosing > 0 && !Array.from(itemsMap.keys()).some(k => k.includes('ഉപ്പ്') || k.toLowerCase().includes('salt'))) {
      itemsMap.set('ഉപ്പ് (Salt)', {
        name: 'ഉപ്പ് (Salt)',
        categoryKey: 'salt',
        dailyTotalKg: saltFromClosing,
        batchShareKg: 0,
        unit: 'kg',
      });
    }

    const basicItems = Array.from(itemsMap.values()).map((item) => ({
      ...item,
      dailyTotalKg: Number(item.dailyTotalKg.toFixed(2)),
      batchShareKg: Number((item.dailyTotalKg * batchRatio).toFixed(2)),
    }));

    const oilShareKg = Number((oilDailyTotal * batchRatio).toFixed(2));
    const hasRecordedAny = oilDailyTotal > 0 || basicItems.length > 0;

    return {
      ratioPercent: (batchRatio * 100).toFixed(1),
      oilDailyTotal: oilDailyTotal.toFixed(2),
      oilShareKg: oilShareKg.toFixed(2),
      basicItems,
      hasRecordedAny,
    };
  }, [batch, totalDailyProductionKg, dailyClosing, stockMovements, ingredients]);

  // Ingredients consumed list (with fallback to recipe if empty)
  const consumedIngredientsList = useMemo(() => {
    if (batch?.ingredientsConsumed && batch.ingredientsConsumed.length > 0) {
      return batch.ingredientsConsumed;
    }
    if (recipe && recipe.ingredients && recipe.ingredients.length > 0) {
      const baseOut = Number(recipe.baseOutputQuantity) || 1;
      const multiplier = batchWeightKg > 0 ? batchWeightKg / baseOut : 1;
      return recipe.ingredients.map((ing) => ({
        ingredientId: ing.ingredientId,
        ingredientName: ing.ingredientName,
        expectedQuantity: Number((ing.quantity * multiplier).toFixed(3)),
        actualQuantity: Number((ing.quantity * multiplier).toFixed(3)),
        unit: ing.unit,
      }));
    }
    return [];
  }, [batch?.ingredientsConsumed, recipe, batchWeightKg]);

  if (!isOpen || !batch) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="lg"
      title={
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-orange-500/15 text-orange-600 dark:text-orange-400 flex items-center justify-center font-black text-sm shrink-0">
            #{batchOrderNumber ?? 1}
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-black text-stone-900 dark:text-white leading-tight font-malayalam">
              {batch.productName}
            </h2>
            <p className="text-[11px] text-stone-500 dark:text-stone-400 font-semibold flex items-center gap-1.5 mt-0.5">
              <TbCalendar className="w-3.5 h-3.5 text-stone-400 shrink-0" />
              <span>{batch.productionDate}</span>
              {batch.operatorName && (
                <>
                  <span className="text-stone-300 dark:text-stone-700">•</span>
                  <TbUser className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                  <span>{batch.operatorName}</span>
                </>
              )}
            </p>
          </div>
        </div>
      }
      footer={
        <div className="flex items-center justify-end w-full">
          <Button variant="secondary" onClick={onClose} className="w-full sm:w-auto font-bold">
            {language === 'ml' ? 'അടയ്ക്കുക' : 'Close'}
          </Button>
        </div>
      }
    >
      <div className="space-y-4 py-1 text-xs select-none">
        {/* Output & Status Top Banner */}
        <div className="p-3.5 rounded-2xl bg-gradient-to-r from-orange-50 to-amber-50 dark:from-orange-950/30 dark:to-amber-950/20 border border-orange-200/70 dark:border-orange-900/50 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-orange-500 text-white shadow-xs">
              <TbScale className="w-6 h-6 stroke-[2.2]" />
            </div>
            <div>
              <span className="text-[10px] uppercase font-black tracking-wider text-orange-700 dark:text-orange-400">
                {language === 'ml' ? 'ഉത്പാദന അളവ്' : 'Produced Output Weight'}
              </span>
              <div className="text-lg sm:text-xl font-black text-stone-900 dark:text-white font-mono leading-tight">
                {batch.actualQuantity > 0 ? (
                  <>
                    {batch.actualQuantity}{' '}
                    <span className="text-xs font-bold text-stone-500 dark:text-stone-400">
                      {batch.unit}
                    </span>
                  </>
                ) : (
                  <span className="text-sm text-amber-600 dark:text-amber-400 font-bold font-malayalam">
                    {language === 'ml' ? 'തൂക്കിയിട്ടില്ല' : 'Unweighed'}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1 px-3 py-1 rounded-full font-bold text-xs ${
                batch.actualQuantity > 0
                  ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
                  : 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800'
              }`}
            >
              {batch.actualQuantity > 0 ? (
                <>
                  <TbCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 stroke-[3]" />
                  <span>{language === 'ml' ? 'തൂക്കം രേഖപ്പെടുത്തി' : 'Weighed'}</span>
                </>
              ) : (
                <>
                  <TbAlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                  <span>{language === 'ml' ? 'തൂക്കം നൽകാനുണ്ട്' : 'Pending Weight'}</span>
                </>
              )}
            </span>
          </div>
        </div>

        {/* SECTION 1: INGREDIENTS ADDED */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-stone-700 dark:text-stone-300 font-bold text-xs">
            <span className="flex items-center gap-1.5 font-malayalam">
              <TbToolsKitchen2 className="w-4 h-4 text-epso-orange" />
              <span>{language === 'ml' ? 'ചേർത്ത ചേരുവകൾ' : 'Ingredients Added'}</span>
            </span>
            <span className="text-[11px] text-stone-400">
              {consumedIngredientsList.length} {language === 'ml' ? 'ചേരുവകൾ' : 'items'}
            </span>
          </div>

          <div className="rounded-2xl border border-stone-200 dark:border-[#282323] overflow-hidden bg-white dark:bg-[#1E1B1B] divide-y divide-stone-100 dark:divide-[#282323]">
            {consumedIngredientsList.length > 0 ? (
              consumedIngredientsList.map((ing, idx) => {
                const diff = (ing.actualQuantity || 0) - (ing.expectedQuantity || 0);
                return (
                  <div
                    key={ing.ingredientId || idx}
                    className="p-3 flex items-center justify-between gap-2 hover:bg-stone-50 dark:hover:bg-[#141212]/50 transition-colors"
                  >
                    <div>
                      <h4 className="font-bold text-stone-900 dark:text-white font-malayalam text-xs">
                        {ing.ingredientName}
                      </h4>
                      {ing.expectedQuantity !== undefined && ing.expectedQuantity > 0 && (
                        <p className="text-[10px] text-stone-400 font-mono">
                          {language === 'ml' ? 'കണക്കാക്കിയത്:' : 'Expected:'} {ing.expectedQuantity} {ing.unit}
                        </p>
                      )}
                    </div>

                    <div className="text-right shrink-0">
                      <span className="font-extrabold text-stone-900 dark:text-white font-mono text-sm">
                        {ing.actualQuantity} {ing.unit}
                      </span>
                      {Math.abs(diff) > 0.05 && ing.expectedQuantity > 0 && (
                        <p
                          className={`text-[10px] font-bold font-mono ${
                            diff > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'
                          }`}
                        >
                          {diff > 0 ? `+${diff.toFixed(2)}` : diff.toFixed(2)} {ing.unit}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="p-4 text-center text-stone-400 italic">
                {language === 'ml' ? 'ചേരുവകൾ രേഖപ്പെടുത്തിയിട്ടില്ല' : 'No ingredients recorded for this batch'}
              </div>
            )}
          </div>
        </div>

        {/* SECTION 2: PACKETS ADDED */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-stone-700 dark:text-stone-300 font-bold text-xs">
            <span className="flex items-center gap-1.5 font-malayalam">
              <TbPackage className="w-4 h-4 text-epso-orange" />
              <span>{language === 'ml' ? 'പാക്ക് ചെയ്ത പാക്കറ്റുകൾ' : 'Packets Added'}</span>
            </span>
            <span className="text-[11px] text-stone-400 font-mono">
              {totalPackets} {language === 'ml' ? 'പാക്കറ്റുകൾ' : 'pkts'}
              {totalPackedWeight > 0 ? ` • ${totalPackedWeight.toFixed(2)} kg` : ''}
            </span>
          </div>

          <div className="rounded-2xl border border-stone-200 dark:border-[#282323] overflow-hidden bg-white dark:bg-[#1E1B1B] divide-y divide-stone-100 dark:divide-[#282323]">
            {groupedPackings.length > 0 ? (
              groupedPackings.map((pkg) => (
                <div
                  key={pkg.packetSize}
                  className="p-3 flex items-center justify-between gap-2 hover:bg-stone-50 dark:hover:bg-[#141212]/50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span className="p-1.5 rounded-lg bg-orange-100 dark:bg-orange-950/60 text-orange-700 dark:text-orange-400 font-black text-xs font-mono">
                      {pkg.packetSize}
                    </span>
                    <span className="font-semibold text-stone-700 dark:text-stone-300">
                      {language === 'ml' ? 'പാക്കറ്റ്' : 'Packet'}
                    </span>
                  </div>

                  <div className="text-right">
                    <span className="font-black text-stone-900 dark:text-white font-mono text-sm">
                      {pkg.packets}{' '}
                      <span className="text-xs font-bold text-stone-400">
                        {language === 'ml' ? 'എണ്ണം' : 'pkts'}
                      </span>
                    </span>
                    {pkg.weightKg > 0 && (
                      <p className="text-[10px] text-stone-400 font-mono">
                        {pkg.weightKg.toFixed(2)} kg
                      </p>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="p-4 text-center text-stone-400 italic">
                {language === 'ml' ? 'പാക്കറ്റുകൾ ചേർത്തിട്ടില്ല' : 'No packets packed yet for this batch'}
              </div>
            )}
          </div>
        </div>

        {/* SECTION 3: BASIC INGREDIENTS CALCULATED */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-stone-700 dark:text-stone-300 font-bold text-xs">
            <span className="flex items-center gap-1.5 font-malayalam">
              <TbDroplet className="w-4 h-4 text-amber-500" />
              <span>
                {language === 'ml'
                  ? 'കണക്കാക്കിയ ബേസിക് ചേരുവകൾ'
                  : 'Basic Ingredients Calculated'}
              </span>
            </span>
            {calculatedBasics && (
              <span className="text-[10px] font-mono text-stone-400">
                {batchRatio < 1
                  ? `${language === 'ml' ? 'വിഹിതം:' : 'Share:'} ${calculatedBasics.ratioPercent}%`
                  : '100%'}
              </span>
            )}
          </div>

          <div className="p-3.5 rounded-2xl border border-stone-200 dark:border-[#282323] bg-stone-50 dark:bg-[#141212] space-y-2.5">
            {calculatedBasics && calculatedBasics.hasRecordedAny ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                {/* 1. Oil (if recorded) */}
                {Number(calculatedBasics.oilDailyTotal) > 0 && (
                  <div className="p-2.5 rounded-xl bg-white dark:bg-[#1E1B1B] border border-stone-200/80 dark:border-[#282323] flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="p-1.5 rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400">
                        <TbDroplet className="w-4 h-4 stroke-[2.2]" />
                      </span>
                      <div>
                        <span className="font-bold text-stone-900 dark:text-white font-malayalam block leading-none">
                          {language === 'ml' ? 'ഓയിൽ' : 'Daily Oil'}
                        </span>
                        <span className="text-[10px] text-stone-400 font-mono">
                          {language === 'ml' ? 'ദിവസേന ആകെ:' : 'Day Total:'} {calculatedBasics.oilDailyTotal} kg
                        </span>
                      </div>
                    </div>
                    <span className="font-black text-amber-600 dark:text-amber-400 font-mono text-sm">
                      {calculatedBasics.oilShareKg} kg
                    </span>
                  </div>
                )}

                {/* 2. All Recorded Daily Basic Ingredients (Salt, Sugar, Fuel, Chippli, Curry leaves, etc.) */}
                {calculatedBasics.basicItems.map((item) => {
                  const isSalt = item.categoryKey === 'salt' || item.name.toLowerCase().includes('salt') || item.name.includes('ഉപ്പ്');
                  const isSugar = item.categoryKey === 'sugar' || item.name.toLowerCase().includes('sugar') || item.name.includes('പഞ്ചസാര');
                  const isFuel = item.name.includes('തോട്') || item.name.toLowerCase().includes('fuel') || item.name.toLowerCase().includes('shell');

                  const IconComp = isSalt ? TbSparkles : isSugar ? TbCandy : isFuel ? TbFlame : TbToolsKitchen2;
                  const colorClass = isSalt
                    ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
                    : isSugar
                    ? 'bg-pink-500/15 text-pink-600 dark:text-pink-400'
                    : isFuel
                    ? 'bg-orange-500/15 text-orange-600 dark:text-orange-400'
                    : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400';
                  const textClass = isSalt
                    ? 'text-blue-600 dark:text-blue-400'
                    : isSugar
                    ? 'text-pink-600 dark:text-pink-400'
                    : isFuel
                    ? 'text-orange-600 dark:text-orange-400'
                    : 'text-emerald-600 dark:text-emerald-400';

                  return (
                    <div
                      key={item.name}
                      className="p-2.5 rounded-xl bg-white dark:bg-[#1E1B1B] border border-stone-200/80 dark:border-[#282323] flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2">
                        <span className={`p-1.5 rounded-lg ${colorClass}`}>
                          <IconComp className="w-4 h-4 stroke-[2.2]" />
                        </span>
                        <div>
                          <span className="font-bold text-stone-900 dark:text-white font-malayalam block leading-none">
                            {item.name}
                          </span>
                          <span className="text-[10px] text-stone-400 font-mono">
                            {language === 'ml' ? 'ദിവസേന ആകെ:' : 'Day Total:'} {item.dailyTotalKg} {item.unit}
                          </span>
                        </div>
                      </div>
                      <span className={`font-black font-mono text-sm ${textClass}`}>
                        {item.batchShareKg} {item.unit}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-2 text-stone-400 italic">
                {language === 'ml'
                  ? 'ഈ ദിവസത്തെ ബേസിക് ചേരുവകൾ രേഖപ്പെടുത്തിയിട്ടില്ല'
                  : 'Daily basic closing has not been logged for this date yet'}
              </div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
};
