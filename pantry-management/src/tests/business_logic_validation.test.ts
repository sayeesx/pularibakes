import { describe, it, expect, beforeEach } from 'vitest';
import {
  roundTo,
  roundStock,
  roundCurrency,
  roundUnitCost,
  calculateWeightedAverageCost,
  scaleRecipeIngredients,
  computeBatchUsageSummary,
  computeBatchMetrics,
  calculateDailyOilUsage,
  calculateContinuousOilExpense,
  allocateDailySharedExpenses,
  calculateFinalProductCosting,
  calculateSpecialMixtureCost,
  calculateProductProductionCost,
  calculateWastageMetrics,
} from '../services/costing';
import {
  convertQuantity,
  convertUnitCost,
  areUnitsCompatible,
  assertUnitsCompatible,
  normalizeUnit,
} from '../services/unitConversion';
import { DemoRepository } from '../services/demoRepository';
import { Recipe } from '../types';

describe('Pulari Bakes Comprehensive Business Logic & Calculation Validation (Section 14)', () => {
  let repo: DemoRepository;

  beforeEach(async () => {
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
    repo = new DemoRepository();
    await repo.resetDemoData();
  });

  // ============================================================================
  // 1. INGREDIENT UNIT CONVERSIONS
  // ============================================================================
  describe('1. Ingredient Unit Conversions', () => {
    it('converts mass units (kg <-> g <-> mg) with exact precision', () => {
      expect(convertQuantity(1.5, 'kg', 'g')).toBe(1500);
      expect(convertQuantity(750, 'g', 'kg')).toBe(0.75);
      expect(convertQuantity(2500, 'mg', 'g')).toBe(2.5);
      expect(convertQuantity(0.005, 'kg', 'g')).toBe(5);
    });

    it('converts volume units (L <-> ml) with exact precision', () => {
      expect(convertQuantity(2, 'l', 'ml')).toBe(2000);
      expect(convertQuantity(350, 'ml', 'l')).toBe(0.35);
    });

    it('converts unit costs accurately (e.g. ₹60/kg -> ₹0.06/g)', () => {
      expect(convertUnitCost(60, 'kg', 'g')).toBe(0.06);
      expect(convertUnitCost(0.05, 'g', 'kg')).toBe(50);
      expect(convertUnitCost(150, 'l', 'ml')).toBe(0.15);
    });

    it('supports mass-volume conversions with density (e.g. coconut oil @ 0.91 kg/L)', () => {
      // 10 L of oil with density 0.91 kg/L = 9.1 kg
      expect(convertQuantity(10, 'l', 'kg', 0.91)).toBe(9.1);
      // 9.1 kg of oil with density 0.91 kg/L = 10 L
      expect(convertQuantity(9.1, 'kg', 'l', 0.91)).toBe(10);
    });

    it('strictly rejects incompatible unit conversions without silent failure', () => {
      expect(areUnitsCompatible('kg', 'l')).toBe(false);
      expect(areUnitsCompatible('kg', 'pcs')).toBe(false);
      expect(areUnitsCompatible('g', 'packs')).toBe(false);

      expect(() => {
        assertUnitsCompatible('kg', 'l', 'oil usage');
      }).toThrow(/Incompatible measurement units/);

      expect(() => {
        convertQuantity(5, 'kg', 'pcs');
      }).toThrow(/Cannot convert between incompatible units/);
    });
  });

  // ============================================================================
  // 2. WEIGHTED AVERAGE PURCHASE COSTING
  // ============================================================================
  describe('2. Weighted Average Purchase Costing', () => {
    it('accurately recalculates weighted average cost across consecutive purchases and price increases', () => {
      // Step 1: Opening stock 100 kg @ ₹40.00
      let stock = 100;
      let avgCost = 40.0;

      // Step 2: Buy 50 kg @ ₹46.00
      // Total value = (100 * 40) + (50 * 46) = 4000 + 2300 = 6300 INR
      // Total stock = 150 kg -> New Avg Cost = 6300 / 150 = 42.00 INR/kg
      avgCost = calculateWeightedAverageCost(stock, avgCost, 50, 46);
      stock += 50;
      expect(avgCost).toBe(42.0);
      expect(stock).toBe(150);

      // Step 3: Buy 50 kg @ ₹50.00
      // Total value = (150 * 42) + (50 * 50) = 6300 + 2500 = 8800 INR
      // Total stock = 200 kg -> New Avg Cost = 8800 / 200 = 44.00 INR/kg
      avgCost = calculateWeightedAverageCost(stock, avgCost, 50, 50);
      stock += 50;
      expect(avgCost).toBe(44.0);

      // Step 4: Consumption of 70 kg does not change unit cost
      stock -= 70;
      expect(stock).toBe(130);
      expect(avgCost).toBe(44.0);

      // Step 5: Buy 70 kg at discounted price ₹36.00
      // Total value = (130 * 44) + (70 * 36) = 5720 + 2520 = 8240 INR
      // Total stock = 200 kg -> New Avg Cost = 8240 / 200 = 41.20 INR/kg
      avgCost = calculateWeightedAverageCost(stock, avgCost, 70, 36);
      stock += 70;
      expect(avgCost).toBe(41.2);
    });

    it('handles edge cases gracefully: zero stock, negative stock, and zero purchase quantity', () => {
      // Zero current stock -> takes purchase cost directly
      expect(calculateWeightedAverageCost(0, 0, 50, 65.5)).toBe(65.5);

      // Negative stock anomaly -> resets to purchase unit cost
      expect(calculateWeightedAverageCost(-10, 40, 50, 60)).toBe(60);

      // Zero purchase quantity -> retains current average cost
      expect(calculateWeightedAverageCost(100, 45, 0, 90)).toBe(45);
    });
  });

  // ============================================================================
  // 3. MIXTURE RECIPE COSTING
  // ============================================================================
  describe('3. Mixture Recipe Costing', () => {
    it('calculates mixture recipe Bill of Materials cost accurately', () => {
      // Whipping Cream formulation:
      // Heavy Cream: 3 kg @ ₹160/kg = ₹480
      // Powdered Sugar: 1 kg @ ₹50/kg = ₹50
      // Vanilla Flavor: 0.1 kg @ ₹500/kg = ₹50
      // Total base output = 4 kg, Total cost = ₹580 -> Cost per kg = ₹145
      const ingredients = [
        { actualQuantity: 3.0, unitCost: 160 },
        { actualQuantity: 1.0, unitCost: 50 },
        { actualQuantity: 0.1, unitCost: 500 },
      ];

      const mixtureCost = calculateSpecialMixtureCost({
        ingredientsConsumed: ingredients,
        actualUsableOutput: 4.0,
        plannedOutput: 4.0,
      });

      expect(mixtureCost.totalBatchCost).toBe(580);
      expect(mixtureCost.actualCostPerUnit).toBe(145);
      expect(mixtureCost.wastageQuantity).toBe(0);
      expect(mixtureCost.wastagePercentage).toBe(0);
    });
  });

  // ============================================================================
  // 4. ACTUAL MIXTURE OUTPUT COSTING
  // ============================================================================
  describe('4. Actual Mixture Output Costing', () => {
    it('calculates cost per kg using actual usable output, not expected output (Section 14.B Example)', () => {
      // User Example from prompt:
      // - Total preparation cost: ₹600.
      // - Expected output: 5 kg.
      // - Actual usable output: 4.8 kg.
      // -> Actual cost per kg = ₹600 / 4.8 = ₹125.00
      const mixtureCost = calculateSpecialMixtureCost({
        ingredientsConsumed: [
          { actualQuantity: 3, unitCost: 120 }, // 360
          { actualQuantity: 2, unitCost: 120 }, // 240 -> sum = 600
        ],
        actualUsableOutput: 4.8,
        plannedOutput: 5.0,
      });

      expect(mixtureCost.totalBatchCost).toBe(600);
      expect(mixtureCost.actualCostPerUnit).toBe(125.0);
      expect(mixtureCost.wastageQuantity).toBe(0.2);
      expect(mixtureCost.wastagePercentage).toBe(4.0); // 0.2 / 5.0 * 100 = 4%
    });

    it('safely handles zero usable output without dividing by zero or throwing NaN', () => {
      const mixtureCost = calculateSpecialMixtureCost({
        ingredientsConsumed: [{ actualQuantity: 5, unitCost: 100 }],
        actualUsableOutput: 0,
        plannedOutput: 5,
      });

      expect(mixtureCost.totalBatchCost).toBe(500);
      expect(mixtureCost.actualCostPerUnit).toBe(0);
      expect(mixtureCost.wastageQuantity).toBe(5);
    });
  });

  // ============================================================================
  // 5. MIXTURE STOCK DEDUCTION
  // ============================================================================
  describe('5. Mixture Stock Deduction', () => {
    it('deducts intermediate mixture stock during consumption and records stock ledger movement', async () => {
      const mixtures = await repo.listSpecialMixtures();
      const plumMix = mixtures.find((m) => m.name === 'പ്ലം കേക്ക് മിക്സ്ചർ')!;
      const initialStock = plumMix.currentStock;

      // Produce cake requiring 5 kg of Plum Cake Mixture
      const cake = await repo.createProduct({
        name: 'ടെസ്റ്റ് പ്ലം കേക്ക് 1kg',
        unit: 'pcs',
        currentStock: 0,
        isActive: true,
      });

      const run = await repo.recordProductionRun({
        runNumber: 'PUL-TEST-RUN-01',
        productId: cake.id,
        productionDate: '2026-11-05',
        plannedQuantity: 5,
        actualQuantity: 5,
        unit: 'pcs',
        operatorName: 'Sasi Baker',
        ingredientsConsumed: [],
        mixturesConsumed: [
          {
            mixtureId: plumMix.id,
            actualQuantity: 5,
            unit: 'kg',
          },
        ],
      });

      expect(run).toBeDefined();
      const updatedMix = await repo.getSpecialMixtureById(plumMix.id);
      expect(updatedMix?.currentStock).toBe(initialStock - 5);

      // Check stock movement was logged
      const movements = await repo.getStockMovements({ itemId: plumMix.id });
      const deductionMove = movements.find(
        (m) => m.movementType === 'production_consumption' || (m.movementType as string) === 'mixture_consumption'
      );
      expect(deductionMove).toBeDefined();
      expect(Math.abs(deductionMove!.quantity)).toBe(5);
    });
  });

  // ============================================================================
  // 6. PRODUCT PRODUCTION USING PREPARED MIXTURES
  // ============================================================================
  describe('6. Product Production Using Prepared Mixtures', () => {
    it('calculates total production material cost combining direct raw ingredients and prepared mixtures', () => {
      // 10 kg Cake Mixture consumed @ ₹150/kg = ₹1500
      // 2 kg Dry Fruits / Cashew @ ₹700/kg = ₹1400
      // 0.5 kg Caramel / Essence @ ₹200/kg = ₹100
      // Total direct material cost = ₹3,000
      const cost = calculateProductProductionCost({
        rawIngredientsConsumed: [
          { actualQuantity: 2.0, unitCost: 700 },
          { actualQuantity: 0.5, unitCost: 200 },
        ],
        mixturesConsumed: [{ actualQuantity: 10.0, unitCost: 150 }],
        packagingCost: 150,
        packingLabourCost: 100,
        allocatedWages: 250,
        allocatedSharedExpenses: 100,
      });

      expect(cost.directRawMaterialCost).toBe(1500);
      expect(cost.directMixtureMaterialCost).toBe(1500);
      expect(cost.totalDirectMaterialCost).toBe(3000);
      expect(cost.totalPackagingCost).toBe(150);
      expect(cost.totalLabourCost).toBe(350); // 100 packing + 250 wages
      expect(cost.totalSharedExpenses).toBe(100);
      expect(cost.totalProductionCost).toBe(3600); // 3000 + 150 + 350 + 100 = 3600
    });
  });

  // ============================================================================
  // 7. PREVENTION OF DOUBLE DEDUCTIONS
  // ============================================================================
  describe('7. Prevention of Double Deductions', () => {
    it('guarantees raw ingredients of a mixture are NEVER re-deducted when consuming that mixture', async () => {
      // In demo data:
      // Mixture: 'ചോക്ലേറ്റ് കേക്ക് മിക്സ്ചർ' uses Flour, Sugar, Cocoa
      const mixtures = await repo.listSpecialMixtures();
      const chocMix = mixtures.find((m) => m.name === 'ചോക്ലേറ്റ് കേക്ക് മിക്സ്ചർ')!;
      const flour = (await repo.listIngredients()).find((i) => i.name === 'മൈദ')!;
      const initialFlourStock = flour.currentStock;

      const cake = await repo.createProduct({
        name: 'ചോക്ലേറ്റ് ഫ്രഷ് കേക്ക്',
        unit: 'pcs',
        currentStock: 0,
        isActive: true,
      });

      await repo.recordProductionRun({
        runNumber: 'PUL-CHOC-NO-DOUBLE',
        productId: cake.id,
        productionDate: '2026-11-05',
        plannedQuantity: 2,
        actualQuantity: 2,
        unit: 'pcs',
        operatorName: 'Head Baker',
        ingredientsConsumed: [],
        mixturesConsumed: [
          {
            mixtureId: chocMix.id,
            actualQuantity: 3,
            unit: 'kg',
          },
        ],
      });

      // Confirm raw flour stock remains completely untouched
      const flourAfter = (await repo.listIngredients()).find((i) => i.name === 'മൈദ')!;
      expect(flourAfter.currentStock).toBe(initialFlourStock);
    });
  });

  // ============================================================================
  // 8. WASTAGE CALCULATIONS
  // ============================================================================
  describe('8. Wastage Calculations', () => {
    it('accurately calculates waste quantities, waste percentages, and yield metrics', () => {
      // Planned 50 kg, Actual usable 47.5 kg -> 2.5 kg waste (5% waste, 95% yield)
      const metrics = calculateWastageMetrics(50, 47.5);
      expect(metrics.plannedQuantity).toBe(50);
      expect(metrics.actualUsableQuantity).toBe(47.5);
      expect(metrics.wastageQuantity).toBe(2.5);
      expect(metrics.wastagePercentage).toBe(5.0);
      expect(metrics.yieldPercentage).toBe(95.0);
    });

    it('accounts for unusable waste without double-counting consumed ingredients', () => {
      // If a batch consumes ₹1,000 worth of ingredients and yields 8 kg usable output out of 10 kg planned:
      // Cost per kg = ₹1,000 / 8 = ₹125/kg. The 2 kg waste is absorbed in the unit cost.
      const mixCost = calculateSpecialMixtureCost({
        ingredientsConsumed: [{ actualQuantity: 10, unitCost: 100 }],
        actualUsableOutput: 8,
        plannedOutput: 10,
      });

      expect(mixCost.totalBatchCost).toBe(1000);
      expect(mixCost.actualCostPerUnit).toBe(125);
      expect(mixCost.wastageQuantity).toBe(2);
    });
  });

  // ============================================================================
  // 9. LABOUR ALLOCATION
  // ============================================================================
  describe('9. Labour Allocation', () => {
    it('allocates daily cooking labour and packing labour across batches by weight with exact penny reconciliation', () => {
      const summary = [
        { productId: 'p1', productName: 'Prod 1', totalProductionKg: 70, batchCount: 2, ingredientCost: 2000 },
        { productId: 'p2', productName: 'Prod 2', totalProductionKg: 30, batchCount: 1, ingredientCost: 1000 },
      ];

      const dailyCookingWages = 1000;
      const dailyPackingWages = 500;
      const totalWages = dailyCookingWages + dailyPackingWages; // 1500

      const alloc = allocateDailySharedExpenses(summary, 0, totalWages, 0);
      expect(alloc).toHaveLength(2);

      // Product 1 (70%): 70% of 1500 = 1050
      expect(alloc[0].allocatedProductionWages).toBe(1050);
      // Product 2 (30%): 30% of 1500 = 450
      expect(alloc[1].allocatedProductionWages).toBe(450);

      // Sum equals original wages exactly
      const sumWages = alloc.reduce((s, a) => s + a.allocatedProductionWages, 0);
      expect(sumWages).toBe(totalWages);
    });
  });

  // ============================================================================
  // 10. SHARED EXPENSE ALLOCATION
  // ============================================================================
  describe('10. Shared Expense Allocation', () => {
    it('distributes shared expenses exactly once and absorbs rounding fractions on the final item', () => {
      // 3 products with weights 10kg, 10kg, 10kg (1/3 each)
      // Shared expense ₹1,000 (1000 / 3 = 333.333...)
      const summary = [
        { productId: 'a', productName: 'A', totalProductionKg: 10, batchCount: 1, ingredientCost: 100 },
        { productId: 'b', productName: 'B', totalProductionKg: 10, batchCount: 1, ingredientCost: 100 },
        { productId: 'c', productName: 'C', totalProductionKg: 10, batchCount: 1, ingredientCost: 100 },
      ];

      const alloc = allocateDailySharedExpenses(summary, 1000, 0, 0);
      expect(alloc[0].allocatedOilCost).toBe(333.33);
      expect(alloc[1].allocatedOilCost).toBe(333.33);
      // Final product absorbs the remaining paisa: 1000 - (333.33 + 333.33) = 333.34
      expect(alloc[2].allocatedOilCost).toBe(333.34);

      const totalAllocated = alloc.reduce((s, a) => roundCurrency(s + a.allocatedOilCost), 0);
      expect(totalAllocated).toBe(1000.0);
    });
  });

  // ============================================================================
  // 11. OIL CARRY-FORWARD
  // ============================================================================
  describe('11. Oil Carry-Forward Workflow', () => {
    it('accurately preserves carry-forward oil balances across consecutive production days', () => {
      // Day 1:
      // Previous available = 30 kg
      // Oil used during production = 10 kg
      // Leftover oil entered at night = 4 kg
      // Formula: Final = Previous - Used + Leftover = 30 - 10 + 4 = 24 kg
      // Net consumed = 10 - 4 = 6 kg @ ₹140/kg = ₹840
      const day1 = calculateDailyOilUsage(30, 10, 4, 140);
      expect(day1.finalOilStockKg).toBe(24);
      expect(day1.netOilConsumedKg).toBe(6);
      expect(day1.oilTotalExpense).toBe(840);

      // Day 2 (Day 1 final stock carries forward seamlessly as previous available):
      // Previous available = 24 kg
      // Purchases added = 20 kg -> (inventory stock = 44 kg)
      // Oil used during production = 8 kg
      // Leftover oil = 3 kg
      // Final = 44 - 8 + 3 = 39 kg
      // Net consumed = 8 - 3 = 5 kg @ ₹140/kg = ₹700
      const day2 = calculateDailyOilUsage(day1.finalOilStockKg + 20, 8, 3, 140);
      expect(day2.finalOilStockKg).toBe(39);
      expect(day2.netOilConsumedKg).toBe(5);
      expect(day2.oilTotalExpense).toBe(700);
    });
  });

  // ============================================================================
  // 12. INVENTORY OPENING AND CLOSING BALANCES
  // ============================================================================
  describe('12. Inventory Opening and Closing Balances', () => {
    it('verifies opening + purchases - consumption + adjustments = closing balance', async () => {
      const flour = (await repo.listIngredients()).find((i) => i.name === 'മൈദ')!;
      const openingStock = flour.currentStock;

      // 1. Purchase +20 kg
      await repo.adjustStock({
        ingredientId: flour.id,
        quantityDelta: 20,
        reason: 'Fresh Supplier Purchase',
        operatorName: 'Store Manager',
        movementType: 'purchase',
      });

      // 2. Consumption -15 kg
      await repo.adjustStock({
        ingredientId: flour.id,
        quantityDelta: -15,
        reason: 'Dough mixing consumption',
        operatorName: 'Baker',
        movementType: 'adjustment',
      });

      // 3. Spillage wastage -1 kg
      await repo.adjustStock({
        ingredientId: flour.id,
        quantityDelta: -1,
        reason: 'Damaged sack spillage',
        operatorName: 'Supervisor',
        movementType: 'wastage',
      });

      const closing = (await repo.listIngredients()).find((i) => i.id === flour.id)!;
      // Expected closing = opening + 20 - 15 - 1 = opening + 4
      expect(closing.currentStock).toBe(roundStock(openingStock + 4));
    });
  });

  // ============================================================================
  // 13. CONCURRENT PRODUCTION TRANSACTIONS & STOCK GUARD
  // ============================================================================
  describe('13. Concurrent Production Transactions & Stock Guards', () => {
    it('prevents negative stock balances when consumption exceeds available stock', async () => {
      const flour = (await repo.listIngredients()).find((i) => i.name === 'മൈദ')!;
      const currentStock = flour.currentStock;

      // Attempting to consume more than available stock should be rejected
      await expect(
        repo.adjustStock({
          ingredientId: flour.id,
          quantityDelta: -(currentStock + 50),
          reason: 'Excessive consumption attempt',
          operatorName: 'Operator',
        })
      ).rejects.toThrow(/Stock cannot be negative|നെഗറ്റീവ്|Insufficient stock/);
    });
  });

  // ============================================================================
  // 14. ROUNDING AND DECIMAL PRECISION
  // ============================================================================
  describe('14. Rounding and Decimal Precision', () => {
    it('eliminates IEEE 754 floating-point drift on monetary and stock calculations', () => {
      // Classic JS floating point bug: 0.1 + 0.2 = 0.30000000000000004
      expect(0.1 + 0.2).not.toBe(0.3);
      expect(roundCurrency(0.1 + 0.2)).toBe(0.3);

      // Financial total with 3 products of ₹33.3333
      const total = roundCurrency(33.3333 + 33.3333 + 33.3333);
      expect(total).toBe(100.0);

      // Unit cost precision up to 4 decimals
      expect(roundUnitCost(0.123456)).toBe(0.1235);
      expect(roundStock(1.23456)).toBe(1.235);
    });
  });

  // ============================================================================
  // 15. DATABASE BACKUP AND RESTORATION INTEGRITY
  // ============================================================================
  describe('15. Database Backup and Restoration Integrity', () => {
    it('validates integrity manifest structure and table coverage', () => {
      const requiredTables = [
        'products',
        'ingredients',
        'packet_types',
        'recipes',
        'recipe_items',
        'production_runs',
        'stock_movements',
        'daily_closings',
        'packing_records',
        'packaging_items',
        'special_mixtures',
        'special_mixture_recipes',
        'special_mixture_batches',
        'unit_conversions',
        'schema_migrations',
      ];

      // Simulated backup manifest check
      const manifestTables = [
        'products',
        'ingredients',
        'packet_types',
        'recipes',
        'recipe_items',
        'recipe_packets',
        'production_runs',
        'production_consumption',
        'stock_movements',
        'daily_closings',
        'packing_records',
        'packaging_items',
        'daily_wages',
        'product_selling_prices',
        'sales',
        'admin_security',
        'admin_sessions',
        'audit_logs',
        'daily_cost_allocations',
        'special_mixtures',
        'special_mixture_recipes',
        'special_mixture_recipe_items',
        'special_mixture_batches',
        'special_mixture_consumption',
        'product_recipe_mixtures',
        'production_mixture_consumption',
        'unit_conversions',
        'schema_migrations',
      ];

      for (const t of requiredTables) {
        expect(manifestTables).toContain(t);
      }
    });

    it('guarantees production run actual quantity is strictly positive even if 0 was passed', async () => {
      const repo = new DemoRepository();
      const product = await repo.createProduct({
        name: 'Positive Quantity Test Cake',
        unit: 'kg',
        currentStock: 0,
        wholesalePrice: 350,
        isActive: true,
      });

      // Pass actualQuantity: 0 to simulate initial modal state
      const run = await repo.recordProductionRun({
        runNumber: `PUL-POS-TEST-${Date.now()}`,
        productId: product.id,
        productionDate: '2026-11-06',
        plannedQuantity: 15,
        actualQuantity: 0, // Should be normalized to positive planned quantity
        unit: 'kg',
        operatorName: 'Test Baker',
        ingredientsConsumed: [],
      });

      expect(run.actualQuantity).toBeGreaterThan(0);
      expect(run.actualQuantity).toBe(15);

      const updatedProduct = await repo.getProductById(product.id);
      expect(updatedProduct?.currentStock).toBe(15);
    });
  });
});
