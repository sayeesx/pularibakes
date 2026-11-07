import { IEpsoRepository } from './repository';
import {
  Ingredient,
  Product,
  Recipe,
  PacketType,
  ProductionRun,
  StockMovement,
  AuditLog,
  AdminDashboardMetrics,
  MovementType,
  DailyClosing,
  DailyCostAllocation,
  PackagingItem,
  PackingRecord,
  SpecialMixture,
  SpecialMixtureBatch,
  SpecialMixtureRecipe,
  SpecialMixtureConsumption,
  ProductionMixtureConsumption,
  UnitType,
} from '../types';
import { INITIAL_PRODUCTS, INITIAL_INGREDIENTS, INITIAL_RECIPES } from './demoSeedData';
import { INITIAL_SPECIAL_MIXTURES, INITIAL_MIXTURE_RECIPES } from './demoMixtureSeedData';
import { calculateDailyOilUsage, roundCurrency, roundStock } from './costing';

const STORAGE_KEYS = {
  PRODUCTS: 'pulari_storage_products_v2',
  INGREDIENTS: 'pulari_storage_ingredients_v2',
  RECIPES: 'pulari_storage_recipes_v2',
  RUNS: 'pulari_storage_production_runs_v2',
  MOVEMENTS: 'pulari_storage_movements_v2',
  AUDIT_LOGS: 'pulari_storage_audit_logs_v2',
  SECURITY: 'pulari_storage_admin_security_v2',
  SESSIONS: 'pulari_storage_admin_sessions_v2',
  MIXTURES: 'pulari_storage_special_mixtures_v2',
  MIXTURE_RECIPES: 'pulari_storage_mixture_recipes_v2',
  MIXTURE_BATCHES: 'pulari_storage_mixture_batches_v2',
  MIXTURE_CONSUMPTIONS: 'pulari_storage_mixture_consumptions_v2',
};

export class DemoRepository implements IEpsoRepository {
  constructor() {
    this.ensureInitialized();
  }

  isSupabaseMode(): boolean {
    return false;
  }

  private memoryStorage = new Map<string, string>();

  private getItem<T>(key: string, defaultVal: T): T {
    try {
      let data: string | null = null;
      if (typeof localStorage !== 'undefined') {
        data = localStorage.getItem(key);
      } else {
        data = this.memoryStorage.get(key) || null;
      }
      return data ? JSON.parse(data) : defaultVal;
    } catch {
      return defaultVal;
    }
  }

