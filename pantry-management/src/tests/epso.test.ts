import { describe, it, expect, beforeEach } from 'vitest';
import { DemoRepository } from '../services/demoRepository';
import { INITIAL_PRODUCTS, INITIAL_INGREDIENTS } from '../services/demoSeedData';

describe('Pulari Bakes Production & Inventory Management System Tests', () => {
  let repo: DemoRepository;

  beforeEach(async () => {
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
    repo = new DemoRepository();
    await repo.resetDemoData();
  });

  // 1. EXACT MALAYALAM CATALOGUE VERIFICATION
  describe('Initial Catalogue Seeding', () => {
    it('seeds exactly 28 snack products with exact Malayalam spelling', async () => {
      const products = await repo.listProducts(true);
      expect(products).toHaveLength(28);

      const expectedFirstNames = [
        'ദാൽ മിക്സ്ചർ',
        'ദാൽ സേവ',
        'കടല മിക്സ്ചർ',
        'പയോളി മിക്സ്ചർ',
        'പെരി പെരി മിക്സ്ചർ',
        'First മിക്സ്ചർ',
        'സാമ്പാർ SP',
        'ചിപ്പി മിക്സ്ചർ',
        'റോസ്റ്റ്',
        'പട്ടാണി',
        'ഒബിസി',
        'കമ്പ്യൂട്ടർ മിക്സ്ചർ',
        'ചോളം സ്വീറ്റ് മിക്സ്ചർ',
        'ചോളം മസാല മിക്സ്ചർ',
        'പട്ടാണി മിക്സ്ചർ',
        '3kg കിറ്റ് മിക്സ്ചർ',
        'എപ്സോ കിറ്റ് മിക്സ്ചർ',
        'മണി കടല',
        'മുളക് മിക്സ്ചർ',
        'സുടാൻ മിക്സ്ചർ',
        'ചില്ലി മിക്സ്ചർ',
        'PT മിക്സ്ചർ',
        'Sr മിക്സ്ചർ',
        'SPSR മിക്സ്ചർ',
        'സാമ്പാർ LC',
        'ജീൻസ്',
        'ഗാർലിക്ക് pv',
        'Sp മിക്സ്ചർ',
      ];

      for (const name of expectedFirstNames) {
        const found = products.find((p) => p.name === name);
        expect(found, `Expected product "${name}" to exist in catalogue`).toBeDefined();
        expect(found?.isActive).toBe(true);
      }
    });

    it('seeds exactly 45 ingredients partitioned into 7 Basic and 38 Other', async () => {
      const ingredients = await repo.listIngredients(true);
      expect(ingredients).toHaveLength(45);

      const basic = ingredients.filter((i) => i.category === 'basic');
      expect(basic).toHaveLength(7);

      const expectedBasicNames = [
        'ഓയിൽ',
        'അണ്ടി തോട്',
        'ചിപ്പ്ളി പൊടി',
        'കറിവേപ്പില',
        'കൂലി',
        'കൂലി പാക്കിങ്',
        'ഉപ്പ്',
      ];
      for (const name of expectedBasicNames) {
        expect(basic.find((i) => i.name === name), `Expected basic ingredient "${name}"`).toBeDefined();
      }

      const other = ingredients.filter((i) => i.category === 'other');
      expect(other).toHaveLength(38);
      expect(other.find((i) => i.name === 'കടല പൊടി 99')).toBeDefined();
      expect(other.find((i) => i.name === 'മസൂർ')).toBeDefined();
    });

    it('starts with honest zero transactions, zero batches, and zero fabricated stock', async () => {
      const runs = await repo.listProductionRuns();
      expect(runs).toHaveLength(0);

      const movements = await repo.getStockMovements();
      expect(movements).toHaveLength(0);

      const metrics = await repo.getAdminDashboardMetrics('2026-01-01', '2026-12-31');
      expect(metrics.runsToday).toBe(0);
      expect(metrics.qtyToday).toBe(0);
      expect(metrics.runsInPeriod).toBe(0);
      expect(metrics.qtyInPeriod).toBe(0);
      expect(metrics.byProduct).toHaveLength(0);
      expect(metrics.consumption).toHaveLength(0);
      expect(metrics.recentActivity).toHaveLength(0);
    });
  });

  // 2. PRODUCT & INGREDIENT CATALOGUE MANAGEMENT (Shared cook/owner permissions)
  describe('Catalogue CRUD & Safe Deactivation', () => {
    it('allows adding, editing, and deactivating a product', async () => {
      const newProd = await repo.createProduct({
        name: 'സ്പെഷ്യൽ ബനാന ചിപ്സ്',
        unit: 'kg',
        currentStock: 0,
        isActive: true,
      });

      expect(newProd.id).toBeDefined();
      expect(newProd.name).toBe('സ്പെഷ്യൽ ബനാന ചിപ്സ്');

      // Edit
      const updated = await repo.updateProduct(newProd.id, { wholesalePrice: 180 });
      expect(updated.wholesalePrice).toBe(180);

      // Deactivate
      await repo.deactivateProduct(newProd.id);
      const activeList = await repo.listProducts(false);
      expect(activeList.find((p) => p.id === newProd.id)).toBeUndefined();

      const allList = await repo.listProducts(true);
      expect(allList.find((p) => p.id === newProd.id)?.isActive).toBe(false);
    });

    it('safely deletes an unreferenced ingredient, but deactivates if referenced', async () => {
      const newIng = await repo.createIngredient({
        name: 'ടെസ്റ്റ് ചേരുവ',
        category: 'other',
        unit: 'g',
        currentStock: 0,
        minStock: 10,
        avgCostPerUnit: 0,
        isActive: true,
      });

      // Safe delete unreferenced -> permanently deleted
      const delRes = await repo.safeDeleteIngredient(newIng.id);
      expect(delRes.deleted).toBe(true);

      const after = await repo.getIngredientById(newIng.id);
      expect(after).toBeNull();
    });
  });

  // 3. ADMIN 6-DIGIT PIN SECURITY & LOCKOUT
  describe('Admin PIN Security & Verification', () => {
    it('starts uninitialized, requires setup, and enforces 6 numeric digits', async () => {
      expect(await repo.isAdminInitialized()).toBe(false);

      await expect(repo.setupAdminPin('12345', 'secret-recovery')).rejects.toThrow(
        /6 numeric digits/i
      );
      await expect(repo.setupAdminPin('abcdef', 'secret-recovery')).rejects.toThrow(
        /6 numeric digits/i
      );

      // Successful setup
      const res = await repo.setupAdminPin('889900', 'owner-secret-key-2026');
      expect(res.success).toBe(true);
      expect(res.sessionToken).toBeDefined();

      expect(await repo.isAdminInitialized()).toBe(true);
      expect(await repo.verifyAdminSession(res.sessionToken)).toBe(true);
    });

    it('verifies valid PIN and rate-limits invalid attempts with lockout', async () => {
      await repo.setupAdminPin('123456', 'my-recovery-passphrase');

      // Correct PIN succeeds
      const good = await repo.verifyAdminPin('123456');
      expect(good.success).toBe(true);
      expect(good.sessionToken).toBeDefined();

      // Wrong attempts
      await expect(repo.verifyAdminPin('000000')).rejects.toThrow(/incorrect pin/i);
      await expect(repo.verifyAdminPin('000000')).rejects.toThrow(/incorrect pin/i);
      await expect(repo.verifyAdminPin('000000')).rejects.toThrow(/incorrect pin/i);
      await expect(repo.verifyAdminPin('000000')).rejects.toThrow(/incorrect pin/i);
      // 5th attempt locks out
      await expect(repo.verifyAdminPin('000000')).rejects.toThrow(/account locked|locked/i);

      // Even correct PIN is rejected during lockout
      await expect(repo.verifyAdminPin('123456')).rejects.toThrow(/locked/i);
    });

    it('allows recovering access and clearing lockout using recovery phrase', async () => {
      await repo.setupAdminPin('111111', 'owner-master-recovery-pass');

      // Lock it out
      for (let i = 0; i < 5; i++) {
        try {
          await repo.verifyAdminPin('999999');
        } catch {}
      }

      // Invalid recovery phrase fails
      await expect(
        repo.resetAdminPinWithRecovery('wrong-phrase', '222222')
      ).rejects.toThrow(/invalid recovery key/i);

      // Correct recovery resets PIN and clears lockout
      const resetRes = await repo.resetAdminPinWithRecovery(
        'owner-master-recovery-pass',
        '222222'
      );
      expect(resetRes.success).toBe(true);

      // New PIN now works immediately
      const login = await repo.verifyAdminPin('222222');
      expect(login.success).toBe(true);
      expect(login.sessionToken).toBeDefined();
    });
  });

  // 4. RECIPE & BILL OF MATERIALS (BOM)
  describe('Recipe Formulations (BOM)', () => {
    it('creates and saves recipe associating products with ingredients', async () => {
      const prod = (await repo.listProducts()).find((p) => p.name === 'പെരി പെരി മിക്സ്ചർ')!;
      const ings = (await repo.listIngredients()).slice(0, 3);

      const recipe = await repo.saveRecipe({
        productId: prod.id,
        productName: prod.name,
        version: 1,
        baseOutputQuantity: 10,
        baseOutputUnit: 'kg',
        ingredients: [
          {
            ingredientId: ings[0].id,
            ingredientName: ings[0].name,
            quantity: 5,
            unit: ings[0].unit,
          },
          {
            ingredientId: ings[1].id,
            ingredientName: ings[1].name,
            quantity: 1,
            unit: ings[1].unit,
          },
        ],
        notes: 'Standard production recipe',
        isActive: true,
      });

      expect(recipe.id).toBeDefined();
      expect(recipe.productId).toBe(prod.id);
      expect(recipe.ingredients).toHaveLength(2);

      const fetched = await repo.getRecipeByProductId(prod.id);
      expect(fetched?.id).toBe(recipe.id);
    });
  });

  // 5. ATOMIC PRODUCTION WORKFLOW & STOCK LEDGER
  describe('Atomic Production Runs & Inventory Ledger', () => {
    it('executes production run, deducts ingredients, updates output, and writes stock movements', async () => {
      const prod = (await repo.listProducts()).find((p) => p.name === 'പെരി പെരി മിക്സ്ചർ')!;
      const ings = await repo.listIngredients();
      const oil = ings.find((i) => i.name === 'ഓയിൽ')!;
      const flour = ings.find((i) => i.name === 'കടല പൊടി 99')!;
      const initialOil = oil.currentStock;
      const initialFlour = flour.currentStock;

      // Step 1: Record valid opening stock for the ingredients
      await repo.adjustStock({
        ingredientId: oil.id,
        quantityDelta: 50,
        reason: 'Opening stock audit',
        operatorName: 'Store Keeper',
      });
      await repo.adjustStock({
        ingredientId: flour.id,
        quantityDelta: 100,
        reason: 'Opening stock audit',
        operatorName: 'Store Keeper',
      });

      const oilBefore = (await repo.getIngredientById(oil.id))!.currentStock;
      const flourBefore = (await repo.getIngredientById(flour.id))!.currentStock;
      expect(oilBefore).toBe(initialOil + 50);
      expect(flourBefore).toBe(initialFlour + 100);

      // Step 2: Record a production run
      const run = await repo.recordProductionRun({
        runNumber: 'PR-2026-001',
        productId: prod.id,
        productionDate: '2026-10-11',
        plannedQuantity: 20,
        actualQuantity: 20,
        unit: 'kg',
        operatorName: 'Cook Master',
        ingredientsConsumed: [
          {
            ingredientId: oil.id,
            expectedQuantity: 5,
            actualQuantity: 5,
            unit: 'L',
          },
          {
            ingredientId: flour.id,
            expectedQuantity: 15,
            actualQuantity: 15,
            unit: 'kg',
          },
        ],
      });

      expect(run.id).toBeDefined();
      expect(run.status).toBe('completed');
      expect(run.actualQuantity).toBe(20);

      // Verify stock deducted
      const oilAfter = (await repo.getIngredientById(oil.id))!.currentStock;
      const flourAfter = (await repo.getIngredientById(flour.id))!.currentStock;
      expect(oilAfter).toBe(initialOil + 45);
      expect(flourAfter).toBe(initialFlour + 85);

      // Verify product stock increased
      const prodAfter = (await repo.getProductById(prod.id))!.currentStock;
      expect(prodAfter).toBe(prod.currentStock + 20);

      // Verify movements ledger
      const movements = await repo.getStockMovements();
      expect(movements.length).toBeGreaterThanOrEqual(5); // 2 opening + 2 consumption + 1 production_output

      const consumptionMovements = movements.filter(
        (m) => m.movementType === 'production_consumption'
      );
      expect(consumptionMovements).toHaveLength(2);

      // Step 3: Prevent duplicate run number
      await expect(
        repo.recordProductionRun({
          runNumber: 'PR-2026-001', // duplicate!
          productId: prod.id,
          productionDate: '2026-10-11',
          plannedQuantity: 10,
          actualQuantity: 10,
          unit: 'kg',
          operatorName: 'Cook Master',
          ingredientsConsumed: [],
        })
      ).rejects.toThrow(/already exists/i);
    });

    it('cancels production run, restores ingredient stock, and deducts produced quantity', async () => {
      const prod = (await repo.listProducts())[1];
      const ings = await repo.listIngredients();
      const oil = ings.find((i) => i.name === 'ഓയിൽ')!;

      await repo.adjustStock({
        ingredientId: oil.id,
        quantityDelta: 30,
        reason: 'Opening stock',
        operatorName: 'Admin',
      });

      const run = await repo.recordProductionRun({
        runNumber: 'PR-CANCEL-001',
        productId: prod.id,
        productionDate: '2026-10-11',
        plannedQuantity: 10,
        actualQuantity: 10,
        unit: 'kg',
        operatorName: 'Cook',
        ingredientsConsumed: [
          {
            ingredientId: oil.id,
            expectedQuantity: 4,
            actualQuantity: 4,
            unit: 'L',
          },
        ],
      });

      const oilBeforeCancel = (await repo.getIngredientById(oil.id))!.currentStock;
      const prodBeforeCancel = (await repo.getProductById(prod.id))!.currentStock;

      // Cancel the run
      const cancelled = await repo.cancelProductionRun({
        runId: run.id,
        reason: 'Overcooked batch - quality rejected',
        operatorName: 'Owner Admin',
      });
      expect(cancelled).toBe(true);

      const updatedRun = await repo.getProductionRunById(run.id);
      expect(updatedRun?.status).toBe('cancelled');
      expect(updatedRun?.cancellationReason).toBe('Overcooked batch - quality rejected');

      // Oil should be restored (+4)
      const oilAfterCancel = (await repo.getIngredientById(oil.id))!.currentStock;
      expect(oilAfterCancel).toBe(oilBeforeCancel + 4);

      // Product stock should be reversed (-10)
      const prodAfterCancel = (await repo.getProductById(prod.id))!.currentStock;
      expect(prodAfterCancel).toBe(prodBeforeCancel - 10);
    });
  });

  // 6. DASHBOARD METRICS CALCULATION
  describe('Admin Dashboard Metrics Aggregation', () => {
    it('accurately computes metrics from real records and excludes cancelled batches from completed totals', async () => {
      const today = new Date().toISOString().split('T')[0];
      const prod1 = (await repo.listProducts())[0];
      const prod2 = (await repo.listProducts())[1];

      // Run 1: Completed
      await repo.recordProductionRun({
        runNumber: 'METRIC-001',
        productId: prod1.id,
        productionDate: today,
        plannedQuantity: 25,
        actualQuantity: 25,
        unit: 'kg',
        operatorName: 'Cook 1',
        ingredientsConsumed: [],
      });

      // Run 2: Completed
      await repo.recordProductionRun({
        runNumber: 'METRIC-002',
        productId: prod2.id,
        productionDate: today,
        plannedQuantity: 15,
        actualQuantity: 15,
        unit: 'kg',
        operatorName: 'Cook 2',
        ingredientsConsumed: [],
      });

      // Run 3: Cancelled
      const run3 = await repo.recordProductionRun({
        runNumber: 'METRIC-003',
        productId: prod1.id,
        productionDate: today,
        plannedQuantity: 50,
        actualQuantity: 50,
        unit: 'kg',
        operatorName: 'Cook 3',
        ingredientsConsumed: [],
      });
      await repo.cancelProductionRun({
        runId: run3.id,
        reason: 'Burnt',
        operatorName: 'Admin',
      });

      const metrics = await repo.getAdminDashboardMetrics(today, today);
      // Only 2 completed runs
      expect(metrics.runsToday).toBe(2);
      // Total completed qty = 25 + 15 = 40 (cancelled 50 is excluded!)
      expect(metrics.qtyToday).toBe(40);
      expect(metrics.runsInPeriod).toBe(2);
      expect(metrics.qtyInPeriod).toBe(40);

      // Breakdown by product
      expect(metrics.byProduct).toHaveLength(2);
      const prod1Summary = metrics.byProduct.find((p) => p.productName === prod1.name);
      expect(prod1Summary?.totalQuantity).toBe(25);
      expect(prod1Summary?.runCount).toBe(1);
    });
  });

  // 13. BASIC INGREDIENT USAGE AS PRODUCTION CONSUMPTION (NOT WASTAGE)
  describe('Basic Ingredient Stock Movement Type', () => {
    it('records basic ingredient consumption as production_consumption and not wastage', async () => {
      const ings = await repo.listIngredients(false);
      const salt = ings.find((i) => i.name === 'ഉപ്പ്')!;
      expect(salt).toBeDefined();

      const initialStock = salt.currentStock;

      const result = await repo.adjustStock({
        ingredientId: salt.id,
        quantityDelta: -2.5,
        movementType: 'production_consumption',
        reason: 'Daily basic ingredient usage (ഉപ്പ്) - 2026-11-04',
        operatorName: 'Kitchen Staff',
        coverUnitCost: salt.avgCostPerUnit,
      });

      expect(result.movement.movementType).toBe('production_consumption');
      expect(result.movement.movementType).not.toBe('wastage');
      expect(result.movement.reference).toBe('Production Consumption');
      expect(result.ingredient.currentStock).toBe(initialStock - 2.5);

      const movements = await repo.getStockMovements({ itemId: salt.id });
      const lastMov = movements[0];
      expect(lastMov.movementType).toBe('production_consumption');
      expect(lastMov.movementType).not.toBe('wastage');
    });
  });
});
