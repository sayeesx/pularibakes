import React from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Recipe, Ingredient, Product } from '../../types';
import { useLanguage } from '../../context/LanguageContext';
import { TbBook, TbChefHat, TbLayersLinked, TbNotes, TbLock } from 'react-icons/tb';

interface RecipeViewModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: Product | null;
  recipe?: Recipe | null;
  ingredients: Ingredient[];
}

export const RecipeViewModal: React.FC<RecipeViewModalProps> = ({
  isOpen,
  onClose,
  product,
  recipe,
  ingredients,
}) => {
  const { language } = useLanguage();

  if (!product) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-orange-100 dark:bg-orange-950/60 text-epso-orange flex items-center justify-center font-bold">
            <TbBook className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-base font-bold text-stone-900 dark:text-white font-malayalam">
              {product.name} - {language === 'ml' ? 'റെസിപ്പി വിവരങ്ങൾ' : 'Recipe Formula'}
            </h2>
            <p className="text-[11px] text-stone-500 dark:text-stone-400">
              {language === 'ml'
                ? 'ഉൽപ്പാദനത്തിന് ആവശ്യമായ ചേരുവകളുടെ അനുപാതം'
                : 'Standard Bill of Materials for production batch'}
            </p>
          </div>
        </div>
      }
      maxWidth="md"
    >
      <div className="space-y-4 text-xs">
        {/* Admin only notice */}
        <div className="p-2.5 rounded-xl bg-stone-100 dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#2E2828] flex items-center gap-2 text-stone-600 dark:text-stone-400">
          <TbLock className="w-4 h-4 text-amber-500 shrink-0" />
          <p className="text-[11px]">
            {language === 'ml'
              ? 'റെസിപ്പികളും ചേരുവകളുടെ അളവുകളും മാറ്റാൻ അഡ്മിൻ പാനൽ ഉപയോഗിക്കുക.'
              : 'Formulas and ingredient quantities can only be modified from Admin Dashboard.'}
          </p>
        </div>

        {!recipe || !recipe.ingredients || recipe.ingredients.length === 0 ? (
          <div className="text-center py-8 text-stone-400 dark:text-stone-500 space-y-2">
            <TbChefHat className="w-8 h-8 mx-auto text-stone-300 dark:text-stone-600" />
            <p className="font-malayalam">
              {language === 'ml'
                ? 'ഈ ഉൽപ്പന്നത്തിന് റെസിപ്പി ക്രമീകരിച്ചിട്ടില്ല (അഡ്മിനെ ബന്ധപ്പെടുക)'
                : 'No recipe configured yet. Please request Admin to configure BOM.'}
            </p>
          </div>
        ) : (
          <>
            {/* Base Batch Output Info */}
            <div className="p-3 bg-red-50/60 dark:bg-red-950/30 rounded-xl border border-red-200 dark:border-red-900/50 flex items-center justify-between">
              <div>
                <span className="text-[11px] text-stone-500 dark:text-stone-400 uppercase font-bold tracking-wider">
                  {language === 'ml' ? 'അടിസ്ഥാന ബാച്ച് ഉൽപ്പാദനം' : 'Base Batch Output'}
                </span>
                <p className="text-base font-black text-epso-red dark:text-amber-400 mt-0.5">
                  {recipe.baseOutputQuantity} {recipe.baseOutputUnit}
                </p>
              </div>
              <div className="text-right text-[11px] text-stone-500">
                <span>Version {recipe.version || 1}</span>
              </div>
            </div>

            {/* Ingredients Table */}
            <div>
              <div className="flex items-center gap-1.5 font-bold text-stone-800 dark:text-stone-200 mb-2">
                <TbLayersLinked className="w-4 h-4 text-epso-orange" />
                <span>
                  {language === 'ml' ? 'ആവശ്യമായ ചേരുവകൾ' : 'Required Ingredients'} ({recipe.ingredients.length})
                </span>
              </div>

              <div className="border border-stone-200 dark:border-[#2E2828] rounded-xl overflow-hidden divide-y divide-stone-200 dark:divide-[#2E2828]">
                {recipe.ingredients.map((ri, idx) => {
                  const ingObj = ingredients.find((i) => i.id === ri.ingredientId);
                  const ingName = ingObj?.name || ri.ingredientName || 'Unknown Ingredient';
                  const currentStock = ingObj?.currentStock ?? 0;
                  const isDepleted = currentStock <= 0;
                  const isLow = currentStock > 0 && currentStock < ri.quantity;

                  return (
                    <div
                      key={ri.ingredientId || idx}
                      className="p-2.5 flex items-center justify-between bg-white dark:bg-[#1E1B1B] hover:bg-stone-50 dark:hover:bg-[#282323] transition-colors"
                    >
                      <div className="flex-1 min-w-0 pr-2">
                        <p className="font-bold text-stone-900 dark:text-white font-malayalam truncate">
                          {idx + 1}. {ingName}
                        </p>
                        <p className="text-[10px] text-stone-400 mt-0.5">
                          {language === 'ml' ? 'ലഭ്യമായ സ്റ്റോക്ക്' : 'Available Stock'}:{' '}
                          <span
                            className={`font-bold ${
                              isDepleted
                                ? 'text-red-500'
                                : isLow
                                ? 'text-amber-500'
                                : 'text-emerald-500'
                            }`}
                          >
                            {currentStock} {ri.unit}
                          </span>
                        </p>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="font-black text-stone-900 dark:text-white text-sm">
                          {ri.quantity}
                        </span>
                        <span className="text-[11px] font-bold text-stone-500 dark:text-stone-400 ml-1">
                          {ri.unit}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Preparation Notes / Instructions if any */}
            {(recipe.instructions || recipe.notes) && (
              <div className="p-3 bg-stone-50 dark:bg-[#1E1B1B] rounded-xl border border-stone-200 dark:border-[#2E2828] space-y-1">
                <div className="flex items-center gap-1 font-bold text-stone-700 dark:text-stone-300">
                  <TbNotes className="w-3.5 h-3.5 text-stone-500" />
                  <span>{language === 'ml' ? 'നിർദ്ദേശങ്ങൾ / കുറിപ്പുകൾ' : 'Preparation Instructions'}</span>
                </div>
                <p className="text-[11px] text-stone-600 dark:text-stone-400 font-malayalam whitespace-pre-line">
                  {recipe.instructions || recipe.notes}
                </p>
              </div>
            )}
          </>
        )}

        <div className="pt-2 flex justify-end">
          <Button variant="secondary" onClick={onClose}>
            {language === 'ml' ? 'അടയ്ക്കുക' : 'Close'}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
