export type UnitType = 'kg' | 'g' | 'L' | 'ml' | 'pcs' | 'packs' | 'rolls' | string;
export type IngredientCategory = 'basic' | 'other';

export interface Product {
  id: string;
  name: string;
  sku?: string;
  recipeId?: string;
  unit: UnitType;
  currentStock: number;
  wholesalePrice: number;
  isActive: boolean;
  description?: string;
  createdAt?: string;
  updatedAt?: string;
}

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
  createdAt?: string;
  updatedAt?: string;
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

export interface RecipeItem {
  id: string;
  recipeId: string;
  ingredientId: string;
  ingredientName?: string;
  quantity: number;
  unit: UnitType;
  cost?: number;
}

export interface Recipe {
  id: string;
  productId: string;
  productName?: string;
  version: number;
  baseOutputQuantity: number;
  baseOutputUnit: UnitType;
  instructions?: string;
  notes?: string;
  isActive: boolean;
  items: RecipeItem[];
  packets?: RecipePacket[];
  createdAt?: string;
  updatedAt?: string;
}

export interface ProductionRun {
  id: string;
  runNumber: string;
  productId: string;
  productName?: string;
  recipeId?: string;
  recipeVersion?: number;
  productionDate: string;
  plannedQuantity: number;
  actualQuantity: number;
  unit: UnitType;
  status: 'completed' | 'cancelled' | 'in_progress';
  cancellationReason?: string;
  notes?: string;
  operatorName: string;
  ingredientsConsumed?: {
    ingredientId: string;
    ingredientName?: string;
    expectedQuantity?: number;
    actualQuantity: number;
    unit: string;
    unitCost?: number;
    totalCost?: number;
  }[];
  totalIngredientCost?: number;
  createdAt?: string;
  packingRecords?: Array<{
    id: string;
    packetSize: string;
    packetsPacked: number;
    weightPackedKg?: number;
  }>;
  totalPacketsPacked?: number;
}

export interface StockMovement {
  id: string;
  itemId: string;
  itemType: 'raw' | 'finished' | 'ingredient' | 'product';
  itemName: string;
  movementType: 'in' | 'out' | 'adjust' | 'opening' | 'purchase' | 'production_consumption' | 'production_output' | 'cancellation_reversal';
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

export interface AuditLog {
  id: string;
  actor: string;
  action: string;
  entityType: string;
  entityId?: string;
  details?: any;
  createdAt: string;
}

export interface DailyClosing {
  id: string;
  productionDate: string; // YYYY-MM-DD
  oilOpeningBalance: number; // kg
  oilPurchases: number; // kg
  oilClosingBalance: number; // kg
  oilConsumed: number; // kg
  totalOilUsedKg?: number;
  oilLeftoverKg?: number;
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
  allocatedCookingWages?: number;
  allocatedPackingWages?: number;
  allocatedBasicIngredientsCost?: number;
  totalProductionCost: number;
  productionCostPerKg: number;
  createdAt?: string;
}

export interface PackagingItem {
  id: string;
  productId: string;
  productName?: string;
  sizeLabel: string; // e.g. '100g', '250g', '500g'
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

export interface FinalProductCosting {
  productId: string;
  productName: string;
  totalProductionKg: number;
  batchCount: number;
  totalIngredientCost: number;
  allocatedOilCost: number;
  allocatedProductionWages: number;
  allocatedCookingWages?: number;
  allocatedPackingWages?: number;
  allocatedBasicIngredientsCost?: number;
  totalProductionCost: number;
  productionCostPerKg: number;
  // Packing
  totalPacketsPacked: number;
  totalWeightPackedKg: number;
  totalPackagingCost: number;
  totalPackingLabourCost: number;
  totalPackingCost: number;
  totalCost: number;
  packetsBySize: Array<{
    size: string;
    packets: number;
    coverCost: number;
    labourCost: number;
    totalCost: number;
    costPerPacket: number;
  }>;
  // Unpacked stock
  unpackedKg: number;
  unpackedValuation: number;
}

export interface SaleRecord {
  id: string;
  sale_date: string;
  product_id?: string;
  product_name: string;
  quantity: number;
  unit: string;
  unit_price: number;
  total_amount: number;
  customer_name?: string;
  payment_method?: 'cash' | 'upi' | 'bank' | 'credit' | string;
  payment_status?: 'paid' | 'pending' | 'partial' | string;
  notes?: string;
  created_at?: string;
}

export interface DailyWage {
  id: string;
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
  createdAt?: string;
  updatedAt?: string;
}

export interface ProductSellingPrice {
  id: string;
  productId: string;
  wholesalePricePerKg: number;
  updatedAt?: string;
  createdAt?: string;
}

export interface FactoryProfile {
  name: string;
  subtitle?: string;
  phone: string;
  email: string;
  location: string;
  address: string;
  gst: string;
  fssai: string;
  billFooter: string;
}

export const DEFAULT_FACTORY_PROFILE: FactoryProfile = {
  name: 'PULARI BAKES',
  subtitle: 'ഉയർന്ന നിലവാരമുള്ള സ്നാക്ക്സ് & പലഹാരങ്ങൾ',
  phone: '+91 9876543210',
  email: 'info@pularibakes.com',
  location: 'Industrial Estate, Malappuram, Kerala',
  address: 'Near Industrial Estate, Malappuram, Kerala - 676505',
  gst: '32AAAAA0000A1Z5',
  fssai: '11322001000123',
  billFooter: 'നന്ദി! വീണ്ടും സന്ദർശിക്കുക.',
};

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
