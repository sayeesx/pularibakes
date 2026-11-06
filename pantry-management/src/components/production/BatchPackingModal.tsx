import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { useLanguage } from '../../context/LanguageContext';
import { Modal } from '../ui/Modal';
import { BatchSuccessAnimation } from '../ui/BatchSuccessAnimation';
import { ProductionRun, Recipe, PackingRecord } from '../../types';
import {
  TbPackage,
  TbCheck,
  TbPlus,
  TbMinus,
  TbAlertCircle,
  TbScale,
  TbX,
} from 'react-icons/tb';

interface BatchPackingModalProps {
  isOpen: boolean;
  onClose: () => void;
  batch: ProductionRun | null;
  recipes?: Recipe[];
  initialPackings?: PackingRecord[];
  onSuccess?: () => void;
}

// Fallback packet sizes if catalogue is loading or empty:
export const DEFAULT_PACKET_SIZES = [
  '3kg HM Packet',
  '2KG HM Packet',
  '10 x 12 Packet',
  '10 x 14 Packet',
  '10 x 16 Packet',
  '8 x 10 Packet',
  '8 x 12 Packet',
] as const;

export const BatchPackingModal: React.FC<BatchPackingModalProps> = ({
  isOpen,
  onClose,
  batch,
  initialPackings,
  onSuccess,
}) => {
  const { repo, staffName, addToast, triggerRefresh } = useApp();
  const { language } = useLanguage();

  // Multi-packet quantities state: { [packetSize: string]: number }
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [showSuccessAnim, setShowSuccessAnim] = useState<boolean>(false);

  // All catalog packets (cook can select any packet without restrictions)
  const [catalogPackets, setCatalogPackets] = useState<Array<{ name: string; costPerPacket?: number }>>([]);

  // Active Ruler / Number input modal for a selected packet
  const [activeRulerPacket, setActiveRulerPacket] = useState<{
    size: string;
    count: number;
    costPerPacket?: number;
  } | null>(null);

  // Ruler scrolling refs
  const rulerRef = useRef<HTMLDivElement>(null);
  const isScrollingRuler = useRef<boolean>(false);

  const MIN_PACKETS = 0;
  const MAX_RULER_PACKETS = 2000;
  const STEP_PACKETS = 1;
  const TICK_SPACING = 14;

  const scrollRulerTo = useCallback((val: number) => {
    if (!rulerRef.current) return;
    const clamped = Math.max(MIN_PACKETS, Math.min(MAX_RULER_PACKETS, val));
    const ticksFromMin = clamped - MIN_PACKETS;
    const targetScroll = ticksFromMin * TICK_SPACING;
    isScrollingRuler.current = true;
    rulerRef.current.scrollTo({
      left: targetScroll,
      behavior: 'smooth',
    });
    setTimeout(() => {
      isScrollingRuler.current = false;
    }, 200);
  }, []);

  // Load ALL in-stock packet types from catalogue (out-of-stock packets are hidden)
  useEffect(() => {
    Promise.all([
      repo.listPacketTypes(),
      repo.listPackagingItems ? repo.listPackagingItems() : Promise.resolve([]),
    ]).then(([types, packagingItems]) => {
      let activeTypes = (types || []).filter((t) => t.isActive !== false);

      if (packagingItems && packagingItems.length > 0) {
        const outOfStockNames = new Set(
          packagingItems
            .filter((p: any) => (p.currentStock !== undefined && Number(p.currentStock) <= 0) || p.isActive === false)
            .map((p: any) => (p.sizeLabel || p.name || '').trim().toLowerCase())
        );
        activeTypes = activeTypes.filter(
          (t) => !outOfStockNames.has(t.name.trim().toLowerCase())
        );
      }

      if (activeTypes.length > 0) {
        setCatalogPackets(activeTypes.map((t) => ({ name: t.name, costPerPacket: t.costPerPacket })));
      } else {
        setCatalogPackets([]);
      }
    }).catch(() => {
      setCatalogPackets([]);
    });
  }, [repo]);

  // Track whether we are adjusting already recorded packets
  const [hasExistingRecords, setHasExistingRecords] = useState<boolean>(false);

  // Load existing records for this batch (instantly from prop if available)
  useEffect(() => {
    if (isOpen && batch) {
      setShowSuccessAnim(false);
      setIsSubmitting(false);
      let isMounted = true;
      const initialMap: Record<string, number> = {};

      if (initialPackings && initialPackings.length > 0) {
        initialPackings.forEach((r) => {
          if ((r.packetsPacked || 0) > 0) {
            initialMap[r.packetSize] = (initialMap[r.packetSize] || 0) + (r.packetsPacked || 0);
          }
        });
        setQuantities({ ...initialMap });
        setHasExistingRecords(Object.keys(initialMap).length > 0);
      }

      repo.listPackingRecords({ productId: batch.productId, limit: 100 }).then((records) => {
        if (!isMounted) return;
        records.forEach((r) => {
          const isThisBatch = r.productionRunId
            ? r.productionRunId === batch.id
            : Boolean(r.notes && r.notes.includes(batch.runNumber));

          if (isThisBatch && (r.packetsPacked || 0) > 0) {
            initialMap[r.packetSize] = (initialMap[r.packetSize] || 0) + (r.packetsPacked || 0);
          }
        });
        setQuantities({ ...initialMap });
        setHasExistingRecords(Object.keys(initialMap).length > 0);
      }).catch(() => {
        if (isMounted && (!initialPackings || initialPackings.length === 0)) {
          setQuantities({});
          setHasExistingRecords(false);
        }
      });

      setActiveRulerPacket(null);
      return () => {
        isMounted = false;
      };
    }
  }, [isOpen, batch, initialPackings, repo]);

  if (!batch) return null;

  // All in-stock packets shown directly to the cook (plus any packet already recorded on this batch):
  const displayedPackets = useMemo(() => {
    const existingPacketNames = Object.keys(quantities).filter((k) => (quantities[k] || 0) > 0);
    const existingMissing = existingPacketNames
      .filter((name) => !catalogPackets.some((cp) => cp.name.toLowerCase() === name.toLowerCase()))
      .map((name) => ({ name, costPerPacket: 0 }));

    return [...catalogPackets, ...existingMissing];
  }, [catalogPackets, quantities]);

  // Open measurement modal instantly when selecting a packet
  const handleOpenRulerForPacket = (size: string, costPerPacket?: number) => {
    const currentVal = quantities[size] || 50;
    setActiveRulerPacket({
      size,
      count: currentVal,
      costPerPacket,
    });
    setTimeout(() => {
      scrollRulerTo(currentVal);
    }, 120);
  };

  const handleRulerScroll = () => {
    if (!rulerRef.current || isScrollingRuler.current || !activeRulerPacket) return;
    const scrollLeft = rulerRef.current.scrollLeft;
    const tickIndex = Math.round(scrollLeft / TICK_SPACING);
    const calculatedVal = Math.max(
      MIN_PACKETS,
      Math.min(MAX_RULER_PACKETS, MIN_PACKETS + tickIndex * STEP_PACKETS)
    );
    setActiveRulerPacket((prev) => (prev ? { ...prev, count: calculatedVal } : null));
  };

  const handleRulerStepDelta = (delta: number) => {
    if (!activeRulerPacket) return;
    const next = Math.max(0, activeRulerPacket.count + delta);
    setActiveRulerPacket((prev) => (prev ? { ...prev, count: next } : null));
    scrollRulerTo(next);
  };

  const handleDirectCountChange = (valStr: string) => {
    const val = parseInt(valStr, 10);
    const count = isNaN(val) ? 0 : Math.max(0, Math.min(MAX_RULER_PACKETS, val));
    setActiveRulerPacket((prev) => (prev ? { ...prev, count } : null));
    scrollRulerTo(count);
  };

  const handleConfirmRulerValue = () => {
    if (!activeRulerPacket) return;
    if (activeRulerPacket.count > 0) {
      setQuantities((prev) => ({
        ...prev,
        [activeRulerPacket.size]: activeRulerPacket.count,
      }));
    } else {
      setQuantities((prev) => {
        const copy = { ...prev };
        delete copy[activeRulerPacket.size];
        return copy;
      });
    }
    setActiveRulerPacket(null);
  };

  const handleClearRulerValue = () => {
    if (!activeRulerPacket) return;
    setQuantities((prev) => {
      const updated = { ...prev };
      delete updated[activeRulerPacket.size];
      return updated;
    });
    setActiveRulerPacket(null);
  };

  // Calculations:
  const configuredPackets = Object.entries(quantities).filter(([_, qty]) => (qty || 0) > 0);
  const totalPacketsSum = configuredPackets.reduce((sum, [_, qty]) => sum + qty, 0);
  const hasAddedPackets = configuredPackets.length > 0;

  const handleSubmitAllPackets = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    try {
      setIsSubmitting(true);
      const packingDate = batch.productionDate || new Date().toISOString().split('T')[0];
      const operatorName = staffName || batch.operatorName || 'Kitchen Staff';

      // 1. Delete previous records for this run to keep calculations & DB strictly accurate
      await repo.deletePackingRecordsForRun(batch.id, batch.runNumber);

      // 2. Insert new confirmed quantities with explicit unit cost for costing accuracy (if > 0)
      for (const [packetSize, count] of configuredPackets) {
        if (count > 0) {
          const pktInfo = displayedPackets.find(
            (p) => p.name.toLowerCase() === packetSize.toLowerCase()
          );
          await repo.recordPacking({
            packingDate,
            productId: batch.productId,
            productionRunId: batch.id,
            packetSize,
            packetsPacked: count,
            operatorName,
            coverUnitCost: pktInfo?.costPerPacket || 0,
            notes: `Batch #${batch.runNumber}`,
          });
        }
      }

      setIsSubmitting(false);
      setShowSuccessAnim(true);
    } catch (err: any) {
      console.error('Failed to record batch packaging', err);
      addToast(err?.message || 'Failed to save packets', 'error');
      setIsSubmitting(false);
    }
  };

  const handleSuccessAnimComplete = () => {
    setShowSuccessAnim(false);
    addToast(
      language === 'ml'
        ? totalPacketsSum === 0
          ? `${batch.productName} പാക്കറ്റുകൾ 0 ആയി ക്രമീകരിച്ചു`
          : hasExistingRecords
          ? `${batch.productName} ലേക്ക് ${totalPacketsSum} പാക്കറ്റുകൾ ക്രമീകരിച്ചു`
          : `${batch.productName} ലേക്ക് ${totalPacketsSum} പാക്കറ്റുകൾ ചേർത്തു`
        : totalPacketsSum === 0
        ? `Reset packets to 0 for ${batch.productName}`
        : hasExistingRecords
        ? `Adjusted ${totalPacketsSum} packets for ${batch.productName}`
        : `Recorded ${totalPacketsSum} packets for ${batch.productName}`,
      'success'
    );
    triggerRefresh();
    if (onSuccess) onSuccess();
    onClose();
  };

  const totalTicks = Math.min(MAX_RULER_PACKETS - MIN_PACKETS, 500);

  return (
    <>
      <Modal
        isOpen={isOpen && !activeRulerPacket}
        onClose={() => {
          setShowSuccessAnim(false);
          setIsSubmitting(false);
          onClose();
        }}
        title={
          <div className="flex items-center gap-2.5">
            <span className="p-2.5 rounded-2xl bg-epso-red/10 text-epso-red dark:bg-amber-500/20 dark:text-amber-400">
              <TbPackage className="w-5 h-5 stroke-[2.5]" />
            </span>
            <div>
              <h2 className="text-base sm:text-lg font-black text-stone-900 dark:text-white leading-tight font-malayalam">
                {hasExistingRecords
                  ? (language === 'ml' ? 'പാക്കറ്റുകൾ ക്രമീകരിക്കുക' : 'Adjust Packets')
                  : (language === 'ml' ? 'പാക്കറ്റുകൾ ചേർക്കുക' : 'Add Packets')}
              </h2>
              <p className="text-xs text-stone-500 dark:text-stone-400 font-medium">
                {batch.productName} ({batch.actualQuantity} {batch.unit})
                {hasExistingRecords && (
                  <span className="text-epso-orange dark:text-amber-400 font-bold ml-1.5 font-malayalam">
                    • {language === 'ml' ? 'തിരുത്തൽ' : 'Edit Mode'}
                  </span>
                )}
              </p>
            </div>
          </div>
        }
        size="md"
        overlay={
          <BatchSuccessAnimation
            isVisible={showSuccessAnim}
            onComplete={handleSuccessAnimComplete}
            message={
              totalPacketsSum === 0
                ? (language === 'ml' ? 'പാക്കറ്റുകൾ 0 ആയി മാറ്റി' : 'Packets Set to 0')
                : (language === 'ml' ? 'പാക്കറ്റുകൾ ചേർത്തു!' : 'Packets Added Successfully!')
            }
            subMessage={
              totalPacketsSum === 0
                ? (language === 'ml' ? 'ഈ ബാച്ചിലെ എല്ലാ പാക്കറ്റുകളും ഒഴിവാക്കി' : 'All packets cleared for this batch')
                : (language === 'ml'
                    ? `${configuredPackets.length} തരങ്ങളിൽ ${totalPacketsSum} പാക്കറ്റുകൾ രേഖപ്പെടുത്തി`
                    : `${totalPacketsSum} packets recorded across ${configuredPackets.length} packet types`)
            }
          />
        }
      >
        <div className={`space-y-4 pb-28 -mx-1 ${activeRulerPacket ? 'hidden' : ''}`}>
          {/* Batch Info Card */}
          <div className="p-3 bg-stone-100/70 dark:bg-[#252020]/70 rounded-2xl flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-orange-100 dark:bg-orange-950/40 text-epso-orange flex items-center justify-center shrink-0">
                <TbPackage className="w-5 h-5 stroke-[2.2]" />
              </div>
              <div>
                <h4 className="text-sm font-extrabold text-stone-900 dark:text-white font-malayalam">
                  {batch.productName}
                </h4>
                <p className="text-[11px] text-stone-500 dark:text-stone-400 font-medium font-sans">
                  {batch.actualQuantity} {batch.unit} output • {batch.productionDate}
                </p>
              </div>
            </div>

            {/* Compulsory Status Badge */}
            <div className="text-right shrink-0">
              <span
                className={`text-[11px] font-black px-2.5 py-1 rounded-full border flex items-center gap-1 whitespace-nowrap shrink-0 ${
                  hasAddedPackets
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                    : 'bg-yellow-50 dark:bg-yellow-950/40 text-yellow-800 dark:text-yellow-300 border-yellow-300 dark:border-yellow-700/60'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    hasAddedPackets ? 'bg-emerald-500' : 'bg-yellow-500 animate-pulse'
                  }`}
                />
                <span className="whitespace-nowrap shrink-0">
                  {hasAddedPackets
                    ? `${totalPacketsSum} ${language === 'ml' ? 'ചേർത്തു' : 'Added'}`
                    : language === 'ml'
                    ? 'നിർബന്ധമാണ്'
                    : 'Compulsory'}
                </span>
              </span>
            </div>
          </div>

          {/* All Available Packets Grid (Cook can pick any packet) */}
          <div className="p-4 rounded-3xl bg-white dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#2E2828] shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-stone-700 dark:text-stone-300 font-malayalam block">
                  {language === 'ml' ? 'എല്ലാ പാക്കറ്റ് തരങ്ങളും (ഏതും തിരഞ്ഞെടുക്കാം)' : 'All Packet Types (Select Any)'}
                </span>
                <span className="text-[10px] text-stone-400 font-medium">
                  {language === 'ml'
                    ? 'പാക്കറ്റുകൾ ചേർക്കൽ നിർബന്ധമാണ്. പരിധിയില്ലാതെ എത്രയും ചേർക്കാം.'
                    : 'Adding packets is compulsory. Select any packet without limits.'}
                </span>
              </div>
              <span className="text-xs font-black text-stone-600 dark:text-stone-400 font-mono">
                {totalPacketsSum} pkts
              </span>
            </div>

            {displayedPackets.length === 0 ? (
              <div className="p-6 text-center rounded-2xl bg-stone-50 dark:bg-[#141212] border border-stone-200 dark:border-[#282323] space-y-1">
                <TbAlertCircle className="w-7 h-7 mx-auto text-amber-500 mb-1 stroke-[1.8]" />
                <h4 className="text-xs font-bold text-stone-700 dark:text-stone-300 font-malayalam">
                  {language === 'ml' ? 'സ്റ്റോക്കിൽ പാക്കറ്റുകൾ ലഭ്യമല്ല' : 'No Packets in Stock'}
                </h4>
                <p className="text-[11px] text-stone-400 font-malayalam">
                  {language === 'ml'
                    ? 'സ്റ്റോക്കില്ലാത്ത പാക്കറ്റുകൾ ഇവിടെ കാണിക്കുന്നില്ല'
                    : 'Out of stock packets are hidden'}
                </p>
              </div>
            ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              {displayedPackets.map((pkt) => {
                const count = quantities[pkt.name] || 0;
                const hasCount = count > 0;

                return (
                  <div
                    key={pkt.name}
                    onClick={() => handleOpenRulerForPacket(pkt.name, pkt.costPerPacket)}
                    className={`relative p-3.5 rounded-2xl border-2 transition-all press-apple cursor-pointer flex flex-col justify-between gap-2.5 select-none ${
                      hasCount
                        ? 'bg-orange-50/70 dark:bg-orange-950/20 border-epso-red dark:border-amber-500 shadow-sm'
                        : 'bg-stone-50 dark:bg-[#141212] border-stone-200 dark:border-[#282323] hover:border-epso-red/50 dark:hover:border-amber-500/50'
                    }`}
                  >
                    {/* Top status indicator */}
                    <div className="flex items-center justify-between w-full">
                      <span className="text-[10px] uppercase font-black tracking-wider text-stone-400 font-mono">
                        Packet
                      </span>

                      {hasCount ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-epso-red dark:bg-amber-500 text-white dark:text-stone-950 font-black text-xs shadow-xs tracking-tight font-mono">
                          <TbCheck className="w-3.5 h-3.5 stroke-[3]" />
                          <span>{count} pkts</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-stone-200/70 dark:bg-[#282323] text-stone-500 dark:text-stone-400 font-bold text-[10px]">
                          <TbPlus className="w-3 h-3" />
                          <span>{language === 'ml' ? 'നൽകുക' : 'Set Count'}</span>
                        </span>
                      )}
                    </div>

                    {/* Packet Name & Quick Info */}
                    <div className="flex items-end justify-between gap-2">
                      <div>
                        <h4
                          className={`text-base font-black tracking-tight ${
                            hasCount
                              ? 'text-epso-red dark:text-amber-400'
                              : 'text-stone-900 dark:text-white'
                          }`}
                        >
                          {pkt.name}
                        </h4>
                        {pkt.costPerPacket ? (
                          <span className="text-[10px] text-stone-400 font-mono">
                            ₹{Number(pkt.costPerPacket).toFixed(2)}/pkt
                          </span>
                        ) : null}
                      </div>

                      <div className="text-right">
                        <span
                          className={`text-xs font-black font-mono px-2 py-1 rounded-lg ${
                            hasCount
                              ? 'bg-white dark:bg-[#1E1B1B] text-stone-900 dark:text-white border border-epso-red/30 dark:border-amber-500/30'
                              : 'text-stone-400'
                          }`}
                        >
                          {hasCount ? `${count} pkts` : '0 pkts'}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            )}
          </div>

          {/* Selected Packets Summary Strip */}
          {hasAddedPackets && (
            <div className="p-3.5 bg-stone-100/80 dark:bg-[#252020]/80 rounded-2xl flex items-center justify-between text-xs">
              <span className="font-bold text-stone-600 dark:text-stone-300 font-malayalam">
                {language === 'ml' ? 'ആകെ പാക്കറ്റുകൾ:' : 'Total Packets to Save:'}
              </span>
              <span className="font-black text-sm text-stone-900 dark:text-white font-mono">
                {totalPacketsSum} {language === 'ml' ? 'പാക്കറ്റുകൾ' : 'Packets'} ({configuredPackets.length} {language === 'ml' ? 'തരങ്ങൾ' : 'types'})
              </span>
            </div>
          )}
        </div>

        {/* FIXED BOTTOM ACTION BAR */}
        <div className="fixed bottom-0 inset-x-0 p-3.5 sm:p-4 bg-white/95 dark:bg-[#1E1B1B]/95 backdrop-blur-xl border-t border-stone-200 dark:border-[#2E2828] z-40 flex items-center gap-3 shadow-[0_-8px_25px_rgba(0,0,0,0.08)] dark:shadow-[0_-8px_25px_rgba(0,0,0,0.4)]">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="flex-1 py-3.5 sm:py-4 px-4 rounded-2xl border-2 border-stone-300 dark:border-stone-700 bg-white dark:bg-[#252020] hover:bg-stone-100 dark:hover:bg-[#2c2626] text-stone-800 dark:text-stone-200 font-extrabold text-sm transition-all press-apple cursor-pointer flex items-center justify-center gap-1.5"
          >
            <TbX className="w-4 h-4 stroke-[2.5]" />
            <span>{language === 'ml' ? 'റദ്ദാക്കുക' : 'Cancel'}</span>
          </button>

          {/* SAVE / UPDATE PACKETS BUTTON: Packets can be set to 0, and adjusted once set */}
          <button
            type="button"
            onClick={() => handleSubmitAllPackets()}
            disabled={isSubmitting}
            className="flex-[2] py-3.5 sm:py-4 px-4 rounded-2xl font-black text-sm shadow-md transition-all press-apple cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed bg-epso-red hover:bg-epso-red-hover dark:bg-amber-500 dark:hover:bg-amber-600 text-white dark:text-stone-950"
          >
            {isSubmitting ? (
              <span>{language === 'ml' ? 'സൂക്ഷിക്കുന്നു...' : 'Saving...'}</span>
            ) : (
              <>
                <TbCheck className="w-5 h-5 stroke-[3]" />
                <span>
                  {totalPacketsSum === 0
                    ? (language === 'ml' ? 'സൂക്ഷിക്കുക (0 പാക്കറ്റുകൾ)' : 'Save (0 Packets)')
                    : hasExistingRecords
                    ? (language === 'ml' ? `മാറ്റങ്ങൾ സൂക്ഷിക്കുക (${totalPacketsSum} പാക്കറ്റുകൾ)` : `Update (${totalPacketsSum} Packets)`)
                    : (language === 'ml' ? `സൂക്ഷിക്കുക (${totalPacketsSum} പാക്കറ്റുകൾ)` : `Save (${totalPacketsSum} Packets)`)}
                </span>
              </>
            )}
          </button>
        </div>
      </Modal>

      {/* =================================================================== */}
      {/* RULER & DIRECT INPUT MODAL FOR SELECTED PACKET (NO LIMITS)          */}
      {/* =================================================================== */}
      {activeRulerPacket && (
        <Modal
          isOpen={true}
          onClose={() => setActiveRulerPacket(null)}
          title={
            <div className="flex items-center gap-2.5">
              <span className="p-2.5 rounded-2xl bg-epso-red/10 text-epso-red dark:bg-amber-500/20 dark:text-amber-400">
                <TbScale className="w-5 h-5 stroke-[2.5]" />
              </span>
              <div>
                <h3 className="text-base font-black text-stone-900 dark:text-white leading-tight font-malayalam">
                  {activeRulerPacket.size}
                </h3>
                <p className="text-xs text-stone-500 dark:text-stone-400 font-medium">
                  {language === 'ml'
                    ? 'പാക്കറ്റുകളുടെ എണ്ണം നൽകുക (പരിധിയില്ല)'
                    : 'Enter Packet Count (No Limits)'}
                </p>
              </div>
            </div>
          }
          size="md"
        >
          <div className="space-y-4 py-2 font-malayalam">
            {/* Direct Number Input + Steppers (No Limits) */}
            <div className="flex items-center justify-center gap-2 py-1">
              <button
                type="button"
                onClick={() => handleRulerStepDelta(-10)}
                className="w-11 h-11 shrink-0 rounded-2xl bg-stone-100 dark:bg-[#282323] hover:bg-stone-200 dark:hover:bg-[#342D2D] text-stone-700 dark:text-stone-200 flex items-center justify-center font-bold text-xs press-apple transition-colors cursor-pointer"
                title="-10"
              >
                -10
              </button>
              <button
                type="button"
                onClick={() => handleRulerStepDelta(-1)}
                className="w-11 h-11 shrink-0 rounded-2xl bg-stone-100 dark:bg-[#282323] hover:bg-stone-200 dark:hover:bg-[#342D2D] text-stone-700 dark:text-stone-200 flex items-center justify-center font-bold text-xs press-apple transition-colors cursor-pointer"
              >
                <TbMinus className="w-4 h-4 stroke-[2.5]" />
              </button>

              {/* Editable Input Box for Any Count */}
              <div className="w-44 shrink-0 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-2xl bg-stone-100 dark:bg-[#141212] border-2 border-epso-red/40 dark:border-amber-500/40 shadow-inner">
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={activeRulerPacket.count === 0 ? '' : activeRulerPacket.count}
                  onChange={(e) => handleDirectCountChange(e.target.value)}
                  placeholder="0"
                  className="w-24 text-3xl font-black text-center text-stone-900 dark:text-white bg-transparent outline-none tabular-nums font-mono"
                  autoFocus
                />
                <span className="text-xs font-black text-stone-500 dark:text-stone-400 uppercase select-none">
                  pkts
                </span>
              </div>

              <button
                type="button"
                onClick={() => handleRulerStepDelta(1)}
                className="w-11 h-11 shrink-0 rounded-2xl bg-stone-100 dark:bg-[#282323] hover:bg-stone-200 dark:hover:bg-[#342D2D] text-stone-700 dark:text-stone-200 flex items-center justify-center font-bold text-xs press-apple transition-colors cursor-pointer"
              >
                <TbPlus className="w-4 h-4 stroke-[2.5]" />
              </button>
              <button
                type="button"
                onClick={() => handleRulerStepDelta(10)}
                className="w-11 h-11 shrink-0 rounded-2xl bg-stone-100 dark:bg-[#282323] hover:bg-stone-200 dark:hover:bg-[#342D2D] text-stone-700 dark:text-stone-200 flex items-center justify-center font-bold text-xs press-apple transition-colors cursor-pointer"
                title="+10"
              >
                +10
              </button>
            </div>

            {/* Horizontal Touch Ruler */}
            <div className="relative w-full py-2 overflow-hidden flex flex-col items-center select-none bg-stone-50 dark:bg-[#141212] rounded-2xl border border-charcoal-border/50 dark:border-[#2E2828]">
              {/* Center Marker Needle */}
              <div className="absolute top-0 bottom-4 left-1/2 -translate-x-1/2 w-0.5 z-20 pointer-events-none rounded-full bg-epso-red dark:bg-amber-500">
                <div className="w-2.5 h-2.5 rounded-full -ml-[4px] -top-1 absolute bg-epso-red dark:bg-amber-500 shadow-sm" />
              </div>

              {/* Scrollable Ruler Track */}
              <div
                ref={rulerRef}
                onScroll={handleRulerScroll}
                className="w-full overflow-x-scroll no-scrollbar touch-pan-x flex items-end h-14 relative select-none"
                style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
              >
                <div className="shrink-0 w-1/2" />
                <div className="flex items-end shrink-0" style={{ gap: `${TICK_SPACING - 2}px` }}>
                  {Array.from({ length: totalTicks + 1 }).map((_, idx) => {
                    const val = MIN_PACKETS + idx * STEP_PACKETS;
                    const isMajor = val % 25 === 0;
                    const isMedium = val % 5 === 0 && !isMajor;

                    return (
                      <div
                        key={idx}
                        onClick={() => {
                          setActiveRulerPacket((prev) => (prev ? { ...prev, count: val } : null));
                          scrollRulerTo(val);
                        }}
                        className="flex flex-col items-center justify-end shrink-0 cursor-pointer h-10 pb-1"
                        style={{ width: '2px' }}
                      >
                        <div
                          className={`rounded-full transition-colors ${
                            isMajor
                              ? 'h-8 bg-stone-500/40 dark:bg-stone-400/35 w-[2px]'
                              : isMedium
                              ? 'h-5 bg-stone-400/30 dark:bg-stone-500/25 w-[1.5px]'
                              : 'h-3 bg-stone-300/25 dark:bg-stone-600/20 w-[1px]'
                          }`}
                        />
                      </div>
                    );
                  })}
                </div>
                <div className="shrink-0 w-1/2" />
              </div>

              {/* Edge gradients */}
              <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-stone-50 dark:from-[#141212] to-transparent pointer-events-none z-10" />
              <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-stone-50 dark:from-[#141212] to-transparent pointer-events-none z-10" />
            </div>

            {/* Quick Presets (Extending to large counts) */}
            <div className="flex items-center justify-center gap-1.5 pt-0.5 flex-wrap">
              <span className="text-[10px] text-stone-400 font-bold mr-1">Quick:</span>
              {[0, 25, 50, 75, 100, 150, 200, 250, 500, 1000].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => {
                    setActiveRulerPacket((prev) => (prev ? { ...prev, count: preset } : null));
                    scrollRulerTo(preset);
                  }}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors cursor-pointer ${
                    activeRulerPacket.count === preset
                      ? 'bg-epso-red text-white border-epso-red dark:bg-amber-500 dark:text-stone-950 dark:border-amber-500'
                      : 'bg-white dark:bg-[#141212] border-charcoal-border/70 dark:border-[#2E2828] text-stone-600 dark:text-stone-300 hover:text-epso-red'
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>

            {/* Ruler Dialog Actions */}
            <div className="flex items-center gap-2 pt-3 border-t border-stone-200 dark:border-[#2E2828]">
              <button
                type="button"
                onClick={handleClearRulerValue}
                className="py-3 px-4 rounded-xl border border-stone-300 dark:border-stone-700 text-stone-600 dark:text-stone-400 font-bold text-xs hover:bg-stone-100 dark:hover:bg-[#282323] cursor-pointer"
              >
                {language === 'ml' ? 'ഒഴിവാക്കുക' : 'Clear'}
              </button>

              <button
                type="button"
                onClick={() => setActiveRulerPacket(null)}
                className="flex-1 py-3 px-4 rounded-xl border-2 border-stone-300 dark:border-stone-700 bg-white dark:bg-[#252020] text-stone-800 dark:text-stone-200 font-extrabold text-xs cursor-pointer text-center"
              >
                {language === 'ml' ? 'റദ്ദാക്കുക' : 'Cancel'}
              </button>

              <button
                type="button"
                onClick={handleConfirmRulerValue}
                className="flex-1 py-3 px-4 rounded-xl bg-epso-red hover:bg-epso-red-hover dark:bg-amber-500 dark:hover:bg-amber-600 text-white dark:text-stone-950 font-black text-xs shadow-md press-apple cursor-pointer flex items-center justify-center gap-1.5"
              >
                <TbCheck className="w-4 h-4 stroke-[3]" />
                <span>{language === 'ml' ? 'സ്ഥിരീകരിക്കുക' : 'Done'}</span>
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
};
