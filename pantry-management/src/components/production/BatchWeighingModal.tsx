import React, { useState, useEffect } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { BatchSuccessAnimation } from '../ui/BatchSuccessAnimation';
import { ProductionRun } from '../../types';
import { useApp } from '../../context/AppContext';
import { useLanguage } from '../../context/LanguageContext';
import { MeasurementRulerSelector } from '../ui/MeasurementRulerSelector';
import {
  TbScale,
  TbCheck,
  TbPackage,
  TbTrendingUp,
  TbTrendingDown,
  TbAlertCircle,
} from 'react-icons/tb';

interface BatchWeighingModalProps {
  isOpen: boolean;
  onClose: () => void;
  batch: ProductionRun | null;
  onSuccess?: (updatedBatch?: ProductionRun) => void;
  onOpenPacking?: (batch: ProductionRun) => void;
  isPostCreationPrompt?: boolean;
}

export const BatchWeighingModal: React.FC<BatchWeighingModalProps> = ({
  isOpen,
  onClose,
  batch,
  onSuccess,
  onOpenPacking,
  isPostCreationPrompt = false,
}) => {
  const { repo, staffName, addToast, triggerRefresh } = useApp();
  const { language } = useLanguage();

  const [producedKg, setProducedKg] = useState<number>(10);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [showSuccessAnim, setShowSuccessAnim] = useState<boolean>(false);
  const [shouldOpenPackingAfter, setShouldOpenPackingAfter] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen && batch) {
      setShowSuccessAnim(false);
      setIsSubmitting(false);
      const initial = Number(batch.actualQuantity) || Number(batch.plannedQuantity) || 10;
      setProducedKg(initial);
      setShouldOpenPackingAfter(false);
    }
  }, [isOpen, batch]);

  if (!batch) return null;

  const planned = Number(batch.plannedQuantity) || producedKg;
  const difference = Number((producedKg - planned).toFixed(2));
  const yieldPercent = planned > 0 ? Number(((producedKg / planned) * 100).toFixed(1)) : 100;

  const handleCommit = async (thenPack: boolean = false) => {
    const finalKg = Number(producedKg.toFixed(2));

    if (finalKg <= 0) {
      addToast(
        language === 'ml'
          ? 'ശരിയായ തൂക്കം നൽകുക'
          : 'Please enter a valid produced weight in kg',
        'warning'
      );
      return;
    }

    try {
      setIsSubmitting(true);
      setShouldOpenPackingAfter(thenPack);

      const updated = await repo.updateProductionRun({
        runId: batch.id,
        actualQuantity: finalKg,
        plannedQuantity: batch.plannedQuantity,
        productionDate: batch.productionDate,
        operatorName: staffName || batch.operatorName || 'Kitchen Staff',
        notes: batch.notes,
        ingredientsConsumed: batch.ingredientsConsumed,
      });

      triggerRefresh();
      setShowSuccessAnim(true);
      if (onSuccess) {
        onSuccess(updated);
      }
    } catch (err: any) {
      console.error('Failed to update produced quantity', err);
      addToast(err?.message || 'Failed to update produced kg', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSuccessAnimComplete = () => {
    setShowSuccessAnim(false);
    addToast(
      language === 'ml'
        ? `${batch.productName}: ${producedKg} kg തൂക്കം രേഖപ്പെടുത്തി!`
        : `Recorded ${producedKg} kg produced for ${batch.productName}!`,
      'success'
    );
    onClose();
    if (shouldOpenPackingAfter && onOpenPacking && batch) {
      onOpenPacking({
        ...batch,
        actualQuantity: producedKg,
      });
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2.5">
          <span className="p-2.5 rounded-2xl bg-amber-500/15 text-amber-600 dark:text-amber-400">
            <TbScale className="w-5 h-5 stroke-[2.5]" />
          </span>
          <div>
            <h2 className="text-base sm:text-lg font-black text-stone-900 dark:text-white leading-tight font-malayalam">
              {isPostCreationPrompt
                ? language === 'ml'
                  ? 'ഉൽപ്പാദിപ്പിച്ച തൂക്കം എത്രയാണ്?'
                  : 'How Much Was Produced?'
                : language === 'ml'
                ? 'ഉൽപ്പാദിപ്പിച്ച തൂക്കം രേഖപ്പെടുത്തുക'
                : 'Record Produced Weight'}
            </h2>
            <p className="text-xs text-stone-500 dark:text-stone-400 font-medium font-malayalam">
              {batch.productName} • {batch.productionDate}
            </p>
          </div>
        </div>
      }
      size="md"
      overlay={
        <BatchSuccessAnimation
          isVisible={showSuccessAnim}
          onComplete={handleSuccessAnimComplete}
          message={language === 'ml' ? 'തൂക്കം രേഖപ്പെടുത്തി!' : 'Produced Weight Saved!'}
          subMessage={`${producedKg} kg • ${batch.productName}`}
        />
      }
    >
      <div className="space-y-4 pb-2">
        {/* Banner for post-creation flow */}
        {isPostCreationPrompt && (
          <div className="p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 flex items-start gap-2.5">
            <TbAlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-900 dark:text-amber-200 font-medium font-malayalam leading-relaxed">
              {language === 'ml'
                ? 'ബാച്ച് വിജയകരമായി തുടങ്ങി! തയ്യാറായ finished snack തൂക്കി എത്ര kg ഉണ്ടെന്ന് താഴെ നൽകുക.'
                : 'Batch created! Weigh the finished output and scroll the scale to enter kilograms produced.'}
            </p>
          </div>
        )}

        {/* Scrollable Scale from Step 2 */}
        <div className="p-4 rounded-3xl bg-stone-50/70 dark:bg-[#141212]/70 border border-stone-200/80 dark:border-[#282323] shadow-xs">
          <MeasurementRulerSelector
            title={language === 'ml' ? 'ഉൽപ്പാദിപ്പിച്ച അളവ്' : 'Production Quantity'}
            subtitle={language === 'ml' ? `ടാർഗെറ്റ്: ${planned} kg` : `Target: ${planned} kg`}
            unit={batch.unit || 'kg'}
            value={producedKg}
            onChange={(val) => setProducedKg(val)}
            min={0}
            max={250}
            step={0.5}
            presets={[0.5, 1, 2, 5, 10, 25, 50, 100]}
            hideHeader={false}
          />

          {/* Planned Target vs Difference Stats */}
          <div className="flex items-center justify-between gap-3 mt-3 pt-3 border-t border-stone-200 dark:border-[#282323] text-xs">
            <span className="text-stone-500 dark:text-stone-400 font-bold font-mono">
              Target: <strong className="text-stone-900 dark:text-white">{planned} kg</strong>
            </span>

            <span
              className={`inline-flex items-center gap-1 font-bold px-2.5 py-0.5 rounded-full ${
                difference >= 0
                  ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/50'
                  : 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/50'
              }`}
            >
              {difference >= 0 ? <TbTrendingUp className="w-3.5 h-3.5" /> : <TbTrendingDown className="w-3.5 h-3.5" />}
              <span>{difference >= 0 ? `+${difference}` : difference} kg</span>
            </span>

            <span className="text-stone-500 dark:text-stone-400 font-bold font-mono">
              Yield: <strong className="text-stone-900 dark:text-white">{yieldPercent}%</strong>
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-2.5 pt-2">
          {/* Primary Action 1: Save & Add Packets Next */}
          <Button
            type="button"
            variant="primary"
            onClick={() => handleCommit(true)}
            isLoading={isSubmitting && shouldOpenPackingAfter}
            disabled={isSubmitting}
            className="flex-1 font-bold py-3.5 rounded-2xl flex items-center justify-center gap-2 shadow-sm order-1 cursor-pointer press-apple"
          >
            <TbPackage className="w-5 h-5 stroke-[2.2]" />
            <span className="font-malayalam">
              {language === 'ml' ? 'സേവ് ചെയ്ത് പാക്കറ്റുകൾ ചേർക്കുക' : 'Save & Add Packets'}
            </span>
          </Button>

          {/* Primary Action 2: Save Only */}
          <Button
            type="button"
            variant="secondary"
            onClick={() => handleCommit(false)}
            isLoading={isSubmitting && !shouldOpenPackingAfter}
            disabled={isSubmitting}
            className="font-bold py-3.5 px-5 rounded-2xl flex items-center justify-center gap-2 border border-stone-300 dark:border-[#2E2828] order-2 cursor-pointer press-apple"
          >
            <TbCheck className="w-5 h-5 stroke-[2.5] text-emerald-600 dark:text-emerald-400" />
            <span className="font-malayalam">
              {language === 'ml' ? 'സേവ് ചെയ്യുക' : 'Save Weight'}
            </span>
          </Button>
        </div>
      </div>
    </Modal>
  );
};
