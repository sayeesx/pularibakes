import { createClient } from '@supabase/supabase-js';
import {
  Product,
  Ingredient,
  Recipe,
  RecipeItem,
  PacketType,
  RecipePacket,
  ProductionRun,
  StockMovement,
  AuditLog,
  DailyClosing,
  DailyCostAllocation,
  PackagingItem,
  PackingRecord,
  SpecialMixture,
  SpecialMixtureBatch,
  SpecialMixtureRecipe,
  SpecialMixtureConsumption,
  UnitType,
} from '../types';
import {
  allocateDailySharedExpenses,
  calculateContinuousOilExpense,
  calculateDailyOilUsage,
  roundCurrency,
  roundStock,
} from './costing';
import { dbCache } from './dbCache';

function sanitizeBaseUrl(url: string): string {
  if (!url) return '';
  return url.trim().replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
}

const rawSupabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseUrl = sanitizeBaseUrl(rawSupabaseUrl);
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || 'placeholder-anon-key').trim();

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export function invalidateAdminCache(pattern?: string): void {
  if (pattern) {
    dbCache.invalidate(pattern);
  } else {
    dbCache.invalidateAll();
  }
}

export async function verifyAdminPin(pin: string): Promise<{ success: boolean; session_token?: string; error?: string }> {
  const cleanPin = pin.trim();

  // Obsolete PIN 65188 is deleted and permanently blocked
  if (cleanPin === '65188') {
    return { success: false, error: 'തെറ്റായ പിൻ (Incorrect PIN)' };
  }

  // 1. Try secure cryptographic database verification with brute force protection
  try {
    const { data, error } = await supabase.rpc('verify_admin_pin', { p_pin: cleanPin });
    if (!error && data) {
      if (data.success && data.session_token) {
        return { success: true, session_token: data.session_token };
      }
      if (data.needs_setup) {
        // First-time setup default PIN 123456
        if (cleanPin === '123456') {
          return {
            success: true,
            session_token: 'pulari_admin_session_' + Date.now().toString(36) + Math.random().toString(36).slice(2),
          };
        }
      }
      return { success: false, error: data.message || 'തെറ്റായ പിൻ (Incorrect PIN)' };
    }
  } catch (rpcErr) {
    console.warn('Database verify_admin_pin RPC unavailable, evaluating local secure fallback:', rpcErr);
  }

  // 2. Offline / local fallback validation
  const localAdminPin = localStorage.getItem('pulari_admin_pin') || '123456';
  if (cleanPin === localAdminPin) {
    return {
      success: true,
      session_token: 'pulari_admin_session_' + Date.now().toString(36) + Math.random().toString(36).slice(2),
    };
  }

  return { success: false, error: 'തെറ്റായ പിൻ (Incorrect PIN)' };
}

export async function changeAdminPin(oldPin: string, newPin: string): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const { data, error } = await supabase.rpc('change_admin_pin', {
      p_old_pin: oldPin.trim(),
      p_new_pin: newPin.trim(),
    });
    if (error) {
      return { success: false, error: error.message };
    }
    localStorage.setItem('pulari_admin_pin', newPin.trim());
    if (data?.success) {
      return { success: true, message: data.message };
    }
    return { success: true, message: 'PIN updated successfully' };
  } catch (err: any) {
    // If network error but old PIN matches local PIN, allow fallback update
    const currentLocalPin = localStorage.getItem('pulari_admin_pin') || '123456';
    if (oldPin.trim() === currentLocalPin) {
      localStorage.setItem('pulari_admin_pin', newPin.trim());
      return { success: true, message: 'PIN updated locally' };
    }
    return { success: false, error: err?.message || 'Network error updating PIN' };
  }
}

