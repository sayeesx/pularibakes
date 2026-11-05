import { describe, it, expect, beforeEach } from 'vitest';
import { DemoRepository } from '../services/demoRepository';

describe('Pulari Bakes Special Cooked Mixtures & Cake Production Tests', () => {
  let repo: DemoRepository;

  beforeEach(async () => {
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
    repo = new DemoRepository();
    await repo.resetDemoData();
  });

  it('initializes with default special mixture catalogue including Plum Cake Mixture, Whipping Cream, etc.', async () => {
    const mixtures = await repo.listSpecialMixtures(true);
    expect(mixtures.length).toBeGreaterThanOrEqual(5);

    const names = mixtures.map((m) => m.name);
    expect(names).toContain('പ്ലം കേക്ക് മിക്സ്ചർ');
    expect(names).toContain('ചോക്ലേറ്റ് കേക്ക് മിക്സ്ചർ');
    expect(names).toContain('വാനില കേക്ക് മിക്സ്ചർ');
    expect(names).toContain('വിപ്പിംഗ് ക്രീം');
    expect(names).toContain('ബട്ടർ ക്രീം');

    const plumMix = mixtures.find((m) => m.name === 'പ്ലം കേക്ക് മിക്സ്ചർ');
    expect(plumMix?.currentStock).toBe(15);
    expect(plumMix?.unit).toBe('kg');
    expect(plumMix?.avgCostPerUnit).toBe(180);
    expect(plumMix?.recipe).toBeDefined();
  });

  it('prepares a special mixture batch: deducts raw ingredients and increases mixture stock', async () => {
    const mixtures = await repo.listSpecialMixtures();
    const plumMix = mixtures.find((m) => m.name === 'പ്ലം കേക്ക് മിക്സ്ചർ')!;
    const initialPlumStock = plumMix.currentStock;

    // In demo data, ing-10 is மைதா with stock 120
    const ingFlour = (await repo.listIngredients()).find((i) => i.name === 'മൈദ')!;
    const initialFlourStock = ingFlour.currentStock;

    // Prepare 10 kg of Plum Cake Mixture using 5 kg of Flour
    const batch = await repo.prepareSpecialMixture({
      mixtureId: plumMix.id,
      preparationDate: '2026-11-05',
      plannedQuantity: 10,
      actualQuantity: 10,
      unit: 'kg',
      operatorName: 'Head Baker Sasi',
      notes: 'Fresh holiday batch preparation',
      ingredientsConsumed: [
        {
          ingredientId: ingFlour.id,
          expectedQuantity: 5,
          actualQuantity: 5,
          unit: 'kg',
          unitCost: ingFlour.avgCostPerUnit,
        },
      ],
    });

    expect(batch).toBeDefined();
    expect(batch.status).toBe('completed');
    expect(batch.actualQuantity).toBe(10);
    expect(batch.totalIngredientCost).toBe(5 * ingFlour.avgCostPerUnit);
    expect(batch.costPerUnit).toBe((5 * ingFlour.avgCostPerUnit) / 10);

    // Verify flour stock was deducted
    const updatedFlour = (await repo.listIngredients()).find((i) => i.id === ingFlour.id)!;
    expect(updatedFlour.currentStock).toBe(initialFlourStock - 5);

    // Verify mixture stock was increased
    const updatedPlumMix = await repo.getSpecialMixtureById(plumMix.id);
    expect(updatedPlumMix?.currentStock).toBe(initialPlumStock + 10);
  });

  it('STRICT RULE: Produces cake using prepared mixture; deducts ONLY mixture stock, NEVER re-deducts raw ingredients', async () => {
    const mixtures = await repo.listSpecialMixtures();
    const plumMix = mixtures.find((m) => m.name === 'പ്ലം കേക്ക് മിക്സ്ചർ')!;
    const initialMixtureStock = plumMix.currentStock;

    // Ingredients that make up the mixture should NOT be touched
    const ingFlour = (await repo.listIngredients()).find((i) => i.name === 'മൈദ')!;
    const initialFlourStock = ingFlour.currentStock;

    // Add a cake product
    const cakeProduct = await repo.createProduct({
      name: 'സ്പെഷ്യൽ പ്ലം കേക്ക് 1kg',
      unit: 'pcs',
      currentStock: 0,
      isActive: true,
    });

    // Run cake production consuming 4 kg of Plum Cake Mixture
    const run = await repo.recordProductionRun({
      runNumber: 'PUL-CAKE-001',
      productId: cakeProduct.id,
      productionDate: '2026-11-05',
      plannedQuantity: 4,
      actualQuantity: 4,
      unit: 'pcs',
      operatorName: 'Pastry Chef Rahul',
      notes: 'Baking 4 cakes with prepared mixture',
      ingredientsConsumed: [], // No extra raw ingredients
      mixturesConsumed: [
        {
          mixtureId: plumMix.id,
          expectedQuantity: 4,
          actualQuantity: 4,
          unit: 'kg',
        },
      ],
    });

    expect(run).toBeDefined();
    expect(run.status).toBe('completed');
    expect(run.mixturesConsumed).toBeDefined();
    expect(run.mixturesConsumed?.length).toBe(1);
    expect(run.mixturesConsumed?.[0].mixtureId).toBe(plumMix.id);
    expect(run.totalMixtureCost).toBe(4 * plumMix.avgCostPerUnit);

    // 1. Verify mixture stock was deducted by 4
    const updatedPlumMix = await repo.getSpecialMixtureById(plumMix.id);
    expect(updatedPlumMix?.currentStock).toBe(initialMixtureStock - 4);

    // 2. CRITICAL: Raw ingredients of the mixture were NOT touched
    const updatedFlour = (await repo.listIngredients()).find((i) => i.id === ingFlour.id)!;
    expect(updatedFlour.currentStock).toBe(initialFlourStock);

    // 3. Produced cake stock incremented
    const updatedCake = await repo.getProductById(cakeProduct.id);
    expect(updatedCake?.currentStock).toBe(4);
  });

  it('cancels mixture batch: reverses mixture stock increase and restores raw ingredients', async () => {
    const mixtures = await repo.listSpecialMixtures();
    const chocMix = mixtures.find((m) => m.name === 'ചോക്ലേറ്റ് കേക്ക് മിക്സ്ചർ')!;
    const initialMixStock = chocMix.currentStock;

    const ingFlour = (await repo.listIngredients()).find((i) => i.name === 'മൈദ')!;
    const initialFlourStock = ingFlour.currentStock;

    const batch = await repo.prepareSpecialMixture({
      mixtureId: chocMix.id,
      preparationDate: '2026-11-05',
      plannedQuantity: 5,
      actualQuantity: 5,
      unit: 'kg',
      operatorName: 'Head Baker Sasi',
      ingredientsConsumed: [
        {
          ingredientId: ingFlour.id,
          expectedQuantity: 2,
          actualQuantity: 2,
          unit: 'kg',
        },
      ],
    });

    expect(batch.status).toBe('completed');

    // Cancel the batch
    const cancelled = await repo.cancelSpecialMixtureBatch(batch.id, 'Wrong sugar proportion', 'Admin');
    expect(cancelled).toBe(true);

    // Verify mixture stock reverted
    const revertedMix = await repo.getSpecialMixtureById(chocMix.id);
    expect(revertedMix?.currentStock).toBe(initialMixStock);

    // Verify raw flour stock restored
    const restoredFlour = (await repo.listIngredients()).find((i) => i.id === ingFlour.id)!;
    expect(restoredFlour.currentStock).toBe(initialFlourStock);
  });
});
