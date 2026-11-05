import React, { useState, useEffect, useCallback } from 'react';
import { FlaskConical, Plus, RefreshCw, AlertTriangle, CheckCircle2, Clock, Scale, Calendar, User, X } from 'lucide-react';
import { getRepository } from '../services';
import { SpecialMixture, SpecialMixtureBatch } from '../types';
import { useLanguage } from '../context/LanguageContext';
import { useApp } from '../context/AppContext';
import { PrepareMixtureModal } from '../components/mixtures/PrepareMixtureModal';

export const MixturesPage: React.FC = () => {
  const { language, t } = useLanguage();
  const { addToast } = useApp();
  const repo = getRepository();

  const [mixtures, setMixtures] = useState<SpecialMixture[]>([]);
  const [batches, setBatches] = useState<SpecialMixtureBatch[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  // Modal controls
  const [isPrepareModalOpen, setIsPrepareModalOpen] = useState<boolean>(false);
  const [preSelectedId, setPreSelectedId] = useState<string | undefined>(undefined);

  // Batch cancellation modal
  const [cancellingBatch, setCancellingBatch] = useState<SpecialMixtureBatch | null>(null);
  const [cancelReason, setCancelReason] = useState<string>('');
  const [isSubmittingCancel, setIsSubmittingCancel] = useState<boolean>(false);

  const loadData = useCallback(async () => {
    try {
      const [mixData, batchData] = await Promise.all([
        repo.listSpecialMixtures(false),
        repo.listSpecialMixtureBatches({ limit: 50 }),
      ]);
      setMixtures(mixData);
      setBatches(batchData);
    } catch (err: any) {
      console.error('Error loading mixtures data:', err);
      addToast(err.message || 'Failed to load mixtures', 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [repo, addToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRefresh = () => {
    setRefreshing(true);
    repo.invalidateCache();
    loadData();
  };

  const openPrepare = (mixtureId?: string) => {
    setPreSelectedId(mixtureId);
    setIsPrepareModalOpen(true);
  };

  const handleCancelBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancellingBatch) return;

    if (!cancelReason.trim()) {
      addToast(
        language === 'ml' ? 'റദ്ദാക്കാനുള്ള കാരണം നൽകുക' : 'Please provide a cancellation reason',
        'error'
      );
      return;
    }

    setIsSubmittingCancel(true);
    try {
      await repo.cancelSpecialMixtureBatch(cancellingBatch.id, cancelReason.trim(), 'Head Baker');
      addToast(
        language === 'ml' ? 'ബാച്ച് റദ്ദാക്കി ചേരുവകൾ തിരിച്ചേൽപ്പിച്ചു' : 'Batch cancelled and raw ingredients restored',
        'success'
      );
      setCancellingBatch(null);
      setCancelReason('');
      loadData();
    } catch (err: any) {
      console.error('Cancellation failed:', err);
      addToast(err.message || 'Failed to cancel batch', 'error');
    } finally {
      setIsSubmittingCancel(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12 animate-fade-in">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white dark:bg-[#181616] p-4 sm:p-5 rounded-2xl border border-stone-200 dark:border-stone-800 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-pulari-primary/10 text-pulari-primary dark:text-pulari-gold">
            <FlaskConical className="w-6 h-6 stroke-[2.2]" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-stone-900 dark:text-stone-100 tracking-tight">
              {language === 'ml' ? 'പ്രത്യേക കൂട്ടുകൾ / മിശ്രിതങ്ങൾ' : 'Special Cooked Mixtures'}
            </h1>
            <p className="text-xs sm:text-sm text-stone-500 dark:text-stone-400">
              {language === 'ml'
                ? 'പ്ലം കേക്ക്, ചോക്ലേറ്റ്, വിപ്പിംഗ് ക്രീം തുടങ്ങിയ മിശ്രിതങ്ങൾ'
                : 'Intermediate mixtures prepared and stored for cake production'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            className="p-2.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-700 transition-colors cursor-pointer"
            title={t.refresh}
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>

          <button
            type="button"
            onClick={() => openPrepare()}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-pulari-primary text-white font-bold text-xs sm:text-sm hover:bg-pulari-primary/90 transition-all shadow-md active:scale-95 cursor-pointer"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            <span>{language === 'ml' ? 'കൂട്ട് തയ്യാറാക്കുക' : 'Prepare Mixture'}</span>
          </button>
        </div>
      </div>

      {/* Mixtures Stock Cards Grid */}
      <div>
        <div className="flex items-center justify-between mb-3 px-1">
          <h2 className="text-sm font-black uppercase tracking-wider text-stone-500 dark:text-stone-400">
            {language === 'ml' ? 'ലഭ്യമായ കൂട്ടുകൾ' : 'Available Mixtures Stock'}
          </h2>
          <span className="text-xs text-stone-400">
            {mixtures.length} {language === 'ml' ? 'കൂട്ടുകൾ' : 'items'}
          </span>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-36 rounded-2xl bg-stone-100 dark:bg-stone-800 animate-pulse" />
            ))}
          </div>
        ) : mixtures.length === 0 ? (
          <div className="p-8 text-center bg-white dark:bg-[#181616] rounded-2xl border border-stone-200 dark:border-stone-800 text-stone-400 text-sm">
            {language === 'ml' ? 'കൂട്ടുകൾ ലഭ്യമല്ല' : 'No special mixtures found'}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {mixtures.map((mix) => {
              const isLowStock = mix.currentStock <= mix.minStock;
              return (
                <div
                  key={mix.id}
                  className="bg-white dark:bg-[#181616] p-4 sm:p-5 rounded-2xl border border-stone-200 dark:border-stone-800 shadow-xs flex flex-col justify-between hover:border-pulari-primary/40 transition-colors"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <h3 className="font-bold text-base text-stone-900 dark:text-stone-100 leading-snug">
                          {mix.name}
                        </h3>
                        {mix.code && (
                          <span className="text-[10px] font-semibold tracking-wider uppercase text-stone-400">
                            {mix.code}
                          </span>
                        )}
                      </div>
                      {isLowStock ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                          <AlertTriangle className="w-3 h-3" />
                          {language === 'ml' ? 'സ്റ്റോക്ക് കുറവ്' : 'Low'}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                          <CheckCircle2 className="w-3 h-3" />
                          {language === 'ml' ? 'ലഭ്യം' : 'Ready'}
                        </span>
                      )}
                    </div>

                    {mix.notes && (
                      <p className="text-xs text-stone-500 dark:text-stone-400 mt-2 line-clamp-2">
                        {mix.notes}
                      </p>
                    )}
                  </div>

                  <div className="mt-4 pt-3 border-t border-stone-100 dark:border-stone-800/80 flex items-center justify-between">
                    <div>
                      <div className="text-[11px] text-stone-400 font-medium">
                        {language === 'ml' ? 'സ്റ്റോക്ക്' : 'Current Stock'}
                      </div>
                      <div className="text-lg font-black text-stone-900 dark:text-stone-100">
                        {mix.currentStock}{' '}
                        <span className="text-xs font-bold text-stone-500">{mix.unit}</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => openPrepare(mix.id)}
                      className="px-3.5 py-2 rounded-xl bg-pulari-primary/10 text-pulari-primary dark:text-pulari-gold hover:bg-pulari-primary hover:text-white dark:hover:bg-pulari-gold dark:hover:text-stone-950 text-xs font-bold transition-all cursor-pointer"
                    >
                      + {language === 'ml' ? 'തയ്യാറാക്കുക' : 'Prepare'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Preparation History Section */}
      <div className="bg-white dark:bg-[#181616] rounded-2xl border border-stone-200 dark:border-stone-800 shadow-xs overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-stone-200 dark:border-stone-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-stone-500" />
            <h2 className="text-sm font-bold text-stone-900 dark:text-stone-100">
              {language === 'ml' ? 'കൂട്ടുകൾ തയ്യാറാക്കിയ ചരിത്രം' : 'Mixture Preparation History'}
            </h2>
          </div>
          <span className="text-xs text-stone-400">
            {batches.length} {language === 'ml' ? 'ബാച്ചുകൾ' : 'batches'}
          </span>
        </div>

        {batches.length === 0 ? (
          <div className="p-8 text-center text-stone-400 text-sm">
            {language === 'ml'
              ? 'കൂട്ടുകൾ തയ്യാറാക്കിയ വിവരങ്ങൾ ലഭ്യമല്ല'
              : 'No mixture batches prepared yet'}
          </div>
        ) : (
          <div className="divide-y divide-stone-100 dark:divide-stone-800/80">
            {batches.map((batch) => {
              const isCancelled = batch.status === 'cancelled';
              return (
                <div
                  key={batch.id}
                  className={`p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs ${
                    isCancelled ? 'opacity-60 bg-stone-50/50 dark:bg-stone-900/30' : ''
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-stone-900 dark:text-stone-100">
                        {batch.batchNumber}
                      </span>
                      <span className="font-bold text-pulari-primary dark:text-pulari-gold text-sm">
                        {batch.mixtureName}
                      </span>
                      {isCancelled && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400">
                          {language === 'ml' ? 'റദ്ദാക്കി' : 'Cancelled'}
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-stone-500 dark:text-stone-400">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" />
                        {batch.preparationDate}
                      </span>
                      <span className="flex items-center gap-1">
                        <User className="w-3.5 h-3.5" />
                        {batch.operatorName}
                      </span>
                      {batch.notes && <span className="italic">"{batch.notes}"</span>}
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-4 self-stretch sm:self-auto">
                    <div className="text-right">
                      <div className="font-black text-stone-900 dark:text-stone-100 text-sm">
                        {batch.actualQuantity} {batch.unit}
                      </div>
                      <div className="text-[11px] text-stone-400">
                        ₹{batch.totalIngredientCost.toFixed(2)} (₹{batch.costPerUnit.toFixed(2)}/{batch.unit})
                      </div>
                    </div>

                    {!isCancelled && (
                      <button
                        type="button"
                        onClick={() => setCancellingBatch(batch)}
                        className="px-2.5 py-1.5 rounded-lg border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors font-bold cursor-pointer"
                      >
                        {language === 'ml' ? 'റദ്ദാക്കുക' : 'Cancel'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Prepare Mixture Modal */}
      <PrepareMixtureModal
        isOpen={isPrepareModalOpen}
        onClose={() => setIsPrepareModalOpen(false)}
        onSuccess={loadData}
        preSelectedMixtureId={preSelectedId}
      />

      {/* Cancel Batch Confirmation Modal */}
      {cancellingBatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-[#181616] rounded-2xl max-w-md w-full p-5 shadow-2xl border border-stone-200 dark:border-stone-800 space-y-4 animate-scale-up">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base text-stone-900 dark:text-stone-100">
                {language === 'ml' ? 'കൂട്ട് ബാച്ച് റദ്ദാക്കുക' : 'Cancel Mixture Batch'}
              </h3>
              <button
                onClick={() => setCancellingBatch(null)}
                className="text-stone-400 hover:text-stone-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-stone-600 dark:text-stone-300">
              {language === 'ml'
                ? `ബാച്ച് #${cancellingBatch.batchNumber} റദ്ദാക്കുമ്പോൾ, ഉണ്ടാക്കിയ മിശ്രിതത്തിന്റെ അളവ് (${cancellingBatch.actualQuantity} ${cancellingBatch.unit}) സ്റ്റോക്കിൽ നിന്ന് കുറയ്ക്കുകയും, ഉപയോഗിച്ച അസംസ്കൃത ചേരുവകൾ തിരികെ സ്റ്റോക്കിലേക്ക് ചേർക്കുകയും ചെയ്യും.`
                : `Cancelling batch #${cancellingBatch.batchNumber} will deduct the produced mixture quantity (${cancellingBatch.actualQuantity} ${cancellingBatch.unit}) and restore all consumed raw ingredients.`}
            </p>

            <form onSubmit={handleCancelBatch} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1">
                  {language === 'ml' ? 'റദ്ദാക്കാനുള്ള കാരണം' : 'Reason for Cancellation'} *
                </label>
                <input
                  type="text"
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder={language === 'ml' ? 'ഉദാ: അനുപാതത്തിൽ മാറ്റം വന്നു' : 'e.g. incorrect proportion'}
                  className="w-full px-3 py-2 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 text-xs font-medium outline-hidden focus:ring-2 focus:ring-red-500"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCancellingBatch(null)}
                  disabled={isSubmittingCancel}
                  className="px-3.5 py-2 rounded-xl border border-stone-300 dark:border-stone-700 font-bold text-xs cursor-pointer"
                >
                  {t.cancel}
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingCancel}
                  className="px-4 py-2 rounded-xl bg-red-600 text-white font-bold text-xs hover:bg-red-700 transition-colors cursor-pointer"
                >
                  {isSubmittingCancel
                    ? t.loading
                    : language === 'ml'
                    ? 'സ്ഥിരീകരിക്കുക'
                    : 'Confirm Reversal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
