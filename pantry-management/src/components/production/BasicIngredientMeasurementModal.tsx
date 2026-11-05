import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Ingredient } from '../../types';
import { useApp } from '../../context/AppContext';
import { useLanguage } from '../../context/LanguageContext';
import { TbScale, TbCheck, TbX, TbAlertCircle, TbSparkles } from 'react-icons/tb';

interface BasicIngredientMeasurementModalProps {
  isOpen: boolean;
  onClose: () => void;
  ingredient: Ingredient | null;
  targetDate: string;
  onSuccess?: () => void;
}

export const BasicIngredientMeasurementModal: React.FC<BasicIngredientMeasurementModalProps> = ({
  isOpen,
  onClose,
  ingredient,
  targetDate,
  onSuccess,
}) => {
  const { repo, staffName, addToast, triggerRefresh } = useApp();
  const { language } = useLanguage();

  // State: total weight measured in kilograms (0 to 25 kg)
  const [weightKg, setWeightKg] = useState<number>(1);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Ruler parameters: 0 to 25 kg, 0.1 kg (100g) step ticks
  const RULER_MAX_KG = 25;
  const RULER_MIN_KG = 0;
  const RULER_STEP_KG = 0.1; // 100g ticks
  const TICK_WIDTH = 32; // px per 0.1 step to fit 0, 0.1, 0.2 ... cleanly

  const rulerRef = useRef<HTMLDivElement>(null);
  const isScrollingRuler = useRef<boolean>(false);

  // Calculate maximum allowed based on available stock
  const ingredientStockKg = useMemo(() => {
    if (!ingredient) return RULER_MAX_KG;
    const stock = Number(ingredient.currentStock) || 0;
    // If unit is grams, convert to kg for ruler comparison
    if (ingredient.unit.toLowerCase() === 'g') {
      return stock / 1000;
    }
    return stock;
  }, [ingredient]);

  const effectiveMaxKg = Math.min(RULER_MAX_KG, Math.max(0, ingredientStockKg));
  const isStockLimited = ingredientStockKg < RULER_MAX_KG;

  // Split weight into kg and grams
  const displayKg = Math.floor(weightKg);
  const displayGrams = Math.round((weightKg - displayKg) * 1000);
  const totalGrams = Math.round(weightKg * 1000);

  // Center ruler on weight change
  const scrollRulerTo = useCallback((val: number) => {
    if (!rulerRef.current) return;
    const clampedVal = Math.min(effectiveMaxKg, Math.max(RULER_MIN_KG, val));
    const ticksFromMin = (clampedVal - RULER_MIN_KG) / RULER_STEP_KG;
    const scrollTarget = ticksFromMin * TICK_WIDTH;
    isScrollingRuler.current = true;
    rulerRef.current.scrollTo({
      left: scrollTarget,
      behavior: 'auto',
    });
    setTimeout(() => {
      isScrollingRuler.current = false;
    }, 100);
  }, [effectiveMaxKg]);

  useEffect(() => {
    if (isOpen) {
      const defaultStart = Math.min(1, effectiveMaxKg > 0 ? effectiveMaxKg : 1);
      setWeightKg(defaultStart);
      setTimeout(() => {
        scrollRulerTo(defaultStart);
      }, 150);
    }
  }, [isOpen, effectiveMaxKg, scrollRulerTo]);

  if (!ingredient) return null;

  // Handle ruler scroll
  const handleRulerScroll = () => {
    if (!rulerRef.current || isScrollingRuler.current) return;
    const scrollLeft = rulerRef.current.scrollLeft;
    const tickIndex = Math.round(scrollLeft / TICK_WIDTH);
    const calculatedVal = Number((RULER_MIN_KG + tickIndex * RULER_STEP_KG).toFixed(2));
    const clamped = Math.max(RULER_MIN_KG, Math.min(effectiveMaxKg, calculatedVal));
    setWeightKg(clamped);
  };

  const handleAdjustWeight = (deltaKg: number) => {
    const next = Number(Math.max(0, Math.min(effectiveMaxKg, weightKg + deltaKg)).toFixed(2));
    setWeightKg(next);
    scrollRulerTo(next);
  };

  const handleSetDirectKg = (kg: number, g: number) => {
    const next = Number(Math.max(0, Math.min(effectiveMaxKg, kg + g / 1000)).toFixed(2));
    setWeightKg(next);
    scrollRulerTo(next);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (weightKg <= 0) {
      addToast(
        language === 'ml'
          ? 'ഉപയോഗിച്ച അളവ് നൽകുക'
          : 'Please enter a valid consumed quantity',
        'warning'
      );
      return;
    }

    try {
      setIsSubmitting(true);
      // Determine delta based on ingredient's native unit
      const isGrams = ingredient.unit.toLowerCase() === 'g';
      const delta = isGrams ? -totalGrams : -weightKg;
      const operator = staffName || 'Kitchen Staff';

      await repo.adjustStock({
        ingredientId: ingredient.id,
        quantityDelta: delta,
        movementType: 'production_consumption',
        coverUnitCost: ingredient.avgCostPerUnit,
        reason: `Daily basic ingredient usage (${ingredient.name}) - ${targetDate}`,
        operatorName: operator,
      });

      addToast(
        language === 'ml'
          ? `${ingredient.name} (${displayKg > 0 ? `${displayKg} kg ` : ''}${displayGrams} g) ഉപയോഗം രേഖപ്പെടുത്തി`
          : `Recorded ${displayKg > 0 ? `${displayKg} kg ` : ''}${displayGrams} g of ${ingredient.name}`,
        'success'
      );

      triggerRefresh();
      if (onSuccess) onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Failed to record basic ingredient usage', err);
      addToast(err?.message || 'Failed to record usage', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const totalTicks = Math.max(1, Math.round((effectiveMaxKg - RULER_MIN_KG) / RULER_STEP_KG));

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2.5">
          <span className="p-2.5 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
            <TbScale className="w-5 h-5 stroke-[2.5]" />
          </span>
          <div>
            <h2 className="text-base sm:text-lg font-black text-stone-900 dark:text-white leading-tight font-malayalam">
              {ingredient.name} {language === 'ml' ? 'അളക്കുക' : 'Usage'}
            </h2>
            <p className="text-xs text-stone-500 dark:text-stone-400 font-medium">
              {language === 'ml' ? 'ദിവസേനയുള്ള ഉപയോഗം രേഖപ്പെടുത്തുക' : 'Record daily consumption'}
            </p>
          </div>
        </div>
      }
      size="md"
      footer={
        <div className="flex items-center justify-end gap-3 w-full">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-100 hover:bg-stone-200 dark:bg-[#252020] dark:hover:bg-[#2e2828] text-stone-700 dark:text-stone-300 font-bold text-xs transition-colors cursor-pointer select-none"
          >
            <span>{language === 'ml' ? 'റദ്ദാക്കുക' : 'Cancel'}</span>
          </button>

          <button
            type="submit"
            form="basicIngredientForm"
            disabled={isSubmitting || weightKg <= 0}
            className="flex items-center justify-center gap-1.5 px-6 py-2.5 rounded-xl bg-gradient-to-r from-epso-red to-epso-orange hover:bg-epso-red-hover text-white font-extrabold text-xs transition-all cursor-pointer select-none disabled:opacity-50 disabled:pointer-events-none"
          >
            <TbCheck className="w-4 h-4 stroke-[2.5]" />
            <span>
              {language === 'ml' ? 'ഉപയോഗം ചേർക്കുക' : 'Record Usage'}
            </span>
          </button>
        </div>
      }
    >
      <form id="basicIngredientForm" onSubmit={handleSubmit} className="space-y-4">
        {/* Main Measurement Display Card */}
        <div className="p-4 rounded-3xl bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/70 dark:border-amber-900/40 shadow-xs space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-extrabold text-amber-900 dark:text-amber-200 uppercase tracking-wider font-malayalam flex items-center gap-1.5">
              <TbSparkles className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              <span>{language === 'ml' ? 'ഉപയോഗിച്ച അളവ്' : 'Measured Quantity'}</span>
            </span>
            <span className="font-bold text-stone-600 dark:text-stone-400 font-mono text-[11px]">
              Stock: {Number(ingredient.currentStock).toFixed(1)} {ingredient.unit}
            </span>
          </div>

          {/* Prominent combined weight display (2,500 g) */}
          <div className="flex flex-col items-center justify-center py-2.5 gap-1 select-none">
            <div className="flex items-baseline justify-center gap-1.5 text-stone-900 dark:text-white">
              <span className="text-4xl sm:text-5xl font-black font-mono text-amber-900 dark:text-amber-200 tracking-tight">
                {totalGrams.toLocaleString('en-US')}
              </span>
              <span className="text-2xl sm:text-3xl font-black text-amber-600 dark:text-amber-400">
                g
              </span>
              <span className="text-sm sm:text-base font-bold text-stone-500 dark:text-stone-400 font-mono ml-2">
                ({weightKg.toFixed(1)} kg)
              </span>
            </div>
          </div>

          {/* Quick Step Buttons for Grams and Kg */}
          <div className="flex items-center justify-center gap-1.5 flex-wrap pt-1">
            <button
              type="button"
              onClick={() => handleAdjustWeight(-1)}
              disabled={weightKg <= 0}
              className="px-2.5 py-1.5 rounded-xl bg-amber-100/80 hover:bg-amber-200 dark:bg-amber-950/60 dark:hover:bg-amber-900/80 text-amber-950 dark:text-amber-200 text-xs font-bold transition-all active:scale-95 cursor-pointer disabled:opacity-40"
            >
              -1 kg
            </button>
            <button
              type="button"
              onClick={() => handleAdjustWeight(-0.1)}
              disabled={weightKg <= 0}
              className="px-2.5 py-1.5 rounded-xl bg-amber-100/80 hover:bg-amber-200 dark:bg-amber-950/60 dark:hover:bg-amber-900/80 text-amber-950 dark:text-amber-200 text-xs font-bold transition-all active:scale-95 cursor-pointer disabled:opacity-40"
            >
              -100g
            </button>
            <button
              type="button"
              onClick={() => handleAdjustWeight(+0.1)}
              disabled={weightKg >= effectiveMaxKg}
              className="px-2.5 py-1.5 rounded-xl bg-amber-100/80 hover:bg-amber-200 dark:bg-amber-950/60 dark:hover:bg-amber-900/80 text-amber-950 dark:text-amber-200 text-xs font-bold transition-all active:scale-95 cursor-pointer disabled:opacity-40"
            >
              +100g
            </button>
            <button
              type="button"
              onClick={() => handleAdjustWeight(+0.5)}
              disabled={weightKg >= effectiveMaxKg}
              className="px-2.5 py-1.5 rounded-xl bg-amber-100/80 hover:bg-amber-200 dark:bg-amber-950/60 dark:hover:bg-amber-900/80 text-amber-950 dark:text-amber-200 text-xs font-bold transition-all active:scale-95 cursor-pointer disabled:opacity-40"
            >
              +500g
            </button>
            <button
              type="button"
              onClick={() => handleAdjustWeight(+1)}
              disabled={weightKg >= effectiveMaxKg}
              className="px-2.5 py-1.5 rounded-xl bg-amber-100/80 hover:bg-amber-200 dark:bg-amber-950/60 dark:hover:bg-amber-900/80 text-amber-950 dark:text-amber-200 text-xs font-bold transition-all active:scale-95 cursor-pointer disabled:opacity-40"
            >
              +1 kg
            </button>
            <button
              type="button"
              onClick={() => handleAdjustWeight(+5)}
              disabled={weightKg >= effectiveMaxKg}
              className="px-2.5 py-1.5 rounded-xl bg-amber-100/80 hover:bg-amber-200 dark:bg-amber-950/60 dark:hover:bg-amber-900/80 text-amber-950 dark:text-amber-200 text-xs font-bold transition-all active:scale-95 cursor-pointer disabled:opacity-40"
            >
              +5 kg
            </button>
          </div>

          {/* Stock remaining notice always active */}
          <div className="flex flex-col items-center justify-center text-center pt-1 select-none">
            <span className="text-xs font-black text-amber-600 dark:text-amber-400 font-malayalam">
              {ingredientStockKg.toFixed(1)} kg {language === 'ml' ? 'ബാക്കി..' : 'remaining..'}
            </span>
          </div>
        </div>

        {/* 25 KG HORIZONTAL RULER WITH 0, 0.1, 0.2 ... LABELS */}
        <div className="relative w-full py-2 overflow-hidden flex flex-col items-center select-none bg-stone-50 dark:bg-[#141212] rounded-2xl border border-charcoal-border/50 dark:border-[#2E2828]">
          {/* Center Orange Marker Needle */}
          <div className="absolute top-0 bottom-4 left-1/2 -translate-x-1/2 w-0.5 z-20 pointer-events-none rounded-full bg-epso-orange">
            <div className="w-2.5 h-2.5 rounded-full -ml-[4px] -top-1 absolute bg-epso-orange shadow-sm" />
          </div>

          {/* Scrollable Ruler Track */}
          <div
            ref={rulerRef}
            onScroll={handleRulerScroll}
            className="w-full overflow-x-scroll no-scrollbar touch-pan-x flex items-end h-16 relative select-none"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            {/* Left padding spacer calibrated so tick 0 center aligns precisely with the center needle */}
            <div className="shrink-0" style={{ width: `calc(50% - ${TICK_WIDTH / 2}px)` }} />
            <div className="flex items-end shrink-0">
              {Array.from({ length: totalTicks + 1 }).map((_, idx) => {
                const val = Number((RULER_MIN_KG + idx * RULER_STEP_KG).toFixed(1));
                const isWholeKg = Math.abs(Math.round(val) - val) < 0.001;
                const isFiveKg = isWholeKg && Math.round(val) % 5 === 0;

                return (
                  <div
                    key={idx}
                    onClick={() => {
                      setWeightKg(val);
                      scrollRulerTo(val);
                    }}
                    className="flex flex-col items-center justify-end shrink-0 cursor-pointer h-16 pb-1 select-none"
                    style={{ width: `${TICK_WIDTH}px` }}
                  >
                    <span className="text-[9px] font-bold text-stone-500 dark:text-stone-400 font-mono mb-1 pointer-events-none select-none">
                      {val === 0 ? '0' : val.toFixed(1)}
                    </span>
                    <div
                      className={`rounded-full transition-colors ${
                        isFiveKg
                          ? 'h-6 bg-amber-600 dark:bg-amber-400 w-[2px]'
                          : isWholeKg
                          ? 'h-5 bg-stone-600/70 dark:bg-stone-300/70 w-[2px]'
                          : 'h-3.5 bg-stone-400/40 dark:bg-stone-500/30 w-[1.5px]'
                      }`}
                    />
                  </div>
                );
              })}
            </div>
            {/* Right padding spacer calibrated so last tick center aligns precisely with the center needle */}
            <div className="shrink-0" style={{ width: `calc(50% - ${TICK_WIDTH / 2}px)` }} />
          </div>

          {/* Edge fades */}
          <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-stone-50 dark:from-[#141212] to-transparent pointer-events-none z-10" />
          <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-stone-50 dark:from-[#141212] to-transparent pointer-events-none z-10" />
        </div>
      </form>
    </Modal>
  );
};