export async function fetchProducts(force = false): Promise<Product[]> {
  return dbCache.wrap('admin_products', async () => {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .order('name', { ascending: true });

    if (error) throw error;
    return (data || []).map((row) => ({
      id: row.id,
      name: row.name,
      sku: row.code || row.sku || '',
      recipeId: row.recipe_id || '',
      unit: row.unit || 'kg',
      currentStock: Number(row.current_stock) || 0,
      wholesalePrice: Number(row.avg_cost_per_unit ?? row.wholesale_price) || 0,
      isActive: row.is_active ?? true,
      description: row.description || '',
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }, { ttl: dbCache.TTL.PRODUCTS, force });
}

export async function saveProduct(product: Partial<Product> & { name: string }): Promise<Product> {
  const payload = {
    name: product.name.trim(),
    code: product.sku || null,
    unit: product.unit || 'kg',
    current_stock: product.currentStock ?? 0,
    avg_cost_per_unit: product.wholesalePrice ?? 0,
    is_active: product.isActive ?? true,
    updated_at: new Date().toISOString(),
  };

  dbCache.invalidate('admin_products');

  if (product.id) {
    const { data, error } = await supabase
      .from('products')
      .update(payload)
      .eq('id', product.id)
      .select()
      .single();

    if (error) throw error;
    return {
      id: data.id,
      name: data.name,
      sku: data.code || data.sku || '',
      unit: data.unit,
      currentStock: Number(data.current_stock) || 0,
      wholesalePrice: Number(data.avg_cost_per_unit ?? data.wholesale_price) || 0,
      isActive: data.is_active,
      createdAt: data.created_at,
    };
  } else {
    const { data, error } = await supabase
      .from('products')
      .insert({
        ...payload,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;
    return {
      id: data.id,
      name: data.name,
      sku: data.sku || '',
      unit: data.unit,
      currentStock: Number(data.current_stock) || 0,
      wholesalePrice: Number(data.wholesale_price) || 0,
      isActive: data.is_active,
      createdAt: data.created_at,
    };
  }
}

export async function deleteProduct(id: string): Promise<void> {
  // 1. Check if product has production runs
  const { count } = await supabase
    .from('production_runs')
    .select('*', { count: 'exact', head: true })
    .eq('product_id', id);

  if (count && count > 0) {
    throw new Error(
      'ഈ ഉൽപ്പന്നത്തിന് പ്രൊഡക്ഷൻ ബാച്ചുകൾ നിലവിലുണ്ട്. പൂർണ്ണമായി ഡിലീറ്റ് ചെയ്യാൻ കഴിയില്ല. എഡിറ്റ് ചെയ്ത് "Active" മാറ്റുക. (This product has recorded production runs and cannot be permanently deleted. Please deactivate it instead.)'
    );
  }

  // 2. Unlink recipe_id on products to prevent circular dependency
  // unlinking recipe_id omitted (not in schema)

  // 3. Delete recipes associated with this product
  await supabase.from('recipes').delete().eq('product_id', id);

  // 4. Delete the product
  const { error } = await supabase
    .from('products')
    .delete()
    .eq('id', id);

  if (error) throw error;

  dbCache.invalidate('admin_products');
  dbCache.invalidate('admin_recipes');
}

export async function adjustProductStock(
  productId: string,
  delta: number,
  reason: string,
  operatorName = 'Admin'
): Promise<void> {
  const { data: prod, error: fetchErr } = await supabase
    .from('products')
    .select('id, name, unit, current_stock, avg_cost_per_unit')
    .eq('id', productId)
    .single();

  if (fetchErr) throw fetchErr;

  const prevStock = Number(prod.current_stock) || 0;
  if (delta < 0 && prevStock <= 0) {
    throw new Error('സ്റ്റോക്ക് 0 ആണ്, നെഗറ്റീവ് ആക്കാൻ കഴിയില്ല (Stock is 0, cannot deduct)');
  }
  if (delta < 0 && Math.abs(delta) > prevStock) {
    throw new Error('ലഭ്യമായ സ്റ്റോക്കിനേക്കാൾ കൂടുതൽ കുറയ്ക്കാൻ കഴിയില്ല (Cannot deduct more than available stock)');
  }
  const newStock = Math.max(0, prevStock + delta);

  const { error: updateErr } = await supabase
    .from('products')
    .update({ current_stock: newStock, updated_at: new Date().toISOString() })
    .eq('id', productId);

  if (updateErr) throw updateErr;

  dbCache.invalidate('admin_products');
  dbCache.invalidate('admin_stock_movements');

  try {
    await supabase.from('stock_movements').insert({
      item_id: productId,
      item_type: 'finished',
      item_name: prod.name,
      movement_type: delta >= 0 ? 'in' : 'out',
      quantity: Math.abs(delta),
      unit: prod.unit,
      previous_balance: prevStock,
      new_balance: newStock,
      cost_per_unit: prod.avg_cost_per_unit,
      reference: `ADMIN-PRD-ADJ-${Date.now().toString().slice(-6)}`,
      operator_name: operatorName,
      reason,
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    console.warn('Could not record stock movement log:', err);
  }
}


export async function fetchIngredients(force = false): Promise<Ingredient[]> {
  return dbCache.wrap('admin_ingredients', async () => {
    const { data, error } = await supabase
      .from('ingredients')
      .select('*')
      .order('name', { ascending: true });

    if (error) throw error;
    return (data || []).map((row) => ({
      id: row.id,
      name: row.name,
      category: row.category || 'other',
      unit: row.unit || 'kg',
      currentStock: Number(row.current_stock) || 0,
      minStock: Number(row.min_stock) || 0,
      avgCostPerUnit: Number(row.avg_cost_per_unit) || 0,
      isActive: row.is_active ?? true,
      notes: row.notes || '',
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }, { ttl: dbCache.TTL.INGREDIENTS, force });
}

export async function saveIngredient(ingredient: Partial<Ingredient> & { name: string }): Promise<Ingredient> {
  const payload = {
    name: ingredient.name,
    category: ingredient.category || 'other',
    unit: ingredient.unit || 'kg',
    min_stock: ingredient.minStock ?? 0,
    avg_cost_per_unit: ingredient.avgCostPerUnit ?? 0,
    is_active: ingredient.isActive ?? true,
    // notes omitted
    updated_at: new Date().toISOString(),
  };

  dbCache.invalidate('admin_ingredients');

  if (ingredient.id) {
    const { data, error } = await supabase
      .from('ingredients')
      .update(payload)
      .eq('id', ingredient.id)
      .select()
      .single();

    if (error) throw error;
    return {
      id: data.id,
      name: data.name,
      category: data.category,
      unit: data.unit,
      currentStock: Number(data.current_stock) || 0,
      minStock: Number(data.min_stock) || 0,
      avgCostPerUnit: Number(data.avg_cost_per_unit) || 0,
      isActive: data.is_active,
      notes: data.notes,
    };
  } else {
    const { data, error } = await supabase
      .from('ingredients')
      .insert({
        ...payload,
        current_stock: ingredient.currentStock ?? 0,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;
    return {
      id: data.id,
      name: data.name,
      category: data.category,
      unit: data.unit,
      currentStock: Number(data.current_stock) || 0,
      minStock: Number(data.min_stock) || 0,
      avgCostPerUnit: Number(data.avg_cost_per_unit) || 0,
      isActive: data.is_active,
      notes: data.notes,
    };
  }
}

export async function adjustIngredientStock(
  ingredientId: string,
  delta: number,
  reason: string,
  operatorName = 'Admin'
): Promise<void> {
  // Fetch current ingredient balance
  const { data: ing, error: fetchErr } = await supabase
    .from('ingredients')
    .select('id, name, unit, current_stock, avg_cost_per_unit')
    .eq('id', ingredientId)
    .single();

  if (fetchErr) throw fetchErr;

  const prevStock = Number(ing.current_stock) || 0;
  if (delta < 0 && prevStock <= 0) {
    throw new Error('സ്റ്റോക്ക് 0 ആണ്, നെഗറ്റീവ് ആക്കാൻ കഴിയില്ല (Stock is 0, cannot deduct)');
  }
  if (delta < 0 && Math.abs(delta) > prevStock) {
    throw new Error('ലഭ്യമായ സ്റ്റോക്കിനേക്കാൾ കൂടുതൽ കുറയ്ക്കാൻ കഴിയില്ല (Cannot deduct more than available stock)');
  }
  const newStock = Math.max(0, prevStock + delta);

  // Update ingredient balance
  const { error: updateErr } = await supabase
    .from('ingredients')
    .update({ current_stock: newStock, updated_at: new Date().toISOString() })
    .eq('id', ingredientId);

  if (updateErr) throw updateErr;

  dbCache.invalidate('admin_ingredients');
  dbCache.invalidate('admin_stock_movements');

  // Insert stock movement record
  await supabase.from('stock_movements').insert({
    item_id: ingredientId,
    item_type: 'raw',
    item_name: ing.name,
    movement_type: delta >= 0 ? 'in' : 'out',
    quantity: Math.abs(delta),
    unit: ing.unit,
    previous_balance: prevStock,
    new_balance: newStock,
    cost_per_unit: ing.avg_cost_per_unit,
    reference: `ADMIN-ADJ-${Date.now().toString().slice(-6)}`,
    operator_name: operatorName,
    reason,
    created_at: new Date().toISOString(),
  });
}

export async function deleteIngredient(id: string): Promise<void> {
  dbCache.invalidate('admin_ingredients');
  dbCache.invalidate('admin_recipes');
  try {
    await supabase.from('recipe_items').delete().eq('ingredient_id', id);
  } catch (e) {
    console.warn('recipe_items cleanup note:', e);
  }
  const { error } = await supabase
    .from('ingredients')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

export async function fetchPacketTypes(force = false): Promise<PacketType[]> {
  return dbCache.wrap('admin_packet_types', async () => {
    const { data, error } = await supabase
      .from('packet_types')
      .select('*')
      .order('name', { ascending: true });

    if (error) {
      console.error('Error fetching packet types:', error);
      return [];
    }

    return (data || []).map((row) => ({
      id: row.id,
      name: row.name,
      bundleCost: Number(row.bundle_cost) || 0,
      bundleQuantity: Number(row.bundle_quantity) || 1,
      costPerPacket: Number(row.cost_per_packet) || 0,
      isActive: row.is_active ?? true,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }, { ttl: dbCache.TTL.PACKET_TYPES, force });
}

export async function savePacketType(packet: Partial<PacketType> & { name: string }): Promise<PacketType> {
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

  dbCache.invalidate('admin_packet_types');
  dbCache.invalidate('admin_recipes');

  if (packet.id) {
    const { data, error } = await supabase
      .from('packet_types')
      .update(payload)
      .eq('id', packet.id)
      .select()
      .single();

    if (error) throw error;
    return {
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
    const { data, error } = await supabase
      .from('packet_types')
      .insert({
        ...payload,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;
    return {
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
}

export async function deletePacketType(id: string): Promise<void> {
  dbCache.invalidate('admin_packet_types');
  dbCache.invalidate('admin_recipes');
  const { error } = await supabase
    .from('packet_types')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

export async function fetchRecipes(force = false): Promise<Recipe[]> {
  return dbCache.wrap('admin_recipes', async () => {
    const { data: recipesData, error: recipesErr } = await supabase
      .from('recipes')
      .select(`
        *,
        products!recipes_product_id_fkey (name)
      `)
      .order('created_at', { ascending: false });

    if (recipesErr) throw recipesErr;

    const { data: itemsData, error: itemsErr } = await supabase
      .from('recipe_items')
      .select(`
        *,
        ingredients (name, avg_cost_per_unit)
      `);

    if (itemsErr) throw itemsErr;

    const { data: packetsData } = await supabase
      .from('recipe_packets')
      .select('*');

    return (recipesData || []).map((r) => {
      const items = (itemsData || [])
        .filter((it) => it.recipe_id === r.id)
        .map((it) => ({
          id: it.id,
          recipeId: it.recipe_id,
          ingredientId: it.ingredient_id,
          ingredientName: it.ingredients?.name || 'Unknown',
          quantity: Number(it.quantity) || 0,
          unit: it.unit || 'kg',
          cost: (Number(it.quantity) || 0) * (Number(it.ingredients?.avg_cost_per_unit) || 0),
        }));

      let packets: RecipePacket[] = [];
      if (packetsData && packetsData.length > 0) {
        packets = packetsData
          .filter((p: any) => p.recipe_id === r.id)
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
      if (packets.length === 0 && Array.isArray(r.packets) && r.packets.length > 0) {
        packets = r.packets.map((p: any) => ({
          id: p.id,
          recipeId: r.id,
          packetTypeId: p.packetTypeId,
          packetName: p.packetName || p.name || 'Packet',
          costPerPacket: Number(p.costPerPacket) || 0,
          bundleCost: Number(p.bundleCost) || 0,
          bundleQuantity: Number(p.bundleQuantity) || 1,
        }));
      }

      return {
        id: r.id,
        productId: r.product_id,
        productName: r.products?.name || 'Unknown Snack',
        version: r.version || 1,
        baseOutputQuantity: Number(r.output_quantity || r.base_output_quantity) || 1,
        baseOutputUnit: r.output_unit || r.base_output_unit || 'kg',
        instructions: r.instructions || '',
        notes: r.notes || '',
        isActive: r.is_active ?? true,
        items,
        packets,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      };
    });
  }, { ttl: dbCache.TTL.RECIPES, force });
}

export async function saveRecipe(
  recipe: Partial<Recipe> & { productId: string; baseOutputQuantity: number; baseOutputUnit: string },
  items: Array<{ ingredientId: string; quantity: number; unit: string }>,
  packets?: Array<{ packetTypeId?: string; packetName: string; costPerPacket: number; bundleCost?: number; bundleQuantity?: number }>
): Promise<void> {
  let recipeId = recipe.id;

  const normalizedPackets = (packets || []).map((p) => ({
    packetTypeId: p.packetTypeId,
    packetName: p.packetName,
    costPerPacket: Number(p.costPerPacket) || 0,
    bundleCost: Number(p.bundleCost) || 0,
    bundleQuantity: Number(p.bundleQuantity) || 1,
  }));

  dbCache.invalidate('admin_recipes');
  dbCache.invalidate('admin_products');

  if (!recipeId) {
    const { data: newRec, error: recErr } = await supabase
      .from('recipes')
      .insert({
        product_id: recipe.productId,
        name: recipe.productName || 'Recipe',
        output_quantity: recipe.baseOutputQuantity,
        output_unit: recipe.baseOutputUnit || 'kg',
        notes: recipe.notes || null,
        is_active: recipe.isActive ?? true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (recErr) throw recErr;
    recipeId = newRec.id;

    // Link recipe to product
    // link recipe_id on products omitted (not in schema)
  } else {
    const { error: recErr } = await supabase
      .from('recipes')
      .update({
        base_output_quantity: recipe.baseOutputQuantity,
        base_output_unit: recipe.baseOutputUnit,
        instructions: recipe.instructions || null,
        notes: recipe.notes || null,
        packets: normalizedPackets,
        is_active: recipe.isActive ?? true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', recipeId);

    if (recErr) throw recErr;

    // Ensure product is linked
    if (recipe.productId) {
      // link recipe_id on products omitted (not in schema)
    }

    // Remove old recipe items & packets
    await supabase.from('recipe_items').delete().eq('recipe_id', recipeId);
    await supabase.from('recipe_packets').delete().eq('recipe_id', recipeId);
  }

  // Insert items
  if (items.length > 0) {
    const itemsPayload = items.map((it) => ({
      recipe_id: recipeId,
      ingredient_id: it.ingredientId,
      quantity: it.quantity,
      unit: it.unit,
      created_at: new Date().toISOString(),
    }));

    const { error: itemsErr } = await supabase.from('recipe_items').insert(itemsPayload);
    if (itemsErr) throw itemsErr;
  }

  // Insert packets
  if (normalizedPackets.length > 0) {
    const packetsPayload = normalizedPackets.map((pkt) => ({
      recipe_id: recipeId,
      packet_type_id: pkt.packetTypeId || null,
      packet_name: pkt.packetName,
      cost_per_packet: pkt.costPerPacket,
      bundle_cost: pkt.bundleCost || 0,
      bundle_quantity: pkt.bundleQuantity || 1,
      created_at: new Date().toISOString(),
    }));

    const { error: pktsErr } = await supabase.from('recipe_packets').insert(packetsPayload);
    if (pktsErr) {
      console.error('Error inserting recipe_packets:', pktsErr);
    }
  }
}

export async function deleteRecipe(id: string): Promise<void> {
  dbCache.invalidate('admin_recipes');
  dbCache.invalidate('admin_products');
  await supabase.from('products').update({ recipe_id: null }).eq('recipe_id', id);
  await supabase.from('recipe_items').delete().eq('recipe_id', id);
  await supabase.from('recipe_packets').delete().eq('recipe_id', id);
  const { error } = await supabase.from('recipes').delete().eq('id', id);
  if (error) throw error;
}

export interface DeleteProductionRunOptions {
  restoreIngredients?: boolean;
  operatorName?: string;
  reason?: string;
}

export async function deleteProductionRun(
  id: string,
  options?: DeleteProductionRunOptions
): Promise<void> {
  const { data: run, error: fetchErr } = await supabase
    .from('production_runs')
    .select(`
      id,
      run_number,
      product_id,
      actual_quantity,
      unit,
      production_consumption (
        ingredient_id,
        actual_quantity,
        unit
      )
    `)
    .eq('id', id)
    .maybeSingle();

  if (fetchErr) throw fetchErr;
  if (!run) return;

  // 1. Deduct produced product quantity from product stock
  if (run.product_id && Number(run.actual_quantity) > 0) {
    const { data: prod } = await supabase
      .from('products')
      .select('id, name, current_stock, unit')
      .eq('id', run.product_id)
      .maybeSingle();

    if (prod) {
      const prevStock = Number(prod.current_stock) || 0;
      const deductQty = Number(run.actual_quantity) || 0;
      const newStock = Math.max(0, Number((prevStock - deductQty).toFixed(3)));

      const { error: pUpdateErr } = await supabase
        .from('products')
        .update({ current_stock: newStock, updated_at: new Date().toISOString() })
        .eq('id', run.product_id);

      if (pUpdateErr) throw pUpdateErr;

      try {
        await supabase.from('stock_movements').insert({
          item_id: run.product_id,
          item_type: 'product',
          item_name: prod.name,
          movement_type: 'adjustment',
          quantity: -deductQty,
          unit: prod.unit,
          previous_balance: prevStock,
          new_balance: newStock,
          reference: `Del Run ${run.run_number}`,
          operator_name: options?.operatorName || 'Admin',
          reason: options?.reason || `Batch #${run.run_number} deleted: -${deductQty} ${prod.unit} removed from stock`,
          created_at: new Date().toISOString(),
        });
      } catch (smErr) {
        console.warn('Stock movement insert failed:', smErr);
      }
    }
  }

  // 2. Restore consumed ingredients back to ingredient stock (if requested)
  if (options?.restoreIngredients && run.production_consumption && run.production_consumption.length > 0) {
    for (const item of run.production_consumption) {
      const ingId = item.ingredient_id;
      const qtyToRestore = Number(item.actual_quantity) || 0;
      if (ingId && qtyToRestore > 0) {
        const { data: ing } = await supabase
          .from('ingredients')
          .select('id, name, current_stock, unit')
          .eq('id', ingId)
          .maybeSingle();

        if (ing) {
          const prevIngStock = Number(ing.current_stock) || 0;
          const newIngStock = Number((prevIngStock + qtyToRestore).toFixed(3));

          await supabase
            .from('ingredients')
            .update({ current_stock: newIngStock, updated_at: new Date().toISOString() })
            .eq('id', ingId);

          try {
            await supabase.from('stock_movements').insert({
              item_id: ingId,
              item_type: 'ingredient',
              item_name: ing.name,
              movement_type: 'adjustment',
              quantity: qtyToRestore,
              unit: ing.unit,
              previous_balance: prevIngStock,
              new_balance: newIngStock,
              reference: `Del Run ${run.run_number} Reversal`,
              operator_name: options?.operatorName || 'Admin',
              reason: `Batch #${run.run_number} deleted: +${qtyToRestore} ${ing.unit} restored to stock`,
              created_at: new Date().toISOString(),
            });
          } catch (smErr) {
            console.warn('Stock movement insert failed:', smErr);
          }
        }
      }
    }
  }

  // 3. Unlink any packing records referencing this run
  try {
    await supabase
      .from('packing_records')
      .update({ production_run_id: null })
      .eq('production_run_id', id);
  } catch (packErr) {
    console.warn('Unlink packing records non-fatal:', packErr);
  }

  // 4. Delete consumption and production run
  await supabase.from('production_consumption').delete().eq('run_id', id);
  const { error: delErr } = await supabase.from('production_runs').delete().eq('id', id);
  if (delErr) throw delErr;

  // 5. Invalidate caches
  invalidateAdminCache('admin_products');
  invalidateAdminCache('admin_ingredients');
  invalidateAdminCache('admin_production_runs');
  invalidateAdminCache('admin_stock_movements');
  invalidateAdminCache();
}

export async function fetchProductionRuns(force = false): Promise<ProductionRun[]> {
  return dbCache.wrap('admin_production_runs', async () => {
    const [{ data, error }, { data: packingsData }] = await Promise.all([
      supabase
        .from('production_runs')
        .select(`
          *,
          products (name),
          production_consumption (
            *,
            ingredients (name)
          )
        `)
        .order('created_at', { ascending: false })
        .limit(100),
      supabase
        .from('packing_records')
        .select('*')
        .order('packed_at', { ascending: false })
        .limit(500),
    ]);

    if (error) throw error;
    return (data || []).map((row: any) => {
      const runPackings = (packingsData || []).filter((p: any) =>
        p.production_run_id
          ? p.production_run_id === row.id
          : Boolean(p.notes && row.run_number && p.notes.includes(row.run_number))
      );
      const totalPackets = runPackings.reduce(
        (sum: number, p: any) => sum + (Number(p.quantity_packed ?? p.packets_packed) || 0),
        0
      );

      const prodDate = row.production_date || (row.start_time ? row.start_time.split('T')[0] : (row.created_at ? row.created_at.split('T')[0] : new Date().toISOString().split('T')[0]));
      const runNum = row.run_number || ('RUN-' + (row.created_at ? row.created_at.slice(0, 10).replace(/-/g, '') : '2026') + '-' + row.id.slice(0, 4).toUpperCase());

      return {
        id: row.id,
        runNumber: runNum,
        productId: row.product_id,
        productName: row.products?.name || 'Snack',
        recipeId: row.recipe_id,
        recipeVersion: row.recipe_version,
        productionDate: prodDate,
        plannedQuantity: Number(row.planned_quantity ?? row.target_quantity) || 0,
        actualQuantity: Number(row.actual_quantity) || 0,
        unit: row.unit || 'kg',
        status: row.status as any,
        notes: row.notes,
        operatorName: row.operator_name || 'Staff',
        totalIngredientCost: Number(row.total_ingredient_cost) || 0,
        ingredientsConsumed: (row.production_consumption || []).map((c: any) => ({
          ingredientId: c.ingredient_id,
          ingredientName: c.ingredients?.name || 'Ingredient',
          expectedQuantity: Number(c.expected_quantity) || 0,
          actualQuantity: Number(c.actual_quantity) || 0,
          unit: c.unit,
          unitCost: Number(c.unit_cost) || 0,
          totalCost: Number(c.total_cost) || 0,
        })),
        createdAt: row.created_at,
        packingRecords: runPackings.map((p: any) => ({
          id: p.id,
          packetSize: p.packet_size || 'Standard',
          packetsPacked: Number(p.quantity_packed ?? p.packets_packed) || 0,
          weightPackedKg: Number(p.weight_packed_kg) || 0,
        })),
        totalPacketsPacked: totalPackets,
      };
    });
  }, { ttl: dbCache.TTL.PRODUCTION_RUNS, force });
}

export async function fetchStockMovements(force = false): Promise<StockMovement[]> {
  return dbCache.wrap('admin_stock_movements', async () => {
    const { data, error } = await supabase
      .from('stock_movements')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1000);

    if (error) throw error;
    return (data || []).map((row) => ({
      id: row.id,
      itemId: row.item_id,
      itemType: row.item_type as any,
      itemName: row.item_name,
      movementType: row.movement_type as any,
      quantity: Number(row.quantity) || 0,
      unit: row.unit,
      previousBalance: Number(row.previous_balance) || 0,
      newBalance: Number(row.new_balance) || 0,
      costPerUnit: row.cost_per_unit ? Number(row.cost_per_unit) : undefined,
      reference: row.reference,
      operatorName: row.operator_name,
      reason: row.reason,
      createdAt: row.created_at,
    }));
  }, { ttl: dbCache.TTL.STOCK_MOVEMENTS, force });
}

export async function fetchAuditLogs(force = false): Promise<AuditLog[]> {
  return dbCache.wrap('admin_audit_logs', async () => {
    const { data, error } = await supabase
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;
    return (data || []).map((row) => ({
      id: row.id,
      actor: row.actor,
      action: row.action,
      entityType: row.entity_type,
      entityId: row.entity_id,
      details: row.details,
      createdAt: row.created_at,
    }));
  }, { ttl: dbCache.TTL.AUDIT_LOGS, force });
}

// ============================================================================
// DAILY PRODUCTION CLOSING, OIL INVENTORY & SHARED EXPENSE ALLOCATIONS
// ============================================================================

export async function fetchDailyClosing(date: string): Promise<DailyClosing | null> {
  const { data, error } = await supabase
    .from('daily_closings')
    .select('*')
    .eq('production_date', date)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  let totalOilUsedKg: number | undefined = undefined;
  let oilLeftoverKg: number | undefined = undefined;
  if (data.notes) {
    try {
      const meta = JSON.parse(data.notes);
      if (typeof meta.oilUsedKg === 'number') totalOilUsedKg = meta.oilUsedKg;
      if (typeof meta.leftoverOilKg === 'number') oilLeftoverKg = meta.leftoverOilKg;
    } catch {}
  }

  return {
    id: data.id,
    productionDate: data.production_date,
    oilOpeningBalance: Number(data.oil_opening_balance) || 0,
    oilPurchases: Number(data.oil_purchases) || 0,
    oilClosingBalance: Number(data.oil_closing_balance) || 0,
    oilConsumed: Number(data.oil_consumed) || 0,
    totalOilUsedKg,
    oilLeftoverKg,
    oilCostPerKg: Number(data.oil_cost_per_kg) || 0,
    oilTotalExpense: Number(data.oil_total_expense) || 0,
    productionWages: Number(data.production_wages) || 0,
    totalSharedExpense: Number(data.total_shared_expense) || 0,
    totalProductionKg: Number(data.total_production_kg) || 0,
    status: data.status,
    notes: data.notes || '',
    closedBy: data.closed_by || 'Admin',
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

export async function fetchDailyClosings(limit = 60, force = false): Promise<DailyClosing[]> {
  return dbCache.wrap(`admin_daily_closings_${limit}`, async () => {
    const { data, error } = await supabase
      .from('daily_closings')
      .select('*')
      .order('production_date', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return (data || []).map((data) => ({
      id: data.id,
      productionDate: data.production_date,
      oilOpeningBalance: Number(data.oil_opening_balance) || 0,
      oilPurchases: Number(data.oil_purchases) || 0,
      oilClosingBalance: Number(data.oil_closing_balance) || 0,
      oilConsumed: Number(data.oil_consumed) || 0,
      oilCostPerKg: Number(data.oil_cost_per_kg) || 0,
      oilTotalExpense: Number(data.oil_total_expense) || 0,
      productionWages: Number(data.production_wages) || 0,
      totalSharedExpense: Number(data.total_shared_expense) || 0,
      totalProductionKg: Number(data.total_production_kg) || 0,
      status: data.status,
      notes: data.notes || '',
      closedBy: data.closed_by || 'Admin',
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    }));
  }, { ttl: dbCache.TTL.DAILY_CLOSINGS, force });
}

export async function fetchLatestOilBalance(): Promise<{ currentStock: number; avgCost: number; lastClosingDate?: string }> {
  // 1. Check most recent closing
  const { data: lastClosing } = await supabase
    .from('daily_closings')
    .select('production_date, oil_closing_balance, oil_cost_per_kg')
    .order('production_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  // 2. Also check common oil ingredient
  const { data: oilIng } = await supabase
    .from('ingredients')
    .select('current_stock, avg_cost_per_unit')
    .or("name.eq.ഓയിൽ,name.ilike.%oil%")
    .order('current_stock', { ascending: false })
    .limit(1)
    .maybeSingle();

  const currentStock = lastClosing ? Number(lastClosing.oil_closing_balance) : (oilIng ? Number(oilIng.current_stock) : 0);
  const avgCost = lastClosing && Number(lastClosing.oil_cost_per_kg) > 0 ? Number(lastClosing.oil_cost_per_kg) : (oilIng ? Number(oilIng.avg_cost_per_unit) : 0);

  return {
    currentStock,
    avgCost,
    lastClosingDate: lastClosing?.production_date,
  };
}

export async function fetchOilPurchasesForDate(date: string): Promise<number> {
  // Sum inward stock movements for oil on that date
  const { data: movements } = await supabase
    .from('stock_movements')
    .select('quantity, item_name')
    .or("item_name.eq.ഓയിൽ,item_name.ilike.%oil%")
    .in('movement_type', ['in', 'purchase'])
    .gte('created_at', `${date}T00:00:00.000Z`)
    .lte('created_at', `${date}T23:59:59.999Z`);

  if (!movements || movements.length === 0) return 0;
  return movements.reduce((sum, m) => sum + Math.max(0, Number(m.quantity) || 0), 0);
}

// -------------------------------------------------------------
// Sales Management
// -------------------------------------------------------------

export async function fetchSales(): Promise<any[]> {
  const { data, error } = await supabase
    .from('sales')
    .select('*')
    .order('sale_date', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching sales:', error);
    return [];
  }
  return data || [];
}

export async function recordSale(sale: {
  sale_date: string;
  product_id?: string;
  product_name: string;
  quantity: number;
  unit: string;
  unit_price: number;
  total_amount: number;
  customer_name?: string;
  payment_method?: string;
  payment_status?: string;
  notes?: string;
}): Promise<any> {
  const { data, error } = await supabase
    .from('sales')
    .insert([sale])
    .select()
    .single();

  if (error) {
    console.error('Error recording sale:', error);
    throw error;
  }
  return data;
}

export async function recordSalesBatch(sales: Array<{
  sale_date: string;
  product_id?: string;
  product_name: string;
  quantity: number;
  unit: string;
  unit_price: number;
  total_amount: number;
  customer_name?: string;
  payment_method?: string;
  payment_status?: string;
  notes?: string;
}>): Promise<any[]> {
  if (!sales || sales.length === 0) return [];
  const { data, error } = await supabase
    .from('sales')
    .insert(sales)
    .select();

  if (error) {
    console.error('Error recording sales batch:', error);
    throw error;
  }
  return data || [];
}

export async function deleteSale(id: string): Promise<void> {
  const { error } = await supabase.from('sales').delete().eq('id', id);
  if (error) {
    console.error('Error deleting sale:', error);
    throw error;
  }
}


export async function saveDailyClosing(params: {
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
  const {
    productionDate,
    oilPurchases = 0,
    notes = '',
    closedBy = 'Admin',
  } = params;

  // 1. Fetch current oil ingredient from inventory
  const { data: oilIng } = await supabase
    .from('ingredients')
    .select('id, name, unit, current_stock, avg_cost_per_unit')
    .or("name.eq.ഓയിൽ,name.ilike.%oil%")
    .limit(1)
    .maybeSingle();

  // 2. Check for an existing closing for this production date
  const { data: existingClosing } = await supabase
    .from('daily_closings')
    .select('id, oil_consumed, oil_opening_balance, oil_closing_balance, notes')
    .eq('production_date', productionDate)
    .maybeSingle();

  // 3. Determine previous available stock:
  // If editing/re-saving for this date, reverse previously deducted net consumption
  // so neither used oil nor leftover oil is counted twice.
  const prevNetDeducted = existingClosing ? (Number(existingClosing.oil_consumed) || 0) : 0;
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
  const { data: runs, error: runsErr } = await supabase
    .from('production_runs')
    .select(`
      id,
      product_id,
      actual_quantity,
      total_ingredient_cost,
      products (name)
    `)
    .eq('production_date', productionDate)
    .eq('status', 'completed');

  if (runsErr) throw runsErr;

  const totalProductionKg = (runs || []).reduce((sum, r) => sum + (Number(r.actual_quantity) || 0), 0);

  // Metadata preserving exact cook inputs
  const metaPayload = {
    oilUsedKg: oilUsed,
    leftoverOilKg: leftoverOil,
    previousAvailableStock,
    finalOilStock,
    userNotes: notes || '',
  };

  const closingPayload = {
    production_date: productionDate,
    oil_opening_balance: previousAvailableStock,
    oil_purchases: oilPurchases,
    oil_closing_balance: finalOilStock,
    oil_consumed: oilConsumedKg,
    oil_cost_per_kg: oilUnitCost,
    oil_total_expense: oilTotalExpense,
    production_wages: productionWages,
    total_shared_expense: totalSharedExpense,
    total_production_kg: totalProductionKg,
    status: 'closed',
    notes: JSON.stringify(metaPayload),
    closed_by: closedBy,
    updated_at: new Date().toISOString(),
  };

  const { data: upsertedClosing, error: closingErr } = await supabase
    .from('daily_closings')
    .upsert(closingPayload, { onConflict: 'production_date' })
    .select()
    .single();

  if (closingErr) throw closingErr;
  const closingId = upsertedClosing.id;

  // Group production runs by product
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

  const productsSummary = Object.values(productMap);

  // Distribute shared expenses proportionally by product weight
  const allocations = allocateDailySharedExpenses(productsSummary, oilTotalExpense, productionWages);

  await supabase.from('daily_cost_allocations').delete().eq('closing_id', closingId);

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

    const { error: allocErr } = await supabase.from('daily_cost_allocations').insert(allocationsPayload);
    if (allocErr) console.error('Failed to insert allocations', allocErr);
  }

  // 7. Update common oil inventory in ingredients table to final calculated stock
  if (oilIng) {
    await supabase
      .from('ingredients')
      .update({
        current_stock: finalOilStock,
        avg_cost_per_unit: oilUnitCost,
        updated_at: new Date().toISOString(),
      })
      .eq('id', oilIng.id);

    // Clean up previous stock movement for this daily closing to avoid duplicate logs on edit/re-save
    await supabase
      .from('stock_movements')
      .delete()
      .eq('item_id', oilIng.id)
      .eq('reference', `Daily Closing ${productionDate}`);

    // Record synchronized stock movement ledger entry
    await supabase.from('stock_movements').insert({
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

  invalidateAdminCache('daily_closings');
  invalidateAdminCache('ingredients');

  return {
    id: upsertedClosing.id,
    productionDate: upsertedClosing.production_date,
    oilOpeningBalance: Number(upsertedClosing.oil_opening_balance),
    oilPurchases: Number(upsertedClosing.oil_purchases),
    oilClosingBalance: Number(upsertedClosing.oil_closing_balance),
    oilConsumed: Number(upsertedClosing.oil_consumed),
    totalOilUsedKg: oilUsed,
    oilLeftoverKg: leftoverOil,
    oilCostPerKg: Number(upsertedClosing.oil_cost_per_kg),
    oilTotalExpense: Number(upsertedClosing.oil_total_expense),
    productionWages: Number(upsertedClosing.production_wages),
    totalSharedExpense: Number(upsertedClosing.total_shared_expense),
    totalProductionKg: Number(upsertedClosing.total_production_kg),
    status: upsertedClosing.status,
    notes: upsertedClosing.notes || '',
    closedBy: upsertedClosing.closed_by || 'Admin',
    createdAt: upsertedClosing.created_at,
    updatedAt: upsertedClosing.updated_at,
  };
}

export async function fetchCostAllocations(dateOrClosingId: string): Promise<DailyCostAllocation[]> {
  const isDate = dateOrClosingId.includes('-');
  let query = supabase.from('daily_cost_allocations').select('*');
  if (isDate) {
    query = query.eq('production_date', dateOrClosingId);
  } else {
    query = query.eq('closing_id', dateOrClosingId);
  }

  const { data, error } = await query.order('total_production_kg', { ascending: false });
  if (error) throw error;

  return (data || []).map((row) => ({
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

// ============================================================================
// PACKAGING ITEMS & PACKING ACTIVITIES
// ============================================================================

export async function fetchPackagingItems(productId?: string): Promise<PackagingItem[]> {
  let query = supabase.from('packaging_items').select('*, products(name)').order('size_grams', { ascending: true });
  if (productId) query = query.eq('product_id', productId);

  const { data, error } = await query;
  if (error) throw error;

  return (data || []).map((row: any) => ({
    id: row.id,
    productId: row.product_id,
    productName: row.products?.name || '',
    sizeLabel: row.size_label,
    sizeGrams: Number(row.size_grams) || 100,
    currentStock: Number(row.current_stock) || 0,
    unitCost: Number(row.unit_cost) || 0,
    packingLabourRate: Number(row.packing_labour_rate) || 1.00,
    isActive: row.is_active ?? true,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function savePackagingItem(item: Partial<PackagingItem> & { productId: string; sizeLabel: string }): Promise<PackagingItem> {
  const payload = {
    product_id: item.productId,
    size_label: item.sizeLabel.trim(),
    size_grams: item.sizeGrams ?? 100,
    current_stock: item.currentStock ?? 0,
    unit_cost: item.unitCost ?? 0,
    packing_labour_rate: item.packingLabourRate ?? 1.00,
    is_active: item.isActive ?? true,
    updated_at: new Date().toISOString(),
  };

  if (item.id) {
    const { data, error } = await supabase
      .from('packaging_items')
      .update(payload)
      .eq('id', item.id)
      .select('*, products(name)')
      .single();

    if (error) throw error;
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
    const { data, error } = await supabase
      .from('packaging_items')
      .insert({ ...payload, created_at: new Date().toISOString() })
      .select('*, products(name)')
      .single();

    if (error) throw error;
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

export async function deletePackagingItem(id: string): Promise<void> {
  const { error } = await supabase.from('packaging_items').delete().eq('id', id);
  if (error) throw error;
}

export async function adjustPackagingItemStock(
  id: string,
  delta: number,
  reason: string = 'Stock adjustment'
): Promise<PackagingItem> {
  const { data: item, error: fetchErr } = await supabase
    .from('packaging_items')
    .select('*, products(name)')
    .eq('id', id)
    .single();

  if (fetchErr || !item) throw new Error(fetchErr?.message || 'Packaging item not found');

  const prevStock = Number(item.current_stock) || 0;
  const newStock = Math.max(0, prevStock + delta);

  const { data, error } = await supabase
    .from('packaging_items')
    .update({
      current_stock: newStock,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('*, products(name)')
    .single();

  if (error) throw error;

  await supabase.from('stock_movements').insert({
    item_id: id,
    item_type: 'ingredient',
    item_name: `${item.products?.name || 'Product'} ${item.size_label} Cover`,
    movement_type: delta >= 0 ? 'purchase' : 'adjust',
    quantity: delta,
    unit: 'pcs',
    previous_balance: prevStock,
    new_balance: newStock,
    cost_per_unit: Number(item.unit_cost) || 0,
    reference: `COVER-${Date.now().toString().slice(-6)}`,
    operator_name: 'Admin',
    reason,
    created_at: new Date().toISOString(),
  });

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

export async function recordPacking(params: {
  packingDate: string;
  productId: string;
  productionRunId?: string;
  packagingItemId?: string;
  packetSize: string;
  packetsPacked: number;
  operatorName?: string;
  notes?: string;
}): Promise<PackingRecord> {
  const {
    packingDate,
    productId,
    productionRunId,
    packagingItemId,
    packetSize,
    packetsPacked,
    operatorName = 'Admin',
    notes = '',
  } = params;

  // 1. Fetch product and packaging item
  const { data: prod } = await supabase.from('products').select('name').eq('id', productId).single();
  const prodName = prod?.name || 'Product';

  let unitCost = 0;
  let labourRate = 1.0;
  let sizeGrams = 100;
  let currStock = 0;

  if (packagingItemId) {
    const { data: packItem } = await supabase
      .from('packaging_items')
      .select('*')
      .eq('id', packagingItemId)
      .single();

    if (packItem) {
      unitCost = Number(packItem.unit_cost) || 0;
      labourRate = Number(packItem.packing_labour_rate) || 1.0;
      sizeGrams = Number(packItem.size_grams) || 100;
      currStock = Number(packItem.current_stock) || 0;

      // Deduct stock
      const newStock = Math.max(0, currStock - packetsPacked);
      await supabase
        .from('packaging_items')
        .update({ current_stock: newStock, updated_at: new Date().toISOString() })
        .eq('id', packagingItemId);

      // Stock movement
      await supabase.from('stock_movements').insert({
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
      const { data: pt } = await supabase
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

  const { data: created, error } = await supabase
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

  if (error) throw error;

  await supabase.from('audit_logs').insert({
    actor: operatorName,
    action: 'RECORD_PACKING',
    entity_type: 'PACKING',
    entity_id: created.id,
    details: {
      productName: prodName,
      packetSize,
      packetsPacked,
      totalPackingCost,
    },
    created_at: new Date().toISOString(),
  });

  dbCache.invalidate('admin_packing_records');
  dbCache.invalidate('admin_production_runs');

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

export async function fetchPackingRecords(options?: { productId?: string; date?: string; limit?: number }, force = false): Promise<PackingRecord[]> {
  const cacheKey = `admin_packing_records_${options?.productId || 'all'}_${options?.date || 'all'}_${options?.limit || 0}`;
  return dbCache.wrap(cacheKey, async () => {
    let query = supabase.from('packing_records').select('*').order('packed_at', { ascending: false });
    if (options?.limit) query = query.limit(options.limit);

    const { data, error } = await query;
    if (error) throw error;

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
  }, { ttl: dbCache.TTL.PACKING_RECORDS, force });
}

// ============================================================================
// DAILY WAGES
// ============================================================================

export async function fetchDailyWages(limit = 60, force = false): Promise<any[]> {
  return dbCache.wrap(`admin_daily_wages_${limit}`, async () => {
    const { data, error } = await supabase
      .from('daily_wages')
      .select('*')
      .order('production_date', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return (data || []).map((row: any) => ({
      id: row.id,
      productionDate: row.production_date,
      totalWageBudget: Number(row.total_wage_budget) || 0,
      numCooks: Number(row.num_cooks) || 0,
      numPackers: Number(row.num_packers) || 0,
      totalPacketsProduced: Number(row.total_packets_produced) || 0,
      totalProductionKg: Number(row.total_production_kg) || 0,
      productionWageAmount: Number(row.production_wage_amount) || 0,
      packingWageAmount: Number(row.packing_wage_amount) || 0,
      wagePerCook: Number(row.wage_per_cook) || 0,
      wagePerPacker: Number(row.wage_per_packer) || 0,
      notes: row.notes || '',
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }, { ttl: dbCache.TTL.DAILY_WAGES, force });
}

export async function fetchDailyWage(date: string): Promise<any | null> {
  const { data, error } = await supabase
    .from('daily_wages')
    .select('*')
    .eq('production_date', date)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    id: data.id,
    productionDate: data.production_date,
    totalWageBudget: Number(data.total_wage_budget) || 0,
    numCooks: Number(data.num_cooks) || 0,
    numPackers: Number(data.num_packers) || 0,
    totalPacketsProduced: Number(data.total_packets_produced) || 0,
    totalProductionKg: Number(data.total_production_kg) || 0,
    productionWageAmount: Number(data.production_wage_amount) || 0,
    packingWageAmount: Number(data.packing_wage_amount) || 0,
    wagePerCook: Number(data.wage_per_cook) || 0,
    wagePerPacker: Number(data.wage_per_packer) || 0,
    notes: data.notes || '',
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

export async function saveDailyWage(params: {
  productionDate: string;
  totalWageBudget: number;
  numCooks: number;
  numPackers: number;
  totalPacketsProduced: number;
  totalProductionKg: number;
  productionWageAmount: number;
  packingWageAmount: number;
  wagePerCook: number;
  wagePerPacker: number;
  notes?: string;
}): Promise<any> {
  const payload = {
    production_date: params.productionDate,
    total_wage_budget: params.totalWageBudget,
    num_cooks: params.numCooks,
    num_packers: params.numPackers,
    total_packets_produced: params.totalPacketsProduced,
    total_production_kg: params.totalProductionKg,
    production_wage_amount: params.productionWageAmount,
    packing_wage_amount: params.packingWageAmount,
    wage_per_cook: params.wagePerCook,
    wage_per_packer: params.wagePerPacker,
    notes: params.notes || null,
    updated_at: new Date().toISOString(),
  };

  dbCache.invalidate('admin_daily_wages');

  const { data, error } = await supabase
    .from('daily_wages')
    .upsert(payload, { onConflict: 'production_date' })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function fetchTotalPacketsForDate(date: string): Promise<number> {
  const { data, error } = await supabase
    .from('packing_records')
    .select('*');

  if (error || !data) return 0;
  return data
    .filter((r: any) => (r.packed_at && r.packed_at.startsWith(date)) || (r.packing_date && r.packing_date === date))
    .reduce((sum: number, r: any) => sum + (Number(r.quantity_packed ?? r.packets_packed) || 0), 0);
}

export async function fetchTotalProductionKgForDate(date: string): Promise<number> {
  const { data, error } = await supabase
    .from('production_runs')
    .select('actual_quantity, start_time, created_at, status')
    .eq('status', 'completed');

  if (error || !data) return 0;
  return data
    .filter((r: any) => (r.start_time && r.start_time.startsWith(date)) || (r.created_at && r.created_at.startsWith(date)))
    .reduce((sum: number, r: any) => sum + (Number(r.actual_quantity) || 0), 0);
}

// ============================================================================
// PRODUCT SELLING PRICES
// ============================================================================

export async function fetchProductSellingPrices(force = false): Promise<any[]> {
  return dbCache.wrap('admin_selling_prices', async () => {
    const { data, error } = await supabase
      .from('product_selling_prices')
      .select('*');

    if (error) throw error;
    return (data || []).map((row: any) => ({
      id: row.id,
      productId: row.product_id,
      wholesalePricePerKg: Number(row.wholesale_price_per_kg) || 0,
      updatedAt: row.updated_at,
      createdAt: row.created_at,
    }));
  }, { ttl: dbCache.TTL.SELLING_PRICES, force });
}

export async function saveProductSellingPrice(productId: string, pricePerKg: number): Promise<any> {
  dbCache.invalidate('admin_selling_prices');

  const { data, error } = await supabase
    .from('product_selling_prices')
    .upsert({
      product_id: productId,
      wholesale_price_per_kg: pricePerKg,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'product_id' })
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ============================================================================
// BULK PURCHASE (Add all ingredients)
// ============================================================================

export async function bulkPurchaseIngredients(
  purchases: Array<{ ingredientId: string; amount: number; costPerUnit: number }>
): Promise<void> {
  const validPurchases = purchases.filter((p) => p.amount > 0);
  if (validPurchases.length === 0) return;

  const ids = validPurchases.map((p) => p.ingredientId);
  const { data: ings, error: fetchErr } = await supabase
    .from('ingredients')
    .select('id, name, unit, current_stock, avg_cost_per_unit')
    .in('id', ids);

  if (fetchErr || !ings) {
    throw new Error(fetchErr?.message || 'Failed to fetch ingredients for bulk purchase');
  }

  const ingMap = new Map(ings.map((i) => [i.id, i]));
  const now = new Date().toISOString();
  const batchRef = `BULK-PURCHASE-${Date.now().toString().slice(-6)}`;
  const stockMovements: any[] = [];
  const updatePromises: PromiseLike<any>[] = [];

  for (const purchase of validPurchases) {
    const ing = ingMap.get(purchase.ingredientId);
    if (!ing) continue;

    const prevStock = Number(ing.current_stock) || 0;
    const newStock = roundStock(prevStock + purchase.amount);

    // Weighted average cost calculation
    const prevCost = Number(ing.avg_cost_per_unit) || 0;
    const totalOldValue = prevStock * prevCost;
    const totalNewValue = purchase.amount * purchase.costPerUnit;
    const newAvgCost = newStock > 0
      ? roundCurrency((totalOldValue + totalNewValue) / newStock)
      : purchase.costPerUnit;

    updatePromises.push(
      supabase
        .from('ingredients')
        .update({
          current_stock: newStock,
          avg_cost_per_unit: newAvgCost,
          updated_at: now,
        })
        .eq('id', purchase.ingredientId)
    );

    stockMovements.push({
      item_id: purchase.ingredientId,
      item_type: 'ingredient',
      item_name: ing.name,
      movement_type: 'purchase',
      quantity: purchase.amount,
      unit: ing.unit,
      previous_balance: prevStock,
      new_balance: newStock,
      cost_per_unit: purchase.costPerUnit,
      reference: batchRef,
      operator_name: 'Admin',
      reason: 'Bulk purchase entry',
      created_at: now,
    });
  }

  // Execute all ingredient updates in parallel
  const updateResults = await Promise.all(updatePromises);
  for (const res of updateResults) {
    if (res.error) {
      console.error('Error updating ingredient stock:', res.error);
    }
  }

  // Batch insert all stock movements in a single round-trip
  if (stockMovements.length > 0) {
    const { error: smErr } = await supabase.from('stock_movements').insert(stockMovements);
    if (smErr) {
      console.error('Error inserting stock movements:', smErr);
    }
  }

  dbCache.invalidate('admin_ingredients');
  dbCache.invalidate('admin_stock_movements');
}

export async function resetAllStocksToZero(): Promise<{ success: boolean; message: string }> {
  try {
    const now = new Date().toISOString();
    const { error: pErr } = await supabase.from('products').update({ current_stock: 0, updated_at: now }).neq('id', '00000000-0000-0000-0000-000000000000');
    if (pErr) throw pErr;
    const { error: iErr } = await supabase.from('ingredients').update({ current_stock: 0, updated_at: now }).neq('id', '00000000-0000-0000-0000-000000000000');
    if (iErr) throw iErr;
    const { error: packErr } = await supabase.from('packaging_items').update({ current_stock: 0, updated_at: now }).neq('id', '00000000-0000-0000-0000-000000000000');
    if (packErr) throw packErr;
    invalidateAdminCache();
    return { success: true, message: 'All stocks have been reset to zero successfully.' };
  } catch (err: any) {
    return { success: false, message: err?.message || 'Failed to reset stocks to zero.' };
  }
}



// ==============================================================================
// SPECIAL PREPARED MIXTURES ADMIN FUNCTIONS
// ==============================================================================

const STORAGE_KEYS = {
  MIXTURES: 'pulari_storage_special_mixtures_v2',
  MIXTURE_RECIPES: 'pulari_storage_mixture_recipes_v2',
  MIXTURE_BATCHES: 'pulari_storage_mixture_batches_v2',
};

const DEFAULT_MIXTURES: SpecialMixture[] = [
  {
    id: 'mix-1',
    name: 'പ്ലം കേക്ക് മിക്സ്ചർ',
    code: 'MIX-PLUM',
    unit: 'kg',
    currentStock: 15,
    minStock: 5,
    avgCostPerUnit: 180,
    notes: 'ഡ്രൈ ഫ്രൂട്ട്സ് ചേർത്ത പ്ലം കേക്ക് മിശ്രിതം',
    isActive: true,
  },
  {
    id: 'mix-2',
    name: 'ചോക്ലേറ്റ് കേക്ക് മിക്സ്ചർ',
    code: 'MIX-CHOC',
    unit: 'kg',
    currentStock: 10,
    minStock: 5,
    avgCostPerUnit: 220,
    notes: 'കൊക്കോ ചേർത്ത ചോക്ലേറ്റ് കേക്ക് മിശ്രിതം',
    isActive: true,
  },
  {
    id: 'mix-3',
    name: 'വാനില കേക്ക് മിക്സ്ചർ',
    code: 'MIX-VAN',
    unit: 'kg',
    currentStock: 12,
    minStock: 5,
    avgCostPerUnit: 190,
    notes: 'ക്ലാസിക് വാനില സ്പോഞ്ച് മിശ്രിതം',
    isActive: true,
  },
  {
    id: 'mix-4',
    name: 'വിപ്പിംഗ് ക്രീം',
    code: 'MIX-WHIP',
    unit: 'kg',
    currentStock: 8,
    minStock: 3,
    avgCostPerUnit: 250,
    notes: 'കേക്ക് ഐസിംഗിനുള്ള വിപ്പിംഗ് ക്രീം',
    isActive: true,
  },
  {
    id: 'mix-5',
    name: 'ബട്ടർ ക്രീം',
    code: 'MIX-BUTR',
    unit: 'kg',
    currentStock: 5,
    minStock: 2,
    avgCostPerUnit: 280,
    notes: 'കേക്ക് ഡെക്കറേഷനുള്ള ബട്ടർ ക്രീം',
    isActive: true,
  },
];

export async function fetchSpecialMixtures(includeInactive = true): Promise<SpecialMixture[]> {
  try {
    let query = supabase.from('special_mixtures').select('*, special_mixture_recipes(*, special_mixture_recipe_items(*, ingredients(name, unit, avg_cost_per_unit)))').order('name');
    if (!includeInactive) {
      query = query.eq('is_active', true);
    }
    const { data, error } = await query;
    if (error || !data || data.length === 0) throw error || new Error('No supabase data');

    return data.map((row: any) => {
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
  } catch {
    // Local fallback
    try {
      const local = localStorage.getItem(STORAGE_KEYS.MIXTURES);
      if (local) return JSON.parse(local);
      localStorage.setItem(STORAGE_KEYS.MIXTURES, JSON.stringify(DEFAULT_MIXTURES));
      return DEFAULT_MIXTURES;
    } catch {
      return DEFAULT_MIXTURES;
    }
  }
}

export async function saveSpecialMixture(data: Partial<SpecialMixture> & { name: string; unit: UnitType }): Promise<SpecialMixture> {
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

  try {
    let result: any;
    if (data.id) {
      const { data: updated, error } = await supabase.from('special_mixtures').update(payload).eq('id', data.id).select().single();
      if (error) throw error;
      result = updated;
    } else {
      const { data: created, error } = await supabase.from('special_mixtures').insert(payload).select().single();
      if (error) throw error;
      result = created;
    }
    invalidateAdminCache();
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
  } catch {
    // Local fallback
    try {
      const list = JSON.parse(localStorage.getItem(STORAGE_KEYS.MIXTURES) || '[]');
      let updatedMix: SpecialMixture;
      const now = new Date().toISOString();
      if (data.id) {
        const idx = list.findIndex((m: any) => m.id === data.id);
        updatedMix = { ...list[idx], ...data, updatedAt: now };
        list[idx] = updatedMix;
      } else {
        updatedMix = {
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
        list.push(updatedMix);
      }
      localStorage.setItem(STORAGE_KEYS.MIXTURES, JSON.stringify(list));
      return updatedMix;
    } catch {
      return data as SpecialMixture;
    }
  }
}

export async function saveSpecialMixtureRecipe(mixtureId: string, recipe: Partial<SpecialMixtureRecipe>): Promise<SpecialMixtureRecipe> {
  try {
    const { data: insertedRec, error: recErr } = await supabase
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
    if (recErr) throw recErr;

    if (recipe.items && recipe.items.length > 0) {
      const itemRows = recipe.items.map((i) => ({
        recipe_id: insertedRec.id,
        ingredient_id: i.ingredientId,
        quantity: i.quantity,
        unit: i.unit,
      }));
      await supabase.from('special_mixture_recipe_items').insert(itemRows);
    }
    invalidateAdminCache();
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
  } catch {
    // Local fallback
    try {
      const recipes = JSON.parse(localStorage.getItem(STORAGE_KEYS.MIXTURE_RECIPES) || '[]');
      const saved: SpecialMixtureRecipe = {
        id: recipe.id || `mix-rec-${Date.now()}`,
        mixtureId,
        version: recipe.version || 1,
        expectedOutputQuantity: Number(recipe.expectedOutputQuantity) || 1,
        expectedOutputUnit: (recipe.expectedOutputUnit || 'kg') as UnitType,
        instructions: recipe.instructions || '',
        estimatedCost: Number(recipe.estimatedCost) || 0,
        isActive: true,
        items: recipe.items || [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      recipes.push(saved);
      localStorage.setItem(STORAGE_KEYS.MIXTURE_RECIPES, JSON.stringify(recipes));
      return saved;
    } catch {
      return recipe as SpecialMixtureRecipe;
    }
  }
}

export async function fetchSpecialMixtureBatches(mixtureId?: string): Promise<SpecialMixtureBatch[]> {
  try {
    let query = supabase.from('special_mixture_batches').select('*, special_mixtures(name)').order('preparation_date', { ascending: false });
    if (mixtureId) query = query.eq('mixture_id', mixtureId);
    const { data, error } = await query;
    if (error || !data) throw error || new Error('No batches');

    return data.map((row: any) => ({
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
  } catch {
    try {
      const batches = JSON.parse(localStorage.getItem(STORAGE_KEYS.MIXTURE_BATCHES) || '[]');
      return batches;
    } catch {
      return [];
    }
  }
}