  private setItem<T>(key: string, value: T): void {
    try {
      const serialized = JSON.stringify(value);
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(key, serialized);
      } else {
        this.memoryStorage.set(key, serialized);
      }
    } catch (e) {
      console.error('Storage write error', e);
    }
  }

  private removeItem(key: string): void {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(key);
      } else {
        this.memoryStorage.delete(key);
      }
    } catch (e) {
      console.error('Storage remove error', e);
    }
  }

  public async resetDemoData(): Promise<void> {
    const prods: Product[] = INITIAL_PRODUCTS.map((p, idx) => ({
      ...p,
      id: `prod-${idx + 1}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
    this.setItem(STORAGE_KEYS.PRODUCTS, prods);

    const ings: Ingredient[] = INITIAL_INGREDIENTS.map((i, idx) => ({
      ...i,
      id: `ing-${idx + 1}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
    this.setItem(STORAGE_KEYS.INGREDIENTS, ings);

    this.setItem(STORAGE_KEYS.RECIPES, INITIAL_RECIPES);
    this.setItem(STORAGE_KEYS.MIXTURES, INITIAL_SPECIAL_MIXTURES);
    this.setItem(STORAGE_KEYS.MIXTURE_RECIPES, INITIAL_MIXTURE_RECIPES);
    this.setItem(STORAGE_KEYS.MIXTURE_BATCHES, []);
    this.setItem(STORAGE_KEYS.MIXTURE_CONSUMPTIONS, []);
    this.setItem(STORAGE_KEYS.RUNS, []);
    this.setItem(STORAGE_KEYS.MOVEMENTS, []);
    this.setItem(STORAGE_KEYS.AUDIT_LOGS, []);
    this.removeItem(STORAGE_KEYS.SECURITY);
    this.removeItem(STORAGE_KEYS.SESSIONS);
  }

  public ensureInitialized(): void {
    const existingProds = this.getItem<Product[]>(STORAGE_KEYS.PRODUCTS, []);
    if (!existingProds || existingProds.length === 0) {
      const prods: Product[] = INITIAL_PRODUCTS.map((p, idx) => ({
        ...p,
        id: `prod-${idx + 1}`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }));
      this.setItem(STORAGE_KEYS.PRODUCTS, prods);
    }

    const existingIngs = this.getItem<Ingredient[]>(STORAGE_KEYS.INGREDIENTS, []);
    if (!existingIngs || existingIngs.length === 0) {
      const ings: Ingredient[] = INITIAL_INGREDIENTS.map((i, idx) => ({
        ...i,
        id: `ing-${idx + 1}`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }));
      this.setItem(STORAGE_KEYS.INGREDIENTS, ings);
    }

    const existingRecs = this.getItem<Recipe[]>(STORAGE_KEYS.RECIPES, []);
    if (!existingRecs || existingRecs.length === 0) {
      this.setItem(STORAGE_KEYS.RECIPES, INITIAL_RECIPES);
    }

    const existingRuns = this.getItem<ProductionRun[]>(STORAGE_KEYS.RUNS, []);
    if (!existingRuns) {
      this.setItem(STORAGE_KEYS.RUNS, []);
    }

    const existingMvs = this.getItem<StockMovement[]>(STORAGE_KEYS.MOVEMENTS, []);
    if (!existingMvs) {
      this.setItem(STORAGE_KEYS.MOVEMENTS, []);
    }

    const existingLogs = this.getItem<AuditLog[]>(STORAGE_KEYS.AUDIT_LOGS, []);
    if (!existingLogs) {
      this.setItem(STORAGE_KEYS.AUDIT_LOGS, []);
    }
  }

  // ============================================================================
  // PRODUCTS
  // ============================================================================

  async listProducts(includeInactive = false): Promise<Product[]> {
    this.ensureInitialized();
    const list = this.getItem<Product[]>(STORAGE_KEYS.PRODUCTS, []);
    return includeInactive ? list : list.filter((p) => p.isActive);
  }

  async getProductById(id: string): Promise<Product | null> {
    const list = await this.listProducts(true);
    return list.find((p) => p.id === id) || null;
  }

  async createProduct(data: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>): Promise<Product> {
    const list = await this.listProducts(true);
    if (list.some((p) => p.name.trim().toLowerCase() === data.name.trim().toLowerCase() && p.isActive)) {
      throw new Error(`A product named '${data.name}' already exists.`);
    }

    const now = new Date().toISOString();
    const newProd: Product = {
      ...data,
      id: `prod-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      createdAt: now,
      updatedAt: now,
    };

    list.push(newProd);
    this.setItem(STORAGE_KEYS.PRODUCTS, list);

    this.recordAudit('Staff', 'CREATE_PRODUCT', 'PRODUCT', newProd.id, { name: newProd.name });
    return newProd;
  }

  async updateProduct(id: string, data: Partial<Product>): Promise<Product> {
    const list = await this.listProducts(true);
    const idx = list.findIndex((p) => p.id === id);
    if (idx === -1) throw new Error('Product not found');

    const updated: Product = {
      ...list[idx],
      ...data,
      updatedAt: new Date().toISOString(),
    };

    list[idx] = updated;
    this.setItem(STORAGE_KEYS.PRODUCTS, list);

    this.recordAudit('Staff', 'UPDATE_PRODUCT', 'PRODUCT', id, data);
    return updated;
  }

  async deactivateProduct(id: string): Promise<void> {
    await this.updateProduct(id, { isActive: false });
  }

  async safeDeleteProduct(id: string): Promise<{ deleted: boolean; deactivated?: boolean }> {
    const runs = this.getItem<ProductionRun[]>(STORAGE_KEYS.RUNS, []);
    const isReferenced = runs.some((r) => r.productId === id);

    if (isReferenced) {
      await this.deactivateProduct(id);
      return { deleted: false, deactivated: true };
    }

    const list = await this.listProducts(true);
    const filtered = list.filter((p) => p.id !== id);
    this.setItem(STORAGE_KEYS.PRODUCTS, filtered);

    this.recordAudit('Staff', 'DELETE_PRODUCT', 'PRODUCT', id, { deleted: true });
    return { deleted: true };
  }

  // ============================================================================
  // INGREDIENTS
  // ============================================================================

  async listIngredients(includeInactive = false): Promise<Ingredient[]> {
    this.ensureInitialized();
    const list = this.getItem<Ingredient[]>(STORAGE_KEYS.INGREDIENTS, []);
    return includeInactive ? list : list.filter((i) => i.isActive);
  }

  async getIngredientById(id: string): Promise<Ingredient | null> {
    const list = await this.listIngredients(true);
    return list.find((i) => i.id === id) || null;
  }

  async createIngredient(data: Omit<Ingredient, 'id' | 'createdAt' | 'updatedAt'>): Promise<Ingredient> {
    const list = await this.listIngredients(true);
    if (list.some((i) => i.name.trim().toLowerCase() === data.name.trim().toLowerCase() && i.isActive)) {
      throw new Error(`An ingredient named '${data.name}' already exists.`);
    }

    const now = new Date().toISOString();
    const newIng: Ingredient = {
      ...data,
      id: `ing-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      createdAt: now,
      updatedAt: now,
    };

    list.push(newIng);
    this.setItem(STORAGE_KEYS.INGREDIENTS, list);

    this.recordAudit('Staff', 'CREATE_INGREDIENT', 'INGREDIENT', newIng.id, { name: newIng.name });
    return newIng;
  }

  async updateIngredient(id: string, data: Partial<Ingredient>): Promise<Ingredient> {
    const list = await this.listIngredients(true);
    const idx = list.findIndex((i) => i.id === id);
    if (idx === -1) throw new Error('Ingredient not found');

    const updated: Ingredient = {
      ...list[idx],
      ...data,
      updatedAt: new Date().toISOString(),
    };

    list[idx] = updated;
    this.setItem(STORAGE_KEYS.INGREDIENTS, list);

    this.recordAudit('Staff', 'UPDATE_INGREDIENT', 'INGREDIENT', id, data);
    return updated;
  }

  async deactivateIngredient(id: string): Promise<void> {
    await this.updateIngredient(id, { isActive: false });
  }

  async safeDeleteIngredient(id: string): Promise<{ deleted: boolean; deactivated?: boolean }> {
    const runs = this.getItem<ProductionRun[]>(STORAGE_KEYS.RUNS, []);
    const isReferencedInRuns = runs.some((r) =>
      r.ingredientsConsumed?.some((c) => c.ingredientId === id)
    );

    const recipes = this.getItem<Recipe[]>(STORAGE_KEYS.RECIPES, []);
    const isReferencedInRecipes = recipes.some((rec) =>
      rec.ingredients?.some((item) => item.ingredientId === id)
    );

    if (isReferencedInRuns || isReferencedInRecipes) {
      await this.deactivateIngredient(id);
      return { deleted: false, deactivated: true };
    }

    const list = await this.listIngredients(true);
    const filtered = list.filter((i) => i.id !== id);
    this.setItem(STORAGE_KEYS.INGREDIENTS, filtered);

    this.recordAudit('Staff', 'DELETE_INGREDIENT', 'INGREDIENT', id, { deleted: true });
    return { deleted: true };
  }

  async adjustStock(params: {
    ingredientId: string;
    quantityDelta: number;
    reason: string;
    operatorName: string;
    coverUnitCost?: number;
    movementType?: MovementType;
  }): Promise<{ ingredient: Ingredient; movement: StockMovement }> {
    const ing = await this.getIngredientById(params.ingredientId);
    if (!ing) throw new Error('Ingredient not found');

    const newStock = ing.currentStock + params.quantityDelta;
    if (newStock < 0) throw new Error('സ്റ്റോക്ക് 0 ആണ് അല്ലെങ്കിൽ കുറവാണ്. നെഗറ്റീവ് ആകാൻ കഴിയില്ല (Stock cannot be negative)');

    const updated = await this.updateIngredient(params.ingredientId, { currentStock: newStock });

    const mType = params.movementType || (params.quantityDelta >= 0 ? 'adjustment' : 'wastage');
    const movements = this.getItem<StockMovement[]>(STORAGE_KEYS.MOVEMENTS, []);
    const newMovement: StockMovement = {
      id: `mov-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      itemId: ing.id,
      itemType: 'ingredient',
      itemName: ing.name,
      movementType: mType,
      quantity: params.quantityDelta,
      unit: ing.unit,
      previousBalance: ing.currentStock,
      newBalance: newStock,
      costPerUnit: params.coverUnitCost ?? ing.avgCostPerUnit ?? 0,
      reference: mType === 'production_consumption' ? 'Production Consumption' : 'Manual Adjustment',
      operatorName: params.operatorName,
      reason: params.reason,
      createdAt: new Date().toISOString(),
    };

    movements.unshift(newMovement);
    this.setItem(STORAGE_KEYS.MOVEMENTS, movements);

    return { ingredient: updated, movement: newMovement };
  }

  // ============================================================================
  // RECIPES
  // ============================================================================

  async listRecipes(): Promise<Recipe[]> {
    return this.getItem<Recipe[]>(STORAGE_KEYS.RECIPES, []);
  }

  async getRecipeById(id: string): Promise<Recipe | null> {
    const list = await this.listRecipes();
    return list.find((r) => r.id === id) || null;
  }

  async getRecipeByProductId(productId: string): Promise<Recipe | null> {
    const list = await this.listRecipes();
    return list.find((r) => r.productId === productId && r.isActive) || null;
  }

  async saveRecipe(
    data: Omit<Recipe, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
  ): Promise<Recipe> {
    const list = await this.listRecipes();
    const now = new Date().toISOString();

    if (data.id) {
      const idx = list.findIndex((r) => r.id === data.id);
      if (idx !== -1) {
        const updated: Recipe = {
          ...list[idx],
          ...data,
          id: data.id,
          version: list[idx].version + 1,
          updatedAt: now,
        };
        list[idx] = updated;
        this.setItem(STORAGE_KEYS.RECIPES, list);
        return updated;
      }
    }

    const newRecipe: Recipe = {
      ...data,
      id: `rec-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      version: 1,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };
    list.push(newRecipe);
    this.setItem(STORAGE_KEYS.RECIPES, list);
    return newRecipe;
  }

  // ============================================================================
  // PRODUCTION OPERATIONS
  // ============================================================================

  async listProductionRuns(options?: {
    limit?: number;
    startDate?: string;
    endDate?: string;
    productId?: string;
    status?: 'completed' | 'cancelled';
  }): Promise<ProductionRun[]> {
    let runs = this.getItem<ProductionRun[]>(STORAGE_KEYS.RUNS, []);

    if (options?.startDate) runs = runs.filter((r) => r.productionDate >= options.startDate!);
    if (options?.endDate) runs = runs.filter((r) => r.productionDate <= options.endDate!);
    if (options?.productId) runs = runs.filter((r) => r.productId === options.productId);
    if (options?.status) runs = runs.filter((r) => r.status === options.status);

    runs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    if (options?.limit) runs = runs.slice(0, options.limit);
    return runs;
  }

  async getProductionRunById(id: string): Promise<ProductionRun | null> {
    const runs = this.getItem<ProductionRun[]>(STORAGE_KEYS.RUNS, []);
    return runs.find((r) => r.id === id) || null;
  }

  async recordProductionRun(params: {
    runNumber: string;
    productId: string;
    recipeId?: string;
    recipeVersion?: number;
    productionDate: string;
    plannedQuantity: number;
    actualQuantity: number;
    unit: string;
    operatorName: string;
    notes?: string;
    ingredientsConsumed: Array<{
      ingredientId: string;
      expectedQuantity: number;
      actualQuantity: number;
      unit: string;
    }>;
    mixturesConsumed?: Array<{
      mixtureId: string;
      expectedQuantity?: number;
      actualQuantity: number;
      unit: UnitType;
    }>;
  }): Promise<ProductionRun> {
    const existingRuns = this.getItem<ProductionRun[]>(STORAGE_KEYS.RUNS, []);
    if (existingRuns.some((r) => r.runNumber === params.runNumber)) {
      throw new Error(`Production run with number "${params.runNumber}" already exists.`);
    }

    const product = await this.getProductById(params.productId);
    if (!product) throw new Error('Product not found');

    const ingredients = await this.listIngredients(true);
    const now = new Date().toISOString();
    const movements = this.getItem<StockMovement[]>(STORAGE_KEYS.MOVEMENTS, []);

    // 1. Verify and deduct ingredient stocks
    const consumedDetails = params.ingredientsConsumed.map((c) => {
      const ing = ingredients.find((i) => i.id === c.ingredientId);
      if (!ing) throw new Error(`Ingredient ${c.ingredientId} not found`);

      if (ing.currentStock < c.actualQuantity) {
        throw new Error(
          `Insufficient stock for ${ing.name}: Available ${ing.currentStock} ${ing.unit}, required ${c.actualQuantity} ${c.unit}`
        );
      }

      const prev = ing.currentStock;
      ing.currentStock -= c.actualQuantity;
      ing.updatedAt = now;

      movements.unshift({
        id: `mov-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        itemId: ing.id,
        itemType: 'ingredient',
        itemName: ing.name,
        movementType: 'production_consumption',
        quantity: -c.actualQuantity,
        unit: c.unit,
        previousBalance: prev,
        newBalance: ing.currentStock,
        reference: `Run ${params.runNumber}`,
        operatorName: params.operatorName,
        reason: `Consumed in production of ${product.name}`,
        createdAt: now,
      });

      return {
        ingredientId: ing.id,
        ingredientName: ing.name,
        expectedQuantity: c.expectedQuantity,
        actualQuantity: c.actualQuantity,
        unit: c.unit,
      };
    });


    // 1b. Check and deduct prepared special mixtures (RULE: Deduct only mixture stock, never raw ingredients)
    const consumedMixtureDetails: ProductionMixtureConsumption[] = [];
    let totalMixtureCost = 0;

    if (params.mixturesConsumed && params.mixturesConsumed.length > 0) {
      const mixtures = this.getItem<SpecialMixture[]>(STORAGE_KEYS.MIXTURES, []);
      for (const mc of params.mixturesConsumed) {
        const mix = mixtures.find((m) => m.id === mc.mixtureId);
        if (!mix) throw new Error(`Special mixture ${mc.mixtureId} not found`);
        if (mix.currentStock < mc.actualQuantity) {
          throw new Error(
            `Insufficient stock for mixture ${mix.name}: Available ${mix.currentStock} ${mix.unit}, required ${mc.actualQuantity} ${mc.unit}`
          );
        }
        const prev = mix.currentStock;
        mix.currentStock -= mc.actualQuantity;
        mix.updatedAt = now;

        const unitCost = mix.avgCostPerUnit || 0;
        const lineTotal = roundCurrency(mc.actualQuantity * unitCost);
        totalMixtureCost += lineTotal;

        movements.unshift({
          id: `mov-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          itemId: mix.id,
          itemType: 'product' as any,
          itemName: mix.name,
          movementType: 'production_consumption',
          quantity: -mc.actualQuantity,
          unit: mc.unit,
          previousBalance: prev,
          newBalance: mix.currentStock,
          costPerUnit: unitCost,
          reference: `Run ${params.runNumber}`,
          operatorName: params.operatorName,
          reason: `Consumed in cake / production run of ${product.name}`,
          createdAt: now,
        });

        consumedMixtureDetails.push({
          id: `pmc-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          runId: `run-${params.runNumber}`,
          mixtureId: mix.id,
          mixtureName: mix.name,
          expectedQuantity: mc.expectedQuantity ?? mc.actualQuantity,
          actualQuantity: mc.actualQuantity,
          unit: mc.unit,
          unitCost,
          totalCost: lineTotal,
        });
      }
      this.setItem(STORAGE_KEYS.MIXTURES, mixtures);
    }

    // 2. Increment product stock ONLY if batch has already been weighed (positive actualQuantity)
    const isUnweighed = !params.actualQuantity || params.actualQuantity <= 0;
    const effectivePlannedQty = params.plannedQuantity > 0 ? params.plannedQuantity : 10;
    const finalActualQty = isUnweighed ? 0 : params.actualQuantity;

    if (!isUnweighed) {
      const prevProdStock = product.currentStock;
      product.currentStock += finalActualQty;
      product.updatedAt = now;

      movements.unshift({
        id: `mov-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        itemId: product.id,
        itemType: 'product',
        itemName: product.name,
        movementType: 'production_output',
        quantity: finalActualQty,
        unit: params.unit,
        previousBalance: prevProdStock,
        newBalance: product.currentStock,
        reference: `Run ${params.runNumber}`,
        operatorName: params.operatorName,
        reason: 'Finished production output',
        createdAt: now,
      });

      await this.updateProduct(product.id, { currentStock: product.currentStock });
    }

    // Save updated stocks and movements
    this.setItem(STORAGE_KEYS.INGREDIENTS, ingredients);
    this.setItem(STORAGE_KEYS.MOVEMENTS, movements);

    // 3. Create run record
    const run: ProductionRun = {
      id: `run-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      runNumber: params.runNumber,
      productId: product.id,
      productName: product.name,
      recipeId: params.recipeId,
      recipeVersion: params.recipeVersion,
      productionDate: params.productionDate,
      plannedQuantity: effectivePlannedQty,
      actualQuantity: finalActualQty,
      unit: params.unit,
      status: 'completed',
      operatorName: params.operatorName,
      notes: params.notes,
      ingredientsConsumed: consumedDetails,
      mixturesConsumed: consumedMixtureDetails,
      totalMixtureCost,
      createdAt: now,
      updatedAt: now,
    };

    const runs = this.getItem<ProductionRun[]>(STORAGE_KEYS.RUNS, []);
    runs.unshift(run);
    this.setItem(STORAGE_KEYS.RUNS, runs);

    this.recordAudit(
      params.operatorName,
      'RECORD_PRODUCTION_RUN',
      'PRODUCTION',
      run.id,
      { runNumber: run.runNumber, product: product.name, quantity: params.actualQuantity }
    );

    return run;
  }

  async updateProductionRun(params: {
    runId: string;
    actualQuantity: number;
    plannedQuantity?: number;
    productionDate?: string;
    operatorName?: string;
    notes?: string;
    ingredientsConsumed?: Array<{
      ingredientId: string;
      expectedQuantity: number;
      actualQuantity: number;
      unit: string;
      unitCost?: number;
      totalCost?: number;
    }>;
  }): Promise<ProductionRun> {
    const runs = this.getItem<ProductionRun[]>(STORAGE_KEYS.RUNS, []);
    const idx = runs.findIndex((r) => r.id === params.runId);
    if (idx === -1) throw new Error('Run not found');

    const oldRun = runs[idx];
    const now = new Date().toISOString();
    const operator = params.operatorName || oldRun.operatorName || 'Kitchen Staff';
    const movements = this.getItem<StockMovement[]>(STORAGE_KEYS.MOVEMENTS, []);
    const ingredients = await this.listIngredients(true);
    const product = await this.getProductById(oldRun.productId);

    // 1. Adjust product stock delta
    const deltaProduct = Number((params.actualQuantity - oldRun.actualQuantity).toFixed(3));
    if (deltaProduct !== 0 && product) {
      const prevProdStock = product.currentStock;
      const newProdStock = Math.max(0, Number((prevProdStock + deltaProduct).toFixed(3)));
      product.currentStock = newProdStock;
      await this.updateProduct(product.id, { currentStock: newProdStock });

      movements.unshift({
        id: `mov-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        itemId: product.id,
        itemType: 'product',
        itemName: product.name,
        movementType: deltaProduct > 0 ? 'production_output' : 'adjustment',
        quantity: deltaProduct,
        unit: oldRun.unit,
        previousBalance: prevProdStock,
        newBalance: newProdStock,
        reference: `Run ${oldRun.runNumber} Edit`,
        operatorName: operator,
        reason: `Batch quantity adjusted from ${oldRun.actualQuantity} to ${params.actualQuantity} ${oldRun.unit}`,
        createdAt: now,
      });
    }

    // 2. Adjust ingredients consumed delta
    let updatedConsumed = oldRun.ingredientsConsumed;
    if (params.ingredientsConsumed && params.ingredientsConsumed.length > 0) {
      updatedConsumed = params.ingredientsConsumed.map((newIng) => {
        const oldIng = oldRun.ingredientsConsumed.find((c) => c.ingredientId === newIng.ingredientId);
        const oldQty = oldIng ? oldIng.actualQuantity : 0;
        const deltaIng = Number((newIng.actualQuantity - oldQty).toFixed(3));
        const ing = ingredients.find((i) => i.id === newIng.ingredientId);

        if (deltaIng !== 0 && ing) {
          const prevIngBal = ing.currentStock;
          const newIngBal = Math.max(0, Number((prevIngBal - deltaIng).toFixed(3)));
          ing.currentStock = newIngBal;
          ing.updatedAt = now;

          movements.unshift({
            id: `mov-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            itemId: ing.id,
            itemType: 'ingredient',
            itemName: ing.name,
            movementType: deltaIng > 0 ? 'production_consumption' : 'adjustment',
            quantity: -deltaIng,
            unit: newIng.unit,
            previousBalance: prevIngBal,
            newBalance: newIngBal,
            reference: `Run ${oldRun.runNumber} Edit`,
            operatorName: operator,
            reason: `Batch ingredient adjustment for ${oldRun.productName}`,
            createdAt: now,
          });
        }

        return {
          ingredientId: newIng.ingredientId,
          ingredientName: ing?.name || oldIng?.ingredientName || 'Ingredient',
          expectedQuantity: newIng.expectedQuantity,
          actualQuantity: newIng.actualQuantity,
          unit: newIng.unit,
          unitCost: newIng.unitCost,
          totalCost: newIng.totalCost,
        };
      });

      this.setItem(STORAGE_KEYS.INGREDIENTS, ingredients);
    }

    this.setItem(STORAGE_KEYS.MOVEMENTS, movements);

    // 3. Update run record
    const updatedRun: ProductionRun = {
      ...oldRun,
      actualQuantity: params.actualQuantity,
      plannedQuantity: params.plannedQuantity !== undefined ? params.plannedQuantity : oldRun.plannedQuantity,
      productionDate: params.productionDate || oldRun.productionDate,
      operatorName: operator,
      notes: params.notes !== undefined ? params.notes : oldRun.notes,
      ingredientsConsumed: updatedConsumed,
      updatedAt: now,
    };

    runs[idx] = updatedRun;
    this.setItem(STORAGE_KEYS.RUNS, runs);

    return updatedRun;
  }

  async cancelProductionRun(params: {
    runId: string;
    reason: string;
    operatorName: string;
  }): Promise<boolean> {
    const runs = this.getItem<ProductionRun[]>(STORAGE_KEYS.RUNS, []);
    const idx = runs.findIndex((r) => r.id === params.runId);
    if (idx === -1) throw new Error('Run not found');

    const run = runs[idx];
    if (run.status === 'cancelled') throw new Error('Run is already cancelled');

    const now = new Date().toISOString();
    const ingredients = await this.listIngredients(true);
    const product = await this.getProductById(run.productId);
    const movements = this.getItem<StockMovement[]>(STORAGE_KEYS.MOVEMENTS, []);

    // 1. Revert ingredient consumption
    for (const c of run.ingredientsConsumed) {
      const ing = ingredients.find((i) => i.id === c.ingredientId);
      if (ing) {
        const prev = ing.currentStock;
        ing.currentStock += c.actualQuantity;
        ing.updatedAt = now;

        movements.unshift({
          id: `mov-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          itemId: ing.id,
          itemType: 'ingredient',
          itemName: ing.name,
          movementType: 'cancellation_reversal',
          quantity: c.actualQuantity,
          unit: c.unit,
          previousBalance: prev,
          newBalance: ing.currentStock,
          reference: `Reversal of ${run.runNumber}`,
          operatorName: params.operatorName,
          reason: params.reason,
          createdAt: now,
        });
      }
    }

    // 2. Deduct product output
    if (product) {
      const prev = product.currentStock;
      product.currentStock = Math.max(0, product.currentStock - run.actualQuantity);
      product.updatedAt = now;

      movements.unshift({
        id: `mov-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        itemId: product.id,
        itemType: 'product',
        itemName: product.name,
        movementType: 'cancellation_reversal',
        quantity: -run.actualQuantity,
        unit: run.unit,
        previousBalance: prev,
        newBalance: product.currentStock,
        reference: `Reversal of ${run.runNumber}`,
        operatorName: params.operatorName,
        reason: params.reason,
        createdAt: now,
      });

      await this.updateProduct(product.id, { currentStock: product.currentStock });
    }

    // Save
    this.setItem(STORAGE_KEYS.INGREDIENTS, ingredients);
      // Restock consumed special mixtures (RULE: Restock only mixtures, never raw ingredients)
      if (run.mixturesConsumed && run.mixturesConsumed.length > 0) {
        const mixtures = this.getItem<SpecialMixture[]>(STORAGE_KEYS.MIXTURES, []);
        for (const mc of run.mixturesConsumed) {
          const mix = mixtures.find((m) => m.id === mc.mixtureId);
          if (mix) {
            const prev = mix.currentStock;
            mix.currentStock += mc.actualQuantity;
            mix.updatedAt = now;

            movements.unshift({
              id: `mov-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
              itemId: mix.id,
              itemType: 'product' as any,
              itemName: mix.name,
              movementType: 'cancellation_reversal',
              quantity: mc.actualQuantity,
              unit: mc.unit,
              previousBalance: prev,
              newBalance: mix.currentStock,
              reference: `Cancellation of Run ${run.runNumber}`,
              operatorName: params.operatorName,
              reason: `Reversal of consumed mixture for cancelled run: ${params.reason}`,
              createdAt: now,
            });
          }
        }
        this.setItem(STORAGE_KEYS.MIXTURES, mixtures);
      }
    this.setItem(STORAGE_KEYS.MOVEMENTS, movements);

    run.status = 'cancelled';
    run.cancellationReason = params.reason;
    run.cancelledAt = now;
    run.cancelledBy = params.operatorName;
    run.updatedAt = now;
    runs[idx] = run;
    this.setItem(STORAGE_KEYS.RUNS, runs);

    this.recordAudit(
      params.operatorName,
      'CANCEL_PRODUCTION_RUN',
      'PRODUCTION',
      run.id,
      { runNumber: run.runNumber, reason: params.reason }
    );

    return true;
  }

  async deleteProductionRun(
    params:
      | {
          runId: string;
          restock: boolean;
          operatorName: string;
          reason?: string;
        }
      | string
  ): Promise<boolean> {
    const runId = typeof params === 'string' ? params : params.runId;
    const restock = typeof params === 'string' ? true : params.restock;
    const operatorName = typeof params === 'string' ? 'Kitchen Staff' : params.operatorName || 'Kitchen Staff';

    const runs = this.getItem<ProductionRun[]>(STORAGE_KEYS.RUNS, []);
    const idx = runs.findIndex((r) => r.id === runId);
    if (idx === -1) return true;

    const run = runs[idx];
    const now = new Date().toISOString();

    if (restock) {
      // Revert ingredient consumption (add back to stock) and deduct product output
      await this.cancelProductionRun({
        runId,
        reason: 'restocked',
        operatorName,
      });
    } else {
      // Wastage: Do NOT restore ingredients! Only deduct product output as wastage
      const product = await this.getProductById(run.productId);
      const movements = this.getItem<StockMovement[]>(STORAGE_KEYS.MOVEMENTS, []);

      if (product) {
        const prev = product.currentStock;
        product.currentStock = Math.max(0, product.currentStock - run.actualQuantity);
        product.updatedAt = now;

        movements.unshift({
          id: `mov-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          itemId: product.id,
          itemType: 'product',
          itemName: product.name,
          movementType: 'wastage',
          quantity: -run.actualQuantity,
          unit: run.unit,
          previousBalance: prev,
          newBalance: product.currentStock,
          reference: `Wastage of batch`,
          operatorName,
          reason: 'Batch marked as wastage on delete',
          createdAt: now,
        });

        await this.updateProduct(product.id, { currentStock: product.currentStock });
        this.setItem(STORAGE_KEYS.MOVEMENTS, movements);
      }

      this.recordAudit(operatorName, 'DELETE_BATCH_WASTAGE', 'PRODUCTION', run.id, {
        product: run.productName,
        quantity: run.actualQuantity,
      });
    }

    // Completely remove the deleted run from storage so it does not appear in Pantry Management
    const updatedRuns = this.getItem<ProductionRun[]>(STORAGE_KEYS.RUNS, []).filter((r) => r.id !== runId);
    this.setItem(STORAGE_KEYS.RUNS, updatedRuns);

    // Also clean up related packing records
    await this.deletePackingRecordsForRun(runId, run.runNumber);
    return true;
  }

  // ============================================================================
  // STOCK LEDGER
  // ============================================================================

  async getStockMovements(filter?: {
    itemId?: string;
    itemType?: 'ingredient' | 'product';
    type?: MovementType;
    limit?: number;
  }): Promise<StockMovement[]> {
    let list = this.getItem<StockMovement[]>(STORAGE_KEYS.MOVEMENTS, []);

    if (filter?.itemId) list = list.filter((m) => m.itemId === filter.itemId);
    if (filter?.itemType) list = list.filter((m) => m.itemType === filter.itemType);
    if (filter?.type) list = list.filter((m) => m.movementType === filter.type);

    if (filter?.limit) list = list.slice(0, filter.limit);
    return list;
  }

  // ============================================================================
  // ADMIN AUTH & DASHBOARD
  // ============================================================================

  async isAdminInitialized(): Promise<boolean> {
    const sec = this.getItem<any>(STORAGE_KEYS.SECURITY, null);
    return Boolean(sec?.isInitialized);
  }

  async setupAdminPin(
    pin: string,
    recoveryKey: string
  ): Promise<{ success: boolean; sessionToken: string }> {
    if (!/^\d{6}$/.test(pin)) {
      throw new Error('PIN must be exactly 6 numeric digits');
    }
    if (recoveryKey.trim().length < 6) {
      throw new Error('Recovery key must be at least 6 characters');
    }

    const sec = {
      pin, // In mock, store string; in Supabase, bcrypt salted hash
      recoveryKey,
      failedAttempts: 0,
      lockedUntil: null,
      isInitialized: true,
      updatedAt: new Date().toISOString(),
    };
    this.setItem(STORAGE_KEYS.SECURITY, sec);

    const token = `adm_sess_${Date.now()}_${Math.random().toString(36).substring(2)}`;
    const expiresAt = new Date(Date.now() + 12 * 3600 * 1000).toISOString();
    this.setItem(STORAGE_KEYS.SESSIONS, { token, expiresAt });

    this.recordAudit('Shop Owner', 'SETUP_ADMIN_PIN', 'SECURITY', 'owner', { status: 'initialized' });
    return { success: true, sessionToken: token };
  }

  async verifyAdminPin(
    pin: string
  ): Promise<{ success: boolean; sessionToken?: string; needsSetup?: boolean }> {
    const sec = this.getItem<any>(STORAGE_KEYS.SECURITY, null);
    if (!sec || !sec.isInitialized) {
      return { success: false, needsSetup: true };
    }

    if (sec.lockedUntil && new Date(sec.lockedUntil) > new Date()) {
      throw new Error(`Account temporarily locked due to repeated failed attempts. Try again later.`);
    }

    if (!/^\d{6}$/.test(pin)) {
      throw new Error('PIN must be exactly 6 digits');
    }

    if (sec.pin === pin) {
      sec.failedAttempts = 0;
      sec.lockedUntil = null;
      this.setItem(STORAGE_KEYS.SECURITY, sec);

      const token = `adm_sess_${Date.now()}_${Math.random().toString(36).substring(2)}`;
      const expiresAt = new Date(Date.now() + 12 * 3600 * 1000).toISOString();
      this.setItem(STORAGE_KEYS.SESSIONS, { token, expiresAt });

      this.recordAudit('Shop Owner', 'ADMIN_LOGIN_SUCCESS', 'SECURITY', 'owner', {});
      return { success: true, sessionToken: token };
    } else {
      sec.failedAttempts = (sec.failedAttempts || 0) + 1;
      if (sec.failedAttempts >= 5) {
        sec.lockedUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      }
      this.setItem(STORAGE_KEYS.SECURITY, sec);

      this.recordAudit('Unknown', 'ADMIN_LOGIN_FAILED', 'SECURITY', 'owner', {
        attempts: sec.failedAttempts,
      });

      if (sec.failedAttempts >= 5) {
        throw new Error('Incorrect PIN. Account locked for 15 minutes due to 5 consecutive failed attempts.');
      } else {
        throw new Error(`Incorrect PIN. ${5 - sec.failedAttempts} attempt(s) remaining before lockout.`);
      }
    }
  }

  async resetAdminPinWithRecovery(
    recoveryKey: string,
    newPin: string
  ): Promise<{ success: boolean; message: string }> {
    const sec = this.getItem<any>(STORAGE_KEYS.SECURITY, null);
    if (!sec || !sec.isInitialized) {
      throw new Error('System security has not been initialized yet');
    }

    if (!/^\d{6}$/.test(newPin)) {
      throw new Error('New PIN must be exactly 6 digits');
    }

    if (sec.recoveryKey === recoveryKey.trim()) {
      sec.pin = newPin;
      sec.failedAttempts = 0;
      sec.lockedUntil = null;
      sec.updatedAt = new Date().toISOString();
      this.setItem(STORAGE_KEYS.SECURITY, sec);

      // Clear sessions
      this.removeItem(STORAGE_KEYS.SESSIONS);

      this.recordAudit('Shop Owner', 'ADMIN_PIN_RESET', 'SECURITY', 'owner', {});
      return { success: true, message: 'PIN reset successfully. Please log in with your new PIN.' };
    } else {
      throw new Error('Invalid recovery key phrase');
    }
  }

  async verifyAdminSession(token: string): Promise<boolean> {
    if (!token) return false;
    const sess = this.getItem<any>(STORAGE_KEYS.SESSIONS, null);
    if (!sess || sess.token !== token) return false;
    return new Date(sess.expiresAt) > new Date();
  }

  async getAdminDashboardMetrics(
    startDate: string,
    endDate: string
  ): Promise<AdminDashboardMetrics> {
    const products = await this.listProducts(true);
    const ingredients = await this.listIngredients(true);
    const runs = this.getItem<ProductionRun[]>(STORAGE_KEYS.RUNS, []);

    const todayStr = new Date().toISOString().split('T')[0];
    const runsToday = runs.filter((r) => r.productionDate === todayStr && r.status === 'completed');
    const qtyToday = runsToday.reduce((sum, r) => sum + r.actualQuantity, 0);

    const periodRuns = runs.filter(
      (r) => r.productionDate >= startDate && r.productionDate <= endDate && r.status === 'completed'
    );
    const qtyInPeriod = periodRuns.reduce((sum, r) => sum + r.actualQuantity, 0);

    // Group by product
    const productMap: Record<string, { totalQuantity: number; runCount: number; unit: string }> = {};
    for (const r of periodRuns) {
      if (!productMap[r.productName]) {
        productMap[r.productName] = { totalQuantity: 0, runCount: 0, unit: r.unit };
      }
      productMap[r.productName].totalQuantity += r.actualQuantity;
      productMap[r.productName].runCount += 1;
    }

    const byProduct = Object.entries(productMap).map(([productName, data]) => ({
      productName,
      unit: data.unit,
      totalQuantity: data.totalQuantity,
      runCount: data.runCount,
    }));

    // Group consumption
    const consMap: Record<string, { totalConsumed: number; category: string; unit: string }> = {};
    for (const r of periodRuns) {
      for (const c of r.ingredientsConsumed || []) {
        if (!consMap[c.ingredientName]) {
          const ing = ingredients.find((i) => i.id === c.ingredientId);
          consMap[c.ingredientName] = {
            totalConsumed: 0,
            category: ing?.category || 'other',
            unit: c.unit,
          };
        }
        consMap[c.ingredientName].totalConsumed += c.actualQuantity;
      }
    }

    const consumption = Object.entries(consMap).map(([ingredientName, data]) => ({
      ingredientName,
      category: data.category,
      unit: data.unit,
      totalConsumed: data.totalConsumed,
    }));

    const recentActivity = runs.slice(0, 8).map((r) => ({
      id: r.id,
      runNumber: r.runNumber,
      productName: r.productName,
      productionDate: r.productionDate,
      actualQuantity: r.actualQuantity,
      unit: r.unit,
      status: r.status,
      operatorName: r.operatorName,
      createdAt: r.createdAt,
    }));

    return {
      totalProducts: products.length,
      activeProducts: products.filter((p) => p.isActive).length,
      inactiveProducts: products.filter((p) => !p.isActive).length,
      totalIngredients: ingredients.length,
      runsToday: runsToday.length,
      qtyToday,
      runsInPeriod: periodRuns.length,
      qtyInPeriod,
      byProduct,
      consumption,
      recentActivity,
    };
  }

  async getAuditLogs(limit = 50): Promise<AuditLog[]> {
    const logs = this.getItem<AuditLog[]>(STORAGE_KEYS.AUDIT_LOGS, []);
    return logs.slice(0, limit);
  }

  private recordAudit(
    actor: string,
    action: string,
    entityType: string,
    entityId?: string,
    details?: Record<string, any>
  ): void {
    const logs = this.getItem<AuditLog[]>(STORAGE_KEYS.AUDIT_LOGS, []);
    logs.unshift({
      id: `audit-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      actor,
      action,
      entityType,
      entityId,
      details,
      createdAt: new Date().toISOString(),
    });
    this.setItem(STORAGE_KEYS.AUDIT_LOGS, logs.slice(0, 200));
  }

  // ============================================================================
  // COSTING & PACKAGING DEMO METHODS
  // ============================================================================

  async getDailyClosing(_date: string): Promise<DailyClosing | null> {
    return null;
  }

  async listDailyClosings(_limit = 60): Promise<DailyClosing[]> {
    return [];
  }

  async saveDailyClosing(params: {
    productionDate: string;
    oilOpeningBalance?: number;
    oilPurchases?: number;
    oilClosingBalance?: number;
    oilUsedKg?: number;
    oilLeftoverKg?: number;
    oilCostPerKg: number;
    productionWages: number;
    notes?: string;
    closedBy: string;
  }): Promise<DailyClosing> {
    const ings = await this.listIngredients(false);
    const oil = ings.find((i) => i.name.toLowerCase().includes('oil') || i.name.includes('ഓയിൽ'));
    const prevStock = oil ? oil.currentStock : (params.oilOpeningBalance ?? 20);

    let used = 0;
    let leftover = 0;
    if (params.oilUsedKg !== undefined) {
      used = Math.max(0, roundStock(params.oilUsedKg));
      leftover = Math.max(0, Math.min(used, roundStock(params.oilLeftoverKg ?? 0)));
    } else {
      used = Math.max(0, roundStock((params.oilOpeningBalance ?? 0) - (params.oilClosingBalance ?? 0)));
      leftover = Math.max(0, roundStock(params.oilClosingBalance ?? 0));
    }

    const {
      netOilConsumedKg: consumed,
      finalOilStockKg: finalStock,
      oilTotalExpense: expense,
    } = calculateDailyOilUsage(prevStock, used, leftover, params.oilCostPerKg);

    if (oil) {
      await this.updateIngredient(oil.id, { currentStock: finalStock });
    }

    return {
      id: `closing-${Date.now()}`,
      productionDate: params.productionDate,
      oilOpeningBalance: prevStock,
      oilPurchases: params.oilPurchases || 0,
      oilClosingBalance: finalStock,
      oilConsumed: consumed,
      totalOilUsedKg: used,
      oilLeftoverKg: leftover,
      oilCostPerKg: params.oilCostPerKg,
      oilTotalExpense: expense,
      productionWages: params.productionWages,
      totalSharedExpense: expense + params.productionWages,
      totalProductionKg: 0,
      status: 'closed',
      notes: params.notes,
      closedBy: params.closedBy,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  async listCostAllocations(_dateOrClosingId: string): Promise<DailyCostAllocation[]> {
    return [];
  }

  async listPackagingItems(_productId?: string): Promise<PackagingItem[]> {
    const stored = this.getItem<PackagingItem[]>('pb_packaging_items', []);
    if (stored.length > 0) return stored;

    const defaultItems: PackagingItem[] = [
      { id: 'pkg-1', productId: '', sizeLabel: '3kg HM Packet', sizeGrams: 3000, currentStock: 150, unitCost: 3.5, packingLabourRate: 1.0, isActive: true },
      { id: 'pkg-2', productId: '', sizeLabel: '2KG HM Packet', sizeGrams: 2000, currentStock: 90, unitCost: 2.8, packingLabourRate: 1.0, isActive: true },
      { id: 'pkg-3', productId: '', sizeLabel: '10 x 12 Packet', sizeGrams: 500, currentStock: 120, unitCost: 1.5, packingLabourRate: 1.0, isActive: true },
      { id: 'pkg-4', productId: '', sizeLabel: '10 x 14 Packet', sizeGrams: 750, currentStock: 0, unitCost: 1.8, packingLabourRate: 1.0, isActive: true }, // Out of stock example
      { id: 'pkg-5', productId: '', sizeLabel: '10 x 16 Packet', sizeGrams: 1000, currentStock: 200, unitCost: 2.0, packingLabourRate: 1.0, isActive: true },
      { id: 'pkg-6', productId: '', sizeLabel: '8 x 10 Packet', sizeGrams: 250, currentStock: 60, unitCost: 1.2, packingLabourRate: 1.0, isActive: true },
      { id: 'pkg-7', productId: '', sizeLabel: '8 x 12 Packet', sizeGrams: 350, currentStock: 0, unitCost: 1.4, packingLabourRate: 1.0, isActive: true }, // Out of stock example
    ];
    this.setItem('pb_packaging_items', defaultItems);
    return defaultItems;
  }

  async savePackagingItem(item: Partial<PackagingItem> & { productId: string; sizeLabel: string }): Promise<PackagingItem> {
    const list = await this.listPackagingItems();
    const id = item.id || `pack-${Date.now()}`;
    const newItem: PackagingItem = {
      id,
      productId: item.productId,
      sizeLabel: item.sizeLabel,
      sizeGrams: item.sizeGrams || 100,
      currentStock: item.currentStock || 0,
      unitCost: item.unitCost || 0,
      packingLabourRate: item.packingLabourRate || 1.0,
      isActive: item.isActive ?? true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const idx = list.findIndex((p) => p.id === id);
    if (idx >= 0) {
      list[idx] = newItem;
    } else {
      list.push(newItem);
    }
    this.setItem('pb_packaging_items', list);
    return newItem;
  }

  async deletePackagingItem(id: string): Promise<void> {
    const list = (await this.listPackagingItems()).filter((p) => p.id !== id);
    this.setItem('pb_packaging_items', list);
  }

  async listPacketTypes(): Promise<PacketType[]> {
    return [
      { id: 'pkt-1', name: '3kg HM Packet', bundleCost: 0, bundleQuantity: 100, costPerPacket: 0, isActive: true },
      { id: 'pkt-2', name: '2KG HM Packet', bundleCost: 0, bundleQuantity: 100, costPerPacket: 0, isActive: true },
      { id: 'pkt-3', name: '10 x 12 Packet', bundleCost: 0, bundleQuantity: 100, costPerPacket: 0, isActive: true },
      { id: 'pkt-4', name: '10 x 14 Packet', bundleCost: 0, bundleQuantity: 100, costPerPacket: 0, isActive: true },
      { id: 'pkt-5', name: '10 x 16 Packet', bundleCost: 0, bundleQuantity: 100, costPerPacket: 0, isActive: true },
      { id: 'pkt-6', name: '8 x 10 Packet', bundleCost: 0, bundleQuantity: 100, costPerPacket: 0, isActive: true },
      { id: 'pkt-7', name: '8 x 12 Packet', bundleCost: 0, bundleQuantity: 100, costPerPacket: 0, isActive: true },
    ];
  }

  async savePacketType(data: Partial<PacketType> & { name: string }): Promise<PacketType> {
    const bundleCost = Number(data.bundleCost) || 0;
    const bundleQuantity = Math.max(1, Number(data.bundleQuantity) || 1);
    const costPerPacket = data.costPerPacket ?? (bundleQuantity > 0 ? bundleCost / bundleQuantity : 0);
    return {
      id: data.id || `pkt-${Date.now()}`,
      name: data.name,
      bundleCost,
      bundleQuantity,
      costPerPacket,
      isActive: data.isActive ?? true,
    };
  }

  async deletePacketType(_id: string): Promise<void> {}

  async recordPacking(params: {
    packingDate: string;
    productId: string;
    productionRunId?: string;
    packagingItemId?: string;
    packetSize: string;
    packetsPacked: number;
    operatorName: string;
    notes?: string;
  }): Promise<PackingRecord> {
    const records = this.getItem<PackingRecord[]>('pb_packing_records', []);
    const product = await this.getProductById(params.productId);
    const prodName = product?.name || 'Product';

    const existingIdx = records.findIndex(
      (r) =>
        (params.productionRunId ? r.productionRunId === params.productionRunId : true) &&
        r.packetSize.toLowerCase() === params.packetSize.toLowerCase()
    );

    // If packetsPacked is 0, delete the record
    if (params.packetsPacked <= 0) {
      if (existingIdx >= 0) {
        records.splice(existingIdx, 1);
        this.setItem('pb_packing_records', records);
      }
      return {
        id: `packing-${Date.now()}`,
        packingDate: params.packingDate,
        productId: params.productId,
        productName: prodName,
        productionRunId: params.productionRunId,
        packagingItemId: params.packagingItemId,
        packetSize: params.packetSize,
        packetsPacked: 0,
        coversConsumed: 0,
        coverUnitCost: 0,
        packagingCost: 0,
        packingLabourRate: 1.0,
        packingLabourCost: 0,
        totalPackingCost: 0,
        weightPackedKg: 0,
        operatorName: params.operatorName,
        notes: params.notes,
        createdAt: new Date().toISOString(),
      };
    }

    const rec: PackingRecord = {
      id: existingIdx >= 0 ? records[existingIdx].id : `packing-${Date.now()}`,
      packingDate: params.packingDate,
      productId: params.productId,
      productName: prodName,
      productionRunId: params.productionRunId,
      packagingItemId: params.packagingItemId,
      packetSize: params.packetSize,
      packetsPacked: params.packetsPacked,
      coversConsumed: params.packetsPacked,
      coverUnitCost: 0,
      packagingCost: 0,
      packingLabourRate: 1.0,
      packingLabourCost: params.packetsPacked,
      totalPackingCost: params.packetsPacked,
      weightPackedKg: (params.packetsPacked * 100) / 1000,
      operatorName: params.operatorName,
      notes: params.notes,
      createdAt: existingIdx >= 0 ? records[existingIdx].createdAt : new Date().toISOString(),
    };

    if (existingIdx >= 0) {
      records[existingIdx] = rec;
    } else {
      records.push(rec);
    }
    this.setItem('pb_packing_records', records);

    // Adjust packaging stock in demo storage
    const packItems = await this.listPackagingItems();
    const packIdx = packItems.findIndex((p) => p.sizeLabel.toLowerCase() === params.packetSize.toLowerCase());
    if (packIdx >= 0) {
      packItems[packIdx].currentStock = Math.max(0, packItems[packIdx].currentStock - params.packetsPacked);
      this.setItem('pb_packaging_items', packItems);
    }

    return rec;
  }

  async listPackingRecords(options?: { productId?: string; date?: string; limit?: number }): Promise<PackingRecord[]> {
    let records = this.getItem<PackingRecord[]>('pb_packing_records', []);
    if (options?.productId) {
      records = records.filter((r) => r.productId === options.productId);
    }
    if (options?.date) {
      records = records.filter((r) => r.packingDate === options.date);
    }
    if (options?.limit) {
      records = records.slice(0, options.limit);
    }
    return records;
  }

  async deletePackingRecordsForRun(runId: string, runNumber?: string): Promise<void> {
    let records = this.getItem<PackingRecord[]>('pb_packing_records', []);
    records = records.filter(
      (r) =>
        r.productionRunId !== runId &&
        !(runNumber && r.notes && r.notes.includes(runNumber))
    );
    this.setItem('pb_packing_records', records);
  }


  // ==============================================================================
  // SPECIAL PREPARED MIXTURES & CAKE PRODUCTION METHODS
  // ==============================================================================

  async listSpecialMixtures(includeInactive = false): Promise<SpecialMixture[]> {
    const list = this.getItem<SpecialMixture[]>(STORAGE_KEYS.MIXTURES, []);
    const recipes = this.getItem<SpecialMixtureRecipe[]>(STORAGE_KEYS.MIXTURE_RECIPES, []);
    const filtered = includeInactive ? list : list.filter((m) => m.isActive);
    return filtered.map((m) => {
      const activeRecipe = recipes.find((r) => r.mixtureId === m.id && r.isActive);
      return { ...m, recipe: activeRecipe };
    });
  }

  async getSpecialMixtureById(id: string): Promise<SpecialMixture | null> {
    const list = this.getItem<SpecialMixture[]>(STORAGE_KEYS.MIXTURES, []);
    const item = list.find((m) => m.id === id);
    if (!item) return null;
    const recipes = this.getItem<SpecialMixtureRecipe[]>(STORAGE_KEYS.MIXTURE_RECIPES, []);
    const activeRecipe = recipes.find((r) => r.mixtureId === id && r.isActive);
    return { ...item, recipe: activeRecipe };
  }

  async saveSpecialMixture(data: Partial<SpecialMixture> & { name: string; unit: UnitType }): Promise<SpecialMixture> {
    const list = this.getItem<SpecialMixture[]>(STORAGE_KEYS.MIXTURES, []);
    const now = new Date().toISOString();
    let updated: SpecialMixture;

    if (data.id) {
      const idx = list.findIndex((m) => m.id === data.id);
      if (idx === -1) throw new Error('Special mixture not found');
      updated = {
        ...list[idx],
        ...data,
        updatedAt: now,
      };
      list[idx] = updated;
    } else {
      updated = {
        id: `mix-${Date.now()}`,
        name: data.name,
        code: data.code || `MIX-${Date.now().toString().slice(-4)}`,
        unit: data.unit,
        currentStock: Number(data.currentStock) || 0,
        minStock: Number(data.minStock) || 0,
        avgCostPerUnit: Number(data.avgCostPerUnit) || 0,
        notes: data.notes || '',
        isActive: data.isActive ?? true,
        createdAt: now,
        updatedAt: now,
      };
      list.push(updated);
    }

    this.setItem(STORAGE_KEYS.MIXTURES, list);
    return updated;
  }

  async saveSpecialMixtureRecipe(mixtureId: string, recipe: Partial<SpecialMixtureRecipe>): Promise<SpecialMixtureRecipe> {
    const recipes = this.getItem<SpecialMixtureRecipe[]>(STORAGE_KEYS.MIXTURE_RECIPES, []);
    const now = new Date().toISOString();
    let saved: SpecialMixtureRecipe;

    const existing = recipes.map((r) => (r.mixtureId === mixtureId ? { ...r, isActive: false } : r));

    if (recipe.id) {
      const idx = existing.findIndex((r) => r.id === recipe.id);
      saved = {
        ...existing[idx],
        ...recipe,
        mixtureId,
        isActive: true,
        updatedAt: now,
      } as SpecialMixtureRecipe;
      existing[idx] = saved;
    } else {
      saved = {
        id: `mix-rec-${Date.now()}`,
        mixtureId,
        version: recipe.version || 1,
        expectedOutputQuantity: Number(recipe.expectedOutputQuantity) || 1,
        expectedOutputUnit: (recipe.expectedOutputUnit || 'kg') as UnitType,
        instructions: recipe.instructions || '',
        estimatedCost: Number(recipe.estimatedCost) || 0,
        isActive: true,
        items: recipe.items || [],
        createdAt: now,
        updatedAt: now,
      };
      existing.push(saved);
    }

    this.setItem(STORAGE_KEYS.MIXTURE_RECIPES, existing);
    return saved;
  }

  async prepareSpecialMixture(params: {
    mixtureId: string;
    batchNumber?: string;
    preparationDate: string;
    plannedQuantity: number;
    actualQuantity: number;
    unit: UnitType;
    operatorName: string;
    notes?: string;
    expiryDate?: string;
    ingredientsConsumed: Array<{
      ingredientId: string;
      expectedQuantity?: number;
      actualQuantity: number;
      unit: UnitType;
      unitCost?: number;
    }>;
  }): Promise<SpecialMixtureBatch> {
    const mixtures = this.getItem<SpecialMixture[]>(STORAGE_KEYS.MIXTURES, []);
    const mixture = mixtures.find((m) => m.id === params.mixtureId);
    if (!mixture) throw new Error('Special mixture not found');

    const ingredients = this.getItem<Ingredient[]>(STORAGE_KEYS.INGREDIENTS, []);
    const movements = this.getItem<StockMovement[]>(STORAGE_KEYS.MOVEMENTS, []);
    const batches = this.getItem<SpecialMixtureBatch[]>(STORAGE_KEYS.MIXTURE_BATCHES, []);
    const allConsumptions = this.getItem<SpecialMixtureConsumption[]>(STORAGE_KEYS.MIXTURE_CONSUMPTIONS, []);
    const now = new Date().toISOString();

    const batchNumber =
      params.batchNumber ||
      `MB-${params.preparationDate.replace(/-/g, '')}-${Math.floor(100 + Math.random() * 900)}`;

    let totalIngredientCost = 0;
    const batchId = `mb-${Date.now()}`;
    const consumedRecords: SpecialMixtureConsumption[] = [];

    // 1. Verify and deduct raw ingredients
    for (const c of params.ingredientsConsumed) {
      const ing = ingredients.find((i) => i.id === c.ingredientId);
      if (!ing) throw new Error(`Ingredient ${c.ingredientId} not found`);

      if (ing.currentStock < c.actualQuantity) {
        throw new Error(
          `Insufficient stock for ${ing.name}: Available ${ing.currentStock} ${ing.unit}, required ${c.actualQuantity} ${c.unit}`
        );
      }

      const prev = ing.currentStock;
      ing.currentStock -= c.actualQuantity;
      ing.updatedAt = now;

      const unitCost = c.unitCost ?? ing.avgCostPerUnit ?? 0;
      const lineCost = roundCurrency(c.actualQuantity * unitCost);
      totalIngredientCost += lineCost;

      movements.unshift({
        id: `mov-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        itemId: ing.id,
        itemType: 'ingredient',
        itemName: ing.name,
        movementType: 'production_consumption',
        quantity: -c.actualQuantity,
        unit: c.unit,
        previousBalance: prev,
        newBalance: ing.currentStock,
        costPerUnit: unitCost,
        reference: `Mixture Batch ${batchNumber}`,
        operatorName: params.operatorName,
        reason: `Consumed in preparing mixture ${mixture.name}`,
        createdAt: now,
      });

      const consumptionRecord: SpecialMixtureConsumption = {
        id: `smc-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        batchId,
        ingredientId: ing.id,
        ingredientName: ing.name,
        expectedQuantity: c.expectedQuantity ?? c.actualQuantity,
        actualQuantity: c.actualQuantity,
        unit: c.unit,
        unitCost,
        totalCost: lineCost,
      };
      consumedRecords.push(consumptionRecord);
      allConsumptions.push(consumptionRecord);
    }

    // 2. Increase mixture stock and update weighted average cost
    const prevStock = mixture.currentStock;
    const newStock = prevStock + params.actualQuantity;
    const costPerUnit = params.actualQuantity > 0 ? roundCurrency(totalIngredientCost / params.actualQuantity) : 0;

    const existingValuation = prevStock * (mixture.avgCostPerUnit || 0);
    const newBatchValuation = totalIngredientCost;
    const updatedAvgCost = newStock > 0 ? roundCurrency((existingValuation + newBatchValuation) / newStock) : costPerUnit;

    mixture.currentStock = newStock;
    mixture.avgCostPerUnit = updatedAvgCost;
    mixture.updatedAt = now;

    movements.unshift({
      id: `mov-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      itemId: mixture.id,
      itemType: 'product' as any,
      itemName: mixture.name,
      movementType: 'production_yield',
      quantity: params.actualQuantity,
      unit: params.unit,
      previousBalance: prevStock,
      newBalance: newStock,
      costPerUnit,
      reference: `Mixture Batch ${batchNumber}`,
      operatorName: params.operatorName,
      reason: `Cooked / Prepared Mixture Yield`,
      createdAt: now,
    });

    const newBatch: SpecialMixtureBatch = {
      id: batchId,
      batchNumber,
      mixtureId: mixture.id,
      mixtureName: mixture.name,
      preparationDate: params.preparationDate,
      plannedQuantity: params.plannedQuantity,
      actualQuantity: params.actualQuantity,
      unit: params.unit,
      totalIngredientCost,
      costPerUnit,
      status: 'completed',
      operatorName: params.operatorName,
      expiryDate: params.expiryDate,
      notes: params.notes,
      consumedIngredients: consumedRecords,
      createdAt: now,
      updatedAt: now,
    };

    batches.unshift(newBatch);

    this.setItem(STORAGE_KEYS.INGREDIENTS, ingredients);
    this.setItem(STORAGE_KEYS.MIXTURES, mixtures);
    this.setItem(STORAGE_KEYS.MOVEMENTS, movements);
    this.setItem(STORAGE_KEYS.MIXTURE_BATCHES, batches);
    this.setItem(STORAGE_KEYS.MIXTURE_CONSUMPTIONS, allConsumptions);

    return newBatch;
  }

  async listSpecialMixtureBatches(options?: { mixtureId?: string; limit?: number }): Promise<SpecialMixtureBatch[]> {
    let batches = this.getItem<SpecialMixtureBatch[]>(STORAGE_KEYS.MIXTURE_BATCHES, []);
    if (options?.mixtureId) {
      batches = batches.filter((b) => b.mixtureId === options.mixtureId);
    }
    batches.sort((a, b) => new Date(b.preparationDate).getTime() - new Date(a.preparationDate).getTime());
    if (options?.limit) {
      batches = batches.slice(0, options.limit);
    }
    return batches;
  }

  async cancelSpecialMixtureBatch(batchId: string, reason: string, operatorName: string): Promise<boolean> {
    const batches = this.getItem<SpecialMixtureBatch[]>(STORAGE_KEYS.MIXTURE_BATCHES, []);
    const batch = batches.find((b) => b.id === batchId);
    if (!batch || batch.status === 'cancelled') return false;

    const mixtures = this.getItem<SpecialMixture[]>(STORAGE_KEYS.MIXTURES, []);
    const mixture = mixtures.find((m) => m.id === batch.mixtureId);
    const ingredients = this.getItem<Ingredient[]>(STORAGE_KEYS.INGREDIENTS, []);
    const movements = this.getItem<StockMovement[]>(STORAGE_KEYS.MOVEMENTS, []);
    const consumptions = this.getItem<SpecialMixtureConsumption[]>(STORAGE_KEYS.MIXTURE_CONSUMPTIONS, []);
    const batchConsumptions = consumptions.filter((c) => c.batchId === batchId);
    const now = new Date().toISOString();

    if (mixture) {
      const prevStock = mixture.currentStock;
      mixture.currentStock = Math.max(0, mixture.currentStock - batch.actualQuantity);
      mixture.updatedAt = now;

      movements.unshift({
        id: `mov-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        itemId: mixture.id,
        itemType: 'product' as any,
        itemName: mixture.name,
        movementType: 'cancellation_reversal',
        quantity: -batch.actualQuantity,
        unit: batch.unit,
        previousBalance: prevStock,
        newBalance: mixture.currentStock,
        reference: `Reversal of Batch ${batch.batchNumber}`,
        operatorName,
        reason: `Mixture batch cancelled: ${reason}`,
        createdAt: now,
      });
    }

    for (const c of batchConsumptions) {
      const ing = ingredients.find((i) => i.id === c.ingredientId);
      if (ing) {
        const prevStock = ing.currentStock;
        ing.currentStock += c.actualQuantity;
        ing.updatedAt = now;

        movements.unshift({
          id: `mov-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          itemId: ing.id,
          itemType: 'ingredient',
          itemName: ing.name,
          movementType: 'cancellation_reversal',
          quantity: c.actualQuantity,
          unit: c.unit,
          previousBalance: prevStock,
          newBalance: ing.currentStock,
          reference: `Reversal of Batch ${batch.batchNumber}`,
          operatorName,
          reason: `Mixture batch cancelled restock: ${reason}`,
          createdAt: now,
        });
      }
    }

    batch.status = 'cancelled';
    batch.cancellationReason = reason;
    batch.updatedAt = now;

    this.setItem(STORAGE_KEYS.MIXTURE_BATCHES, batches);
    this.setItem(STORAGE_KEYS.MIXTURES, mixtures);
    this.setItem(STORAGE_KEYS.INGREDIENTS, ingredients);
    this.setItem(STORAGE_KEYS.MOVEMENTS, movements);

    return true;
  }


  invalidateCache(_key?: string): void {}
}

