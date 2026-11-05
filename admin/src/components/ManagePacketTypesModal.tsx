import React, { useState, useEffect } from 'react';
import { PacketType } from '../types';
import {
  fetchPacketTypes,
  savePacketType,
  deletePacketType,
} from '../services/supabase';
import {
  FiPackage,
  FiPlus,
  FiTrash2,
  FiEdit2,
  FiCheck,
  FiX,
  FiDollarSign,
  FiLayers,
  FiAlertCircle,
} from 'react-icons/fi';
import { useLockBodyScroll } from '../hooks/useLockBodyScroll';
import { createPortal } from 'react-dom';
import { useFeedback } from '../context/FeedbackContext';

interface ManagePacketTypesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpdated?: () => void;
  initialPacket?: PacketType | null;
}

export const ManagePacketTypesModal: React.FC<ManagePacketTypesModalProps> = ({
  isOpen,
  onClose,
  onUpdated,
  initialPacket,
}) => {
  const { showToast, confirm } = useFeedback();
  useLockBodyScroll(isOpen);

  const [packetTypes, setPacketTypes] = useState<PacketType[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form states for creating or editing
  const [name, setName] = useState('');
  const [bundleCost, setBundleCost] = useState<number | string>(0);
  const [bundleQuantity, setBundleQuantity] = useState<number | string>(100);
  const [costPerPacket, setCostPerPacket] = useState<number | string>(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const loadData = async () => {
    try {
      setLoading(true);
      const data = await fetchPacketTypes();
      setPacketTypes(data);
      if (initialPacket?.id) {
        const fresh = data.find((p) => p.id === initialPacket.id);
        if (fresh) {
          startEdit(fresh);
        }
      }
    } catch (err: any) {
      console.error('Failed to load packet types:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      if (initialPacket) {
        startEdit(initialPacket);
      } else {
        resetForm();
      }
      loadData();
    }
  }, [isOpen, initialPacket]);

  const resetForm = () => {
    setEditingId(null);
    setName('');
    setBundleCost(0);
    setBundleQuantity(100);
    setCostPerPacket(0);
    setErrorMsg('');
  };

  const startEdit = (pkt: PacketType) => {
    setEditingId(pkt.id);
    setName(pkt.name);
    setBundleCost(pkt.bundleCost || 0);
    setBundleQuantity(pkt.bundleQuantity || 100);
    setCostPerPacket(pkt.costPerPacket || 0);
    setErrorMsg('');
  };

  // Recalculate cost per packet when bundle cost or quantity changes
  const handleBundleCostChange = (val: string) => {
    setBundleCost(val);
    const cost = parseFloat(val) || 0;
    const qty = parseFloat(String(bundleQuantity)) || 1;
    if (qty > 0) {
      setCostPerPacket(parseFloat((cost / qty).toFixed(4)));
    }
  };

  const handleBundleQuantityChange = (val: string) => {
    setBundleQuantity(val);
    const qty = parseFloat(val) || 1;
    const cost = parseFloat(String(bundleCost)) || 0;
    if (qty > 0) {
      setCostPerPacket(parseFloat((cost / qty).toFixed(4)));
    }
  };

  const handleCostPerPacketDirectChange = (val: string) => {
    setCostPerPacket(val);
    const singleCost = parseFloat(val) || 0;
    const qty = parseFloat(String(bundleQuantity)) || 100;
    setBundleCost(parseFloat((singleCost * qty).toFixed(2)));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setErrorMsg('പാക്കറ്റിന്റെ പേര് നൽകുക (Enter packet name)');
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMsg('');

      const bCost = parseFloat(String(bundleCost)) || 0;
      const bQty = Math.max(1, parseInt(String(bundleQuantity)) || 1);
      const cPerPacket = parseFloat(String(costPerPacket)) || (bQty > 0 ? bCost / bQty : 0);

      await savePacketType({
        id: editingId || undefined,
        name: name.trim(),
        bundleCost: bCost,
        bundleQuantity: bQty,
        costPerPacket: cPerPacket,
      });

      resetForm();
      await loadData();
      if (onUpdated) onUpdated();
    } catch (err: any) {
      console.error('Failed to save packet type:', err);
      setErrorMsg(err?.message || 'Error saving packet type');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string, pktName: string) => {
    const confirmed = await confirm({
      title: 'പാക്കറ്റ് തരം നീക്കം ചെയ്യണോ?',
      message: `"${pktName}" പാക്കറ്റ് തരം നീക്കം ചെയ്യണോ?`,
      confirmLabel: 'ഡിലീറ്റ് ചെയ്യുക',
      cancelLabel: 'റദ്ദാക്കുക',
      isDestructive: true,
    });
    if (!confirmed) return;

    try {
      await deletePacketType(id);
      showToast('പാക്കറ്റ് തരം വിജയകരമായി നീക്കം ചെയ്തു', 'success');
      await loadData();
      if (onUpdated) onUpdated();
    } catch (err: any) {
      showToast(`ഡിലീറ്റ് പരാജയപ്പെട്ടു: ${err?.message || 'Error deleting packet type'}`, 'error');
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] overflow-hidden">
      {/* Edge-to-edge backdrop */}
      <div
        className="fixed inset-0 w-full h-full bg-black/65 backdrop-blur-md animate-apple-backdrop"
        onClick={() => !isSubmitting && onClose()}
      />

      <div className="fixed inset-0 flex items-center justify-center p-3 sm:p-5 relative z-10 pointer-events-none">
        <div className="w-full max-w-3xl max-h-[90vh] flex flex-col bg-white dark:bg-[#1E1B1B] rounded-3xl border border-stone-200 dark:border-[#2E2828] shadow-apple-modal animate-apple-modal google-modal pointer-events-auto overflow-hidden">
          {/* Header */}
          <div className="p-5 pb-3 border-b border-stone-200 dark:border-[#2E2828] shrink-0 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="p-2 rounded-xl bg-orange-500/10 text-epso-orange dark:text-amber-400">
                <FiPackage className="w-5 h-5 stroke-[2.2]" />
              </span>
              <div>
                <h2 className="text-lg font-bold text-stone-900 dark:text-white font-malayalam leading-tight">
                  പാക്കറ്റ് തരങ്ങളും ചിലവും (Packet Types & Costs)
                </h2>
                <p className="text-xs text-stone-500 dark:text-stone-400 font-malayalam">
                  പാക്കറ്റുകളുടെ വിലയും ബണ്ടിൽ അളവും ക്രമീകരിക്കുക
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full flex items-center justify-center text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-[#282323] transition-colors cursor-pointer"
            >
              <FiX className="w-5 h-5" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-5 space-y-5 text-xs">
            {errorMsg && (
              <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/50 text-red-600 dark:text-red-400 text-xs flex items-center gap-2 border border-red-200 dark:border-red-900/60">
                <FiAlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Form: Add or Edit Packet Type */}
            <form onSubmit={handleSubmit} className="p-4 rounded-2xl bg-stone-50 dark:bg-[#141212] border border-stone-200 dark:border-[#282323] space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-stone-900 dark:text-white font-malayalam flex items-center gap-1.5">
                  <FiLayers className="w-4 h-4 text-epso-orange" />
                  {editingId ? `പാക്കറ്റ് തരം തിരുത്തുക: ${name || 'Selected'}` : 'പുതിയ പാക്കറ്റ് തരം ചേർക്കുക (Add Packet Type)'}
                </span>
                {editingId && (
                  <button
                    type="button"
                    onClick={resetForm}
                    className="text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 font-bold"
                  >
                    റദ്ദാക്കുക (Cancel Edit)
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Packet Name */}
                <div className="sm:col-span-2">
                  <label className="block font-bold text-stone-700 dark:text-stone-300 font-malayalam mb-1">
                    പാക്കറ്റിന്റെ പേര് / സൈസ് (Packet Name / Size) *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 3kg HM Packet, 10 x 12 Packet"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full google-input text-stone-900 dark:text-white font-bold"
                  />
                </div>

                {/* Bundle Total Cost */}
                <div>
                  <label className="block font-bold text-stone-700 dark:text-stone-300 font-malayalam mb-1">
                    ബണ്ടിൽ ആകെ ചിലവ് (Bundle Cost ₹)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="e.g. 250"
                    value={bundleCost === 0 ? '' : bundleCost}
                    onChange={(e) => handleBundleCostChange(e.target.value)}
                    className="w-full google-input text-stone-900 dark:text-white font-bold font-mono"
                  />
                </div>

                {/* Bundle Quantity (No. of packets whole added) */}
                <div>
                  <label className="block font-bold text-stone-700 dark:text-stone-300 font-malayalam mb-1">
                    ബണ്ടിലിലെ പാക്കറ്റുകളുടെ എണ്ണം (Packets in Bundle)
                  </label>
                  <input
                    type="number"
                    step="1"
                    min="1"
                    placeholder="e.g. 100"
                    value={bundleQuantity === 0 ? '' : bundleQuantity}
                    onChange={(e) => handleBundleQuantityChange(e.target.value)}
                    className="w-full google-input text-stone-900 dark:text-white font-bold font-mono"
                  />
                </div>

                {/* Cost Per Packet (Direct / Calculated) */}
                <div className="sm:col-span-2">
                  <div className="p-3 rounded-xl bg-orange-500/10 border border-orange-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <span className="font-bold text-orange-900 dark:text-amber-300 block font-malayalam">
                        ഒരു പാക്കറ്റിന്റെ ചിലവ് (Cost per Packet):
                      </span>
                      <span className="text-[11px] text-stone-500 dark:text-stone-400 font-mono">
                        ₹{Number(bundleCost) || 0} / {Number(bundleQuantity) || 1} pkts = ₹{Number(costPerPacket).toFixed(2)} / pkt
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 self-end sm:self-auto">
                      <span className="font-bold text-stone-500">₹</span>
                      <input
                        type="number"
                        step="0.0001"
                        min="0"
                        value={costPerPacket === 0 ? '' : costPerPacket}
                        onChange={(e) => handleCostPerPacketDirectChange(e.target.value)}
                        placeholder="0.00"
                        className="w-24 p-2 rounded-lg border border-orange-300 dark:border-amber-700/60 bg-white dark:bg-[#1E1B1B] text-stone-900 dark:text-white font-extrabold font-mono text-right outline-none"
                      />
                      <span className="font-bold text-stone-500">/ pkt</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl bg-epso-red hover:bg-epso-red-hover dark:bg-amber-500 dark:hover:bg-amber-600 text-white dark:text-stone-950 font-bold text-xs shadow-sm press-apple flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <span>സൂക്ഷിക്കുന്നു...</span>
                  ) : (
                    <>
                      <FiCheck className="w-3.5 h-3.5" />
                      <span>{editingId ? 'അപ്ഡേറ്റ് ചെയ്യുക (Update)' : 'പാക്കറ്റ് ചേർക്കുക (Save)'}</span>
                    </>
                  )}
                </button>
              </div>
            </form>

            {/* List of Defined Packet Types */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-stone-700 dark:text-stone-300 font-malayalam">
                  ലഭ്യമായ പാക്കറ്റ് തരങ്ങൾ ({packetTypes.length} എണ്ണം):
                </span>
                {loading && <span className="text-stone-400 animate-pulse">റീലോഡ് ചെയ്യുന്നു...</span>}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {packetTypes.map((pkt) => {
                  const isCurrentlyEditing = editingId === pkt.id;
                  const cPerPkt = Number(pkt.costPerPacket) || (pkt.bundleQuantity > 0 ? pkt.bundleCost / pkt.bundleQuantity : 0);

                  return (
                    <div
                      key={pkt.id}
                      className={`p-3 rounded-2xl border transition-all flex flex-col justify-between gap-2 ${
                        isCurrentlyEditing
                          ? 'border-epso-red dark:border-amber-500 bg-orange-50/50 dark:bg-amber-950/20'
                          : 'border-stone-200 dark:border-[#282323] bg-white dark:bg-[#1E1B1B]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h4 className="font-black text-stone-900 dark:text-white text-sm">
                            {pkt.name}
                          </h4>
                          <div className="flex items-center gap-2 mt-0.5 text-stone-500 dark:text-stone-400 font-mono text-[11px]">
                            <span>ബണ്ടിൽ: ₹{Number(pkt.bundleCost || 0).toFixed(0)}</span>
                            <span>•</span>
                            <span>{pkt.bundleQuantity || 100} pkts</span>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <span className="text-sm font-black text-epso-red dark:text-amber-400 font-mono">
                            ₹{cPerPkt.toFixed(2)}
                          </span>
                          <span className="text-[10px] text-stone-400 block font-semibold">/ packet</span>
                        </div>
                      </div>

                      <div className="flex items-center justify-end gap-1 pt-1.5 border-t border-stone-100 dark:border-[#282323]">
                        <button
                          type="button"
                          onClick={() => startEdit(pkt)}
                          className="px-2.5 py-1 rounded-lg bg-stone-100 dark:bg-[#282323] hover:bg-stone-200 dark:hover:bg-[#342e2e] text-stone-700 dark:text-stone-300 font-bold text-[11px] flex items-center gap-1 transition-colors cursor-pointer"
                        >
                          <FiEdit2 className="w-3 h-3" />
                          <span>തിരുത്തുക</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(pkt.id, pkt.name)}
                          className="p-1 text-red-500 hover:text-red-700 transition-colors cursor-pointer"
                          title="ഡിലീറ്റ്"
                        >
                          <FiTrash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {packetTypes.length === 0 && !loading && (
                <div className="py-8 text-center text-stone-400 font-malayalam">
                  പാക്കറ്റുകൾ ചേർത്തിട്ടില്ല
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="p-4 px-5 border-t border-stone-100 dark:border-[#2E2828] bg-stone-50/80 dark:bg-[#1A1616]/80 backdrop-blur-sm shrink-0 flex items-center justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 rounded-xl bg-stone-200 dark:bg-[#282323] hover:bg-stone-300 dark:hover:bg-[#342e2e] text-stone-800 dark:text-stone-200 font-bold font-malayalam cursor-pointer"
            >
              പൂർത്തിയായി (Done)
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
