import React, { useState, useMemo } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { NumberStepper } from '../ui/NumberStepper';
import { Badge } from '../ui/Badge';
import { Recipe, Ingredient } from '../../types';
import { scaleRecipeIngredients, roundCurrency } from '../../services/costing';
import { TbCheck, TbPencil, TbBuildingFactory2, TbPackage } from 'react-icons/tb';

interface RecipeDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  recipe: Recipe | null;
  ingredients: Ingredient[];
  onEditClick: (recipe: Recipe) => void;
  onStartProductionClick: (productId: string, plannedOutputKg: number) => void;
}

export const RecipeDetailModal: React.FC<RecipeDetailModalProps> = ({
  isOpen,
  onClose,
  recipe,
  ingredients,
  onEditClick,
  onStartProductionClick,
}) => {
  const [testOutputKg, setTestOutputKg] = useState<number>(20);

  // Set initial test output to base output
  React.useEffect(() => {
    if (recipe) {
      setTestOutputKg(recipe.baseOutputQuantity * 2);
    }
  }, [recipe, isOpen]);

  const ingredientCostMap = useMemo(() => {
    const map: Record<string, number> = {};
    ingredients.forEach((ing) => {
      map[ing.id] = ing.avgCostPerUnit;
    });
    return map;
  }, [ingredients]);

  const scaledItems = useMemo(() => {
    if (!recipe) return [];
    return scaleRecipeIngredients(recipe, testOutputKg);
  }, [recipe, testOutputKg]);

  const estimatedBatchCost = useMemo(() => {
    return roundCurrency(
      scaledItems.reduce((acc, item) => {
        const unitCost = ingredientCostMap[item.ingredientId] || 0;
        return acc + item.expectedQuantity * unitCost;
      }, 0)
    );
  }, [scaledItems, ingredientCostMap]);

  const costPerKg = testOutputKg > 0 ? roundCurrency(estimatedBatchCost / testOutputKg) : 0;

  if (!recipe) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={recipe.productName}
      description={`Formulation v${recipe.version} • Base Standard: ${recipe.baseOutputQuantity} ${recipe.baseOutputUnit}`}
      maxWidth="md"
    >
      <div className="space-y-4">
        {/* Interactive Scaling Simulator */}
        <div className="p-3.5 bg-red-50/70 dark:bg-red-950/30 border border-red-200/70 dark:border-red-900/40 rounded-2xl space-y-2.5 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-epso-red dark:text-amber-400 uppercase tracking-wider">
              Proportional Scaling Simulator
            </span>
            <Badge variant="default" size="sm">
              {(testOutputKg / recipe.baseOutputQuantity).toFixed(1)}x Scale
            </Badge>
          </div>

          <NumberStepper
            value={testOutputKg}
            onChange={setTestOutputKg}
            min={1}
            step={5}
            unit="kg"
          />

          <div className="flex items-center justify-between text-xs pt-1 border-t border-red-200/50 dark:border-red-900/40">
            <span className="text-charcoal-muted dark:text-stone-400">Estimated Material Cost:</span>
            <span className="font-extrabold text-stone-900 dark:text-white text-sm">
              ₹{estimatedBatchCost.toFixed(2)} (₹{costPerKg.toFixed(2)}/kg)
            </span>
          </div>
        </div>

        {/* Scaled Ingredients Checklist */}
        <div>
          <h4 className="text-xs font-bold text-charcoal dark:text-stone-300 uppercase tracking-wider mb-2">
            Ingredients for {testOutputKg} kg Batch
          </h4>

          <div className="divide-y divide-charcoal-border/50 dark:divide-[#2E2828] border border-charcoal-border dark:border-[#2E2828] rounded-2xl bg-white dark:bg-[#1E1B1B] overflow-hidden max-h-56 overflow-y-auto">
            {scaledItems.map((item) => {
              const unitCost = ingredientCostMap[item.ingredientId] || 0;
              const lineCost = roundCurrency(item.expectedQuantity * unitCost);

              return (
                <div key={item.ingredientId} className="p-3 flex items-center justify-between hover:bg-stone-50 dark:hover:bg-[#282323] transition-colors">
                  <div className="flex items-center gap-2.5">
                    <div className="w-5 h-5 rounded-md bg-red-100 dark:bg-red-950/60 text-epso-red dark:text-red-300 flex items-center justify-center shrink-0">
                      <TbCheck className="w-3.5 h-3.5 stroke-[3]" />
                    </div>
                    <div>
                      <span className="text-sm font-bold text-charcoal dark:text-white leading-tight font-malayalam">
                        {item.ingredientName}
                      </span>
                      <span className="block text-[11px] text-charcoal-muted dark:text-stone-400">
                        Cost basis: ₹{unitCost.toFixed(2)} / {item.unit}
                      </span>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-sm font-extrabold text-epso-red dark:text-amber-400">
                      {item.expectedQuantity} {item.unit}
                    </span>
                    <p className="text-[11px] text-charcoal-muted dark:text-stone-400 font-medium">₹{lineCost.toFixed(2)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Recipe notes */}
        {recipe.notes && (
          <div className="p-3 bg-stone-50 dark:bg-[#141212] rounded-xl border border-charcoal-border dark:border-[#2E2828] text-xs">
            <span className="font-bold text-charcoal dark:text-white block mb-0.5">Technique & Instructions:</span>
            <p className="text-charcoal-muted dark:text-stone-400 whitespace-pre-wrap">{recipe.notes}</p>
          </div>
        )}

        {/* Assigned Packets */}
        {recipe.packets && recipe.packets.length > 0 && (
          <div className="p-3 bg-stone-50 dark:bg-[#141212] rounded-xl border border-charcoal-border dark:border-[#2E2828] text-xs space-y-1.5">
            <span className="font-bold text-charcoal dark:text-white flex items-center gap-1.5">
              <TbPackage className="w-3.5 h-3.5 text-epso-orange" />
              <span>Assigned Packets ({recipe.packets.length}):</span>
            </span>
            <div className="flex flex-wrap gap-1.5">
              {recipe.packets.map((pkt, pIdx) => (
                <span
                  key={pIdx}
                  className="px-2 py-0.5 rounded-lg bg-white dark:bg-[#1E1B1B] border border-charcoal-border/60 dark:border-[#2E2828] text-stone-700 dark:text-stone-300 font-semibold text-[11px]"
                >
                  {pkt.packetName}{' '}
                  <span className="text-stone-400 font-normal">
                    (₹{pkt.costPerPacket?.toFixed(2)}/pkt)
                  </span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Modal Actions */}
        <div className="flex items-center gap-2.5 pt-3 border-t border-charcoal-border/70 dark:border-[#2E2828]">
          <Button
            variant="secondary"
            fullWidth
            onClick={() => {
              onClose();
              onEditClick(recipe);
            }}
            icon={<TbPencil className="w-4 h-4" />}
          >
            Edit Formula
          </Button>

          <Button
            variant="primary"
            fullWidth
            onClick={() => {
              onClose();
              onStartProductionClick(recipe.productId, testOutputKg);
            }}
            icon={<TbBuildingFactory2 className="w-4 h-4" />}
          >
            Start Batch ({testOutputKg}kg)
          </Button>
        </div>
      </div>
    </Modal>
  );
};
