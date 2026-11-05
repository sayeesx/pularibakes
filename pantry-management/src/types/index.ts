// ==============================================================================
// PULARI BAKES PRODUCTION & INVENTORY MANAGEMENT - DATA TYPES
// ==============================================================================

export type UserRole = 'owner' | 'production_staff' | 'catalogue_manager';

export type IngredientCategory = 'basic' | 'other';

export type UnitType = 'kg' | 'g' | 'L' | 'ml' | 'pcs' | 'packs' | 'rolls' | string;

export interface Ingredient {
  id: string;
  name: string;
  category: IngredientCategory;
  unit: UnitType;
  currentStock: number;
  minStock: number;
  avgCostPerUnit: number;
  isActive: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Product {
  id: string;
  name: string;
  sku?: string;
  description?: string;
  unit: UnitType;
  currentStock: number;
  wholesalePrice?: number;
  isActive: boolean;
  recipeId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PacketType {
  id: string;
  name: string;
  bundleCost: number;
  bundleQuantity: number;
  costPerPacket: number;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface RecipePacket {
  id?: string;
  recipeId?: string;
  packetTypeId?: string;
  packetName: string;
  costPerPacket: number;
  bundleCost?: number;
  bundleQuantity?: number;
}

export interface RecipeIngredient {
  ingredientId: string;
  ingredientName: string;
  quantity: number;
  unit: UnitType;
}

export interface Recipe {
  id: string;
  productId: string;
  productName: string;
  version: number;
  baseOutputQuantity: number;
  baseOutputUnit: UnitType;
  ingredients: RecipeIngredient[];
  packets?: RecipePacket[];
  instructions?: string;
  notes?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export type MovementType =
  | 'opening'
  | 'purchase'
  | 'production_consumption'
  | 'production_output'
  | 'production_yield'
  | 'adjustment'
  | 'wastage'
  | 'cancellation_reversal';

export interface StockMovement {
  id: string;
  itemId: string;
  itemType: 'ingredient' | 'product';
  itemName: string;
  movementType: MovementType;
  quantity: number;
  unit: string;
  previousBalance: number;
  newBalance: number;
  costPerUnit?: number;
  reference: string;
  operatorName: string;
  reason?: string;
  createdAt: string;
}

export interface ConsumedIngredientItem {
  ingredientId: string;
  ingredientName: string;
  expectedQuantity: number;
  actualQuantity: number;
  unit: UnitType;
  unitCost?: number;
  totalCost?: number;
}

export interface BatchIngredientUsage {
  ingredientId: string;
  ingredientName: string;
  unit: UnitType;
  expectedQuantity: number;
  actualQuantity: number;
  differenceQuantity: number;
  unitCost: number;
  totalCost: number;
}

export interface ProductionRun {
  id: string;
  runNumber: string;
  productId: string;
  productName: string;
  recipeId?: string;
  recipeVersion?: number;
  productionDate: string; // YYYY-MM-DD
  plannedQuantity: number;
  actualQuantity: number;
  unit: UnitType;
  status: 'completed' | 'cancelled';
  cancellationReason?: string;
  cancelledAt?: string;
  cancelledBy?: string;
  notes?: string;
  operatorName: string;
  ingredientsConsumed: ConsumedIngredientItem[];
  mixturesConsumed?: ProductionMixtureConsumption[];
  totalMixtureCost?: number;
  totalIngredientCost?: number;
  createdAt: string;
  updatedAt: string;
}

// Backward compatibility alias for existing components
export type ProductionBatch = ProductionRun;

export interface DailyClosing {
  id: string;
  productionDate: string; // YYYY-MM-DD
  oilOpeningBalance: number; // kg
  oilPurchases: number; // kg
  oilClosingBalance: number; // kg
  oilConsumed: number; // kg
  totalOilUsedKg?: number;
  oilLeftoverKg?: number;
  saltUsedKg?: number;
  cashewShellUsedKg?: number;
  chippliPowderUsedKg?: number;
  curryLeavesUsedKg?: number;
  oilCostPerKg: number; // ₹
  oilTotalExpense: number; // ₹
  productionWages: number; // ₹
  totalSharedExpense: number; // ₹
  totalProductionKg: number; // kg
  status: 'open' | 'closed' | 'adjusted';
  notes?: string;
  closedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface DailyCostAllocation {
  id: string;
  closingId: string;
  productionDate: string;
  productId: string;
  productName: string;
  totalProductionKg: number;
  batchCount: number;
  ingredientCost: number;
  allocatedOilCost: number;
  allocatedProductionWages: number;
  totalProductionCost: number;
  productionCostPerKg: number;
  createdAt?: string;
}

export interface PackagingItem {
  id: string;
  productId: string;
  productName?: string;
  sizeLabel: string;
  sizeGrams: number;
  currentStock: number;
  unitCost: number;
  packingLabourRate: number;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface PackingRecord {
  id: string;
  packingDate: string;
  productId: string;
  productName?: string;
  productionRunId?: string;
  packagingItemId?: string;
  packetSize: string;
  packetsPacked: number;
  coversConsumed: number;
  coverUnitCost: number;
  packagingCost: number;
  packingLabourRate: number;
  packingLabourCost: number;
  totalPackingCost: number;
  weightPackedKg: number;
  operatorName: string;
  notes?: string;
  createdAt?: string;
}

export interface AuditLog {
  id: string;
  actor: string;
  action: string;
  entityType: string;
  entityId?: string;
  details?: Record<string, any>;
  createdAt: string;
}

export interface AdminDashboardMetrics {
  totalProducts: number;
  activeProducts: number;
  inactiveProducts: number;
  totalIngredients: number;
  runsToday: number;
  qtyToday: number;
  runsInPeriod: number;
  qtyInPeriod: number;
  byProduct: Array<{
    productName: string;
    unit: string;
    totalQuantity: number;
    runCount: number;
  }>;
  consumption: Array<{
    ingredientName: string;
    category: string;
    unit: string;
    totalConsumed: number;
  }>;
  recentActivity: Array<{
    id: string;
    runNumber: string;
    productName: string;
    productionDate: string;
    actualQuantity: number;
    unit: string;
    status: string;
    operatorName: string;
    createdAt: string;
  }>;
}

export interface AdminSession {
  token: string;
  expiresAt: string;
}

// ==============================================================================
// SPECIAL PREPARED MIXTURES & CAKE PRODUCTION TYPES
// ==============================================================================

export interface SpecialMixture {
  id: string;
  name: string;
  code?: string;
  unit: UnitType;
  currentStock: number;
  minStock: number;
  avgCostPerUnit: number;
  notes?: string;
  isActive: boolean;
  recipe?: SpecialMixtureRecipe;
  createdAt?: string;
  updatedAt?: string;
}

export interface SpecialMixtureRecipe {
  id: string;
  mixtureId: string;
  version: number;
  expectedOutputQuantity: number;
  expectedOutputUnit: UnitType;
  instructions?: string;
  estimatedCost: number;
  isActive: boolean;
  items: SpecialMixtureRecipeItem[];
  createdAt?: string;
  updatedAt?: string;
}

export interface SpecialMixtureRecipeItem {
  id: string;
  recipeId: string;
  ingredientId: string;
  ingredientName?: string;
  quantity: number;
  unit: UnitType;
  avgCostPerUnit?: number;
  totalCost?: number;
}

export interface SpecialMixtureBatch {
  id: string;
  batchNumber: string;
  mixtureId: string;
  mixtureName?: string;
  recipeId?: string;
  preparationDate: string;
  plannedQuantity: number;
  actualQuantity: number;
  unit: UnitType;
  totalIngredientCost: number;
  costPerUnit: number;
  status: 'completed' | 'cancelled';
  cancellationReason?: string;
  operatorName: string;
  expiryDate?: string;
  notes?: string;
  consumedIngredients?: SpecialMixtureConsumption[];
  createdAt?: string;
  updatedAt?: string;
}

export interface SpecialMixtureConsumption {
  id: string;
  batchId: string;
  ingredientId: string;
  ingredientName?: string;
  expectedQuantity: number;
  actualQuantity: number;
  unit: UnitType;
  unitCost: number;
  totalCost: number;
}

export interface ProductRecipeMixture {
  id: string;
  recipeId: string;
  mixtureId: string;
  mixtureName?: string;
  quantity: number;
  unit: UnitType;
  costPerUnit?: number;
  totalCost?: number;
}

export interface ProductionMixtureConsumption {
  id: string;
  runId: string;
  mixtureId: string;
  mixtureName?: string;
  expectedQuantity: number;
  actualQuantity: number;
  unit: UnitType;
  unitCost: number;
  totalCost: number;
}
