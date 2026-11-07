import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { useLanguage } from '../../context/LanguageContext';
import { Modal } from '../ui/Modal';
import { ProductionRun, Recipe, PackingRecord } from '../../types';
import {
  TbPackage,
  TbCheck,
  TbPlus,
  TbMinus,
  TbAlertCircle,
  TbScale,
  TbX,
  TbPencil,
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

export interface CatalogPacketInfo {
  name: string;
  costPerPacket: number;
  availableStock?: number;
  isOutOfStock: boolean;
  packagingItemId?: string;
}

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
  const [isSavingPacket, setIsSavingPacket] = useState<boolean>(false);

  // All catalog packets with real stock info
  const [catalogPackets, setCatalogPackets] = useState<CatalogPacketInfo[]>([]);

  // Active Ruler / Number input modal for a selected packet
  const [activeRulerPacket, setActiveRulerPacket] = useState<{
    size: string;
    count: number;
    costPerPacket?: number;
    maxStock: number;
    packagingItemId?: string;
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

  // Load ALL packet types from catalogue with stock levels (do NOT hide out-of-stock packets)
  useEffect(() => {
    Promise.all([
      repo.listPacketTypes(),
      repo.listPackagingItems ? repo.listPackagingItems() : Promise.resolve([]),
    ]).then(([types, packagingItems]) => {
      const activeTypes = (types || []).filter((t) => t && t.isActive !== false);
      const typesToUse = activeTypes.length > 0
        ? activeTypes
        : DEFAULT_PACKET_SIZES.map((name) => ({ name, costPerPacket: 0 }));

      const packetList: CatalogPacketInfo[] = typesToUse.map((t) => {
        const tNameLower = t.name.trim().toLowerCase();
        const matchingPack = (packagingItems || []).find((p: any) => {
          if (!p) return false;
          const pNameLower = (p.sizeLabel || p.name || '').trim().toLowerCase();
          return (
            pNameLower === tNameLower ||
            pNameLower.replace(/\s+/g, '') === tNameLower.replace(/\s+/g, '')
          );
        });

        const stock = matchingPack && matchingPack.currentStock !== undefined ? Number(matchingPack.currentStock) : undefined;
        const isOutOfStock = Boolean(
          matchingPack &&
            ((stock !== undefined && stock <= 0) || matchingPack.isActive === false)
        );

        return {
          name: t.name,
          costPerPacket: Number(t.costPerPacket) || 0,
          availableStock: stock,
          isOutOfStock,
          packagingItemId: matchingPack?.id,
        };
      });

      setCatalogPackets(packetList);
    }).catch(() => {
      setCatalogPackets(
        DEFAULT_PACKET_SIZES.map((name) => ({
          name,
          costPerPacket: 0,
          availableStock: undefined,
          isOutOfStock: false,
        }))
      );
    });
  }, [repo]);

  // Load existing records for this batch
  useEffect(() => {
    if (isOpen && batch) {
      setIsSavingPacket(false);
      let isMounted = true;
      const initialMap: Record<string, number> = {};

      if (initialPackings && initialPackings.length > 0) {
        initialPackings.forEach((r) => {
          if ((r.packetsPacked || 0) > 0) {
            initialMap[r.packetSize] = Number(r.packetsPacked) || 0;
          }
        });
        setQuantities({ ...initialMap });
      }

      repo.listPackingRecords({ productId: batch.productId, limit: 100 }).then((records) => {
        if (!isMounted) return;
        const freshMap: Record<string, number> = {};
        records.forEach((r) => {
          const isThisBatch = r.productionRunId
            ? r.productionRunId === batch.id
            : Boolean(r.notes && r.notes.includes(batch.runNumber));

          if (isThisBatch && (r.packetsPacked || 0) > 0) {
            freshMap[r.packetSize] = Number(r.packetsPacked) || 0;
          }
        });
        setQuantities(freshMap);
      }).catch(() => {
        if (isMounted && (!initialPackings || initialPackings.length === 0)) {
          setQuantities({});
        }
      });

      setActiveRulerPacket(null);
      return () => {
        isMounted = false;
      };
    }
  }, [isOpen, batch, initialPackings, repo]);

  // All packets shown directly to the cook (catalog packets + any already saved for this batch)
  const displayedPackets = useMemo(() => {
    const existingPacketNames = Object.keys(quantities).filter((k) => (quantities[k] || 0) > 0);
    const existingMissing = existingPacketNames
      .filter((name) => Boolean(name) && !catalogPackets.some((cp) => cp.name.toLowerCase() === name.toLowerCase()))
      .map((name) => ({
        name,
        costPerPacket: 0,
        availableStock: undefined,
        isOutOfStock: false,
      }));

    return [...catalogPackets, ...existingMissing];
  }, [catalogPackets, quantities]);

  // Open measurement modal for a selected packet
  const handleOpenRulerForPacket = (pkt: CatalogPacketInfo) => {
    const currentSaved = quantities[pkt.name] || 0;
    const isOut = pkt.isOutOfStock || (pkt.availableStock !== undefined && pkt.availableStock <= 0);

    if (isOut && currentSaved <= 0) {
      addToast(
        language === 'ml'
          ? `${pkt.name} സ്റ്റോക്കിലില്ല (Out of Stock)`
          : `${pkt.name} is out of stock`,
        'warning'
      );
      return;
    }

    // Maximum allowable is available warehouse stock + whatever was already allocated to this batch
    const maxStock =
      pkt.availableStock !== undefined
        ? Math.max(0, pkt.availableStock + currentSaved)
        : MAX_RULER_PACKETS;

    if (maxStock <= 0 && currentSaved <= 0) {
      addToast(
        language === 'ml'
          ? `${pkt.name} സ്റ്റോക്കിലില്ല (Out of Stock)`
          : `${pkt.name} is out of stock`,
        'warning'
      );
      return;
    }

    const initialCount = currentSaved > 0 ? currentSaved : Math.min(50, Math.max(0, maxStock));

    setActiveRulerPacket({
      size: pkt.name,
      count: initialCount,
      costPerPacket: pkt.costPerPacket,
      maxStock,
      packagingItemId: pkt.packagingItemId,
    });

    setTimeout(() => {
      scrollRulerTo(initialCount);
    }, 120);
  };

  const handleRulerScroll = () => {
    if (!rulerRef.current || isScrollingRuler.current || !activeRulerPacket) return;
    const scrollLeft = rulerRef.current.scrollLeft;
    const tickIndex = Math.round(scrollLeft / TICK_SPACING);
    const maxLimit = activeRulerPacket.maxStock;
    const calculatedVal = Math.max(
      MIN_PACKETS,
      Math.min(maxLimit, MIN_PACKETS + tickIndex * STEP_PACKETS)
    );
    setActiveRulerPacket((prev) => (prev ? { ...prev, count: calculatedVal } : null));
  };

  const handleRulerStepDelta = (delta: number) => {
    if (!activeRulerPacket) return;
    const maxLimit = activeRulerPacket.maxStock;
    const next = Math.max(0, Math.min(maxLimit, activeRulerPacket.count + delta));
    setActiveRulerPacket((prev) => (prev ? { ...prev, count: next } : null));
    scrollRulerTo(next);
  };

  const handleDirectCountChange = (valStr: string) => {
    if (!activeRulerPacket) return;
    const maxLimit = activeRulerPacket.maxStock;
    const val = parseInt(valStr, 10);
    const count = isNaN(val) ? 0 : Math.max(0, Math.min(maxLimit, val));
    setActiveRulerPacket((prev) => (prev ? { ...prev, count } : null));
    scrollRulerTo(count);
  };

  // Save selected packet to the batch immediately upon confirmation in the ruler modal
  const handleConfirmRulerValue = async () => {
    if (!activeRulerPacket || !batch) return;
    const { size, count, costPerPacket, maxStock, packagingItemId } = activeRulerPacket;

    // Prevent adding more packets than available stock
    if (maxStock !== undefined && count > maxStock) {
      addToast(
        language === 'ml'
          ? `പരമാവധി ലഭ്യമായ സ്റ്റോക്ക് ${maxStock} പാക്കറ്റുകളാണ്`
          : `Cannot add more than available stock (${maxStock} pkts)`,
        'warning'
      );
      return;
    }

    if (maxStock !== undefined && maxStock <= 0 && count > 0) {
      addToast(
        language === 'ml'
          ? `${size} സ്റ്റോക്കിലില്ല (Out of Stock)`
          : `${size} is out of stock`,
        'warning'
      );
      return;
    }

    try {
      setIsSavingPacket(true);
      const packingDate = batch.productionDate || new Date().toISOString().split('T')[0];
      const operatorName = staffName || batch.operatorName || 'Kitchen Staff';

      // 1. Immediately save/update this specific packet on the batch (no duplicate rows)
      await repo.recordPacking({
        packingDate,
        productId: batch.productId,
        productionRunId: batch.id,
        packagingItemId,
        packetSize: size,
        packetsPacked: count,
        operatorName,
        coverUnitCost: costPerPacket || 0,
        notes: `Batch #${batch.runNumber}`,
      });

      // 2. Immediately update local state
      setQuantities((prev) => {
        const copy = { ...prev };
        if (count > 0) {
          copy[size] = count;
        } else {
          delete copy[size];
        }
        return copy;
      });

      // 3. Update stock locally in catalogPackets
      if (maxStock !== undefined) {
        const prevCount = quantities[size] || 0;
        const delta = count - prevCount;
        setCatalogPackets((prev) =>
          prev.map((cp) => {
            if (cp.name.toLowerCase() === size.toLowerCase() && cp.availableStock !== undefined) {
              const newAvail = Math.max(0, cp.availableStock - delta);
              return {
                ...cp,
                availableStock: newAvail,
                isOutOfStock: newAvail <= 0,
              };
            }
            return cp;
          })
        );
      }

      addToast(
        count > 0
          ? language === 'ml'
            ? `${size}: ${count} പാക്കറ്റുകൾ ബാച്ചിലേക്ക് സൂക്ഷിച്ചു`
            : `${size}: ${count} packets saved to batch`
          : language === 'ml'
          ? `${size} ഒഴിവാക്കി`
          : `${size} cleared`,
        'success'
      );

      // 4. Automatic updates without refreshing: trigger refresh and notify parent
      triggerRefresh();
      if (onSuccess) onSuccess();

      setActiveRulerPacket(null);
    } catch (err: any) {
      console.error('Failed to save packet:', err);
      addToast(err?.message || 'Failed to save packet', 'error');
    } finally {
      setIsSavingPacket(false);
    }
  };

  // Clear packet value immediately
  const handleClearRulerValue = async () => {
    if (!activeRulerPacket || !batch) return;
    const { size, packagingItemId, costPerPacket } = activeRulerPacket;

    try {
      setIsSavingPacket(true);
      const packingDate = batch.productionDate || new Date().toISOString().split('T')[0];
      const operatorName = staffName || batch.operatorName || 'Kitchen Staff';

      await repo.recordPacking({
        packingDate,
        productId: batch.productId,
        productionRunId: batch.id,
        packagingItemId,
        packetSize: size,
        packetsPacked: 0,
        operatorName,
        coverUnitCost: costPerPacket || 0,
        notes: `Batch #${batch.runNumber}`,
      });

      setQuantities((prev) => {
        const copy = { ...prev };
        delete copy[size];
        return copy;
      });

      addToast(language === 'ml' ? `${size} ഒഴിവാക്കി` : `${size} cleared`, 'info');
      triggerRefresh();
      if (onSuccess) onSuccess();
      setActiveRulerPacket(null);
    } catch (err: any) {
      console.error('Failed to clear packet:', err);
      addToast(err?.message || 'Failed to clear packet', 'error');
    } finally {
      setIsSavingPacket(false);
    }
  };

  // Calculations:
  const configuredPackets = Object.entries(quantities).filter(([_, qty]) => (qty || 0) > 0);
  const totalPacketsSum = configuredPackets.reduce((sum, [_, qty]) => sum + qty, 0);
  const hasAddedPackets = configuredPackets.length > 0;

  const totalTicks = activeRulerPacket
    ? Math.min(activeRulerPacket.maxStock - MIN_PACKETS, 500)
    : 500;

  if (!isOpen || !batch) return null;

  return (
    <>
      <Modal
        isOpen={isOpen && !activeRulerPacket}
        onClose={() => {
          onClose();
        }}
        title={
          <div className="flex items-center gap-2.5">
            <span className="p-2.5 rounded-2xl bg-epso-red/10 text-epso-red dark:bg-amber-500/20 dark:text-amber-400">
              <TbPackage className="w-5 h-5 stroke-[2.5]" />
            </span>
            <div>
              <h2 className="text-base sm:text-lg font-black text-stone-900 dark:text-white leading-tight font-malayalam">
                {hasAddedPackets
                  ? language === 'ml'
                    ? 'പാക്കറ്റുകൾ ചേർക്കുക / തിരുത്തുക'
                    : 'Add / Edit Packets'
                  : language === 'ml'
                  ? 'പാക്കറ്റുകൾ ചേർക്കുക'
                  : 'Add Packets'}
              </h2>
              <p className="text-xs text-stone-500 dark:text-stone-400 font-medium">
                {batch.productName} ({batch.actualQuantity} {batch.unit})
              </p>
            </div>
          </div>
        }
        size="md"
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

            {/* Status Badge */}
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

          {/* All Packets Grid */}
          <div className="p-4 rounded-3xl bg-white dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#2E2828] shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-stone-700 dark:text-stone-300 font-malayalam block">
                  {language === 'ml' ? 'പാക്കറ്റ് തരങ്ങൾ' : 'Packet Types'}
                </span>
                <span className="text-[10px] text-stone-400 font-medium">
                  {language === 'ml'
                    ? 'പാക്കറ്റുകൾ തിരഞ്ഞെടുത്ത് എണ്ണം നൽകുക. മാറ്റങ്ങൾ ഉടൻ സൂക്ഷിക്കപ്പെടും.'
                    : 'Select a packet to add or adjust count. Saved immediately.'}
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
                  {language === 'ml' ? 'പാക്കറ്റുകൾ ലഭ്യമല്ല' : 'No Packet Types Configured'}
                </h4>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                {displayedPackets.map((pkt) => {
                  const count = quantities[pkt.name] || 0;
                  const hasCount = count > 0;
                  const isOut = (pkt.isOutOfStock || (pkt.availableStock !== undefined && pkt.availableStock <= 0)) && count <= 0;

                  return (
                    <div
                      key={pkt.name}
                      onClick={() => handleOpenRulerForPacket(pkt)}
                      className={`relative p-3.5 rounded-2xl border-2 transition-all flex flex-col justify-between gap-2.5 select-none ${
                        isOut
                          ? 'bg-stone-100/60 dark:bg-[#151212] border-stone-200 dark:border-[#242020] opacity-70 cursor-not-allowed'
                          : hasCount
                          ? 'bg-orange-50/70 dark:bg-orange-950/20 border-epso-red dark:border-amber-500 shadow-sm cursor-pointer press-apple'
                          : 'bg-stone-50 dark:bg-[#141212] border-stone-200 dark:border-[#282323] hover:border-epso-red/50 dark:hover:border-amber-500/50 cursor-pointer press-apple'
                      }`}
                    >
                      {/* Top status indicator */}
                      <div className="flex items-center justify-between w-full">
                        <span className="text-[10px] uppercase font-black tracking-wider text-stone-400 font-mono">
                          Packet
                        </span>

                        {isOut ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-400 font-bold text-[10px] border border-red-200 dark:border-red-900/60">
                            <TbAlertCircle className="w-3 h-3 text-red-500" />
                            <span>{language === 'ml' ? 'സ്റ്റോക്കില്ല' : 'Out of Stock'}</span>
                          </span>
                        ) : hasCount ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-600 dark:bg-emerald-500 text-white dark:text-stone-950 font-black text-xs shadow-xs tracking-tight font-mono">
                            <TbCheck className="w-3.5 h-3.5 stroke-[3]" />
                            <span>{count} pkts</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-stone-200/70 dark:bg-[#282323] text-stone-500 dark:text-stone-400 font-bold text-[10px]">
                            <TbPlus className="w-3 h-3" />
                            <span>{language === 'ml' ? 'ചേർക്കുക' : 'Add'}</span>
                          </span>
                        )}
                      </div>

                      {/* Packet Name & Quick Info */}
                      <div className="flex items-end justify-between gap-2">
                        <div>
                          <h4
                            className={`text-base font-black tracking-tight ${
                              isOut
                                ? 'text-stone-400 dark:text-stone-500 line-through'
                                : hasCount
                                ? 'text-epso-red dark:text-amber-400'
                                : 'text-stone-900 dark:text-white'
                            }`}
                          >
                            {pkt.name}
                          </h4>
                          <div className="flex items-center gap-2 mt-0.5">
                            {pkt.availableStock !== undefined ? (
                              <span
                                className={`text-[10px] font-bold font-mono ${
                                  isOut
                                    ? 'text-red-500 dark:text-red-400'
                                    : 'text-emerald-600 dark:text-emerald-400'
                                }`}
                              >
                                {isOut
                                  ? (language === 'ml' ? 'സ്റ്റോക്ക്: 0' : 'Stock: 0')
                                  : (language === 'ml' ? `സ്റ്റോക്ക്: ${pkt.availableStock}` : `Stock: ${pkt.availableStock}`)}
                              </span>
                            ) : null}

                            {pkt.costPerPacket ? (
                              <span className="text-[10px] text-stone-400 font-mono">
                                ₹{Number(pkt.costPerPacket).toFixed(2)}/pkt
                              </span>
                            ) : null}
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          {hasCount ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-epso-red dark:text-amber-400 bg-white dark:bg-[#1E1B1B] px-2 py-0.5 rounded-lg border border-epso-red/30 dark:border-amber-500/30">
                              <TbPencil className="w-3 h-3" />
                              <span>{language === 'ml' ? 'തിരുത്തുക' : 'Edit'}</span>
                            </span>
                          ) : (
                            <span
                              className={`text-xs font-black font-mono px-2 py-1 rounded-lg ${
                                isOut ? 'text-stone-300 dark:text-stone-600' : 'text-stone-400'
                              }`}
                            >
                              0 pkts
                            </span>
                          )}
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
                {language === 'ml' ? 'ആകെ ചേർത്ത പാക്കറ്റുകൾ:' : 'Total Packets Saved:'}
              </span>
              <span className="font-black text-sm text-stone-900 dark:text-white font-mono">
                {totalPacketsSum} {language === 'ml' ? 'പാക്കറ്റുകൾ' : 'Packets'} ({configuredPackets.length}{' '}
                {language === 'ml' ? 'തരങ്ങൾ' : 'types'})
              </span>
            </div>
          )}
        </div>

        {/* FIXED BOTTOM ACTION BAR */}
        <div className="fixed bottom-0 inset-x-0 p-3.5 sm:p-4 bg-white/95 dark:bg-[#1E1B1B]/95 backdrop-blur-xl border-t border-stone-200 dark:border-[#2E2828] z-40 flex items-center gap-3 shadow-[0_-8px_25px_rgba(0,0,0,0.08)] dark:shadow-[0_-8px_25px_rgba(0,0,0,0.4)]">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3.5 sm:py-4 px-4 rounded-2xl border-2 border-stone-300 dark:border-stone-700 bg-white dark:bg-[#252020] hover:bg-stone-100 dark:hover:bg-[#2c2626] text-stone-800 dark:text-stone-200 font-extrabold text-sm transition-all press-apple cursor-pointer flex items-center justify-center gap-1.5"
          >
            <TbX className="w-4 h-4 stroke-[2.5]" />
            <span>{language === 'ml' ? 'അടയ്ക്കുക' : 'Close'}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              triggerRefresh();
              if (onSuccess) onSuccess();
              onClose();
            }}
            className="flex-[2] py-3.5 sm:py-4 px-4 rounded-2xl font-black text-sm shadow-md transition-all press-apple cursor-pointer flex items-center justify-center gap-2 bg-epso-red hover:bg-epso-red-hover dark:bg-amber-500 dark:hover:bg-amber-600 text-white dark:text-stone-950"
          >
            <TbCheck className="w-5 h-5 stroke-[3]" />
            <span>
              {totalPacketsSum > 0
                ? language === 'ml'
                  ? `പൂർത്തിയായി (${totalPacketsSum} പാക്കറ്റുകൾ)`
                  : `Done (${totalPacketsSum} Packets)`
                : language === 'ml'
                ? 'പൂർത്തിയായി'
                : 'Done'}
            </span>
          </button>
        </div>
      </Modal>

      {/* =================================================================== */}
      {/* RULER & DIRECT INPUT MODAL FOR SELECTED PACKET (WITH STOCK LIMITS)  */}
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
                  {activeRulerPacket.maxStock < MAX_RULER_PACKETS
                    ? language === 'ml'
                      ? `ലഭ്യമായ പരമാവധി സ്റ്റോക്ക്: ${activeRulerPacket.maxStock}`
                      : `Max Available Stock: ${activeRulerPacket.maxStock}`
                    : language === 'ml'
                    ? 'പാക്കറ്റുകളുടെ എണ്ണം നൽകുക'
                    : 'Enter Packet Count'}
                </p>
              </div>
            </div>
          }
          size="md"
        >
          <div className="space-y-4 py-2 font-malayalam">
            {/* Direct Number Input + Steppers (Bounded by available stock) */}
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

              {/* Editable Input Box for Count, clamped to available stock */}
              <div className="w-44 shrink-0 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-2xl bg-stone-100 dark:bg-[#141212] border-2 border-epso-red/40 dark:border-amber-500/40 shadow-inner">
                <input
                  type="number"
                  min="0"
                  max={activeRulerPacket.maxStock}
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
                disabled={activeRulerPacket.count >= activeRulerPacket.maxStock}
                className="w-11 h-11 shrink-0 rounded-2xl bg-stone-100 dark:bg-[#282323] hover:bg-stone-200 dark:hover:bg-[#342D2D] text-stone-700 dark:text-stone-200 flex items-center justify-center font-bold text-xs press-apple transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <TbPlus className="w-4 h-4 stroke-[2.5]" />
              </button>
              <button
                type="button"
                onClick={() => handleRulerStepDelta(10)}
                disabled={activeRulerPacket.count >= activeRulerPacket.maxStock}
                className="w-11 h-11 shrink-0 rounded-2xl bg-stone-100 dark:bg-[#282323] hover:bg-stone-200 dark:hover:bg-[#342D2D] text-stone-700 dark:text-stone-200 flex items-center justify-center font-bold text-xs press-apple transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
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
                          const clamped = Math.min(activeRulerPacket.maxStock, val);
                          setActiveRulerPacket((prev) => (prev ? { ...prev, count: clamped } : null));
                          scrollRulerTo(clamped);
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

            {/* Quick Presets (Clamped to max stock) */}
            <div className="flex items-center justify-center gap-1.5 pt-0.5 flex-wrap">
              <span className="text-[10px] text-stone-400 font-bold mr-1">Quick:</span>
              {[0, 25, 50, 75, 100, 150, 200, 250, 500, 1000]
                .filter((preset) => preset === 0 || preset <= activeRulerPacket.maxStock)
                .map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => {
                      const clamped = Math.min(activeRulerPacket.maxStock, preset);
                      setActiveRulerPacket((prev) => (prev ? { ...prev, count: clamped } : null));
                      scrollRulerTo(clamped);
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

            {/* Stock Limit Warning if near or at max */}
            {activeRulerPacket.maxStock < MAX_RULER_PACKETS && (
              <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 flex items-center justify-between text-[11px]">
                <span className="text-amber-800 dark:text-amber-300 font-medium font-malayalam">
                  {language === 'ml' ? 'ലഭ്യമായ സ്റ്റോക്ക് പരിധി:' : 'Available stock limit:'}
                </span>
                <span className="font-bold text-amber-900 dark:text-amber-200 font-mono">
                  {activeRulerPacket.maxStock} pkts
                </span>
              </div>
            )}

            {/* Ruler Dialog Actions */}
            <div className="flex items-center gap-2 pt-3 border-t border-stone-200 dark:border-[#2E2828]">
              <button
                type="button"
                onClick={handleClearRulerValue}
                disabled={isSavingPacket}
                className="py-3 px-4 rounded-xl border border-stone-300 dark:border-stone-700 text-stone-600 dark:text-stone-400 font-bold text-xs hover:bg-stone-100 dark:hover:bg-[#282323] cursor-pointer disabled:opacity-50"
              >
                {language === 'ml' ? 'ഒഴിവാക്കുക' : 'Clear'}
              </button>

              <button
                type="button"
                onClick={() => setActiveRulerPacket(null)}
                disabled={isSavingPacket}
                className="flex-1 py-3 px-4 rounded-xl border-2 border-stone-300 dark:border-stone-700 bg-white dark:bg-[#252020] text-stone-800 dark:text-stone-200 font-extrabold text-xs cursor-pointer text-center disabled:opacity-50"
              >
                {language === 'ml' ? 'റദ്ദാക്കുക' : 'Cancel'}
              </button>

              <button
                type="button"
                onClick={handleConfirmRulerValue}
                disabled={isSavingPacket}
                className="flex-1 py-3 px-4 rounded-xl bg-epso-red hover:bg-epso-red-hover dark:bg-amber-500 dark:hover:bg-amber-600 text-white dark:text-stone-950 font-black text-xs shadow-md press-apple cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                {isSavingPacket ? (
                  <span>{language === 'ml' ? 'സൂക്ഷിക്കുന്നു...' : 'Saving...'}</span>
                ) : (
                  <>
                    <TbCheck className="w-4 h-4 stroke-[3]" />
                    <span>{language === 'ml' ? 'സൂക്ഷിക്കുക' : 'Save'}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
};
