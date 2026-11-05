import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { useLanguage } from '../context/LanguageContext';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { GridCardSkeleton } from '../components/ui/BatchCardSkeleton';
import { Ingredient } from '../types';
import {
  TbCarrot,
  TbSearch,
  TbAlertTriangle,
  TbCheck,
  TbBuildingStore,
} from 'react-icons/tb';
import { RecordPurchaseModal } from '../components/ingredients/RecordPurchaseModal';

export const IngredientsPage: React.FC = () => {
  const { repo, dataVersion, triggerRefresh } = useApp();
  const { language } = useLanguage();

  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isPurchaseModalOpen, setIsPurchaseModalOpen] = useState(false);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        setLoading(true);
        const data = await repo.listIngredients(showInactive);
        if (mounted) setIngredients(data);
      } catch (err) {
        console.error('Failed to load ingredients:', err);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, [repo, dataVersion, showInactive]);

  const filteredIngredients = useMemo(() => {
    return ingredients.filter((ing) => {
      if (!showInactive && ing.isActive === false) return false;
      const matchSearch = ing.name.toLowerCase().includes(searchTerm.toLowerCase());
      if (!matchSearch) return false;
      return true;
    });
  }, [ingredients, searchTerm, showInactive]);

  return (
    <div className="space-y-4 max-w-lg md:max-w-5xl mx-auto pb-10 animate-fade-in">
      {/* Header and Inactive Filter Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-stone-900 dark:text-white tracking-tight flex items-center gap-2">
            <span>{language === 'ml' ? 'ചേരുവകൾ' : 'Ingredients Catalogue'}</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-950/60 text-epso-red dark:text-red-300 font-bold">
              {ingredients.length}
            </span>
          </h1>
          <p className="text-xs text-stone-500 dark:text-stone-400">
            {language === 'ml'
              ? 'ചേരുവകളുടെ കാറ്റലോഗും നിലവിലെ സ്റ്റോക്കും'
              : 'Ingredients catalogue & live inventory stock'}
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setIsPurchaseModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-sm cursor-pointer"
          >
            <TbBuildingStore className="w-4 h-4" />
            <span>{language === 'ml' ? '+ പർച്ചേസ്' : '+ Record Purchase'}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowInactive(!showInactive)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold shrink-0 transition-colors ${
              showInactive
                ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-300 border border-amber-300 dark:border-amber-800'
                : 'bg-stone-100 dark:bg-[#1E1B1B] text-stone-600 dark:text-stone-400 border border-stone-200 dark:border-[#2E2828] hover:text-stone-800 dark:hover:text-stone-200'
            }`}
          >
            {showInactive
              ? (language === 'ml' ? 'നിർജ്ജീവമായവ ഉൾപ്പെടുത്തിയിരിക്കുന്നു' : 'Showing Inactive')
              : (language === 'ml' ? 'നിർജ്ജീവമായവ കാണിക്കുക' : 'Show Inactive')}
          </button>
        </div>
      </div>

      {/* Search Input */}
      <Input
        placeholder={language === 'ml' ? 'ചേരുവയുടെ പേര് തിരയുക...' : 'Search ingredient name...'}
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        leftAddon={<TbSearch className="w-4 h-4 text-stone-400" />}
      />

      {/* Ingredient Items Grid */}
      {loading ? (
        <GridCardSkeleton count={6} columns="grid-cols-1 sm:grid-cols-2 lg:grid-cols-3" />
      ) : filteredIngredients.length === 0 ? (
        <Card className="text-center py-12 text-stone-500 dark:text-stone-400 text-sm space-y-2">
          <TbCarrot className="w-8 h-8 text-stone-400 dark:text-stone-600 mx-auto" />
          <p>
            {searchTerm
              ? (language === 'ml' ? `"${searchTerm}" എന്ന പേരിൽ ചേരുവകൾ ലഭ്യമല്ല` : `No ingredients found matching "${searchTerm}"`)
              : (language === 'ml' ? 'ചേരുവകൾ ലഭ്യമല്ല' : 'No ingredients available')}
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredIngredients.map((ing) => {
            const isLow = ing.currentStock <= ing.minStock;
            return (
              <Card
                key={ing.id}
                padding="md"
                className={`flex flex-col justify-between transition-all ${
                  !ing.isActive
                    ? 'bg-stone-50/80 dark:bg-[#181515] border-dashed opacity-75'
                    : isLow
                    ? 'border-amber-300 dark:border-amber-800/80 bg-amber-50/20 dark:bg-amber-950/10'
                    : 'hover:border-stone-300 dark:hover:border-stone-700'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <h3 className="font-bold text-stone-900 dark:text-white text-sm truncate font-malayalam">
                          {ing.name}
                        </h3>
                        {!ing.isActive && (
                          <span className="text-[10px] font-bold text-stone-500 bg-stone-200 dark:bg-stone-800 px-1.5 py-0.5 rounded">
                            Inactive
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-stone-400 dark:text-stone-500 font-mono">
                        {language === 'ml' ? 'മിനിമം സ്റ്റോക്ക്' : 'Min Stock'}: {ing.minStock} {ing.unit}
                      </p>
                    </div>

                    <div className="text-right shrink-0">
                      <div
                        className={`text-base font-black ${
                          ing.currentStock <= 0
                            ? 'text-red-600 dark:text-red-400'
                            : isLow
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-stone-900 dark:text-white'
                        }`}
                      >
                        {ing.currentStock} {ing.unit}
                      </div>
                      <p className="text-[10px] text-stone-400 font-semibold">
                        ₹{ing.avgCostPerUnit.toFixed(2)}/{ing.unit}
                      </p>
                    </div>
                  </div>

                  {ing.notes && (
                    <p className="mt-1 text-[11px] text-stone-500 dark:text-stone-400 italic truncate">
                      {ing.notes}
                    </p>
                  )}
                </div>

                {/* Stock Status Footer */}
                <div className="flex items-center justify-between pt-2.5 mt-3 border-t border-charcoal-border/50 dark:border-[#2E2828] text-xs">
                  {ing.currentStock <= 0 ? (
                    <span className="text-[11px] font-extrabold text-red-600 dark:text-red-400 flex items-center gap-1">
                      <TbAlertTriangle className="w-3.5 h-3.5" />
                      <span>{language === 'ml' ? 'സ്റ്റോക്ക് തീർന്നു' : 'Out of Stock'}</span>
                    </span>
                  ) : isLow ? (
                    <span className="text-[11px] font-extrabold text-amber-600 dark:text-amber-400 flex items-center gap-1">
                      <TbAlertTriangle className="w-3.5 h-3.5" />
                      <span>{language === 'ml' ? 'കുറഞ്ഞ സ്റ്റോക്ക്' : 'Low Stock Alert'}</span>
                    </span>
                  ) : (
                    <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                      <TbCheck className="w-3.5 h-3.5" />
                      <span>{language === 'ml' ? 'സ്റ്റോക്ക് ലഭ്യമാണ്' : 'In Stock'}</span>
                    </span>
                  )}

                  <span className="text-[10px] text-stone-400 dark:text-stone-500 font-medium">
                    {ing.category === 'basic' ? 'Basic' : 'Other'}
                  </span>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Record Purchase Modal */}
      <RecordPurchaseModal
        isOpen={isPurchaseModalOpen}
        onClose={() => setIsPurchaseModalOpen(false)}
        onSuccess={() => triggerRefresh()}
      />
    </div>
  );
};
