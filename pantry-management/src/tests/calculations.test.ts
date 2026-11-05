import { describe, it, expect } from 'vitest';
import {
  roundTo,
  roundStock,
  roundCurrency,
  scaleRecipeIngredients,
  computeBatchUsageSummary,
  computeBatchMetrics,
  calculateWeightedAverageCost,
  calculateContinuousOilExpense,
  calculateDailyOilUsage,
  allocateDailySharedExpenses,
  calculateFinalProductCosting,
} from '../services/costing';
import { Recipe } from '../types';

describe('Pulari Bakes Precision Calculation Engine Tests', () => {
  // 1. DECIMAL & CURRENCY SAFETY
  describe('Rounding & Decimal Precision', () => {
    it('rounds numbers without floating point drift', () => {
      expect(roundTo(0.1 + 0.2, 2)).toBe(0.3);
      expect(roundStock(1.0005)).toBe(1.001);
      expect(roundCurrency(10.256)).toBe(10.26);
      expect(roundCurrency(10.254)).toBe(10.25);
    });
  });

  // 2. RECIPE SCALING & BATCH INGREDIENT USAGE
  describe('Production Recipe Scaling', () => {
    const mockRecipe: Recipe = {
      id: 'rec-dal-mixture',
      productId: 'prod-dal-mixture',
      productName: 'ദാൽ മിക്സ്ചർ',
      version: 1,
      baseOutputQuantity: 10, // 10 kg base
      baseOutputUnit: 'kg',
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ingredients: [
        { ingredientId: 'ing-rice', ingredientName: 'അരിപ്പൊടി പൊള്ളാച്ചി', quantity: 3, unit: 'kg' },
        { ingredientId: 'ing-maida', ingredientName: 'മൈദ', quantity: 2, unit: 'kg' },
        { ingredientId: 'ing-poola', ingredientName: 'പൂള പൊടി', quantity: 2, unit: 'kg' },
        { ingredientId: 'ing-masoor', ingredientName: 'മസൂർ', quantity: 2.5, unit: 'kg' },
        { ingredientId: 'ing-bsalt', ingredientName: 'Black Salt', quantity: 0.5, unit: 'kg' },
      ],
    };

    it('accurately scales recipe ingredients when planned quantity scales up (e.g. 10kg -> 25kg)', () => {
      // Scale from 10kg base to 25kg planned (2.5x multiplier)
      const scaled = scaleRecipeIngredients(mockRecipe, 25);
      expect(scaled).toHaveLength(5);

      const rice = scaled.find((i) => i.ingredientId === 'ing-rice')!;
      expect(rice.expectedQuantity).toBe(7.5); // 3 * 2.5 = 7.5

      const maida = scaled.find((i) => i.ingredientId === 'ing-maida')!;
      expect(maida.expectedQuantity).toBe(5.0); // 2 * 2.5 = 5.0

      const poola = scaled.find((i) => i.ingredientId === 'ing-poola')!;
      expect(poola.expectedQuantity).toBe(5.0); // 2 * 2.5 = 5.0

      const masoor = scaled.find((i) => i.ingredientId === 'ing-masoor')!;
      expect(masoor.expectedQuantity).toBe(6.25); // 2.5 * 2.5 = 6.25

      const bsalt = scaled.find((i) => i.ingredientId === 'ing-bsalt')!;
      expect(bsalt.expectedQuantity).toBe(1.25); // 0.5 * 2.5 = 1.25
    });

    it('computes usage, variances, and ingredient cost totals', () => {
      const scaled = scaleRecipeIngredients(mockRecipe, 10);
      const actuals: Record<string, number> = {
        'ing-rice': 3.2, // used 0.2 kg more
        'ing-maida': 2.0,
        'ing-poola': 1.9, // used 0.1 kg less
        'ing-masoor': 2.5,
        'ing-bsalt': 0.5,
      };
      const costs: Record<string, number> = {
        'ing-rice': 40,
        'ing-maida': 35,
        'ing-poola': 45,
        'ing-masoor': 90,
        'ing-bsalt': 80,
      };

      const usage = computeBatchUsageSummary(scaled, actuals, costs);
      expect(usage).toHaveLength(5);

      const riceUsage = usage.find((u) => u.ingredientId === 'ing-rice')!;
      expect(riceUsage.expectedQuantity).toBe(3);
      expect(riceUsage.actualQuantity).toBe(3.2);
      expect(riceUsage.differenceQuantity).toBe(0.2);
      expect(riceUsage.totalCost).toBe(roundCurrency(3.2 * 40)); // 128.00

      // Batch Metrics
      const metrics = computeBatchMetrics(usage, 10.5, 10);
      // Expected total cost = (3.2*40) + (2*35) + (1.9*45) + (2.5*90) + (0.5*80) = 128 + 70 + 85.5 + 225 + 40 = 548.5
      expect(metrics.totalIngredientCost).toBe(548.5);
      expect(metrics.costPerKg).toBe(roundCurrency(548.5 / 10.5));
      expect(metrics.yieldPercentage).toBe(105);
      expect(metrics.outputDifferenceKg).toBe(0.5);
    });
  });

  // 3. CONTINUOUS DAILY OIL CALCULATIONS (Oil Used, Oil Left, Oil for Tomorrow)
  describe('Continuous Daily Oil Calculations', () => {
    it('calculates oil used, oil left, and daily oil expense accurately', () => {
      // Scenario:
      // Yesterday leftover oil (opening today) = 20 kg
      // Today purchases added = 50 kg
      // Total available oil = 70 kg
      // Tonight closing oil left in pans (oil for tomorrow) = 18 kg
      // Cost per kg = 150 INR
      const opening = 20;
      const purchases = 50;
      const closing = 18;
      const costPerKg = 150;

      const { oilConsumedKg, oilTotalExpense } = calculateContinuousOilExpense(
        opening,
        purchases,
        closing,
        costPerKg
      );

      // Oil Used = (20 + 50) - 18 = 52 kg
      expect(oilConsumedKg).toBe(52);

      // Oil Expense = 52 kg * 150 INR = 7,800 INR
      expect(oilTotalExpense).toBe(7800);

      // Oil Left for tomorrow is the closing balance:
      const oilForTomorrow = closing;
      expect(oilForTomorrow).toBe(18);
    });

    it('handles zero consumption gracefully without negative numbers', () => {
      const { oilConsumedKg, oilTotalExpense } = calculateContinuousOilExpense(25, 0, 30, 150);
      // If closing is greater than available due to counting anomaly, consumed should clamp to 0
      expect(oilConsumedKg).toBe(0);
      expect(oilTotalExpense).toBe(0);
    });

    it('calculates oil stock using user formula: Final = Previous - Used + Leftover', () => {
      // User specifications:
      // - Previous available oil stock: 20 kg
      // - Oil used during production: 5 kg
      // - Leftover oil entered by the cook: 2 kg
      // - Final available oil stock: 17 kg (20 - 5 + 2 = 17)
      // - Net oil consumed: 3 kg
      // - Oil cost: 150 INR/kg -> total expense = 450 INR
      const res = calculateDailyOilUsage(20, 5, 2, 150);

      expect(res.previousAvailableStockKg).toBe(20);
      expect(res.oilUsedKg).toBe(5);
      expect(res.leftoverOilKg).toBe(2);
      expect(res.finalOilStockKg).toBe(17);
      expect(res.netOilConsumedKg).toBe(3);
      expect(res.oilTotalExpense).toBe(450);

      // Next day carry-forward:
      // 17 kg becomes the next day's previous available stock
      const day2 = calculateDailyOilUsage(res.finalOilStockKg, 4, 1, 150);
      expect(day2.previousAvailableStockKg).toBe(17);
      expect(day2.finalOilStockKg).toBe(14); // 17 - 4 + 1 = 14 kg
      expect(day2.netOilConsumedKg).toBe(3); // 4 - 1 = 3 kg
      expect(day2.oilTotalExpense).toBe(450);
    });

    it('clamps leftover oil if cook enters more than used oil', () => {
      // If used = 5 kg and cook erroneously enters leftover = 6 kg,
      // leftover is clamped to used (5 kg), net consumed = 0, final stock = 20 kg
      const res = calculateDailyOilUsage(20, 5, 6, 150);
      expect(res.leftoverOilKg).toBe(5);
      expect(res.netOilConsumedKg).toBe(0);
      expect(res.finalOilStockKg).toBe(20);
      expect(res.oilTotalExpense).toBe(0);
    });

    it('handles zero used and zero leftover without modifying stock', () => {
      const res = calculateDailyOilUsage(20, 0, 0, 150);
      expect(res.finalOilStockKg).toBe(20);
      expect(res.netOilConsumedKg).toBe(0);
      expect(res.oilTotalExpense).toBe(0);
    });

  });

  // 4. SHARED EXPENSES & WAGES ALLOCATION
  describe('Wages & Shared Daily Expense Allocation', () => {
    it('allocates shared oil and wages proportionally by production weight with exact reconciliation', () => {
      const productsSummary = [
        {
          productId: 'p-dal-mix',
          productName: 'ദാൽ മിക്സ്ചർ',
          totalProductionKg: 60, // 60% of total
          batchCount: 3,
          ingredientCost: 3200,
        },
        {
          productId: 'p-kadala-mix',
          productName: 'കടല മിക്സ്ചർ',
          totalProductionKg: 40, // 40% of total
          batchCount: 2,
          ingredientCost: 2400,
        },
      ];

      const dailyOilExpense = 3000;
      const dailyWages = 1500;
      const totalShared = dailyOilExpense + dailyWages; // 4500

      const allocations = allocateDailySharedExpenses(productsSummary, dailyOilExpense, dailyWages);
      expect(allocations).toHaveLength(2);

      const dalMix = allocations[0];
      expect(dalMix.allocatedOilCost).toBe(1800); // 60% of 3000
      expect(dalMix.allocatedProductionWages).toBe(900); // 60% of 1500
      expect(dalMix.totalProductionCost).toBe(3200 + 1800 + 900); // 5900
      expect(dalMix.productionCostPerKg).toBe(roundCurrency(5900 / 60)); // 98.33

      const kadalaMix = allocations[1];
      expect(kadalaMix.allocatedOilCost).toBe(1200); // 40% of 3000
      expect(kadalaMix.allocatedProductionWages).toBe(600); // 40% of 1500
      expect(kadalaMix.totalProductionCost).toBe(2400 + 1200 + 600); // 4200
      expect(kadalaMix.productionCostPerKg).toBe(roundCurrency(4200 / 40)); // 105.00

      // Sum of allocations must EXACTLY match the daily totals
      const totalAllocatedOil = allocations.reduce((s, a) => s + a.allocatedOilCost, 0);
      const totalAllocatedWages = allocations.reduce((s, a) => s + a.allocatedProductionWages, 0);
      expect(totalAllocatedOil).toBe(dailyOilExpense);
      expect(totalAllocatedWages).toBe(dailyWages);
    });

    it('guarantees penny/paisa reconciliation when weights divide with periodic fractions', () => {
      // 3 products with equal weights (1/3 each = 33.333...%)
      const productsSummary = [
        { productId: 'p1', productName: 'P1', totalProductionKg: 10, batchCount: 1, ingredientCost: 500 },
        { productId: 'p2', productName: 'P2', totalProductionKg: 10, batchCount: 1, ingredientCost: 500 },
        { productId: 'p3', productName: 'P3', totalProductionKg: 10, batchCount: 1, ingredientCost: 500 },
      ];

      const dailyOilExpense = 1000;
      const dailyWages = 500;

      const allocations = allocateDailySharedExpenses(productsSummary, dailyOilExpense, dailyWages);
      const totalAllocatedOil = allocations.reduce((s, a) => roundCurrency(s + a.allocatedOilCost), 0);
      const totalAllocatedWages = allocations.reduce((s, a) => roundCurrency(s + a.allocatedProductionWages), 0);

      expect(totalAllocatedOil).toBe(1000);
      expect(totalAllocatedWages).toBe(500);
    });
  });

  // 5. PACKET PACKAGING & MARGIN BREAKDOWN
  describe('Packet Packaging & Output Valuation', () => {
    it('accurately calculates bulk vs packed portions, packet costs, and unpacked bulk valuation', () => {
      const prodAllocation = {
        productId: 'p-dal',
        productName: 'ദാൽ മിക്സ്ചർ',
        totalProductionKg: 50,
        batchCount: 2,
        ingredientCost: 3500,
        allocatedOilCost: 1000,
        allocatedProductionWages: 500,
        totalProductionCost: 5000, // 5000 / 50kg = 100 INR/kg bulk cost
        productionCostPerKg: 100,
      };

      const packingRecords = [
        {
          packetSize: '200g',
          packetsPacked: 100, // 100 * 0.2kg = 20 kg bulk
          coverUnitCost: 2.0,
          packagingCost: 200,
          packingLabourRate: 1.0,
          packingLabourCost: 100,
          totalPackingCost: 300,
          weightPackedKg: 20,
        },
        {
          packetSize: '500g',
          packetsPacked: 20, // 20 * 0.5kg = 10 kg bulk
          coverUnitCost: 3.5,
          packagingCost: 70,
          packingLabourRate: 1.5,
          packingLabourCost: 30,
          totalPackingCost: 100,
          weightPackedKg: 10,
        },
      ];

      const finalCosting = calculateFinalProductCosting(prodAllocation, packingRecords);

      // Total weight packed = 20kg + 10kg = 30kg
      expect(finalCosting.totalWeightPackedKg).toBe(30);
      // Unpacked bulk stock = 50kg - 30kg = 20kg
      expect(finalCosting.unpackedKg).toBe(20);
      // Valuation of unpacked bulk stock = 20kg * 100 INR/kg = 2000 INR
      expect(finalCosting.unpackedValuation).toBe(2000);

      // Packet Cost Breakdown:
      // For 200g packet:
      // Bulk cost inside packet = 0.2kg * 100 = 20 INR
      // Packing cost inside packet = 300 / 100 = 3 INR
      // Total cost per 200g packet = 23 INR
      const p200 = finalCosting.packetsBySize.find((p) => p.size === '200g')!;
      expect(p200.costPerPacket).toBe(23);

      // For 500g packet:
      // Bulk cost inside packet = 0.5kg * 100 = 50 INR
      // Packing cost inside packet = 100 / 20 = 5 INR
      // Total cost per 500g packet = 55 INR
      const p500 = finalCosting.packetsBySize.find((p) => p.size === '500g')!;
      expect(p500.costPerPacket).toBe(55);
    });
  });

  // 6. WEIGHTED AVERAGE PURCHASE COST
  describe('Weighted Average Purchase Cost', () => {
    it('calculates weighted average cost correctly when stock is replenished', () => {
      // 50kg @ 40 INR/kg (value 2000)
      // buy 50kg @ 60 INR/kg (value 3000)
      // total 100kg, total value 5000 -> 50 INR/kg
      const newCost = calculateWeightedAverageCost(50, 40, 50, 60);
      expect(newCost).toBe(50);
    });
  });
});
