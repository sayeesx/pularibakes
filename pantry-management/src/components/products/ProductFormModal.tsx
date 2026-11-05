import React, { useState, useEffect } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Product, UnitType } from '../../types';
import { useApp } from '../../context/AppContext';
import { useLanguage } from '../../context/LanguageContext';
import { TbBook } from 'react-icons/tb';

interface ProductFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  productToEdit?: Product | null;
  onSuccess: () => void;
  onOpenRecipe?: (product: Product) => void;
}

export const ProductFormModal: React.FC<ProductFormModalProps> = ({
  isOpen,
  onClose,
  productToEdit,
  onSuccess,
  onOpenRecipe,
}) => {
  const { repo, addToast } = useApp();
  const { language } = useLanguage();
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [description, setDescription] = useState('');
  const [unit, setUnit] = useState<UnitType>('kg');
  const [currentStock, setCurrentStock] = useState<number | string>(0);
  const [wholesalePrice, setWholesalePrice] = useState<number>(0);
  const [isActive, setIsActive] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (productToEdit) {
      setName(productToEdit.name);
      setSku(productToEdit.sku || '');
      setDescription(productToEdit.description || '');
      setUnit(productToEdit.unit);
      setCurrentStock(productToEdit.currentStock);
      setWholesalePrice(productToEdit.wholesalePrice || 0);
      setIsActive(productToEdit.isActive);
    } else {
      setName('');
      setSku(`PULARI-PRD-${Math.floor(100 + Math.random() * 900)}`);
      setDescription('');
      setUnit('kg');
      setCurrentStock(0);
      setWholesalePrice(0);
      setIsActive(true);
    }
  }, [productToEdit, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      addToast(
        language === 'ml' ? 'ഉൽപ്പന്നത്തിന്റെ പേര് നൽകുക' : 'Product name is required',
        'error'
      );
      return;
    }

    try {
      setIsSubmitting(true);
      if (productToEdit) {
        await repo.updateProduct(productToEdit.id, {
          name: name.trim(),
          sku: sku.trim() || undefined,
          description: description.trim() || undefined,
          unit,
          currentStock: Number(currentStock) || 0,
          wholesalePrice,
          isActive,
        });
        addToast(
          language === 'ml'
            ? `ഉൽപ്പന്നം അപ്ഡേറ്റ് ചെയ്തു: ${name.trim()}`
            : `Updated product: ${name.trim()}`,
          'success'
        );
      } else {
        await repo.createProduct({
          name: name.trim(),
          sku: sku.trim() || undefined,
          description: description.trim() || undefined,
          recipeId: '',
          unit,
          currentStock: Number(currentStock) || 0,
          wholesalePrice,
          isActive,
        });
        addToast(
          language === 'ml'
            ? `പുതിയ ഉൽപ്പന്നം ചേർത്തു: ${name.trim()}`
            : `Added new snack product: ${name.trim()}`,
          'success'
        );
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      addToast(err?.message || (language === 'ml' ? 'സേവ് ചെയ്യാൻ കഴിഞ്ഞില്ല' : 'Failed to save product'), 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        productToEdit
          ? (language === 'ml' ? 'ഉൽപ്പന്നം തിരുത്തുക' : 'Edit Product')
          : (language === 'ml' ? 'പുതിയ ഉൽപ്പന്നം ചേർക്കുക' : 'Add New Snack Product')
      }
      description={
        language === 'ml'
          ? 'സ്നാക്ക് ഇനത്തിന്റെ വിവരങ്ങൾ, യൂണിറ്റ്, സ്റ്റോക്ക് എന്നിവ ക്രമീകരിക്കുക.'
          : 'Manage finished snack line details, SKU, and wholesale selling rate.'
      }
      maxWidth="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Product Name */}
        <Input
          label={language === 'ml' ? 'ഉൽപ്പന്നത്തിന്റെ പേര്' : 'Product Name'}
          placeholder={language === 'ml' ? 'ഉദാ: 3kg കിറ്റ് മിക്സ്ചർ, ബനാന ചിപ്സ്...' : 'e.g. Kerala Banana Chips'}
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <div className="grid grid-cols-2 gap-3">
          <Input
            label={language === 'ml' ? 'എസ്.കെ.യു കോഡ്' : 'SKU Code'}
            placeholder="e.g. PULARI-BAN-01"
            value={sku}
            onChange={(e) => setSku(e.target.value)}
          />

          <Select
            label={language === 'ml' ? 'സ്റ്റോക്ക് യൂണിറ്റ്' : 'Unit of Stock'}
            value={unit}
            onChange={(e) => setUnit(e.target.value as UnitType)}
            options={[
              { value: 'kg', label: language === 'ml' ? 'കിലോഗ്രാം' : 'Kilograms' },
              { value: 'packs', label: language === 'ml' ? 'പാക്കറ്റ്' : 'Packs' },
            ]}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Input
              label={language === 'ml' ? 'മൊത്തവില (₹)' : 'Wholesale Selling Price (₹)'}
              type="number"
              value={wholesalePrice}
              readOnly
              disabled
              leftAddon="₹"
              helperText={language === 'ml' ? 'അഡ്മിൻ മാനേജ് ചെയ്യുന്നു' : 'Managed by Admin'}
              className="opacity-75 cursor-not-allowed bg-stone-100 dark:bg-[#181616]"
            />
          </div>

          <Input
            label={language === 'ml' ? 'കൈവശമുള്ള ഫിനിഷ്ഡ് സ്റ്റോക്ക്' : 'Current Finished Stock'}
            type="number"
            step="0.5"
            min="0"
            value={currentStock === 0 ? '' : currentStock}
            onChange={(e) => setCurrentStock(e.target.value === '' ? '' : parseFloat(e.target.value))}
            rightAddon={unit}
          />
        </div>

        <Input
          label={language === 'ml' ? 'വിവരണം' : 'Product Description (Optional)'}
          placeholder={language === 'ml' ? 'ഉദാ: ശുദ്ധമായ വെളിച്ചെണ്ണയിൽ വറുത്ത പലഹാരം...' : 'e.g. Crispy snack fried in pure oil'}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        {/* Recipe Configuration Shortcut if editing product */}
        {productToEdit && onOpenRecipe && (
          <div className="p-3 bg-orange-50 dark:bg-orange-950/30 rounded-xl border border-orange-200 dark:border-orange-900/40 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-orange-100 dark:bg-orange-950/60 text-epso-orange flex items-center justify-center shrink-0">
                <TbBook className="w-4 h-4" />
              </div>
              <div>
                <h5 className="text-xs font-black text-stone-900 dark:text-white leading-tight font-malayalam">
                  {language === 'ml' ? 'റെസിപ്പി ചേരുവകൾ ക്രമീകരിക്കുക' : 'Recipe Ingredients'}
                </h5>
                <p className="text-[11px] text-stone-500 dark:text-stone-400 font-medium">
                  {language === 'ml'
                    ? 'പ്രൊഡക്ഷൻ സമയത്ത് ചേരുവകൾ സ്വയം വരാൻ ഇവിടെ ചേർക്കാം'
                    : 'Configure ingredients used automatically during production'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenRecipe(productToEdit);
              }}
              className="px-3 py-1.5 rounded-lg bg-white dark:bg-[#1E1B1B] text-epso-orange border border-orange-300 dark:border-orange-800 text-xs font-extrabold hover:bg-orange-50 transition-colors press-apple cursor-pointer shrink-0"
            >
              {language === 'ml' ? 'ചേരുവകൾ' : 'Ingredients'}
            </button>
          </div>
        )}

        {/* Status Active / Inactive switch */}
        <div className="flex items-center justify-between p-3 bg-stone-50 dark:bg-[#141212] rounded-xl border border-charcoal-border dark:border-[#2E2828] transition-colors">
          <div>
            <span className="text-xs font-bold text-charcoal dark:text-white">Status (Active / Inactive)</span>
            <p className="text-[11px] text-charcoal-muted dark:text-stone-400">
              {isActive
                ? (language === 'ml' ? 'ഈ ഉൽപ്പന്നം ഉൽപ്പാദനത്തിൽ തിരഞ്ഞെടുക്കാം' : 'Available for daily batch logging and reports')
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
            >
              <span
                aria-hidden="true"
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                  isActive ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
            <span className={`text-xs font-bold ${isActive ? 'text-epso-red dark:text-amber-400' : 'text-stone-400 dark:text-stone-500'}`}>
              {isActive ? 'Active' : 'Inactive'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3 pt-3 border-t border-charcoal-border/70">
          <Button type="button" variant="secondary" fullWidth onClick={onClose}>
            {language === 'ml' ? 'റദ്ദാക്കുക' : 'Cancel'}
          </Button>
          <Button type="submit" variant="primary" fullWidth isLoading={isSubmitting}>
            {productToEdit
              ? (language === 'ml' ? 'സൂക്ഷിക്കുക' : 'Save Changes')
              : (language === 'ml' ? 'ഉൽപ്പന്നം ചേർക്കുക' : 'Create Product')}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
