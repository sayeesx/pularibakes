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
} from 'react-icons/tb';

export const IngredientsPage: React.FC = () => {
  const { repo, dataVersion } = useApp();
  const { language } = useLanguage();

  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [loading, setLoading] = useState(true);

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
    <div className="space-y-4 max-w-lg md:max-w-5xl mx-auto pb-10">
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

        <button
          type="button"
          onClick={() => setShowInactive(!showInactive)}
          className={`px-3 py-1.5 rounded-xl text-xs font-semibold shrink-0 transition-colors self-start sm:self-auto ${
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
              ? (language === 'ml' ? 'തിരഞ്ഞ ചേരുവ കണ്ടെത്തിയില്ല' : 'No ingredients match your search')
              : (language === 'ml' ? 'ചേരുവകൾ ഒന്നും രേഖപ്പെടുത്തിയിട്ടില്ല' : 'No ingredients in catalogue')}
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredIngredients.map((ing) => {
            const isLow = ing.minStock > 0 && ing.currentStock <= ing.minStock;

            return (
              <Card
                key={ing.id}
                padding="sm"
                className={`flex flex-col justify-between transition-all hover:border-epso-red/50 dark:hover:border-epso-red/50 ${
                  ing.isActive === false
                    ? 'opacity-60 bg-stone-50 dark:bg-[#181515] border-dashed'
                    : isLow
                    ? 'border-red-300 dark:border-red-900/60 bg-red-50/20 dark:bg-red-950/10'
                    : ''
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 flex-1 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-stone-100 dark:bg-[#221E1E] border border-stone-200/80 dark:border-[#2C2727] flex items-center justify-center shrink-0 shadow-2xs">
                        <img
                          src="/pulari-logo.jpg"
                          alt=""
                          className="w-6 h-6 object-contain opacity-50 dark:opacity-40 select-none pointer-events-none"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        {ing.isActive === false && (
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-stone-200 dark:bg-stone-800 text-stone-700 dark:text-stone-300">
                              Inactive
                            </span>
                          </div>
                        )}

                        <h3 className="text-base font-bold text-stone-900 dark:text-white leading-snug break-words font-malayalam">
                          {ing.name}
                        </h3>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span
                        className={`text-lg font-black ${
                          isLow ? 'text-red-600 dark:text-red-400' : 'text-stone-900 dark:text-white'
                        }`}
                      >
                        {ing.currentStock}
                      </span>
                      <span className="text-xs font-bold text-stone-500 dark:text-stone-400 ml-1">
                        {ing.unit}
                      </span>
                      {isLow && (
                        <p className="text-[10px] text-red-600 dark:text-red-400 font-extrabold flex items-center justify-end gap-0.5">
                          <TbAlertTriangle className="w-3 h-3" />
                          <span>{language === 'ml' ? 'കുറഞ്ഞ സ്റ്റോക്ക്' : 'Low Stock'}</span>
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Stock context & notes */}
                  <div className="mt-2.5 pt-2 border-t border-charcoal-border/40 dark:border-[#2E2828] flex items-center justify-between text-[11px] text-stone-500 dark:text-stone-400">
                    <span>
                      {language === 'ml' ? 'അളവ് യൂണിറ്റ്' : 'Unit'}: <strong className="text-stone-800 dark:text-stone-200">{ing.unit}</strong>
                    </span>
                    {ing.minStock > 0 && (
                      <span>
                        {language === 'ml' ? 'അലേർട്ട് പരിധി' : 'Alert'}: {ing.minStock} {ing.unit}
                      </span>
                    )}
                  </div>

                  {ing.notes && (
                    <p className="mt-1 text-[11px] text-stone-500 dark:text-stone-400 italic truncate">
                      {ing.notes}
                    </p>
                  )}
                </div>

                {/* Stock Status Footer (Read-Only) */}
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
    </div>
  );
};
