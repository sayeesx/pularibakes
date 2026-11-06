import { IEpsoRepository } from './repository';
import {
  Ingredient,
  Product,
  Recipe,
  PacketType,
  RecipePacket,
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
import { supabase, isSupabaseConfigured } from './supabaseClient';
import {
  allocateDailySharedExpenses,
  calculateContinuousOilExpense,
  calculateDailyOilUsage,
  roundCurrency,
  roundStock,
} from './costing';
import { dbCache } from './dbCache';

export class SupabaseRepository implements IEpsoRepository {
  private checkClient() {
    if (!isSupabaseConfigured || !supabase) {
      throw new Error(
        'Supabase is not configured. Please supply valid VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file.'
      );
    }
    return supabase;
  }

  isSupabaseMode(): boolean {
    return true;
  }


  // ==============================================================================
  // SPECIAL PREPARED MIXTURES & CAKE PRODUCTION METHODS
  // ==============================================================================

  async listSpecialMixtures(includeInactive = false): Promise<SpecialMixture[]> {
    return dbCache.wrap(
      `special_mixtures_${includeInactive}`,
      async () => {
        const client = this.checkClient();
        let query = client.from('special_mixtures').select('*, special_mixture_recipes(*, special_mixture_recipe_items(*, ingredients(name, unit, avg_cost_per_unit)))').order('name', { ascending: true });
        if (!includeInactive) {
          query = query.eq('is_active', true);
        }
        const { data, error } = await query;
        if (error) throw new Error(error.message);

        return (data || []).map((row: any) => {
          const activeRecipe = (row.special_mixture_recipes || []).find((r: any) => r.is_active);
          return {
            id: row.id,
            name: row.name,
            code: row.code,
            unit: row.unit,
            currentStock: Number(row.current_stock) || 0,
            minStock: Number(row.min_stock) || 0,
            avgCostPerUnit: Number(row.avg_cost_per_unit) || 0,
            notes: row.notes,
            isActive: row.is_active,
            recipe: activeRecipe
              ? {
                  id: activeRecipe.id,
                  mixtureId: activeRecipe.mixture_id,
                  version: activeRecipe.version,
                  expectedOutputQuantity: Number(activeRecipe.expected_output_quantity) || 0,
                  expectedOutputUnit: activeRecipe.expected_output_unit,
                  instructions: activeRecipe.instructions,
                  estimatedCost: Number(activeRecipe.estimated_cost) || 0,
                  isActive: activeRecipe.is_active,
                  items: (activeRecipe.special_mixture_recipe_items || []).map((i: any) => ({
                    id: i.id,
                    recipeId: i.recipe_id,
                    ingredientId: i.ingredient_id,
                    ingredientName: i.ingredients?.name || 'Ingredient',
                    quantity: Number(i.quantity) || 0,
                    unit: i.unit,
                    avgCostPerUnit: Number(i.ingredients?.avg_cost_per_unit) || 0,
                    totalCost: (Number(i.quantity) || 0) * (Number(i.ingredients?.avg_cost_per_unit) || 0),
                  })),
                }
              : undefined,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
          };
        });
      },
      { ttl: 60 * 1000 }
    );
  }

  async getSpecialMixtureById(id: string): Promise<SpecialMixture | null> {
    const client = this.checkClient();
    const { data, error } = await client
      .from('special_mixtures')
      .select('*, special_mixture_recipes(*, special_mixture_recipe_items(*, ingredients(name, unit, avg_cost_per_unit)))')
      .eq('id', id)
      .single();

    if (error || !data) return null;

    const activeRecipe = (data.special_mixture_recipes || []).find((r: any) => r.is_active);
    return {
      id: data.id,
      name: data.name,
      code: data.code,
      unit: data.unit,
      currentStock: Number(data.current_stock) || 0,
      minStock: Number(data.min_stock) || 0,
      avgCostPerUnit: Number(data.avg_cost_per_unit) || 0,
      notes: data.notes,
      isActive: data.is_active,
      recipe: activeRecipe
        ? {
            id: activeRecipe.id,
            mixtureId: activeRecipe.mixture_id,
            version: activeRecipe.version,
            expectedOutputQuantity: Number(activeRecipe.expected_output_quantity) || 0,
            expectedOutputUnit: activeRecipe.expected_output_unit,
            instructions: activeRecipe.instructions,
            estimatedCost: Number(activeRecipe.estimated_cost) || 0,
            isActive: activeRecipe.is_active,
            items: (activeRecipe.special_mixture_recipe_items || []).map((i: any) => ({
              id: i.id,
              recipeId: i.recipe_id,
              ingredientId: i.ingredient_id,
              ingredientName: i.ingredients?.name || 'Ingredient',
              quantity: Number(i.quantity) || 0,
              unit: i.unit,
              avgCostPerUnit: Number(i.ingredients?.avg_cost_per_unit) || 0,
              totalCost: (Number(i.quantity) || 0) * (Number(i.ingredients?.avg_cost_per_unit) || 0),
            })),
          }
        : undefined,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  }

  async saveSpecialMixture(data: Partial<SpecialMixture> & { name: string; unit: UnitType }): Promise<SpecialMixture> {
    const client = this.checkClient();
    const payload = {
      name: data.name,
      code: data.code,
      unit: data.unit,
      current_stock: data.currentStock ?? 0,
      min_stock: data.minStock ?? 0,
      avg_cost_per_unit: data.avgCostPerUnit ?? 0,
      notes: data.notes,
      is_active: data.isActive ?? true,
      updated_at: new Date().toISOString(),
    };

    let result: any;
    if (data.id) {
      const { data: updated, error } = await client
        .from('special_mixtures')
        .update(payload)
        .eq('id', data.id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      result = updated;
    } else {
      const { data: created, error } = await client
        .from('special_mixtures')
        .insert(payload)
        .select()
        .single();
      if (error) throw new Error(error.message);
      result = created;
    }

    dbCache.invalidate('special_mixtures');
    return {
      id: result.id,
      name: result.name,
      code: result.code,
      unit: result.unit,
      currentStock: Number(result.current_stock) || 0,
      minStock: Number(result.min_stock) || 0,
      avgCostPerUnit: Number(result.avg_cost_per_unit) || 0,
      notes: result.notes,
      isActive: result.is_active,
      createdAt: result.created_at,
      updatedAt: result.updated_at,
    };
  }

  async saveSpecialMixtureRecipe(mixtureId: string, recipe: Partial<SpecialMixtureRecipe>): Promise<SpecialMixtureRecipe> {
    const client = this.checkClient();
    const { data, error } = await client.rpc('save_special_mixture_recipe', {
      p_mixture_id: mixtureId,
      p_expected_output_quantity: recipe.expectedOutputQuantity || 1,
      p_expected_output_unit: recipe.expectedOutputUnit || 'kg',
      p_instructions: recipe.instructions || '',
      p_items: (recipe.items || []).map((i) => ({
        ingredient_id: i.ingredientId,
        quantity: i.quantity,
        unit: i.unit,
      })),
    });

    dbCache.invalidate('special_mixtures');
    if (error) {
      // Fallback direct insert if RPC not present
      const { data: insertedRec, error: recErr } = await client
        .from('special_mixture_recipes')
        .insert({
          mixture_id: mixtureId,
          version: recipe.version || 1,
          expected_output_quantity: recipe.expectedOutputQuantity || 1,
          expected_output_unit: recipe.expectedOutputUnit || 'kg',
          instructions: recipe.instructions || '',
          estimated_cost: recipe.estimatedCost || 0,
          is_active: true,
        })
        .select()
        .single();
      if (recErr) throw new Error(recErr.message);

      if (recipe.items && recipe.items.length > 0) {
        const itemRows = recipe.items.map((i) => ({
          recipe_id: insertedRec.id,
          ingredient_id: i.ingredientId,
          quantity: i.quantity,
          unit: i.unit,
        }));
        await client.from('special_mixture_recipe_items').insert(itemRows);
      }
      return {
        id: insertedRec.id,
        mixtureId,
        version: insertedRec.version,
        expectedOutputQuantity: Number(insertedRec.expected_output_quantity),
        expectedOutputUnit: insertedRec.expected_output_unit,
        instructions: insertedRec.instructions,
        estimatedCost: Number(insertedRec.estimated_cost),
        isActive: true,
        items: recipe.items || [],
      };
    }

    return data;
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
    const client = this.checkClient();
    const batchNumber =
      params.batchNumber ||
      `MB-${params.preparationDate.replace(/-/g, '')}-${Math.floor(100 + Math.random() * 900)}`;

    const { data, error } = await client.rpc('prepare_special_mixture_atomic', {
      p_mixture_id: params.mixtureId,
      p_batch_number: batchNumber,
      p_preparation_date: params.preparationDate,
      p_planned_quantity: params.plannedQuantity,
      p_actual_quantity: params.actualQuantity,
      p_unit: params.unit,
      p_operator_name: params.operatorName,
      p_notes: params.notes || null,
      p_expiry_date: params.expiryDate || null,
      p_ingredients: params.ingredientsConsumed.map((c) => ({
        ingredient_id: c.ingredientId,
        expected_quantity: c.expectedQuantity ?? c.actualQuantity,
        actual_quantity: c.actualQuantity,
        unit: c.unit,
        unit_cost: c.unitCost || 0,
      })),
    });

    dbCache.invalidate('special_mixtures');
    dbCache.invalidate('ingredients');
    dbCache.invalidate('stock_movements');

    if (error) {
      throw new Error(error.message);
    }

    return {
      id: data.id || batchNumber,
      batchNumber,
      mixtureId: params.mixtureId,
      preparationDate: params.preparationDate,
      plannedQuantity: params.plannedQuantity,
      actualQuantity: params.actualQuantity,
      unit: params.unit,
      totalIngredientCost: Number(data.total_cost) || 0,
      costPerUnit: Number(data.cost_per_unit) || 0,
      status: 'completed',
      operatorName: params.operatorName,
      expiryDate: params.expiryDate,
      notes: params.notes,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  async listSpecialMixtureBatches(options?: { mixtureId?: string; limit?: number }): Promise<SpecialMixtureBatch[]> {
    const client = this.checkClient();
    let query = client
      .from('special_mixture_batches')
      .select('*, special_mixtures(name)')
      .order('preparation_date', { ascending: false });

    if (options?.mixtureId) {
      query = query.eq('mixture_id', options.mixtureId);
    }
    if (options?.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    return (data || []).map((row: any) => ({
      id: row.id,
      batchNumber: row.batch_number,
      mixtureId: row.mixture_id,
      mixtureName: row.special_mixtures?.name || 'Mixture',
      recipeId: row.recipe_id,
      preparationDate: row.preparation_date,
      plannedQuantity: Number(row.planned_quantity) || 0,
      actualQuantity: Number(row.actual_quantity) || 0,
      unit: row.unit,
      totalIngredientCost: Number(row.total_ingredient_cost) || 0,
      costPerUnit: Number(row.cost_per_unit) || 0,
      status: row.status,
      cancellationReason: row.cancellation_reason,
      operatorName: row.operator_name,
      expiryDate: row.expiry_date,
      notes: row.notes,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  async cancelSpecialMixtureBatch(batchId: string, reason: string, operatorName: string): Promise<boolean> {
    const client = this.checkClient();
    const { data, error } = await client.rpc('cancel_special_mixture_batch_atomic', {
      p_batch_id: batchId,
      p_reason: reason,
      p_operator_name: operatorName,
    });

    dbCache.invalidate('special_mixtures');
    dbCache.invalidate('ingredients');
    dbCache.invalidate('stock_movements');

    if (error) {
      // Direct update fallback
      const { error: updErr } = await client
        .from('special_mixture_batches')
        .update({
          status: 'cancelled',
          cancellation_reason: reason,
          cancelled_at: new Date().toISOString(),
          cancelled_by: operatorName,
        })
        .eq('id', batchId);
      if (updErr) throw new Error(updErr.message);
    }

    return true;
  }


  invalidateCache(key?: string): void {
    if (key) {
      dbCache.invalidate(key);
    } else {
      dbCache.invalidateAll();
    }
  }

  // ============================================================================
  // PRODUCTS
  // ============================================================================

  async listProducts(includeInactive = false): Promise<Product[]> {
    return dbCache.wrap(
      `products_${includeInactive}`,
      async () => {
        const client = this.checkClient();
        let query = client.from('products').select('*').order('name', { ascending: true });
        if (!includeInactive) {
          query = query.eq('is_active', true);
        }

        const { data, error } = await query;
        if (error) throw new Error(error.message);

        return (data || []).map((row: any) => ({
          id: row.id,
          name: row.name,
          sku: row.code || row.sku || undefined,
          unit: row.unit,
          currentStock: Number(row.current_stock || 0),
          wholesalePrice: Number(row.avg_cost_per_unit ?? row.wholesale_price) || undefined,
          isActive: row.is_active,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        }));
      },
      { ttl: 5 * 60 * 1000 }
    );
  }

  async getProductById(id: string): Promise<Product | null> {
    const client = this.checkClient();
    const { data, error } = await client.from('products').select('*').eq('id', id).single();
    if (error || !data) return null;

    return {
      id: data.id,
      name: data.name,
      sku: data.code || data.sku || undefined,
      unit: data.unit,
      currentStock: Number(data.current_stock || 0),
      wholesalePrice: Number(data.avg_cost_per_unit ?? data.wholesale_price) || undefined,
      isActive: data.is_active,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  }

  async createProduct(data: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>): Promise<Product> {
    const client = this.checkClient();
    const { data: created, error } = await client
      .from('products')
      .insert({
        name: data.name.trim(),
        code: data.sku?.trim() || null,
        unit: data.unit || 'kg',
        current_stock: data.currentStock || 0,
        avg_cost_per_unit: data.wholesalePrice || 0,
        is_active: data.isActive !== false,
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    dbCache.invalidate('product');

    // Audit log
    await client.from('audit_logs').insert({
      actor: 'Catalogue Staff',
      action: 'CREATE_PRODUCT',
      entity_type: 'PRODUCT',
      entity_id: created.id,
      details: { name: created.name, unit: created.unit },
    });

    return {
      id: created.id,
      name: created.name,
      sku: created.code || created.sku || undefined,
      unit: created.unit,
      currentStock: Number(created.current_stock || 0),
      wholesalePrice: Number(created.avg_cost_per_unit ?? created.wholesale_price) || undefined,
      isActive: created.is_active,
      createdAt: created.created_at,
      updatedAt: created.updated_at,
    };
  }

  async updateProduct(id: string, data: Partial<Product>): Promise<Product> {
    const client = this.checkClient();
    const updates: any = { updated_at: new Date().toISOString() };
    if (data.name !== undefined) updates.name = data.name.trim();
    if (data.sku !== undefined) updates.code = data.sku.trim();
    if (data.unit !== undefined) updates.unit = data.unit;
    if (data.currentStock !== undefined) updates.current_stock = data.currentStock;
    if (data.wholesalePrice !== undefined) updates.avg_cost_per_unit = data.wholesalePrice;
    if (data.isActive !== undefined) updates.is_active = data.isActive;

    const { data: updated, error } = await client
      .from('products')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(error.message);
    dbCache.invalidate('product');

    // Audit log
    await client.from('audit_logs').insert({
      actor: 'Catalogue Staff',
      action: 'UPDATE_PRODUCT',
      entity_type: 'PRODUCT',
      entity_id: id,
      details: updates,
    });

    return {
      id: updated.id,
      name: updated.name,
      sku: updated.code || updated.sku || undefined,
      unit: updated.unit,
      currentStock: Number(updated.current_stock || 0),
      wholesalePrice: Number(updated.avg_cost_per_unit ?? updated.wholesale_price) || undefined,
      isActive: updated.is_active,
      createdAt: updated.created_at,
      updatedAt: updated.updated_at,
    };
  }

  async deactivateProduct(id: string): Promise<void> {
    await this.updateProduct(id, { isActive: false });
  }

  async safeDeleteProduct(id: string): Promise<{ deleted: boolean; deactivated?: boolean }> {
    const client = this.checkClient();

    // Check if referenced in historical production runs
    const { count, error: countErr } = await client
      .from('production_runs')
      .select('*', { count: 'exact', head: true })
      .eq('product_id', id);

    if (countErr) throw new Error(countErr.message);

    if (count && count > 0) {
      // Historical references exist - soft-delete (deactivate) to protect history
      await this.deactivateProduct(id);
      return { deleted: false, deactivated: true };
    }

    // Safe to hard delete
    const { error: delErr } = await client.from('products').delete().eq('id', id);
    if (delErr) throw new Error(delErr.message);

    await client.from('audit_logs').insert({
      actor: 'Catalogue Staff',
      action: 'DELETE_PRODUCT',
      entity_type: 'PRODUCT',
      entity_id: id,
      details: { deleted: true },
    });

    return { deleted: true };
  }

  // ============================================================================
  // INGREDIENTS
  // ============================================================================

  async listIngredients(includeInactive = false): Promise<Ingredient[]> {
    return dbCache.wrap(
      `ingredients_${includeInactive}`,
      async () => {
        const client = this.checkClient();
        let query = client.from('ingredients').select('*').order('name', { ascending: true });
        if (!includeInactive) {
          query = query.eq('is_active', true);
        }

        const { data, error } = await query;
        if (error) throw new Error(error.message);

        return (data || []).map((row: any) => ({
          id: row.id,
          name: row.name,
          category: row.category,
          unit: row.unit,
          currentStock: Number(row.current_stock || 0),
          minStock: Number(row.min_stock || 0),
          avgCostPerUnit: Number(row.avg_cost_per_unit || 0),
          isActive: row.is_active,
          notes: row.notes || undefined,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        }));
      },
      { ttl: 60 * 1000 }
    );
  }

  async getIngredientById(id: string): Promise<Ingredient | null> {
    const client = this.checkClient();
    const { data, error } = await client.from('ingredients').select('*').eq('id', id).single();
    if (error || !data) return null;

    return {
      id: data.id,
      name: data.name,
      category: data.category,
      unit: data.unit,
      currentStock: Number(data.current_stock || 0),
      minStock: Number(data.min_stock || 0),
      avgCostPerUnit: Number(data.avg_cost_per_unit || 0),
      isActive: data.is_active,
      notes: data.notes || undefined,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  }

  async createIngredient(data: Omit<Ingredient, 'id' | 'createdAt' | 'updatedAt'>): Promise<Ingredient> {
    const client = this.checkClient();
    const { data: created, error } = await client
      .from('ingredients')
      .insert({
        name: data.name.trim(),
        category: data.category,
        unit: data.unit || 'kg',
        current_stock: data.currentStock || 0,
        min_stock: data.minStock || 0,
        avg_cost_per_unit: data.avgCostPerUnit || 0,
        is_active: data.isActive !== false,
        // notes column omitted (not in schema)
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    dbCache.invalidate('ingredient');

    await client.from('audit_logs').insert({
      actor: 'Catalogue Staff',
      action: 'CREATE_INGREDIENT',
      entity_type: 'INGREDIENT',
      entity_id: created.id,
      details: { name: created.name, category: created.category, unit: created.unit },
    });

    return {
      id: created.id,
      name: created.name,
      category: created.category,
      unit: created.unit,
      currentStock: Number(created.current_stock || 0),
      minStock: Number(created.min_stock || 0),
      avgCostPerUnit: Number(created.avg_cost_per_unit || 0),
      isActive: created.is_active,
      notes: created.notes || undefined,
      createdAt: created.created_at,
      updatedAt: created.updated_at,
    };
  }

  async updateIngredient(id: string, data: Partial<Ingredient>): Promise<Ingredient> {
    const client = this.checkClient();
    const updates: any = { updated_at: new Date().toISOString() };
    if (data.name !== undefined) updates.name = data.name.trim();
    if (data.category !== undefined) updates.category = data.category;
    if (data.unit !== undefined) updates.unit = data.unit;
    if (data.currentStock !== undefined) updates.current_stock = data.currentStock;
    if (data.minStock !== undefined) updates.min_stock = data.minStock;
    if (data.avgCostPerUnit !== undefined) updates.avg_cost_per_unit = data.avgCostPerUnit;
    if (data.isActive !== undefined) updates.is_active = data.isActive;
    // notes omitted

    const { data: updated, error } = await client
      .from('ingredients')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(error.message);
    dbCache.invalidate('ingredient');

    await client.from('audit_logs').insert({
      actor: 'Catalogue Staff',
      action: 'UPDATE_INGREDIENT',
      entity_type: 'INGREDIENT',
      entity_id: id,
      details: updates,
    });

    return {
      id: updated.id,
      name: updated.name,
      category: updated.category,
      unit: updated.unit,
      currentStock: Number(updated.current_stock || 0),
      minStock: Number(updated.min_stock || 0),
      avgCostPerUnit: Number(updated.avg_cost_per_unit || 0),
      isActive: updated.is_active,
      notes: updated.notes || undefined,
      createdAt: updated.created_at,
      updatedAt: updated.updated_at,
    };
  }

  async deactivateIngredient(id: string): Promise<void> {
    await this.updateIngredient(id, { isActive: false });
  }

  async safeDeleteIngredient(id: string): Promise<{ deleted: boolean; deactivated?: boolean }> {
    const client = this.checkClient();

    // Check if ingredient is referenced in production consumption or recipes
    const [c1, c2] = await Promise.all([
      client.from('production_consumption').select('*', { count: 'exact', head: true }).eq('ingredient_id', id),
      client.from('recipe_items').select('*', { count: 'exact', head: true }).eq('ingredient_id', id),
    ]);

    const totalRefs = (c1.count || 0) + (c2.count || 0);
    if (totalRefs > 0) {
      await this.deactivateIngredient(id);
      return { deleted: false, deactivated: true };
    }

    const { error } = await client.from('ingredients').delete().eq('id', id);
    if (error) throw new Error(error.message);
    dbCache.invalidate('ingredient');

    await client.from('audit_logs').insert({
      actor: 'Catalogue Staff',
      action: 'DELETE_INGREDIENT',
      entity_type: 'INGREDIENT',
      entity_id: id,
      details: { deleted: true },
    });

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
    const client = this.checkClient();

    const mType = params.movementType || (params.quantityDelta >= 0 ? 'adjustment' : 'wastage');
    const costPerUnit = params.coverUnitCost ?? ing.avgCostPerUnit ?? 0;

    const { data: mov, error } = await client
      .from('stock_movements')
      .insert({
        item_id: ing.id,
        item_type: 'ingredient',
        item_name: ing.name,
        movement_type: mType,
        quantity: params.quantityDelta,
        unit: ing.unit,
        previous_balance: ing.currentStock,
        new_balance: newStock,
        cost_per_unit: costPerUnit,
        reference: mType === 'production_consumption' ? 'Production Consumption' : 'Stock Adjustment',
        operator_name: params.operatorName,
        reason: params.reason,
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    dbCache.invalidate('ingredient');

    return {
      ingredient: updated,
      movement: {
        id: mov.id,
        itemId: mov.item_id,
        itemType: mov.item_type,
        itemName: mov.item_name,
        movementType: mov.movement_type,
        quantity: Number(mov.quantity),
        unit: mov.unit,
        previousBalance: Number(mov.previous_balance),
        newBalance: Number(mov.new_balance),
        reference: mov.reference,
        operatorName: mov.operator_name,
        reason: mov.reason,
        createdAt: mov.created_at,
      },
    };
  }

  // ============================================================================
  // RECIPES
  // ============================================================================

  async listRecipes(): Promise<Recipe[]> {
    return dbCache.wrap(
      'recipes',
      async () => {
        const client = this.checkClient();
        const { data, error } = await client
          .from('recipes')
          .select('*, products!recipes_product_id_fkey(name), recipe_items(*, ingredients(name))')
          .eq('is_active', true)
          .order('created_at', { ascending: false });

        if (error) throw new Error(error.message);

        const { data: packetsData } = await client
          .from('recipe_packets')
          .select('*');

        return (data || []).map((row: any) => {
          let packets: RecipePacket[] = [];
          if (packetsData && packetsData.length > 0) {
            packets = packetsData
              .filter((p: any) => p.recipe_id === row.id)
              .map((p: any) => ({
                id: p.id,
                recipeId: p.recipe_id,
                packetTypeId: p.packet_type_id,
                packetName: p.packet_name,
                costPerPacket: Number(p.cost_per_packet) || 0,
                bundleCost: Number(p.bundle_cost) || 0,
                bundleQuantity: Number(p.bundle_quantity) || 1,
              }));
          }
          if (packets.length === 0 && Array.isArray(row.packets) && row.packets.length > 0) {
            packets = row.packets.map((p: any) => ({
              id: p.id,
              recipeId: row.id,
              packetTypeId: p.packetTypeId,
              packetName: p.packetName || p.name || 'Packet',
              costPerPacket: Number(p.costPerPacket) || 0,
              bundleCost: Number(p.bundleCost) || 0,
              bundleQuantity: Number(p.bundleQuantity) || 1,
            }));
          }

          return {
            id: row.id,
            productId: row.product_id,
            productName: row.products?.name || 'Snack Product',
            version: row.version,
            baseOutputQuantity: Number(row.output_quantity || row.base_output_quantity || 10),
            baseOutputUnit: row.output_unit || row.base_output_unit || 'kg',
            instructions: row.instructions || undefined,
            notes: row.notes || undefined,
            isActive: row.is_active,
            packets,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            ingredients: (row.recipe_items || []).map((item: any) => ({
              ingredientId: item.ingredient_id,
              ingredientName: item.ingredients?.name || 'Ingredient',
              quantity: Number(item.quantity),
              unit: item.unit,
            })),
          };
        });
      },
      { ttl: 5 * 60 * 1000 }
    );
  }

  async getRecipeById(id: string): Promise<Recipe | null> {
    const recipes = await this.listRecipes();
    return recipes.find((r) => r.id === id) || null;
  }

  async getRecipeByProductId(productId: string): Promise<Recipe | null> {
    const recipes = await this.listRecipes();
    return recipes.find((r) => r.productId === productId) || null;
  }

  async saveRecipe(
    data: Omit<Recipe, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
  ): Promise<Recipe> {
    const client = this.checkClient();

    let recipeId = data.id;
    const normalizedPackets = (data.packets || []).map((p) => ({
      packetTypeId: p.packetTypeId,
      packetName: p.packetName,
      costPerPacket: Number(p.costPerPacket) || 0,
      bundleCost: Number(p.bundleCost) || 0,
      bundleQuantity: Number(p.bundleQuantity) || 1,
    }));

    if (!recipeId) {
      const { data: rec, error } = await client
        .from('recipes')
        .insert({
          product_id: data.productId,
          name: data.productName || 'Recipe',
          output_quantity: data.baseOutputQuantity,
          output_unit: data.baseOutputUnit || 'kg',
          // notes column omitted (not in schema)
          is_active: data.isActive !== false,
        })
        .select()
        .single();

      if (error) throw new Error(error.message);
      recipeId = rec.id;
    } else {
      await client
        .from('recipes')
        .update({
          base_output_quantity: data.baseOutputQuantity,
          base_output_unit: data.baseOutputUnit,
          instructions: data.instructions,
          notes: data.notes,
          packets: normalizedPackets,
          version: (data.version || 1) + 1,
          updated_at: new Date().toISOString(),
        })
        .eq('id', recipeId);

      // Clear existing items and packets for replacement
      await client.from('recipe_items').delete().eq('recipe_id', recipeId);
      await client.from('recipe_packets').delete().eq('recipe_id', recipeId);
    }

    // Insert recipe items
    if (data.ingredients.length > 0) {
      const items = data.ingredients.map((item) => ({
        recipe_id: recipeId,
        ingredient_id: item.ingredientId,
        quantity: item.quantity,
        unit: item.unit,
      }));
      const { error: itemErr } = await client.from('recipe_items').insert(items);
      if (itemErr) throw new Error(itemErr.message);
    }

    // Insert recipe packets
    if (normalizedPackets.length > 0) {
      const pktsPayload = normalizedPackets.map((pkt) => ({
        recipe_id: recipeId,
        packet_type_id: pkt.packetTypeId || null,
        packet_name: pkt.packetName,
        cost_per_packet: pkt.costPerPacket,
        bundle_cost: pkt.bundleCost || 0,
        bundle_quantity: pkt.bundleQuantity || 1,
        created_at: new Date().toISOString(),
      }));

      const { error: pktsErr } = await client.from('recipe_packets').insert(pktsPayload);
      if (pktsErr) {
        console.error('Error saving recipe_packets:', pktsErr);
      }
    }

    dbCache.invalidate('recipe');

    const saved = await this.getRecipeById(recipeId!);
    if (!saved) throw new Error('Recipe could not be retrieved after save');
    return saved;
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
    return dbCache.wrap(
      `production_runs_${JSON.stringify(options || {})}`,
      async () => {
        const client = this.checkClient();
        let query = client
          .from('production_runs')
          .select('*, products(name), production_consumption(*, ingredients(name))')
          .order('created_at', { ascending: false });

        if (options?.limit) query = query.limit(options.limit);
        if (options?.productId) query = query.eq('product_id', options.productId);
        if (options?.status) query = query.eq('status', options.status);

        const { data, error } = await query;
        if (error) throw new Error(error.message);

        let runs = (data || []).map((row: any) => {
          const prodDate = row.production_date || (row.start_time ? row.start_time.split('T')[0] : (row.created_at ? row.created_at.split('T')[0] : new Date().toISOString().split('T')[0]));
          const runNum = row.run_number || ('RUN-' + (row.created_at ? row.created_at.slice(0, 10).replace(/-/g, '') : '2026') + '-' + row.id.slice(0, 4).toUpperCase());

          return {
            id: row.id,
            runNumber: runNum,
            productId: row.product_id,
            productName: row.products?.name || 'Product',
            recipeId: row.recipe_id || undefined,
            recipeVersion: row.recipe_version || undefined,
            productionDate: prodDate,
            plannedQuantity: Number(row.planned_quantity ?? row.target_quantity ?? 0),
            actualQuantity: Number(row.actual_quantity || 0),
            unit: row.unit || 'kg',
            status: row.status,
            cancellationReason: row.cancellation_reason || undefined,
            cancelledAt: row.cancelled_at || undefined,
            cancelledBy: row.cancelled_by || undefined,
            notes: row.notes || undefined,
            operatorName: row.operator_name || 'Staff',
            totalIngredientCost: Number(row.total_ingredient_cost) || 0,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            ingredientsConsumed: (row.production_consumption || []).map((c: any) => ({
              ingredientId: c.ingredient_id,
              ingredientName: c.ingredients?.name || 'Ingredient',
              expectedQuantity: Number(c.expected_quantity || 0),
              actualQuantity: Number(c.actual_quantity || 0),
              unit: c.unit,
              unitCost: Number(c.unit_cost) || 0,
              totalCost: Number(c.total_cost) || 0,
            })),
          };
        });

        if (options?.startDate) {
          runs = runs.filter((r: any) => r.productionDate >= options.startDate!);
        }
        if (options?.endDate) {
          runs = runs.filter((r: any) => r.productionDate <= options.endDate!);
        }

        return runs;
      },
      { ttl: 45 * 1000 }
    );
  }

  async getProductionRunById(id: string): Promise<ProductionRun | null> {
    const client = this.checkClient();
    const { data, error } = await client
      .from('production_runs')
      .select('*, products(name), production_consumption(*, ingredients(name))')
      .eq('id', id)
      .single();

    if (error || !data) return null;

    const prodDate = data.production_date || (data.start_time ? data.start_time.split('T')[0] : (data.created_at ? data.created_at.split('T')[0] : new Date().toISOString().split('T')[0]));
    const runNum = data.run_number || ('RUN-' + (data.created_at ? data.created_at.slice(0, 10).replace(/-/g, '') : '2026') + '-' + data.id.slice(0, 4).toUpperCase());

    return {
      id: data.id,
      runNumber: runNum,
      productId: data.product_id,
      productName: data.products?.name || 'Product',
      recipeId: data.recipe_id || undefined,
      recipeVersion: data.recipe_version || undefined,
      productionDate: prodDate,
      plannedQuantity: Number(data.planned_quantity ?? data.target_quantity ?? 0),
      actualQuantity: Number(data.actual_quantity || 0),
      unit: data.unit || 'kg',
      status: data.status,
      cancellationReason: data.cancellation_reason || undefined,
      cancelledAt: data.cancelled_at || undefined,
      cancelledBy: data.cancelled_by || undefined,
      notes: data.notes || undefined,
      operatorName: data.operator_name || 'Staff',
      totalIngredientCost: Number(data.total_ingredient_cost) || 0,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      ingredientsConsumed: (data.production_consumption || []).map((c: any) => ({
        ingredientId: c.ingredient_id,
        ingredientName: c.ingredients?.name || 'Ingredient',
        expectedQuantity: Number(c.expected_quantity || 0),
        actualQuantity: Number(c.actual_quantity),
        unit: c.unit,
        unitCost: Number(c.unit_cost) || 0,
        totalCost: Number(c.total_cost) || 0,
      })),
    };
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
      unitCost?: number;
      totalCost?: number;
    }>;
  }): Promise<ProductionRun> {
    const client = this.checkClient();

    const effectiveTargetQty =
      params.plannedQuantity > 0
        ? params.plannedQuantity
        : params.actualQuantity > 0
        ? params.actualQuantity
        : 10;

    const effectiveRpcActualQty =
      params.actualQuantity > 0
        ? params.actualQuantity
        : effectiveTargetQty;

    // Invoking PostgreSQL atomic stored procedure
    // Note: p_ingredients items MUST include actual_quantity to avoid null current_stock violations
    const { data: rpcRes, error } = await client.rpc('record_production_run_atomic', {
      p_product_id: params.productId,
      p_recipe_id: params.recipeId || null,
      p_actual_quantity: effectiveRpcActualQty,
      p_unit: params.unit || 'kg',
      p_operator: params.operatorName || 'Staff',
      p_notes: params.notes || null,
      p_oil_absorbed_kg: 0,
      p_oil_carried_forward_kg: 0,
      p_packets: [],
      p_ingredients: params.ingredientsConsumed.map((i) => ({
        ingredient_id: i.ingredientId,
        actual_quantity: i.actualQuantity,
        quantity: i.actualQuantity,
        expected_quantity: i.expectedQuantity,
        unit: i.unit,
        unit_cost: i.unitCost || 0,
        total_cost: i.totalCost || 0,
      })),
    });

    if (error) throw new Error(error.message);

    const runId = typeof rpcRes === 'string' ? rpcRes : (rpcRes?.production_run_id || rpcRes?.id);
    if (!runId) throw new Error('Failed to retrieve created production run ID');

    // If batch was created as unweighed (actualQuantity <= 0), set actual_quantity to 0
    // and reverse premature product stock addition until the cook weighs the batch on the card
    const isUnweighedAtCreation = !params.actualQuantity || params.actualQuantity <= 0;
    if (isUnweighedAtCreation) {
      await client
        .from('production_runs')
        .update({
          actual_quantity: 0,
          target_quantity: effectiveTargetQty,
        })
        .eq('id', runId);

      // Revert premature finished goods stock increment on product
      try {
        const { data: prod } = await client
          .from('products')
          .select('current_stock')
          .eq('id', params.productId)
          .maybeSingle();

        if (prod) {
          const correctedStock = Number(Math.max(0, (prod.current_stock || 0) - effectiveRpcActualQty).toFixed(3));
          await client.from('products').update({ current_stock: correctedStock }).eq('id', params.productId);
        }

        // Remove premature finished output movement
        await client
          .from('stock_movements')
          .delete()
          .eq('item_id', params.productId)
          .eq('movement_type', 'production_output')
          .eq('quantity', effectiveRpcActualQty);
      } catch (revErr) {
        console.warn('Non-critical: could not revert premature stock addition', revErr);
      }
    }

    dbCache.invalidate('production_runs');
    dbCache.invalidate('product');
    dbCache.invalidate('ingredient');

    const saved = await this.getProductionRunById(runId);
    if (!saved) throw new Error('Production run saved but could not be loaded');
    return saved;
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
    const client = this.checkClient();
    const oldRun = await this.getProductionRunById(params.runId);
    if (!oldRun) throw new Error(`Production run with id ${params.runId} not found`);

    const now = new Date().toISOString();
    const operator = params.operatorName || oldRun.operatorName || 'Kitchen Staff';

    // 1. Calculate and apply product stock delta
    const deltaProduct = Number((params.actualQuantity - oldRun.actualQuantity).toFixed(3));
    if (deltaProduct !== 0) {
      const { data: prod } = await client
        .from('products')
        .select('current_stock, name')
        .eq('id', oldRun.productId)
        .maybeSingle();

      if (prod) {
        const prevBal = Number(prod.current_stock) || 0;
        const newBal = Math.max(0, Number((prevBal + deltaProduct).toFixed(3)));

        await client
          .from('products')
          .update({ current_stock: newBal, updated_at: now })
          .eq('id', oldRun.productId);

        await client.from('stock_movements').insert({
          item_id: oldRun.productId,
          item_type: 'product',
          movement_type: deltaProduct > 0 ? 'production_output' : 'adjustment',
          quantity: deltaProduct,
          unit: oldRun.unit,
          previous_balance: prevBal,
          new_balance: newBal,
          reference: `Run ${oldRun.runNumber} Edit`,
          operator_name: operator,
          reason: `Batch quantity adjusted from ${oldRun.actualQuantity} to ${params.actualQuantity} ${oldRun.unit}`,
          created_at: now,
        });
      }
    }

    // 2. Calculate and apply ingredients consumed delta
    if (params.ingredientsConsumed && params.ingredientsConsumed.length > 0) {
      for (const newIng of params.ingredientsConsumed) {
        const oldIng = oldRun.ingredientsConsumed.find((c) => c.ingredientId === newIng.ingredientId);
        const oldQty = oldIng ? oldIng.actualQuantity : 0;
        const deltaIng = Number((newIng.actualQuantity - oldQty).toFixed(3));

        if (deltaIng !== 0) {
          const { data: ingData } = await client
            .from('ingredients')
            .select('current_stock, name')
            .eq('id', newIng.ingredientId)
            .maybeSingle();

          if (ingData) {
            const prevIngBal = Number(ingData.current_stock) || 0;
            // deltaIng > 0 means more was consumed (subtract from stock)
            // deltaIng < 0 means less was consumed (restore to stock)
            const newIngBal = Math.max(0, Number((prevIngBal - deltaIng).toFixed(3)));

            await client
              .from('ingredients')
              .update({ current_stock: newIngBal, updated_at: now })
              .eq('id', newIng.ingredientId);

            await client.from('stock_movements').insert({
              item_id: newIng.ingredientId,
              item_type: 'ingredient',
              movement_type: deltaIng > 0 ? 'production_consumption' : 'adjustment',
              quantity: -deltaIng,
              unit: newIng.unit,
              previous_balance: prevIngBal,
              new_balance: newIngBal,
              reference: `Run ${oldRun.runNumber} Edit`,
              operator_name: operator,
              reason: `Batch ingredient adjustment for ${oldRun.productName}`,
              created_at: now,
            });
          }
        }
      }

      // Update production_consumption rows (foreign key column is run_id)
      const { error: delErr } = await client.from('production_consumption').delete().eq('run_id', params.runId);
      if (delErr) console.warn('Warning deleting old consumption rows:', delErr.message);

      const consumptionRows = params.ingredientsConsumed.map((i) => ({
        run_id: params.runId,
        ingredient_id: i.ingredientId,
        expected_quantity: i.expectedQuantity,
        actual_quantity: i.actualQuantity,
        unit: i.unit,
        unit_cost: i.unitCost || 0,
        total_cost: i.totalCost || 0,
      }));
      const { error: insErr } = await client.from('production_consumption').insert(consumptionRows);
      if (insErr) console.warn('Warning inserting updated consumption rows:', insErr.message);
    }

    // 3. Update production_runs record
    const updatePayload: Record<string, any> = {
      actual_quantity: params.actualQuantity,
      updated_at: now,
    };
    if (params.plannedQuantity !== undefined) updatePayload.target_quantity = params.plannedQuantity;
    if (params.productionDate) {
      updatePayload.start_time = params.productionDate.includes('T')
        ? params.productionDate
        : new Date(params.productionDate).toISOString();
    }
    if (params.operatorName) updatePayload.operator_name = params.operatorName;
    if (params.notes !== undefined) updatePayload.notes = params.notes;

    const { error: runUpdateErr } = await client
      .from('production_runs')
      .update(updatePayload)
      .eq('id', params.runId);

    if (runUpdateErr) throw new Error(runUpdateErr.message);

    dbCache.invalidate('production_runs');
    dbCache.invalidate('product');
    dbCache.invalidate('ingredient');

    const updated = await this.getProductionRunById(params.runId);
    if (!updated) throw new Error('Updated production run could not be re-loaded');
    return updated;
  }

  async cancelProductionRun(params: {
    runId: string;
    reason: string;
    operatorName: string;
  }): Promise<boolean> {
    const client = this.checkClient();
    const { data, error } = await client.rpc('cancel_production_run_atomic', {
      p_run_id: params.runId,
      p_reason: params.reason,
      p_operator: params.operatorName,
    });

    if (error) throw new Error(error.message);

    dbCache.invalidate('production_runs');
    dbCache.invalidate('product');
    dbCache.invalidate('ingredient');

    return Boolean(data);
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
    const client = this.checkClient();
    const runId = typeof params === 'string' ? params : params.runId;
    const restock = typeof params === 'string' ? true : params.restock;
    const operatorName = typeof params === 'string' ? 'Kitchen Staff' : params.operatorName || 'Kitchen Staff';
    const now = new Date().toISOString();

    const { data: run } = await client
      .from('production_runs')
      .select('id, run_number, product_id, actual_quantity, unit, status')
      .eq('id', runId)
      .maybeSingle();

    if (!run) return true;

    if (restock) {
      // 1. If restock: call atomic procedure which adds ingredients back and removes product produced
      const { error: cancelErr } = await client.rpc('cancel_production_run_atomic', {
        p_run_id: runId,
        p_reason: 'restocked',
        p_operator: operatorName,
      });
      if (cancelErr) {
        console.warn('cancel_production_run_atomic notice:', cancelErr.message);
      }
    } else {
      // 2. If wastage: do NOT add ingredients back to stock!
      // Deduct product output
      const { data: prod } = await client
        .from('products')
        .select('current_stock, name')
        .eq('id', run.product_id)
        .maybeSingle();

      if (prod) {
        const prev = Number(prod.current_stock) || 0;
        const newBal = Math.max(0, prev - Number(run.actual_quantity));
        await client
          .from('products')
          .update({ current_stock: newBal, updated_at: now })
          .eq('id', run.product_id);

        await client.from('stock_movements').insert({
          item_id: run.product_id,
          item_type: 'product',
          item_name: prod.name,
          movement_type: 'wastage',
          quantity: -Number(run.actual_quantity),
          unit: run.unit,
          previous_balance: prev,
          new_balance: newBal,
          reference: `Wastage of batch`,
          operator_name: operatorName,
          reason: 'Batch marked as wastage on delete',
        });
      }
    }

    // Completely purge related records and delete the run record from the database
    try {
      await client.from('production_consumption').delete().eq('run_id', runId);
      await client.from('packing_records').delete().eq('production_run_id', runId);
      await client.from('production_runs').delete().eq('id', runId);
    } catch (e) {
      console.warn('Notice purging run records:', e);
    }

    dbCache.invalidate('production_runs');
    dbCache.invalidate('product');
    dbCache.invalidate('ingredient');
    dbCache.invalidate('packing_records');
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
    const client = this.checkClient();
    let query = client.from('stock_movements').select('*').order('created_at', { ascending: false });

    if (filter?.itemId) query = query.eq('item_id', filter.itemId);
    if (filter?.itemType) query = query.eq('item_type', filter.itemType);
    if (filter?.type) query = query.eq('movement_type', filter.type);
    if (filter?.limit) query = query.limit(filter.limit);

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    return (data || []).map((m: any) => ({
      id: m.id,
      itemId: m.item_id || '',
      itemType: m.item_type,
      itemName: m.item_name || '',
      movementType: m.movement_type,
      quantity: Number(m.quantity),
      unit: m.unit,
      previousBalance: Number(m.previous_balance ?? m.stock_before) || 0,
      newBalance: Number(m.new_balance ?? m.stock_after) || 0,
      costPerUnit: Number(m.unit_cost ?? m.cost_per_unit) || undefined,
      reference: m.reference || m.reference_id || '',
      operatorName: m.operator_name || m.operator || '',
      reason: m.reason || undefined,
      createdAt: m.created_at,
    }));
  }

  // ============================================================================
  // ADMIN AUTH & DASHBOARD
  // ============================================================================

  async isAdminInitialized(): Promise<boolean> {
    const client = this.checkClient();
    const { data, error } = await client.rpc('is_admin_initialized');
    if (error) throw new Error(error.message);
    return Boolean(data);
  }

  async setupAdminPin(
    pin: string,
    recoveryKey: string
  ): Promise<{ success: boolean; sessionToken: string }> {
    const client = this.checkClient();
    const { data, error } = await client.rpc('setup_initial_admin_pin', {
      p_pin: pin,
      p_recovery_key: recoveryKey,
    });

    if (error) throw new Error(error.message);
    return {
      success: true,
      sessionToken: data.session_token,
    };
  }

  async verifyAdminPin(
    pin: string
  ): Promise<{ success: boolean; sessionToken?: string; needsSetup?: boolean }> {
    const client = this.checkClient();
    const { data, error } = await client.rpc('verify_admin_pin', { p_pin: pin });

    if (error) throw new Error(error.message);
    if (data.needs_setup) {
      return { success: false, needsSetup: true };
    }

    return {
      success: true,
      sessionToken: data.session_token,
    };
  }

  async resetAdminPinWithRecovery(
    recoveryKey: string,
    newPin: string
  ): Promise<{ success: boolean; message: string }> {
    const client = this.checkClient();
    const { data, error } = await client.rpc('reset_admin_pin_with_recovery', {
      p_recovery_key: recoveryKey,
      p_new_pin: newPin,
    });

    if (error) throw new Error(error.message);
    return {
      success: true,
      message: data.message || 'PIN reset successfully',
    };
  }

  async verifyAdminSession(token: string): Promise<boolean> {
    if (!token) return false;
    const client = this.checkClient();
    const { data, error } = await client.rpc('is_admin_session_valid', { p_token: token });
    if (error) return false;
    return Boolean(data);
  }

  async getAdminDashboardMetrics(
    startDate: string,
    endDate: string
  ): Promise<AdminDashboardMetrics> {
    const client = this.checkClient();
    const { data, error } = await client.rpc('get_admin_dashboard_metrics', {
      p_start_date: startDate,
      p_end_date: endDate,
    });

    if (error) throw new Error(error.message);

    return {
      totalProducts: data.total_products || 0,
      activeProducts: data.active_products || 0,
      inactiveProducts: data.inactive_products || 0,
      totalIngredients: data.total_ingredients || 0,
      runsToday: data.runs_today || 0,
      qtyToday: Number(data.qty_today || 0),
      runsInPeriod: data.runs_in_period || 0,
      qtyInPeriod: Number(data.qty_in_period || 0),
      byProduct: (data.by_product || []).map((p: any) => ({
        productName: p.product_name,
        unit: p.unit,
        totalQuantity: Number(p.total_quantity || 0),
        runCount: Number(p.run_count || 0),
      })),
      consumption: (data.consumption || []).map((c: any) => ({
        ingredientName: c.ingredient_name,
        category: c.category,
        unit: c.unit,
        totalConsumed: Number(c.total_consumed || 0),
      })),
      recentActivity: (data.recent_activity || []).map((a: any) => ({
        id: a.id,
        runNumber: a.run_number,
        productName: a.product_name,
        productionDate: a.production_date,
        actualQuantity: Number(a.actual_quantity || 0),
        unit: a.unit,
        status: a.status,
        operatorName: a.operator_name,
        createdAt: a.created_at,
      })),
    };
  }

  async getAuditLogs(limit = 50): Promise<AuditLog[]> {
    const client = this.checkClient();
    const { data, error } = await client
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw new Error(error.message);

    return (data || []).map((row: any) => ({
      id: row.id,
      actor: row.actor,
      action: row.action,
      entityType: row.entity_type,
      entityId: row.entity_id || undefined,
      details: row.details || undefined,
      createdAt: row.created_at,
    }));
  }

  // ============================================================================
  // DAILY CLOSING, OIL INVENTORY & SHARED EXPENSE ALLOCATIONS
  // ============================================================================

  async getDailyClosing(date: string): Promise<DailyClosing | null> {
    const client = this.checkClient();
    const { data, error } = await client
      .from('daily_closings')
      .select('*')
      .eq('closing_date', date)
      .maybeSingle();

    if (error || !data) return null;

    let meta: any = {};
    if (data.notes) {
      try {
        meta = JSON.parse(data.notes);
      } catch {}
    }

    const totalOilUsedKg = typeof meta.oilUsedKg === 'number' ? meta.oilUsedKg : undefined;
    const oilLeftoverKg = typeof meta.leftoverOilKg === 'number' ? meta.leftoverOilKg : undefined;

    return {
      id: data.id,
      productionDate: data.closing_date,
      oilOpeningBalance: Number(meta.oilOpeningBalance) || 0,
      oilPurchases: Number(meta.oilPurchases) || 0,
      oilClosingBalance: Number(data.oil_balance_kg ?? meta.oilClosingBalance) || 0,
      oilConsumed: Number(meta.oilConsumed) || 0,
      totalOilUsedKg,
      oilLeftoverKg,
      oilCostPerKg: Number(meta.oilCostPerKg) || 0,
      oilTotalExpense: Number(meta.oilTotalExpense) || 0,
      productionWages: Number(meta.productionWages) || 0,
      totalSharedExpense: Number(meta.totalSharedExpense) || 0,
      totalProductionKg: Number(meta.totalProductionKg) || 0,
      status: meta.status || 'closed',
      notes: meta.userNotes ?? data.notes ?? undefined,
      closedBy: data.closed_by || 'Admin',
      createdAt: data.created_at,
      updatedAt: data.created_at,
    };
  }

  async listDailyClosings(limit = 60): Promise<DailyClosing[]> {
    return dbCache.wrap(
      `daily_closings_${limit}`,
      async () => {
        const client = this.checkClient();
        const { data, error } = await client
          .from('daily_closings')
          .select('*')
          .order('closing_date', { ascending: false })
          .limit(limit);

        if (error) throw new Error(error.message);

        return (data || []).map((d: any) => {
          let meta: any = {};
          if (d.notes) {
            try {
              meta = JSON.parse(d.notes);
            } catch {}
          }
          const totalOilUsedKg = typeof meta.oilUsedKg === 'number' ? meta.oilUsedKg : undefined;
          const oilLeftoverKg = typeof meta.leftoverOilKg === 'number' ? meta.leftoverOilKg : undefined;
          return {
            id: d.id,
            productionDate: d.closing_date,
            oilOpeningBalance: Number(meta.oilOpeningBalance) || 0,
            oilPurchases: Number(meta.oilPurchases) || 0,
            oilClosingBalance: Number(d.oil_balance_kg ?? meta.oilClosingBalance) || 0,
            oilConsumed: Number(meta.oilConsumed) || 0,
            totalOilUsedKg,
            oilLeftoverKg,
            oilCostPerKg: Number(meta.oilCostPerKg) || 0,
            oilTotalExpense: Number(meta.oilTotalExpense) || 0,
            productionWages: Number(meta.productionWages) || 0,
            totalSharedExpense: Number(meta.totalSharedExpense) || 0,
            totalProductionKg: Number(meta.totalProductionKg) || 0,
            status: meta.status || 'closed',
            notes: meta.userNotes ?? d.notes ?? undefined,
            closedBy: d.closed_by || 'Admin',
            createdAt: d.created_at,
            updatedAt: d.created_at,
          };
        });
      },
      { ttl: 2 * 60 * 1000 }
    );
  }

  async saveDailyClosing(params: {
    productionDate: string;
    oilOpeningBalance?: number;
    oilPurchases?: number;
    oilClosingBalance?: number;
    oilUsedKg?: number;
    oilLeftoverKg?: number;
    oilCostPerKg?: number;
    productionWages?: number;
    notes?: string;
    closedBy?: string;
  }): Promise<DailyClosing> {
    const client = this.checkClient();
    const {
      productionDate,
      oilPurchases = 0,
      notes = '',
      closedBy = 'Kitchen Staff',
    } = params;

    // 1. Fetch current oil ingredient from inventory
    const { data: oilIng, error: oilErr } = await client
      .from('ingredients')
      .select('id, name, unit, current_stock, avg_cost_per_unit')
      .or("name.eq.ഓയിൽ,name.ilike.%oil%")
      .limit(1)
      .maybeSingle();

    if (oilErr) {
      console.warn('Could not query oil ingredient:', oilErr);
    }

    // 2. Check for an existing closing for this production date
    const { data: existingClosing } = await client
      .from('daily_closings')
      .select('id, closing_date, oil_balance_kg, notes')
      .eq('closing_date', productionDate)
      .maybeSingle();

    // 3. Determine previous available stock:
    // If editing/re-saving for this date, reverse the previously deducted net consumption
    // so neither used oil nor leftover oil is counted twice.
    let prevNetDeducted = 0;
    if (existingClosing?.notes) {
      try {
        const meta = JSON.parse(existingClosing.notes);
        if (typeof meta.oilConsumed === 'number') prevNetDeducted = meta.oilConsumed;
        else if (typeof meta.oilUsedKg === 'number' && typeof meta.leftoverOilKg === 'number') {
          prevNetDeducted = Math.max(0, meta.oilUsedKg - meta.leftoverOilKg);
        }
      } catch {}
    }
    const currentStockInDb = oilIng ? (Number(oilIng.current_stock) || 0) : 0;
    const previousAvailableStock = existingClosing
      ? roundStock(currentStockInDb + prevNetDeducted)
      : (currentStockInDb > 0 ? currentStockInDb : (params.oilOpeningBalance ?? 0));

    // 4. Determine oil used and leftover oil
    let oilUsed = 0;
    let leftoverOil = 0;

    if (params.oilUsedKg !== undefined) {
      oilUsed = Math.max(0, roundStock(params.oilUsedKg));
      leftoverOil = Math.max(0, Math.min(oilUsed, roundStock(params.oilLeftoverKg ?? 0)));
    } else if (params.oilOpeningBalance !== undefined && params.oilClosingBalance !== undefined) {
      // Legacy fallback
      oilUsed = Math.max(0, roundStock(params.oilOpeningBalance - params.oilClosingBalance));
      leftoverOil = Math.max(0, roundStock(params.oilClosingBalance));
    }

    // 5. Backend Inventory Calculation:
    // Final Oil Stock = Previous Available Stock - Oil Used + Leftover Oil
    // Net Oil Consumed = Oil Used - Leftover Oil
    const oilUnitCost = params.oilCostPerKg ?? (Number(oilIng?.avg_cost_per_unit) || 150);
    const {
      netOilConsumedKg: oilConsumedKg,
      finalOilStockKg: finalOilStock,
      oilTotalExpense,
    } = calculateDailyOilUsage(
      previousAvailableStock,
      oilUsed,
      leftoverOil,
      oilUnitCost
    );

    const productionWages = params.productionWages || 0;
    const totalSharedExpense = roundCurrency(oilTotalExpense + productionWages);

    // 6. Fetch completed production runs on that date
    const { data: allRuns, error: runsErr } = await client
      .from('production_runs')
      .select('id, product_id, actual_quantity, total_ingredient_cost, products(name), start_time, created_at')
      .eq('status', 'completed');

    if (runsErr) throw new Error(runsErr.message);

    const runs = (allRuns || []).filter((r: any) =>
      (r.start_time && r.start_time.startsWith(productionDate)) ||
      (r.created_at && r.created_at.startsWith(productionDate))
    );

    const totalProductionKg = runs.reduce((sum: number, r: any) => sum + (Number(r.actual_quantity) || 0), 0);

    // Metadata preserving exact cook inputs
    const metaPayload = {
      oilOpeningBalance: previousAvailableStock,
      oilPurchases,
      oilClosingBalance: finalOilStock,
      oilConsumed: oilConsumedKg,
      oilUsedKg: oilUsed,
      leftoverOilKg: leftoverOil,
      oilCostPerKg: oilUnitCost,
      oilTotalExpense,
      productionWages,
      totalSharedExpense,
      totalProductionKg,
      status: 'closed',
      userNotes: notes || '',
    };

    const closingDbPayload = {
      closing_date: productionDate,
      oil_balance_kg: finalOilStock,
      notes: JSON.stringify(metaPayload),
      closed_by: closedBy,
    };

    let upsertedClosing: any;
    if (existingClosing?.id) {
      const { data, error } = await client
        .from('daily_closings')
        .update(closingDbPayload)
        .eq('id', existingClosing.id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      upsertedClosing = data;
    } else {
      const { data, error } = await client
        .from('daily_closings')
        .insert(closingDbPayload)
        .select()
        .single();
      if (error) throw new Error(error.message);
      upsertedClosing = data;
    }

    const closingId = upsertedClosing.id;

    // Group runs by product for cost allocation
    const productMap: Record<string, { productId: string; productName: string; totalProductionKg: number; batchCount: number; ingredientCost: number }> = {};
    for (const r of runs || []) {
      const pId = r.product_id;
      const pName = (r.products as any)?.name || 'Product';
      const qty = Number(r.actual_quantity) || 0;
      const ingCost = Number(r.total_ingredient_cost) || 0;

      if (!productMap[pId]) {
        productMap[pId] = {
          productId: pId,
          productName: pName,
          totalProductionKg: 0,
          batchCount: 0,
          ingredientCost: 0,
        };
      }
      productMap[pId].totalProductionKg += qty;
      productMap[pId].batchCount += 1;
      productMap[pId].ingredientCost += ingCost;
    }

    // Query basic ingredients adjustments recorded on this date (Salt, Cashew shell, Chippli, Curry leaves)
    let dailyBasicIngredientsExpense = 0;
    try {
      const { data: basicMovements } = await client
        .from('stock_movements')
        .select('quantity, cost_per_unit, item_name, reason')
        .eq('item_type', 'ingredient')
        .ilike('reason', `%${productionDate}%`);

      if (basicMovements && basicMovements.length > 0) {
        for (const m of basicMovements) {
          const cost = Number(m.cost_per_unit) || 0;
          const qty = Math.abs(Number(m.quantity) || 0);
          dailyBasicIngredientsExpense += qty * cost;
        }
      }
    } catch (e) {
      console.warn('Could not query basic ingredients expense for allocation', e);
    }

    const allocations = allocateDailySharedExpenses(
      Object.values(productMap),
      oilTotalExpense,
      productionWages,
      dailyBasicIngredientsExpense
    );

    await client.from('daily_cost_allocations').delete().eq('closing_id', closingId);

    if (allocations.length > 0) {
      const allocationsPayload = allocations.map((a) => ({
        closing_id: closingId,
        production_date: productionDate,
        product_id: a.productId,
        product_name: a.productName,
        total_production_kg: a.totalProductionKg,
        batch_count: a.batchCount,
        ingredient_cost: a.ingredientCost,
        allocated_oil_cost: a.allocatedOilCost,
        allocated_production_wages: a.allocatedProductionWages,
        total_production_cost: a.totalProductionCost,
        production_cost_per_kg: a.productionCostPerKg,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));

      await client.from('daily_cost_allocations').insert(allocationsPayload);
    }

    // 7. Update common oil inventory in ingredients table to final calculated stock
    if (oilIng) {
      await client
        .from('ingredients')
        .update({
          current_stock: finalOilStock,
          avg_cost_per_unit: oilUnitCost,
          updated_at: new Date().toISOString(),
        })
        .eq('id', oilIng.id);

      // Clean up previous stock movement for this daily closing to avoid duplicate logs on edit/re-save
      await client
        .from('stock_movements')
        .delete()
        .eq('item_id', oilIng.id)
        .eq('reference', `Daily Closing ${productionDate}`);

      // Record synchronized stock movement ledger entry
      await client.from('stock_movements').insert({
        item_id: oilIng.id,
        item_type: 'ingredient',
        item_name: oilIng.name || 'ഓയിൽ',
        movement_type: 'production_consumption',
        quantity: -oilConsumedKg,
        unit: oilIng.unit || 'kg',
        previous_balance: previousAvailableStock,
        new_balance: finalOilStock,
        cost_per_unit: oilUnitCost,
        reference: `Daily Closing ${productionDate}`,
        operator_name: closedBy,
        reason: `Daily oil usage: ${oilUsed} kg used - ${leftoverOil} kg leftover = ${oilConsumedKg} kg net consumed`,
        created_at: new Date().toISOString(),
      });
    }

    dbCache.invalidate('daily_closing');
    dbCache.invalidate('ingredient');

    return {
      id: upsertedClosing.id,
      productionDate: upsertedClosing.closing_date,
      oilOpeningBalance: previousAvailableStock,
      oilPurchases,
      oilClosingBalance: finalOilStock,
      oilConsumed: oilConsumedKg,
      totalOilUsedKg: oilUsed,
      oilLeftoverKg: leftoverOil,
      oilCostPerKg: oilUnitCost,
      oilTotalExpense,
      productionWages,
      totalSharedExpense,
      totalProductionKg,
      status: 'closed',
      notes: notes || undefined,
      closedBy: upsertedClosing.closed_by || closedBy,
      createdAt: upsertedClosing.created_at,
      updatedAt: upsertedClosing.created_at,
    };
  }

  async listCostAllocations(dateOrClosingId: string): Promise<DailyCostAllocation[]> {
    const client = this.checkClient();
    const isDate = dateOrClosingId.includes('-');
    let query = client.from('daily_cost_allocations').select('*');
    if (isDate) {
      query = query.eq('production_date', dateOrClosingId);
    } else {
      query = query.eq('closing_id', dateOrClosingId);
    }

    const { data, error } = await query.order('total_production_kg', { ascending: false });
    if (error) throw new Error(error.message);

    return (data || []).map((row: any) => ({
      id: row.id,
      closingId: row.closing_id,
      productionDate: row.production_date,
      productId: row.product_id,
      productName: row.product_name,
      totalProductionKg: Number(row.total_production_kg) || 0,
      batchCount: Number(row.batch_count) || 1,
      ingredientCost: Number(row.ingredient_cost) || 0,
      allocatedOilCost: Number(row.allocated_oil_cost) || 0,
      allocatedProductionWages: Number(row.allocated_production_wages) || 0,
      totalProductionCost: Number(row.total_production_cost) || 0,
      productionCostPerKg: Number(row.production_cost_per_kg) || 0,
      createdAt: row.created_at,
    }));
  }

  async listPackagingItems(productId?: string): Promise<PackagingItem[]> {
    const client = this.checkClient();
    try {
      const { data, error } = await client.from('packaging_items').select('*').order('name', { ascending: true });
      if (error) {
        console.warn('Could not query packaging_items:', error);
        return [];
      }

      return (data || []).map((row: any) => ({
        id: row.id,
        productId: row.product_id || '',
        productName: row.name || '',
        sizeLabel: row.size_label || row.name || '',
        sizeGrams: Number(row.size_grams) || 100,
        currentStock: Number(row.current_stock) || 0,
        unitCost: Number(row.unit_cost ?? row.cost_per_unit) || 0,
        packingLabourRate: Number(row.packing_labour_rate) || 1.0,
        isActive: row.is_active ?? true,
        createdAt: row.created_at,
        updatedAt: row.updated_at || row.created_at,
      }));
    } catch {
      return [];
    }
  }

  async savePackagingItem(item: Partial<PackagingItem> & { productId: string; sizeLabel: string }): Promise<PackagingItem> {
    const client = this.checkClient();
    const payload = {
      product_id: item.productId,
      size_label: item.sizeLabel.trim(),
      size_grams: item.sizeGrams ?? 100,
      current_stock: item.currentStock ?? 0,
      unit_cost: item.unitCost ?? 0,
      packing_labour_rate: item.packingLabourRate ?? 1.0,
      is_active: item.isActive ?? true,
      updated_at: new Date().toISOString(),
    };

    if (item.id) {
      const { data, error } = await client
        .from('packaging_items')
        .update(payload)
        .eq('id', item.id)
        .select('*, products(name)')
        .single();

      if (error) throw new Error(error.message);
      return {
        id: data.id,
        productId: data.product_id,
        productName: data.products?.name || '',
        sizeLabel: data.size_label,
        sizeGrams: Number(data.size_grams),
        currentStock: Number(data.current_stock),
        unitCost: Number(data.unit_cost),
        packingLabourRate: Number(data.packing_labour_rate),
        isActive: data.is_active,
      };
    } else {
      const { data, error } = await client
        .from('packaging_items')
        .insert({ ...payload, created_at: new Date().toISOString() })
        .select('*, products(name)')
        .single();

      if (error) throw new Error(error.message);
      return {
        id: data.id,
        productId: data.product_id,
        productName: data.products?.name || '',
        sizeLabel: data.size_label,
        sizeGrams: Number(data.size_grams),
        currentStock: Number(data.current_stock),
        unitCost: Number(data.unit_cost),
        packingLabourRate: Number(data.packing_labour_rate),
        isActive: data.is_active,
      };
    }
  }

  async deletePackagingItem(id: string): Promise<void> {
    const client = this.checkClient();
    const { error } = await client.from('packaging_items').delete().eq('id', id);
    if (error) throw new Error(error.message);
  }

  async listPacketTypes(): Promise<PacketType[]> {
    return dbCache.wrap(
      'packet_types',
      async () => {
        const client = this.checkClient();
        const { data, error } = await client
          .from('packet_types')
          .select('*')
          .eq('is_active', true)
          .order('name', { ascending: true });

        if (error) {
          console.error('Error fetching packet types:', error);
          return [];
        }

        return (data || []).map((row: any) => ({
          id: row.id,
          name: row.name,
          bundleCost: Number(row.bundle_cost) || 0,
          bundleQuantity: Number(row.bundle_quantity) || 1,
          costPerPacket: Number(row.cost_per_packet) || 0,
          isActive: row.is_active ?? true,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        }));
      },
      { ttl: 10 * 60 * 1000 }
    );
  }

  async savePacketType(packet: Partial<PacketType> & { name: string }): Promise<PacketType> {
    const client = this.checkClient();
    const bundleCost = Number(packet.bundleCost) || 0;
    const bundleQuantity = Math.max(1, Number(packet.bundleQuantity) || 1);
    const costPerPacket = packet.costPerPacket !== undefined && packet.costPerPacket > 0
      ? Number(packet.costPerPacket)
      : bundleQuantity > 0 ? Number((bundleCost / bundleQuantity).toFixed(4)) : 0;

    const payload = {
      name: packet.name.trim(),
      bundle_cost: bundleCost,
      bundle_quantity: bundleQuantity,
      cost_per_packet: costPerPacket,
      is_active: packet.isActive ?? true,
      updated_at: new Date().toISOString(),
    };

    let result: PacketType;
    if (packet.id) {
      const { data, error } = await client
        .from('packet_types')
        .update(payload)
        .eq('id', packet.id)
        .select()
        .single();

      if (error) throw new Error(error.message);
      result = {
        id: data.id,
        name: data.name,
        bundleCost: Number(data.bundle_cost) || 0,
        bundleQuantity: Number(data.bundle_quantity) || 1,
        costPerPacket: Number(data.cost_per_packet) || 0,
        isActive: data.is_active,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      };
    } else {
      const { data, error } = await client
        .from('packet_types')
        .insert({
          ...payload,
          created_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw new Error(error.message);
      result = {
        id: data.id,
        name: data.name,
        bundleCost: Number(data.bundle_cost) || 0,
        bundleQuantity: Number(data.bundle_quantity) || 1,
        costPerPacket: Number(data.cost_per_packet) || 0,
        isActive: data.is_active,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      };
    }

    dbCache.invalidate('packet_types');
    dbCache.invalidate('recipe');
    return result;
  }

  async deletePacketType(id: string): Promise<void> {
    const client = this.checkClient();
    const { error } = await client.from('packet_types').delete().eq('id', id);
    if (error) throw new Error(error.message);
    dbCache.invalidate('packet_types');
    dbCache.invalidate('recipe');
  }

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
    const client = this.checkClient();
    const {
      packingDate,
      productId,
      productionRunId,
      packagingItemId,
      packetSize,
      packetsPacked,
      operatorName,
      notes = '',
    } = params;

    const { data: prod } = await client.from('products').select('name').eq('id', productId).single();
    const prodName = prod?.name || 'Product';

    let unitCost = 0;
    let labourRate = 1.0;
    let sizeGrams = 100;
    let currStock = 0;

    if (packagingItemId) {
      const { data: packItem } = await client
        .from('packaging_items')
        .select('*')
        .eq('id', packagingItemId)
        .single();

      if (packItem) {
        unitCost = Number(packItem.unit_cost) || 0;
        labourRate = Number(packItem.packing_labour_rate) || 1.0;
        sizeGrams = Number(packItem.size_grams) || 100;
        currStock = Number(packItem.current_stock) || 0;

        const newStock = Math.max(0, currStock - packetsPacked);
        await client
          .from('packaging_items')
          .update({ current_stock: newStock, updated_at: new Date().toISOString() })
          .eq('id', packagingItemId);

        await client.from('stock_movements').insert({
          item_id: packagingItemId,
          item_type: 'ingredient',
          item_name: `${prodName} Covers (${packetSize})`,
          movement_type: 'production_consumption',
          quantity: -packetsPacked,
          unit: 'pcs',
          previous_balance: currStock,
          new_balance: newStock,
          cost_per_unit: unitCost,
          reference: `Packing ${packingDate}`,
          operator_name: operatorName,
          reason: `Packaging covers consumed for ${packetsPacked} packets`,
          created_at: new Date().toISOString(),
        });
      }
    }

    if (unitCost <= 0) {
      try {
        const { data: pt } = await client
          .from('packet_types')
          .select('cost_per_packet, bundle_cost, bundle_quantity')
          .eq('name', packetSize)
          .limit(1)
          .maybeSingle();
        if (pt) {
          unitCost = Number(pt.cost_per_packet) || (Number(pt.bundle_cost) / Math.max(1, Number(pt.bundle_quantity))) || 0;
        }
      } catch (e) {
        console.warn('Could not query packet_types cost for', packetSize, e);
      }
    }

    const packagingCost = roundCurrency(packetsPacked * unitCost);
    const packingLabourCost = roundCurrency(packetsPacked * labourRate);
    const totalPackingCost = roundCurrency(packagingCost + packingLabourCost);
    const weightPackedKg = roundStock((packetsPacked * sizeGrams) / 1000.0);

    const { data: created, error } = await client
      .from('packing_records')
      .insert({
        packing_date: packingDate,
        product_id: productId,
        production_run_id: productionRunId || null,
        packaging_item_id: packagingItemId || null,
        packet_size: packetSize,
        packets_packed: packetsPacked,
        covers_consumed: packetsPacked,
        cover_unit_cost: unitCost,
        packaging_cost: packagingCost,
        packing_labour_rate: labourRate,
        packing_labour_cost: packingLabourCost,
        total_packing_cost: totalPackingCost,
        weight_packed_kg: weightPackedKg,
        operator_name: operatorName,
        notes: notes || null,
        created_at: new Date().toISOString(),
      })
      .select('*, products(name)')
      .single();

    if (error) throw new Error(error.message);

    dbCache.invalidate('packing_records');
    dbCache.invalidate('production_runs');

    return {
      id: created.id,
      packingDate: created.packing_date,
      productId: created.product_id,
      productName: created.products?.name || prodName,
      productionRunId: created.production_run_id,
      packagingItemId: created.packaging_item_id,
      packetSize: created.packet_size,
      packetsPacked: Number(created.packets_packed),
      coversConsumed: Number(created.covers_consumed),
      coverUnitCost: Number(created.cover_unit_cost),
      packagingCost: Number(created.packaging_cost),
      packingLabourRate: Number(created.packing_labour_rate),
      packingLabourCost: Number(created.packing_labour_cost),
      totalPackingCost: Number(created.total_packing_cost),
      weightPackedKg: Number(created.weight_packed_kg),
      operatorName: created.operator_name,
      notes: created.notes,
      createdAt: created.created_at,
    };
  }

  async listPackingRecords(options?: { productId?: string; date?: string; limit?: number }): Promise<PackingRecord[]> {
    return dbCache.wrap(
      `packing_records_${JSON.stringify(options || {})}`,
      async () => {
        const client = this.checkClient();
        let query = client.from('packing_records').select('*').order('packed_at', { ascending: false });
        if (options?.limit) query = query.limit(options.limit);

        const { data, error } = await query;
        if (error) throw new Error(error.message);

        let records = (data || []).map((row: any) => ({
          id: row.id,
          packingDate: row.packing_date || (row.packed_at ? row.packed_at.split('T')[0] : new Date().toISOString().split('T')[0]),
          productId: row.product_id,
          productName: row.product_name || 'Snack',
          productionRunId: row.production_run_id,
          packagingItemId: row.packaging_item_id || row.packet_type_id,
          packetSize: row.packet_size || 'Standard',
          packetsPacked: Number(row.quantity_packed ?? row.packets_packed) || 0,
          coversConsumed: Number(row.covers_consumed) || 0,
          coverUnitCost: Number(row.cover_unit_cost) || 0,
          packagingCost: Number(row.packaging_cost) || 0,
          packingLabourRate: Number(row.packing_labour_rate) || 0,
          packingLabourCost: Number(row.packing_labour_cost) || 0,
          totalPackingCost: Number(row.total_packing_cost ?? row.total_cost) || 0,
          weightPackedKg: Number(row.weight_packed_kg) || 0,
          operatorName: row.operator_name || row.operator || 'Staff',
          notes: row.notes,
          createdAt: row.created_at || row.packed_at,
        }));

        if (options?.productId) {
          records = records.filter((r: any) => r.productId === options.productId);
        }
        if (options?.date) {
          records = records.filter((r: any) => r.packingDate === options.date);
        }

        return records;
      },
      { ttl: 60 * 1000 }
    );
  }

  async deletePackingRecordsForRun(runId: string, runNumber?: string): Promise<void> {
    const client = this.checkClient();
    const { error } = await client
      .from('packing_records')
      .delete()
      .eq('production_run_id', runId);

    if (error) {
      console.error('Error deleting previous packing records for run:', error);
      throw new Error(error.message);
    }

    if (runNumber) {
      await client
        .from('packing_records')
        .delete()
        .is('production_run_id', null)
        .eq('notes', `Batch #${runNumber}`);
    }

    dbCache.invalidate('packing_records');
    dbCache.invalidate('production_runs');
  }
}

