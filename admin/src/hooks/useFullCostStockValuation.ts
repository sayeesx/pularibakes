import { useEffect, useMemo, useState } from 'react';
import { Product, ProductionRun } from '../types';
import {
  fetchDailyClosings,
  fetchPackingRecords,
  fetchDailyWages,
  fetchPacketTypes,
  fetchStockMovements,
  fetchIngredients,
} from '../services/supabase';
import { roundCurrency, isBasicIngredientName } from '../services/costing';

/**
 * Full-cost stock valuation.
 *
 * Cost per kg for each product is computed with the SAME formula used by the
 * Production Costing page (all-time view):
 *   (ingredients + oil + basic ingredients + cooking wages + packing wages + packaging material) / total kg produced
 *
 * Total valuation = Σ (product current stock kg × full cost per kg)
 */
export function useFullCostStockValuation(products: Product[], productionRuns: ProductionRun[]) {
  const [costPerKgMap, setCostPerKgMap] = useState<Record<string, number>>({});

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const [closings, allPackingRecords, wageList, packetTypesList, movementsList, ingredientsList] = await Promise.all([
          fetchDailyClosings(90).catch(() => [] as any[]),
          fetchPackingRecords({ limit: 500 }).catch(() => [] as any[]),
          fetchDailyWages(90).catch(() => [] as any[]),
          fetchPacketTypes().catch(() => [] as any[]),
          fetchStockMovements(false).catch(() => [] as any[]),
          fetchIngredients().catch(() => [] as any[]),
        ]);

        const pCostMap: Record<string, number> = {};
        for (const pt of packetTypesList || []) {
          if (pt.name) {
            pCostMap[pt.name.toLowerCase().trim()] = Number(pt.costPerPacket) || 0;
          }
        }

        const wageMap: Record<string, any> = {};
        for (const w of wageList || []) {
          wageMap[w.productionDate] = w;
        }

        const closingMap: Record<string, any> = {};
        for (const c of closings || []) {
          closingMap[c.productionDate] = c;
        }

        // Map ingredients by id and lowercase name for unit cost lookup
        const ingCostMap = new Map<string, number>();
        for (const ing of ingredientsList || []) {
          if (ing.id) ingCostMap.set(ing.id, Number(ing.avgCostPerUnit) || 0);
          if (ing.name) ingCostMap.set(ing.name.toLowerCase().trim(), Number(ing.avgCostPerUnit) || 0);
        }

        // Compute daily basic ingredients consumption cost by date
        // Basic ingredients: ഉപ്പ്, പഞ്ചസാര (Sugar)
        const basicCostByDate: Record<string, number> = {};
        for (const m of movementsList || []) {
          if ((m.quantity || 0) >= 0) continue;
          const itemName = (m.itemName || '').toLowerCase().trim();
          const reason = (m.reason || '').toLowerCase();

          const isBasic = isBasicIngredientName(itemName) || reason.includes('daily basic ingredient usage');
          if (!isBasic) continue;

          // Exclude oil (tracked separately via daily closings)
          if (itemName.includes('ഓയിൽ') || itemName.includes('oil')) continue;

          const isConsumption =
            m.movementType === 'production_consumption' ||
            reason.includes('daily basic ingredient usage');
          if (!isConsumption) continue;

          const dateMatch = m.reason?.match(/\b(\d{4}-\d{2}-\d{2})\b/);
          const movDate = dateMatch ? dateMatch[1] : (m.createdAt ? m.createdAt.split('T')[0] : '');
          if (!movDate) continue;

          const qtyKg = m.unit?.toLowerCase() === 'g' ? Math.abs(m.quantity) / 1000 : Math.abs(m.quantity);
          const unitCost = (m.costPerUnit && m.costPerUnit > 0)
            ? m.costPerUnit
            : (ingCostMap.get(m.itemId) || ingCostMap.get(itemName) || 0);
          const cost = roundCurrency(qtyKg * unitCost);

          basicCostByDate[movDate] = roundCurrency((basicCostByDate[movDate] || 0) + cost);
        }

        const completedRuns = productionRuns.filter((r) => r.status === 'completed');
        const map: Record<string, number> = {};

        for (const prod of products) {
          const pRuns = completedRuns.filter((r) => r.productId === prod.id);
          const totalKg = pRuns.reduce((sum, r) => sum + (r.actualQuantity || 0), 0);
          if (totalKg <= 0) {
            map[prod.id] = 0;
            continue;
          }

          // Ingredients cost from runs (exclude basic ingredients to avoid double-counting)
          let ingredientCost = 0;
          for (const run of pRuns) {
            if (run.ingredientsConsumed && Array.isArray(run.ingredientsConsumed) && run.ingredientsConsumed.length > 0) {
              for (const ing of run.ingredientsConsumed) {
                if (isBasicIngredientName(ing.ingredientName || '')) continue;
                ingredientCost += ing.totalCost || 0;
              }
            } else if (run.totalIngredientCost) {
              ingredientCost += run.totalIngredientCost;
            }
          }
          ingredientCost = roundCurrency(ingredientCost);

          // Packaging material cost
          const prodPacking = (allPackingRecords || []).filter((pr: any) => pr.productId === prod.id);
          const packagingMaterialCost = roundCurrency(
            prodPacking.reduce((sum: number, pr: any) => {
              const sizeKey = (pr.packetSize || '').toLowerCase().trim();
              const unitCost = Number(pr.coverUnitCost) || pCostMap[sizeKey] || 0;
              const cost =
                pr.packagingCost && pr.packagingCost > 0
                  ? Number(pr.packagingCost)
                  : roundCurrency((pr.packetsPacked || 0) * unitCost);
              return sum + cost;
            }, 0)
          );

          // Oil, basic ingredients, cooking wages, and packing wages: proportional to production weight on respective dates
          let oilCost = 0;
          let basicIngredientsCost = 0;
          let productionWages = 0;
          let packingWages = 0;

          for (const run of pRuns) {
            const rDate = run.productionDate;
            const closing = rDate ? closingMap[rDate] : null;
            const wage = rDate ? wageMap[rDate] : null;

            const dayRuns = completedRuns.filter((r) => r.productionDate === rDate);
            const dayTotalKg = dayRuns.reduce((s, r) => s + (r.actualQuantity || 0), 0);
            const ratio = dayTotalKg > 0 ? (run.actualQuantity || 0) / dayTotalKg : 1;

            if (closing && closing.oilConsumed > 0) {
              const dayOilCost = roundCurrency(closing.oilConsumed * (closing.oilCostPerKg || 150));
              oilCost += roundCurrency(dayOilCost * ratio);
            }

            const dayBasicCost = basicCostByDate[rDate] || 0;
            if (dayBasicCost > 0) {
              basicIngredientsCost += roundCurrency(dayBasicCost * ratio);
            }

            const dayProdWages = wage?.productionWageAmount ?? (closing?.productionWages || 0);
            productionWages += roundCurrency(dayProdWages * ratio);

            const dayPackWages = wage?.packingWageAmount ?? 0;
            if (dayPackWages > 0) {
              packingWages += roundCurrency(dayPackWages * ratio);
            }
          }

          const totalManufacturingCost = roundCurrency(
            ingredientCost +
              roundCurrency(oilCost) +
              roundCurrency(basicIngredientsCost) +
              roundCurrency(productionWages) +
              roundCurrency(packingWages) +
              packagingMaterialCost
          );

          map[prod.id] = roundCurrency(totalManufacturingCost / totalKg);
        }

        if (!cancelled) setCostPerKgMap(map);
      } catch (err) {
        console.error('Failed to compute full-cost stock valuation:', err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [products, productionRuns]);

  const totalValuation = useMemo(() => {
    return roundCurrency(
      products.reduce((acc, p) => acc + Math.max(0, p.currentStock || 0) * (costPerKgMap[p.id] || 0), 0)
    );
  }, [products, costPerKgMap]);

  return { costPerKgMap, totalValuation };
}
