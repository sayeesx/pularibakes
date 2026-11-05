import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useApp } from '../../context/AppContext';
import { useLanguage } from '../../context/LanguageContext';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import {
  TbDroplet,
  TbCheck,
  TbPencil,
  TbLock,
} from 'react-icons/tb';
import { BatchSuccessAnimation } from '../ui/BatchSuccessAnimation';

interface DailyOilModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  initialDate?: string;
}

export const DailyOilModal: React.FC<DailyOilModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  initialDate,
}) => {
  const { repo, staffName, addToast, triggerRefresh } = useApp();
  const { language } = useLanguage();

  const getLocalDateStr = (offsetDays = 0) => {
    const d = new Date();
    if (offsetDays !== 0) d.setDate(d.getDate() + offsetDays);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const todayStr = useMemo(() => getLocalDateStr(0), []);
  const yesterdayStr = useMemo(() => getLocalDateStr(-1), []);
  const targetDate = initialDate || todayStr;

  // Measured oil states
  const [pouredOil, setPouredOil] = useState<number>(0);
  const [remainingOil, setRemainingOil] = useState<number>(0);
  const [pouredInputStr, setPouredInputStr] = useState<string>('0');
  const [remainingInputStr, setRemainingInputStr] = useState<string>('0');

  // Confirmation / Unclickable lock states (only editable via pencil icon)
  const [isPouredConfirmed, setIsPouredConfirmed] = useState<boolean>(false);
  const [isRemainingConfirmed, setIsRemainingConfirmed] = useState<boolean>(false);

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [showSuccessAnim, setShowSuccessAnim] = useState<boolean>(false);
  const [isLoadingExisting, setIsLoadingExisting] = useState<boolean>(false);
  const [oilStock, setOilStock] = useState<number | null>(null);
  const [oilUnit, setOilUnit] = useState<string>('kg');
  const [oilCost, setOilCost] = useState<number>(150);

  // Ruler track ref for poured oil
  const pouredRulerRef = useRef<HTMLDivElement>(null);
  const isPouredScrollingRef = useRef<boolean>(false);
  const isManualTypingPoured = useRef<boolean>(false);

  // Calibrated, ultra-smooth ruler constants: 1 kg steps with 0.5 kg half-ticks
  // (Only ~50-100 ticks total = 60 FPS hardware-accelerated smooth scrolling)
  const POURED_MIN = 0;
  const POURED_STEP = 1;
  const TICK_WIDTH = 48; // px per 1 kg step

  const maxAllowedOil = oilStock !== null ? Math.max(0, oilStock) : 100;

  // Load live ingredient stock & existing closing together for target date
  useEffect(() => {
    if (isOpen) {
      setShowSuccessAnim(false);
      setIsSubmitting(false);
      setIsLoadingExisting(true);
      let isMounted = true;

      Promise.all([
        repo.getDailyClosing(targetDate),
        repo.listIngredients(false),
      ]).then(([existing, ings]) => {
        if (!isMounted) return;

        const oil = ings.find((i) =>
          i.name.toLowerCase().includes('oil') ||
          i.name.includes('ഓയിൽ')
        );

        const liveStock = oil ? (Number(oil.currentStock) || 0) : 0;
        const unit = oil?.unit || 'kg';
        const cost = Number(oil?.avgCostPerUnit) || 150;
        setOilUnit(unit);
        setOilCost(cost);

        if (existing) {
          const prevConsumed = Number(existing.oilConsumed) || 0;
          const baselineAvailable = Number((liveStock + prevConsumed).toFixed(3));
          setOilStock(baselineAvailable);

          const p = existing.totalOilUsedKg !== undefined
            ? Number(existing.totalOilUsedKg)
            : (existing.oilConsumed > 0 ? Number(existing.oilConsumed) : 0);
          const r = existing.oilLeftoverKg !== undefined
            ? Number(existing.oilLeftoverKg)
            : 0;

          const limit = baselineAvailable > 0 ? baselineAvailable : 100;
          const safeP = Math.min(limit, Math.max(0, p));
          const safeR = Math.min(safeP, Math.max(0, r));

          setPouredOil(safeP);
          setRemainingOil(safeR);
          setPouredInputStr(String(safeP));
          setRemainingInputStr(String(safeR));

          // If already entered previously, lock as confirmed with pencil icon
          setIsPouredConfirmed(safeP > 0);
          setIsRemainingConfirmed(safeR > 0);
        } else {
          setOilStock(liveStock);
          setPouredOil(0);
          setRemainingOil(0);
          setPouredInputStr('0');
          setRemainingInputStr('0');
          setIsPouredConfirmed(false);
          setIsRemainingConfirmed(false);
        }
        setIsLoadingExisting(false);
      }).catch((err) => {
        console.error('Failed to load oil data', err);
        if (isMounted) setIsLoadingExisting(false);
      });

      return () => {
        isMounted = false;
      };
    }
  }, [isOpen, repo, targetDate]);

  // Smooth scroll ruler to poured oil value
  const scrollPouredRulerTo = useCallback((val: number) => {
    if (!pouredRulerRef.current) return;
    const clampedVal = Math.min(maxAllowedOil, Math.max(POURED_MIN, val));
    const ticksFromMin = (clampedVal - POURED_MIN) / POURED_STEP;
    const scrollTarget = ticksFromMin * TICK_WIDTH;
    isPouredScrollingRef.current = true;
    pouredRulerRef.current.scrollTo({
      left: scrollTarget,
      behavior: 'smooth',
    });
    setTimeout(() => {
      isPouredScrollingRef.current = false;
    }, 150);
  }, [maxAllowedOil]);

  useEffect(() => {
    if (isOpen && !isLoadingExisting && !isPouredConfirmed) {
      setTimeout(() => {
        scrollPouredRulerTo(pouredOil);
      }, 100);
    }
  }, [isOpen, isLoadingExisting, isPouredConfirmed, scrollPouredRulerTo, pouredOil]);

  // Handle ruler scroll for poured oil
  const handlePouredRulerScroll = () => {
    if (!pouredRulerRef.current || isPouredScrollingRef.current || isManualTypingPoured.current) return;
    const scrollLeft = pouredRulerRef.current.scrollLeft;
    const tickIndex = Math.round(scrollLeft / (TICK_WIDTH / 2)); // 0.5kg precision on drag
    const calculatedVal = Number((POURED_MIN + tickIndex * 0.5).toFixed(1));
    const clamped = Math.max(POURED_MIN, Math.min(maxAllowedOil, calculatedVal));
    setPouredOil(clamped);
    setPouredInputStr(String(clamped));
    if (remainingOil > clamped) {
      setRemainingOil(clamped);
      setRemainingInputStr(String(clamped));
    }
  };

  // Manual input commit for Poured Oil
  const handlePouredInputCommit = () => {
    const parsed = parseFloat(pouredInputStr);
    const safe = isNaN(parsed) ? 0 : Math.min(maxAllowedOil, Math.max(0, parsed));
    const clean = Number(safe.toFixed(1));
    setPouredOil(clean);
    setPouredInputStr(String(clean));
    scrollPouredRulerTo(clean);
    if (remainingOil > clean) {
      setRemainingOil(clean);
      setRemainingInputStr(String(clean));
    }
  };

  // Manual input commit for Remaining Oil
  const handleRemainingInputCommit = () => {
    const parsed = parseFloat(remainingInputStr);
    const safe = isNaN(parsed) ? 0 : Math.min(pouredOil, Math.max(0, parsed));
    const clean = Number(safe.toFixed(1));
    setRemainingOil(clean);
    setRemainingInputStr(String(clean));
  };

  // Exact Calculation Workflow:
  // Net Consumed = Poured - Balance
  // Final Original Stock = Morning Stock - Net Consumed
  const netConsumedOil = Math.max(0, Number((pouredOil - remainingOil).toFixed(1)));
  const morningStock = oilStock !== null ? Math.max(0, oilStock) : 0;
  const finalMainStock = Math.max(0, Number((morningStock - netConsumedOil).toFixed(1)));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    handlePouredInputCommit();
    handleRemainingInputCommit();

    if (pouredOil <= 0) {
      addToast(
        language === 'ml'
          ? 'ദയവായി ഇന്ന് ഒഴിച്ച ഓയിലിന്റെ അളവ് നൽകുക'
          : 'Please enter a valid quantity for poured oil',
        'warning'
      );
      return;
    }

    if (oilStock !== null && pouredOil > oilStock) {
      addToast(
        language === 'ml'
          ? `സ്റ്റോക്കിൽ ${oilStock} ${oilUnit} മാത്രമേ ബാക്കിയുള്ളൂ..`
          : `Only ${oilStock} ${oilUnit} remaining in stock..`,
        'warning'
      );
      return;
    }

    try {
      setIsSubmitting(true);
      const safeRemaining = Math.min(pouredOil, Math.max(0, remainingOil));
      const available = oilStock !== null ? Math.max(0, oilStock) : 0;
      
      // Net consumed = Poured - Balance
      const netConsumed = Math.max(0, Number((pouredOil - safeRemaining).toFixed(3)));
      // Final stock in store = Available - Net consumed (Remaining oil stays in original stock)
      const finalStock = Math.max(0, Number((available - netConsumed).toFixed(3)));

      await repo.saveDailyClosing({
        productionDate: targetDate,
        oilOpeningBalance: available,
        oilPurchases: 0,
        oilClosingBalance: finalStock,
        oilUsedKg: pouredOil,
        oilLeftoverKg: safeRemaining,
        oilCostPerKg: oilCost,
        productionWages: 0,
        notes: undefined,
        closedBy: staffName || (language === 'ml' ? 'പ്രൊഡക്ഷൻ ടീം' : 'Kitchen Staff'),
      });

      setShowSuccessAnim(true);
    } catch (err: any) {
      console.error('Failed to save daily oil usage', err);
      addToast(err?.message || 'Failed to record oil usage', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSuccessAnimComplete = () => {
    setShowSuccessAnim(false);
    const safeRemaining = Math.min(pouredOil, Math.max(0, remainingOil));
    addToast(
      language === 'ml'
        ? `ഓയിൽ രേഖപ്പെടുത്തി: ${pouredOil}kg ഒഴിച്ചു • ${safeRemaining}kg ബാക്കി (ആകെ ഉപയോഗം: ${netConsumedOil}kg)`
        : `Oil recorded: ${pouredOil}kg poured, ${safeRemaining}kg balance (Net used: ${netConsumedOil}kg)`,
      'success'
    );
    triggerRefresh();
    if (onSuccess) onSuccess();
    onClose();
  };

  const totalPouredTicks = Math.max(1, Math.round(maxAllowedOil / POURED_STEP));

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        setShowSuccessAnim(false);
        setIsSubmitting(false);
        onClose();
      }}
      title={
        <div className="flex items-center gap-2.5">
          <span className="p-2.5 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
            <TbDroplet className="w-5 h-5 stroke-[2.5]" />
          </span>
          <div>
            <h2 className="text-base sm:text-lg font-black text-stone-900 dark:text-white leading-tight">
              {targetDate === yesterdayStr
                ? (language === 'ml' ? 'ഇന്നലത്തെ ഓയിൽ കണക്ക്' : "Yesterday's Oil Record")
                : (language === 'ml' ? 'ഇന്നത്തെ ഓയിൽ കണക്ക്' : "Today's Oil Record")}
            </h2>
            <p className="text-xs text-stone-500 dark:text-stone-400 font-medium">
              {targetDate}
            </p>
          </div>
        </div>
      }
      size="md"
      footer={
        <div className="flex items-center justify-end gap-3 w-full">
          <Button
            type="button"
            variant="ghost"
            size="md"
            onClick={onClose}
            disabled={isSubmitting}
            className="font-bold px-4 font-malayalam"
          >
            {language === 'ml' ? 'റദ്ദാക്കുക' : 'Cancel'}
          </Button>
          <Button
            type="submit"
            form="dailyOilForm"
            variant="primary"
            size="md"
            isLoading={isSubmitting}
            icon={<TbCheck className="w-5 h-5 stroke-[2.5]" />}
            className="font-black px-6 shadow-md font-malayalam"
          >
            {remainingOil > 0
              ? (language === 'ml' ? 'കണക്ക് പൂർത്തിയാക്കുക' : 'Complete Daily Oil')
              : (language === 'ml' ? 'ഒഴിച്ച ഓയിൽ രേഖപ്പെടുത്തുക' : 'Save Poured Oil')}
          </Button>
        </div>
      }
      overlay={
        <BatchSuccessAnimation
          isVisible={showSuccessAnim}
          onComplete={handleSuccessAnimComplete}
          message={
            targetDate === yesterdayStr
              ? (language === 'ml' ? 'ഇന്നലത്തെ ഓയിൽ രേഖപ്പെടുത്തി!' : 'Yesterday Oil Recorded!')
              : (language === 'ml' ? 'ഓയിൽ രേഖപ്പെടുത്തി!' : 'Oil Recorded!')
          }
          subMessage={
            language === 'ml'
              ? `${pouredOil} ${oilUnit} ഒഴിച്ചു • ${Math.min(pouredOil, Math.max(0, remainingOil))} ${oilUnit} ബാക്കി • യഥാർത്ഥ ഉപയോഗം: ${netConsumedOil} ${oilUnit}`
              : `${pouredOil} ${oilUnit} poured • ${Math.min(pouredOil, Math.max(0, remainingOil))} ${oilUnit} balance • Consumed: ${netConsumedOil} ${oilUnit}`
          }
        />
      }
    >
      <form id="dailyOilForm" onSubmit={handleSubmit} className="space-y-4">
        {/* 1. POURED OIL SECTION */}
          <div className="p-4 rounded-2xl bg-white dark:bg-[#1E1B1B] border border-amber-200 dark:border-amber-900/60 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                <label className="text-xs font-black text-stone-900 dark:text-white uppercase tracking-wider font-malayalam">
                  {language === 'ml' ? 'ഇന്ന് ഒഴിച്ച ഓയിൽ' : 'Oil Poured'} *
                </label>
              </div>

              {/* Locked vs Editable Indicator */}
              {isPouredConfirmed && pouredOil > 0 ? (
                <button
                  type="button"
                  onClick={() => setIsPouredConfirmed(false)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-100 hover:bg-amber-200 dark:bg-amber-950/60 dark:hover:bg-amber-900/70 border border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200 text-xs font-bold font-malayalam transition-colors cursor-pointer"
                  title={language === 'ml' ? 'ഒഴിച്ച ഓയിൽ മാറ്റുക' : 'Edit Poured Oil'}
                >
                  <TbPencil className="w-3.5 h-3.5 text-amber-700 dark:text-amber-300" />
                  <span>{language === 'ml' ? 'മാറ്റുക' : 'Edit'}</span>
                </button>
              ) : (
                <span className="text-[11px] font-bold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded-lg border border-amber-200 dark:border-amber-900/50">
                  {language === 'ml' ? `പരമാവധി ${maxAllowedOil} ${oilUnit}` : `Max ${maxAllowedOil} ${oilUnit}`}
                </span>
              )}
            </div>

            {/* If Confirmed/Entered: Show as Unclickable Card with Pencil Edit Icon */}
            {isPouredConfirmed && pouredOil > 0 ? (
              <div className="p-4 rounded-xl bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/80 dark:border-amber-900/40 flex items-center justify-between">
                <div className="space-y-0.5">
                  <span className="text-xs font-bold text-amber-800 dark:text-amber-300 font-malayalam flex items-center gap-1.5">
                    <TbLock className="w-3.5 h-3.5 text-amber-600" />
                    ഒഴിച്ച ഓയിൽ സ്ഥിരീകരിച്ചു
                  </span>
                  <span className="text-[11px] text-stone-500 dark:text-stone-400 font-malayalam block">
                    മാറ്റം വരുത്താൻ മുകളിലെ 'മാറ്റുക' (✏️) ക്ലിക്ക് ചെയ്യുക
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-2xl sm:text-3xl font-black text-amber-900 dark:text-amber-200 font-mono">
                    {pouredOil.toFixed(1)}
                  </span>
                  <span className="text-xs font-extrabold text-amber-700 dark:text-amber-400 uppercase ml-1">
                    {oilUnit}
                  </span>
                </div>
              </div>
            ) : (
              /* Editable State with Smooth Calibrated Ruler */
              <div className="space-y-3">
                <div className="flex flex-col items-center justify-center py-1 gap-1">
                  <div className="flex items-center justify-center">
                    <div className="flex items-center justify-center gap-1.5 px-6 py-2 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border-2 border-amber-300 dark:border-amber-800/60 focus-within:border-amber-500 focus-within:ring-2 focus-within:ring-amber-500/20 transition-all cursor-text">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={pouredInputStr}
                        onFocus={() => {
                          isManualTypingPoured.current = true;
                        }}
                        onChange={(e) => {
                          isManualTypingPoured.current = true;
                          const val = e.target.value.replace(/[^0-9.]/g, '');
                          setPouredInputStr(val);
                          const parsed = parseFloat(val);
                          if (!isNaN(parsed) && parsed >= 0) {
                            const clamped = Math.min(maxAllowedOil, parsed);
                            const clean = Number(clamped.toFixed(1));
                            setPouredOil(clean);
                            if (remainingOil > clean) {
                              setRemainingOil(clean);
                              setRemainingInputStr(String(clean));
                            }
                          }
                        }}
                        onBlur={() => {
                          isManualTypingPoured.current = false;
                          handlePouredInputCommit();
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handlePouredInputCommit();
                            if (pouredOil > 0) setIsPouredConfirmed(true);
                          }
                        }}
                        className="text-3xl sm:text-4xl font-black text-amber-900 dark:text-amber-200 tabular-nums text-center w-28 bg-transparent focus:outline-none"
                      />
                      <span className="text-base font-extrabold text-amber-600 dark:text-amber-400 uppercase select-none">
                        {oilUnit}
                      </span>
                    </div>
                  </div>

                  {oilStock !== null && (
                    <div className="text-center my-0.5 select-none">
                      <span className="text-xs font-semibold text-amber-700 dark:text-amber-400 font-malayalam">
                        മെയിൻ സ്റ്റോക്ക്: {oilStock} {oilUnit}
                      </span>
                    </div>
                  )}
                </div>

                {/* Ultra-Smooth Calibrated Ruler Track (1kg steps, 0.5kg precision) */}
                <div className="relative w-full py-2 overflow-hidden flex flex-col items-center select-none bg-stone-50 dark:bg-[#141212] rounded-2xl border border-charcoal-border/50 dark:border-[#2E2828]">
                  {/* Center Orange Marker Needle */}
                  <div className="absolute top-0 bottom-4 left-1/2 -translate-x-1/2 w-0.5 z-20 pointer-events-none rounded-full bg-epso-orange">
                    <div className="w-2.5 h-2.5 rounded-full -ml-[4px] -top-1 absolute bg-epso-orange shadow-sm" />
                  </div>

                  {/* Smooth Scrollable Ruler Track */}
                  <div
                    ref={pouredRulerRef}
                    onScroll={handlePouredRulerScroll}
                    className="w-full overflow-x-scroll no-scrollbar touch-pan-x flex items-end h-16 relative select-none"
                    style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                  >
                    <div className="shrink-0" style={{ width: `calc(50% - ${TICK_WIDTH / 2}px)` }} />
                    <div className="flex items-end shrink-0">
                      {Array.from({ length: totalPouredTicks + 1 }).map((_, idx) => {
                        const val = POURED_MIN + idx * POURED_STEP;
                        const isMajor = val % 5 === 0;

                        return (
                          <div
                            key={idx}
                            onClick={() => {
                              setPouredOil(val);
                              setPouredInputStr(String(val));
                              scrollPouredRulerTo(val);
                              if (remainingOil > val) {
                                setRemainingOil(val);
                                setRemainingInputStr(String(val));
                              }
                            }}
                            className="flex flex-col items-center justify-end shrink-0 cursor-pointer h-16 pb-1 select-none"
                            style={{ width: `${TICK_WIDTH}px` }}
                          >
                            <span className="text-[10px] font-bold text-stone-500 dark:text-stone-400 font-mono mb-1 pointer-events-none select-none">
                              {val}
                            </span>
                            <div
                              className={`rounded-full transition-colors ${
                                isMajor
                                  ? 'h-6 bg-amber-600 dark:bg-amber-400 w-[2.5px]'
                                  : 'h-4 bg-stone-400/50 dark:bg-stone-500/40 w-[1.5px]'
                              }`}
                            />
                          </div>
                        );
                      })}
                    </div>
                    <div className="shrink-0" style={{ width: `calc(50% - ${TICK_WIDTH / 2}px)` }} />
                  </div>

                  <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-stone-50 dark:from-[#141212] to-transparent pointer-events-none z-10" />
                  <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-stone-50 dark:from-[#141212] to-transparent pointer-events-none z-10" />
                </div>

                {/* Confirm Button to lock poured oil */}
                {pouredOil > 0 && (
                  <div className="flex justify-end pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        handlePouredInputCommit();
                        setIsPouredConfirmed(true);
                      }}
                      className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs font-malayalam flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      <TbCheck className="w-4 h-4" />
                      <span>{language === 'ml' ? 'ശരി' : 'Confirm'}</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 2. REMAINING / BALANCE OIL SECTION (NO SLIDER, NO -1/0.5/+1/0.5) */}
          <div className="p-4 rounded-2xl bg-white dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#2E2828] shadow-sm space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
                <label className="text-xs font-black text-stone-900 dark:text-white uppercase tracking-wider truncate font-malayalam">
                  {language === 'ml' ? 'ബാക്കി വന്ന ഓയിൽ' : 'Remaining Oil'}
                </label>
              </div>

              {/* Locked vs Editable Indicator */}
              {isRemainingConfirmed && remainingOil > 0 ? (
                <button
                  type="button"
                  onClick={() => setIsRemainingConfirmed(false)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-100 hover:bg-emerald-200 dark:bg-emerald-950/60 dark:hover:bg-emerald-900/70 border border-emerald-300 dark:border-emerald-700 text-emerald-900 dark:text-emerald-200 text-xs font-bold font-malayalam transition-colors cursor-pointer"
                  title={language === 'ml' ? 'ബാക്കി വന്ന ഓയിൽ മാറ്റുക' : 'Edit Remaining Oil'}
                >
                  <TbPencil className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-300" />
                  <span>{language === 'ml' ? 'മാറ്റുക' : 'Edit'}</span>
                </button>
              ) : (
                <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-lg border border-emerald-200 dark:border-emerald-900/50 whitespace-nowrap shrink-0">
                  {language === 'ml' ? `പരമാവധി: ${pouredOil.toFixed(1)} ${oilUnit}` : `Max: ${pouredOil.toFixed(1)} ${oilUnit}`}
                </span>
              )}
            </div>

            {/* If Confirmed/Entered: Show as Unclickable Card with Pencil Edit Icon */}
            {isRemainingConfirmed && remainingOil > 0 ? (
              <div className="p-4 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200/80 dark:border-emerald-900/40 flex items-center justify-between">
                <div className="space-y-0.5">
                  <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300 font-malayalam flex items-center gap-1.5">
                    <TbLock className="w-3.5 h-3.5 text-emerald-600" />
                    ബാക്കി വന്നത് രേഖപ്പെടുത്തി
                  </span>
                  <span className="text-[11px] text-stone-500 dark:text-stone-400 font-malayalam block">
                    മെയിൻ സ്റ്റോക്കിലേക്ക് തിരികെ കണക്കാക്കും
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-2xl sm:text-3xl font-black text-emerald-900 dark:text-emerald-200 font-mono">
                    {remainingOil.toFixed(1)}
                  </span>
                  <span className="text-xs font-extrabold text-emerald-700 dark:text-emerald-400 uppercase ml-1">
                    {oilUnit}
                  </span>
                </div>
              </div>
            ) : (
              /* Editable State: Clean Numeric Entry (No slider, no stepper buttons) */
              <div className="space-y-3">
                <p className="text-[11px] text-stone-500 dark:text-stone-400 font-malayalam">
                  {language === 'ml'
                    ? 'പണി കഴിഞ്ഞ ശേഷം ചീനച്ചട്ടിയിൽ ബാക്കിയുള്ള ഓയിലിന്റെ അളവ് നൽകുക:'
                    : 'Enter remaining oil in pan after cooking:'}
                </p>

                <div className="flex flex-col items-center justify-center py-1">
                  <div className="flex items-center justify-center gap-1.5 px-6 py-2 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border-2 border-emerald-300 dark:border-emerald-800/60 focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-500/20 transition-all cursor-text">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={remainingInputStr}
                      onChange={(e) => {
                        const val = e.target.value.replace(/[^0-9.]/g, '');
                        setRemainingInputStr(val);
                        const parsed = parseFloat(val);
                        if (!isNaN(parsed) && parsed >= 0) {
                          const clamped = Math.min(pouredOil, parsed);
                          setRemainingOil(Number(clamped.toFixed(1)));
                        }
                      }}
                      onBlur={handleRemainingInputCommit}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleRemainingInputCommit();
                          if (remainingOil > 0) setIsRemainingConfirmed(true);
                        }
                      }}
                      className="text-3xl sm:text-4xl font-black text-emerald-900 dark:text-emerald-200 tabular-nums text-center w-28 bg-transparent focus:outline-none"
                    />
                    <span className="text-base font-extrabold text-emerald-600 dark:text-emerald-400 uppercase select-none">
                      {oilUnit}
                    </span>
                  </div>
                </div>

                {remainingOil > 0 && (
                  <div className="flex justify-end pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        handleRemainingInputCommit();
                        setIsRemainingConfirmed(true);
                      }}
                      className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs font-malayalam flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      <TbCheck className="w-4 h-4" />
                      <span>{language === 'ml' ? 'ശരി' : 'Confirm'}</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
      </form>
    </Modal>
  );
};
