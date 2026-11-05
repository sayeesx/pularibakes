import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { useLanguage } from '../context/LanguageContext';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { GridCardSkeleton } from '../components/ui/BatchCardSkeleton';
import { RecipeViewModal } from '../components/recipes/RecipeViewModal';
import { Product, Recipe, Ingredient } from '../types';
import {
  TbSearch,
  TbBook,
  TbCheck,
} from 'react-icons/tb';

export const ProductsPage: React.FC = () => {
  const { repo, dataVersion, addToast } = useApp();
  const { t, language } = useLanguage();

  const [products, setProducts] = useState<Product[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);

  // Read-only Recipe Modal
  const [isRecipeModalOpen, setIsRecipeModalOpen] = useState<boolean>(false);
  const [selectedProductForRecipe, setSelectedProductForRecipe] = useState<Product | null>(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        setLoading(true);
        const [pList, rList, iList] = await Promise.all([
          repo.listProducts(true),
          repo.listRecipes(),
          repo.listIngredients(false),
        ]);
        if (mounted) {
          setProducts(pList);
          setRecipes(rList);
          setIngredients(iList);
        }
      } catch (err: any) {
        console.error('Error loading products', err);
        addToast(err?.message || 'Failed to load products', 'error');
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, [repo, dataVersion, addToast]);

  const filteredProducts = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.sku && p.sku.toLowerCase().includes(q))
    );
  }, [products, searchTerm]);

  return (
    <div className="space-y-4 max-w-4xl mx-auto pb-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-stone-900 dark:text-white tracking-tight flex items-center gap-2">
            <span>{t.navProducts}</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-950/60 text-epso-red dark:text-red-300 font-bold">
              {products.length}
            </span>
          </h1>
          <p className="text-xs text-stone-500 dark:text-stone-400">
            {language === 'ml'
              ? 'എപ്സോ ഉൽപ്പന്നങ്ങളുടെ കാറ്റലോഗും നിലവിലെ സ്റ്റോക്കും'
              : 'Pulari Bakes snack product catalogue & stock inventory'}
          </p>
        </div>
      </div>

      {/* Search Bar */}
      <Input
        placeholder="Search snack product name or SKU..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        leftAddon={<TbSearch className="w-4 h-4 text-stone-400" />}
      />

      {/* Loading state: shimmer skeleton effect */}
      {loading ? (
        <GridCardSkeleton count={6} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {filteredProducts.map((prod) => {
            const recipe = recipes.find((r) => r.productId === prod.id && r.isActive);
            const hasRecipe = Boolean(recipe);

            return (
              <Card
                key={prod.id}
                padding="md"
                className={`flex flex-col justify-between transition-all space-y-3 ${
                  prod.isActive
                    ? 'hover:border-epso-red/40 dark:hover:border-epso-red/50'
                    : 'bg-stone-50/80 dark:bg-[#181515] border-dashed opacity-75'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="w-10 h-10 rounded-full bg-stone-100 dark:bg-[#221E1E] border border-stone-200/80 dark:border-[#2C2727] flex items-center justify-center shrink-0 shadow-2xs">
                        <img
                          src="/epso-icon-grey.png"
                          alt=""
                          className="w-6 h-6 object-contain opacity-50 dark:opacity-40 select-none pointer-events-none"
                        />
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <h3 className="text-sm font-black text-stone-900 dark:text-white leading-tight font-malayalam">
                            {prod.name}
                          </h3>
                          {!prod.isActive && (
                            <span className="text-[10px] font-bold text-stone-500 bg-stone-200 dark:bg-stone-800 px-1.5 py-0.5 rounded">
                              Inactive
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] font-semibold text-stone-500 dark:text-stone-400 mt-0.5">
                          SKU: {prod.sku || 'N/A'} • Unit: {prod.unit}
                        </p>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-base font-black text-stone-900 dark:text-white">
                        {prod.currentStock} {prod.unit}
                      </span>
                      <p className="text-[10px] text-stone-400 font-semibold">in stock</p>
                    </div>
                  </div>

                  {/* Read-only Recipe information view */}
                  <div className="mt-2.5 flex items-center gap-2">
                    {hasRecipe ? (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedProductForRecipe(prod);
                          setIsRecipeModalOpen(true);
                        }}
                        className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-800 dark:text-emerald-300 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/40 border border-emerald-300 dark:border-emerald-800 px-2.5 py-1 rounded-lg transition-colors cursor-pointer press-apple shadow-2xs"
                        title={language === 'ml' ? 'റെസിപ്പി ചേരുവകൾ കാണുക' : 'View bill of materials recipe'}
                      >
                        <TbBook className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                        <span>{language === 'ml' ? 'റെസിപ്പി കാണുക' : 'View Recipe Formula'}</span>
                      </button>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-stone-400 dark:text-stone-500 bg-stone-100 dark:bg-[#1E1B1B] px-2.5 py-1 rounded-lg">
                        {language === 'ml' ? 'റെസിപ്പി ക്രമീകരിച്ചിട്ടില്ല' : 'No Recipe Configured'}
                      </span>
                    )}
                  </div>
                </div>

                {/* Operations Footer (Read-Only) */}
                <div className="flex items-center justify-between pt-2 border-t border-charcoal-border/50 dark:border-[#2E2828] text-xs">
                  <div className="flex items-center gap-1.5">
                    {prod.isActive ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                        <TbCheck className="w-3.5 h-3.5" />
                        <span>{language === 'ml' ? 'സജീവം' : 'Active'}</span>
                      </span>
                    ) : (
                      <span className="text-[11px] font-semibold text-stone-400 dark:text-stone-500">
                        {language === 'ml' ? 'നിർജ്ജീവം' : 'Inactive'}
                      </span>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Read-Only Recipe View Modal for Kitchen Staff */}
      <RecipeViewModal
        isOpen={isRecipeModalOpen}
        onClose={() => {
          setIsRecipeModalOpen(false);
          setSelectedProductForRecipe(null);
        }}
        product={selectedProductForRecipe}
        recipe={recipes.find((r) => r.productId === selectedProductForRecipe?.id && r.isActive)}
        ingredients={ingredients}
      />
    </div>
  );
};
