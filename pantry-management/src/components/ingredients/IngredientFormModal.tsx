import React, { useState, useEffect } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Ingredient, IngredientCategory, UnitType } from '../../types';
import { useApp } from '../../context/AppContext';
import { useLanguage } from '../../context/LanguageContext';
import { TbTrash } from 'react-icons/tb';

interface IngredientFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  ingredientToEdit?: Ingredient | null;
  onSuccess: () => void;
}

export const IngredientFormModal: React.FC<IngredientFormModalProps> = ({
  isOpen,
  onClose,
  ingredientToEdit,
  onSuccess,
}) => {
  const { repo, staffName, addToast } = useApp();
  const { t, language } = useLanguage();

  const [name, setName] = useState('');
  const [category, setCategory] = useState<IngredientCategory>('other');
  const [unit, setUnit] = useState<string>('kg');
  const [customUnit, setCustomUnit] = useState('');
  const [isCustomUnit, setIsCustomUnit] = useState(false);
  const [openingStock, setOpeningStock] = useState<number | string>(0);
  const [minStock, setMinStock] = useState<number | string>(0);
  const [notes, setNotes] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (ingredientToEdit) {
      setName(ingredientToEdit.name);
      setCategory(ingredientToEdit.category || 'other');
      const standardUnits = ['kg', 'g', 'L', 'ml', 'pcs', 'packs', 'rolls'];
      if (standardUnits.includes(ingredientToEdit.unit)) {
        setUnit(ingredientToEdit.unit);
        setIsCustomUnit(false);
        setCustomUnit('');
      } else {
        setUnit('custom');
        setIsCustomUnit(true);
        setCustomUnit(ingredientToEdit.unit);
      }
      setOpeningStock(0);
      setMinStock(ingredientToEdit.minStock || 0);
      setNotes(ingredientToEdit.notes || '');
      setIsActive(ingredientToEdit.isActive !== false);
    } else {
      setName('');
      setCategory('other');
      setUnit('kg');
      setIsCustomUnit(false);
      setCustomUnit('');
      setOpeningStock(0);
      setMinStock(0);
      setNotes('');
      setIsActive(true);
    }
  }, [ingredientToEdit, isOpen]);

  const effectiveUnit = (isCustomUnit ? customUnit.trim() : unit) || 'kg';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      addToast(language === 'ml' ? 'ചേരുവയുടെ പേര് നൽകുക' : 'Ingredient name is required', 'error');
      return;
    }
    if (isCustomUnit && !customUnit.trim()) {
      addToast(language === 'ml' ? 'അളവ് യൂണിറ്റ് നൽകുക' : 'Please specify measurement unit', 'error');
      return;
    }
    if (Number(minStock) < 0 || Number(openingStock) < 0) {
      addToast(language === 'ml' ? 'അളവുകൾ പൂജ്യത്തിൽ കുറവാകരുത്' : 'Quantities cannot be negative', 'error');
      return;
    }

    try {
      setIsSubmitting(true);
      if (ingredientToEdit) {
        await repo.updateIngredient(ingredientToEdit.id, {
          name: name.trim(),
          category,
          unit: effectiveUnit,
          minStock: Number(minStock) || 0,
          notes: notes.trim() || undefined,
          isActive,
        });
        addToast(
          language === 'ml'
            ? `ചേരുവ അപ്ഡേറ്റ് ചെയ്തു: ${name.trim()}`
            : `Updated ingredient: ${name.trim()}`,
          'success'
        );
      } else {
        const created = await repo.createIngredient({
          name: name.trim(),
          category,
          unit: effectiveUnit,
          currentStock: 0,
          minStock: Number(minStock) || 0,
          avgCostPerUnit: 0,
          isActive,
          notes: notes.trim() || undefined,
        });

        // If user explicitly entered valid opening stock > 0, record opening movement
        const openingStockNum = Number(openingStock) || 0;
        if (openingStockNum > 0) {
          await repo.adjustStock({
            ingredientId: created.id,
            quantityDelta: openingStockNum,
            reason: 'Opening stock balance',
            operatorName: staffName || 'Operator',
          });
        }

        addToast(
          language === 'ml'
            ? `പുതിയ ചേരുവ ചേർത്തു: ${name.trim()}`
            : `Added ingredient: ${name.trim()}`,
          'success'
        );
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      addToast(err?.message || 'Failed to save ingredient', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!ingredientToEdit) return;
    const confirmMsg =
      language === 'ml'
        ? `ഈ ചേരുവ നീക്കം ചെയ്യണോ: "${ingredientToEdit.name}"?`
        : `Are you sure you want to delete or deactivate "${ingredientToEdit.name}"?`;

    if (!window.confirm(confirmMsg)) return;

    try {
      setIsDeleting(true);
      const res = await repo.safeDeleteIngredient(ingredientToEdit.id);
      if (res.deleted) {
        addToast(
          language === 'ml' ? 'ചേരുവ നീക്കം ചെയ്തു' : 'Ingredient safely deleted',
          'success'
        );
      } else {
        addToast(
          language === 'ml'
            ? 'റെക്കോർഡുകളിൽ ഉള്ളതിനാൽ ചേരുവ നിർജ്ജീവമാക്കി'
            : 'Ingredient in production history: marked inactive to protect audit trail',
          'info'
        );
      }
      onSuccess();
      onClose();
    } catch (err: any) {
      addToast(err?.message || 'Failed to delete ingredient', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        ingredientToEdit
          ? (language === 'ml' ? 'ചേരുവ തിരുത്തുക' : 'Edit Ingredient')
          : (language === 'ml' ? 'പുതിയ ചേരുവ ചേർക്കുക' : 'Add Ingredient')
      }
      description={
        language === 'ml'
          ? 'സ്നാക്ക് നിർമ്മാണത്തിനുള്ള അസംസ്കൃത വസ്തുക്കളുടെ വിവരങ്ങൾ'
          : 'Configure ingredient details, category, and measurement unit.'
      }
      maxWidth="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Item Name */}
        <Input
          label={language === 'ml' ? 'ചേരുവയുടെ പേര്' : 'Ingredient Name'}
          placeholder={language === 'ml' ? 'ഉദാ: കടല പൊടി 99, വെളിച്ചെണ്ണ...' : 'e.g. Gram Flour 99, Coconut Oil...'}
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        {/* Category & Unit */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Select
            label={language === 'ml' ? 'വിഭാഗം' : 'Category'}
            value={category}
            onChange={(e) => setCategory(e.target.value as IngredientCategory)}
            options={[
              {
                value: 'basic',
                label: language === 'ml' ? 'പ്രധാന ചേരുവ' : 'Category A: Basic Raw Materials',
              },
              {
                value: 'other',
                label: language === 'ml' ? 'മറ്റു ചേരുവകൾ' : 'Category B: Other Seasonings & Pack',
              },
            ]}
          />

          <div>
            <Select
              label={language === 'ml' ? 'അളവ് യൂണിറ്റ്' : 'Measurement Unit'}
              value={isCustomUnit ? 'custom' : unit}
              onChange={(e) => {
                if (e.target.value === 'custom') {
                  setIsCustomUnit(true);
                } else {
                  setIsCustomUnit(false);
                  setUnit(e.target.value);
                }
              }}
              options={[
                { value: 'kg', label: language === 'ml' ? 'കിലോഗ്രാം (kg)' : 'Kilogram (kg)' },
                { value: 'g', label: language === 'ml' ? 'ഗ്രാം (g)' : 'Gram (g)' },
                { value: 'L', label: language === 'ml' ? 'ലിറ്റർ (L)' : 'Liter (L)' },
                { value: 'ml', label: language === 'ml' ? 'മില്ലിലിറ്റർ (ml)' : 'Milliliter (ml)' },
                { value: 'pcs', label: language === 'ml' ? 'എണ്ണം' : 'Pieces' },
                { value: 'packs', label: language === 'ml' ? 'പാക്കറ്റ്' : 'Packets' },
                { value: 'rolls', label: language === 'ml' ? 'റോൾ' : 'Rolls' },
                { value: 'custom', label: language === 'ml' ? 'മറ്റൊരു യൂണിറ്റ്...' : 'Other unit...' },
              ]}
            />
            {isCustomUnit && (
              <div className="mt-2">
                <Input
                  placeholder={language === 'ml' ? 'യൂണിറ്റ് പേര് (ഉദാ: bag, tin)' : 'Enter unit name (e.g. bag, tin)'}
                  value={customUnit}
                  onChange={(e) => setCustomUnit(e.target.value)}
                  required
                />
              </div>
            )}
          </div>
        </div>

        {/* Quantities */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {!ingredientToEdit ? (
            <div>
              <Input
                label={language === 'ml' ? 'തുടക്ക സ്റ്റോക്ക്' : 'Opening Stock (Optional)'}
                type="number"
                step="any"
                min="0"
                value={openingStock === 0 ? '' : openingStock}
                onChange={(e) => setOpeningStock(e.target.value === '' ? '' : parseFloat(e.target.value))}
                helperText={
                  language === 'ml'
                    ? 'തുടക്കത്തിൽ ഉള്ള സ്റ്റോക്ക് ഉണ്ടെങ്കിൽ മാത്രം നൽകുക'
                    : 'Only enter if valid stock currently exists'
                }
              />
            </div>
          ) : (
            <div className="p-3 bg-stone-50 dark:bg-[#141212] rounded-xl border border-charcoal-border dark:border-[#2E2828] transition-colors">
              <span className="text-xs text-charcoal-muted dark:text-stone-400 block">{t('currentStock')}</span>
              <span className="text-lg font-bold text-stone-900 dark:text-white">
                {ingredientToEdit.currentStock} {ingredientToEdit.unit}
              </span>
              <span className="text-[11px] text-charcoal-muted dark:text-stone-400 block mt-0.5">
                {language === 'ml' ? 'സ്റ്റോക്ക് മാറ്റങ്ങൾക്ക് സ്റ്റോക്ക് ലെഡ്ജർ ഉപയോഗിക്കുക' : 'Adjust via stock ledger'}
              </span>
            </div>
          )}

          <Input
            label={language === 'ml' ? 'കുറഞ്ഞ സ്റ്റോക്ക് മുന്നറിയിപ്പ്' : 'Min Stock Alert'}
            type="number"
            step="any"
            min="0"
            value={minStock === 0 ? '' : minStock}
            onChange={(e) => setMinStock(e.target.value === '' ? '' : parseFloat(e.target.value))}
            helperText={language === 'ml' ? 'ഈ അളവിൽ താഴെ ആയാൽ മുന്നറിയിപ്പ്' : 'Low stock threshold'}
          />
        </div>

        {/* Active Toggle (when editing) */}
        {ingredientToEdit && (
          <div className="flex items-center justify-between p-3 bg-stone-50 dark:bg-[#141212] rounded-xl border border-charcoal-border dark:border-[#2E2828] transition-colors">
            <div>
              <p className="text-xs font-bold text-charcoal dark:text-white">
                Status (Active / Inactive)
              </p>
              <p className="text-[11px] text-charcoal-muted dark:text-stone-400">
                {isActive
                  ? (language === 'ml' ? 'ഈ ചേരുവ ഉൽപ്പാദനത്തിൽ തിരഞ്ഞെടുക്കാം' : 'Available for recipes and production')
                  : (language === 'ml' ? 'നിർജ്ജീവമാക്കിയതിനാൽ ലിസ്റ്റിൽ കാണിക്കില്ല' : 'Deactivated from production list')}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                role="switch"
                aria-checked={isActive}
                onClick={() => setIsActive(!isActive)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-epso-red/30 ${
                  isActive ? 'bg-epso-red' : 'bg-stone-300 dark:bg-stone-700'
                }`}
                title={isActive ? 'Active' : 'Inactive'}
              >
                <span
                  aria-hidden="true"
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                    isActive ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
              <span className={`text-xs font-bold ${isActive ? 'text-epso-red dark:text-amber-400' : 'text-stone-400 dark:text-stone-500'}`}>
                {isActive ? (language === 'ml' ? 'സജീവം' : 'Active') : (language === 'ml' ? 'നിർജ്ജീവം' : 'Inactive')}
              </span>
            </div>
          </div>
        )}

        {/* Notes */}
        <Input
          label={t('notes')}
          placeholder={language === 'ml' ? 'കുറിപ്പുകൾ (ഓപ്ഷണൽ)' : 'Optional notes (supplier, grade, storage)'}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />

        {/* Actions */}
        <div className="flex items-center justify-between gap-3 pt-3 border-t border-charcoal-border/70">
          {ingredientToEdit ? (
            <Button
              type="button"
              variant="danger"
              size="sm"
              onClick={handleDelete}
              isLoading={isDeleting}
              icon={<TbTrash className="w-4 h-4" />}
            >
              {t('deleteIngredient')}
            </Button>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              {language === 'ml' ? 'റദ്ദാക്കുക' : 'Cancel'}
            </Button>
            <Button type="submit" variant="primary" isLoading={isSubmitting}>
              {ingredientToEdit
                ? (language === 'ml' ? 'സൂക്ഷിക്കുക' : 'Save Changes')
                : (language === 'ml' ? 'ചേർക്കുക' : 'Add Ingredient')}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
};
