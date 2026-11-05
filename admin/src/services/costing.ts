import { DailyCostAllocation, FinalProductCosting, PackagingItem, PackingRecord } from '../types';

/**
 * Rounds a number to a specified number of decimal places without floating-point drift.
 */
export function roundTo(value: number, decimals: number = 2): number {
  if (isNaN(value) || !isFinite(value)) return 0;
  const factor = Math.pow(10, decimals);
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function roundStock(value: number): number {
  return roundTo(value, 3);
}

export function roundCurrency(value: number): number {
  return roundTo(value, 2);
}

/**
 * Continuous Oil Balance Calculator.
 * Closing oil balance = Opening oil balance + Purchases − Oil consumption/loss.
 * Oil consumed/lost = Opening + Purchases - Closing.
 * Daily oil expense = Oil consumed * Weighted avg cost per kg.
 */
/**
 * Daily Oil Stock & Consumption Calculator according to Cook's Workflow:
 * 1. Automatically uses previous available oil stock from inventory.
 * 2. Subtracts oil used during production.
 * 3. Adds leftover oil entered at the end of the day back to stock.
 *
 * Formula:
 * Final Oil Stock = Previous Available Stock - Oil Used + Leftover Oil
 * Net Oil Consumed = Oil Used - Leftover Oil
 * Daily Oil Expense = Net Oil Consumed * Cost per kg
 *
 * Example:
 * Previous available: 20 kg
 * Oil used: 5 kg
 * Leftover: 2 kg
 * -> Final available: 20 - 5 + 2 = 17 kg
 * -> Net consumed: 3 kg
 */
export function calculateDailyOilUsage(
  previousAvailableStockKg: number,
  oilUsedKg: number,
  leftoverOilKg: number,
  oilCostPerKg: number
): {
  previousAvailableStockKg: number;
  oilUsedKg: number;
  leftoverOilKg: number;
  netOilConsumedKg: number;
  finalOilStockKg: number;
  oilTotalExpense: number;
} {
  const prevStock = Math.max(0, roundStock(previousAvailableStockKg));
  const used = Math.max(0, roundStock(oilUsedKg));
  const leftover = Math.max(0, Math.min(used, roundStock(leftoverOilKg)));
  const netOilConsumedKg = Math.max(0, roundStock(used - leftover));
  const finalOilStockKg = Math.max(0, roundStock(prevStock - netOilConsumedKg));
  const oilTotalExpense = roundCurrency(netOilConsumedKg * Math.max(0, oilCostPerKg));

  return {
    previousAvailableStockKg: prevStock,
    oilUsedKg: used,
    leftoverOilKg: leftover,
    netOilConsumedKg,
    finalOilStockKg,
    oilTotalExpense,
  };
}

export function calculateContinuousOilExpense(
  openingBalanceKg: number,
  purchasesKg: number,
  closingBalanceKg: number,
  avgCostPerKg: number
): { oilConsumedKg: number; oilTotalExpense: number } {
  const available = Math.max(0, roundStock(openingBalanceKg + purchasesKg));
  const closing = Math.max(0, roundStock(closingBalanceKg));
  const consumed = Math.max(0, roundStock(available - closing));
  const expense = roundCurrency(consumed * Math.max(0, avgCostPerKg));

  return {
    oilConsumedKg: consumed,
    oilTotalExpense: expense,
  };
}

/**
 * Checks if an ingredient name matches any of the 4 basic ingredients:
 * - ഉപ്പ് (Salt)
 * - അണ്ടി തോട് (Cashew shell)
 * - ചിപ്പ്ളി പൊടി (Chippli powder)
 * - കറിവേപ്പില (Curry leaves)
 */
export function isBasicIngredientName(name: string): boolean {
  if (!name) return false;
  const n = name.toLowerCase().trim();
  return (
    n.includes('ഉപ്പ്') ||
    n.includes('salt') ||
    n.includes('അണ്ടി തോട്') ||
    (n.includes('തോട്') && n.includes('അണ്ടി')) ||
    n.includes('cashew') ||
    n.includes('ചിപ്പ്ളി') ||
    n.includes('chippli') ||
    n.includes('കറിവേപ്പില') ||
    n.includes('കറിവേപ്പി') ||
    n.includes('curry')
  );
}

/**
 * Distributes shared daily expenses (Oil, Cooking Wages, Packing Wages, Basic Ingredients)
 * across products produced that day by production weight.
 *
 * Important: Cooking workers (കുക്കിംഗ് തൊഴിലാളികൾ) and packing workers (പാക്കിംഗ് തൊഴിലാളികൾ)
 * are both treated as separate wage categories in daily wage expenses, and both are allocated
 * across production batches using the existing daily wage allocation method (weight ratio).
 *
 * Formula: Product allocation = (Product production kg / Total production kg) * Total daily expense.
 * Exact reconciliation: The final product absorbs any fractional paisa rounding discrepancy
 * so that sum(allocated) strictly equals the original expense amount.
 */
export function allocateDailySharedExpenses(
  productsSummary: Array<{
    productId: string;
    productName: string;
    totalProductionKg: number;
    batchCount: number;
    ingredientCost: number;
  }>,
  dailyOilExpense: number,
  dailyCookingWages: number,
  dailyBasicIngredientsExpense: number = 0,
  dailyPackingWages: number = 0
): Array<{
  productId: string;
  productName: string;
  totalProductionKg: number;
  batchCount: number;
  ingredientCost: number;
  allocatedOilCost: number;
  allocatedProductionWages: number;
  allocatedCookingWages: number;
  allocatedPackingWages: number;
  allocatedBasicIngredientsCost: number;
  totalProductionCost: number;
  productionCostPerKg: number;
}> {
  const totalKg = productsSummary.reduce((sum, p) => sum + p.totalProductionKg, 0);
  if (totalKg <= 0 || productsSummary.length === 0) {
    return productsSummary.map((p) => ({
      ...p,
      allocatedOilCost: 0,
      allocatedProductionWages: 0,
      allocatedCookingWages: 0,
      allocatedPackingWages: 0,
      allocatedBasicIngredientsCost: 0,
      totalProductionCost: p.ingredientCost,
      productionCostPerKg: 0,
    }));
  }

  let runningOil = 0;
  let runningCookingWages = 0;
  let runningPackingWages = 0;
  let runningBasic = 0;
  const count = productsSummary.length;

  return productsSummary.map((p, idx) => {
    const isLast = idx === count - 1;
    let oilAlloc: number;
    let cookingAlloc: number;
    let packingAlloc: number;
    let basicAlloc: number;

    if (isLast) {
      oilAlloc = roundCurrency(dailyOilExpense - runningOil);
      cookingAlloc = roundCurrency(dailyCookingWages - runningCookingWages);
      packingAlloc = roundCurrency(dailyPackingWages - runningPackingWages);
      basicAlloc = roundCurrency(dailyBasicIngredientsExpense - runningBasic);
    } else {
      const ratio = p.totalProductionKg / totalKg;
      oilAlloc = roundCurrency(ratio * dailyOilExpense);
      cookingAlloc = roundCurrency(ratio * dailyCookingWages);
      packingAlloc = roundCurrency(ratio * dailyPackingWages);
      basicAlloc = roundCurrency(ratio * dailyBasicIngredientsExpense);
      runningOil += oilAlloc;
      runningCookingWages += cookingAlloc;
      runningPackingWages += packingAlloc;
      runningBasic += basicAlloc;
    }

    const totalProdCost = roundCurrency(
      p.ingredientCost + oilAlloc + cookingAlloc + packingAlloc + basicAlloc
    );
    const costPerKg = p.totalProductionKg > 0 ? roundCurrency(totalProdCost / p.totalProductionKg) : 0;

    return {
      productId: p.productId,
      productName: p.productName,
      totalProductionKg: p.totalProductionKg,
      batchCount: p.batchCount,
      ingredientCost: p.ingredientCost,
      allocatedOilCost: oilAlloc,
      allocatedProductionWages: cookingAlloc,
      allocatedCookingWages: cookingAlloc,
      allocatedPackingWages: packingAlloc,
      allocatedBasicIngredientsCost: basicAlloc,
      totalProductionCost: totalProdCost,
      productionCostPerKg: costPerKg,
    };
  });
}

/**
 * Calculates Final Product Costing Breakdown.
 *
 * Packing labour is treated as a wage expense allocated across production batches
 * by weight (included in productionAllocation). Per-packet packing labour calculation
 * is removed, ensuring labour is NOT calculated based on the number of packets.
 *
 * Total product cost = Bulk production cost + Packaging material (cover) cost.
 */
export function calculateFinalProductCosting(
  productionAllocation: {
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
  },
  packingRecords: Array<{
    packetSize: string;
    packetsPacked: number;
    coverUnitCost?: number;
    packagingCost: number;
    packingLabourRate?: number;
    packingLabourCost?: number;
    totalPackingCost?: number;
    weightPackedKg: number;
  }>
): FinalProductCosting {
  const totalPacketsPacked = packingRecords.reduce((sum, r) => sum + r.packetsPacked, 0);
  const totalWeightPackedKg = roundStock(packingRecords.reduce((sum, r) => sum + r.weightPackedKg, 0));
  const totalPackagingCost = roundCurrency(packingRecords.reduce((sum, r) => sum + (r.packagingCost || 0), 0));
  // Removed per-packet packing labour calculation; packing labour is allocated as daily wage expense.
  const totalPackingLabourCost = 0;
  const totalPackingCost = totalPackagingCost;

  const totalCost = roundCurrency(productionAllocation.totalProductionCost + totalPackingCost);
  const unpackedKg = Math.max(0, roundStock(productionAllocation.totalProductionKg - totalWeightPackedKg));
  const unpackedValuation = roundCurrency(unpackedKg * productionAllocation.productionCostPerKg);

  // Group packing by size for packet-level costing breakdown
  const sizeMap: Record<string, { packets: number; coverCost: number; totalCost: number; weightKg: number }> = {};
  for (const r of packingRecords) {
    if (!sizeMap[r.packetSize]) {
      sizeMap[r.packetSize] = { packets: 0, coverCost: 0, totalCost: 0, weightKg: 0 };
    }
    sizeMap[r.packetSize].packets += r.packetsPacked;
    sizeMap[r.packetSize].coverCost += (r.packagingCost || 0);
    sizeMap[r.packetSize].totalCost += (r.packagingCost || 0);
    sizeMap[r.packetSize].weightKg += r.weightPackedKg;
  }

  const packetsBySize = Object.entries(sizeMap).map(([size, item]) => {
    // Exact weight per packet: prioritize actual recorded weight / packets, fallback to size label parse (kg vs g)
    let kgPerPacket = 0;
    if (item.packets > 0 && item.weightKg > 0) {
      kgPerPacket = item.weightKg / item.packets;
    } else if (/(\d+(?:\.\d+)?)\s*kg/i.test(size)) {
      const match = size.match(/(\d+(?:\.\d+)?)\s*kg/i);
      kgPerPacket = match ? parseFloat(match[1]) : 1;
    } else if (/(\d+)\s*g/i.test(size)) {
      const match = size.match(/(\d+)\s*g/i);
      kgPerPacket = match ? parseInt(match[1], 10) / 1000 : 0.1;
    } else {
      kgPerPacket = 0.1;
    }

    // Bulk product share inside this packet: kgPerPacket * productionCostPerKg
    // Note: productionCostPerKg ALREADY includes both cooking and packing wages allocated by weight!
    const bulkInsidePacket = roundCurrency(kgPerPacket * productionAllocation.productionCostPerKg);
    const coverInsidePacket = item.packets > 0 ? roundCurrency(item.coverCost / item.packets) : 0;
    const costPerPacket = roundCurrency(bulkInsidePacket + coverInsidePacket);

    return {
      size,
      packets: item.packets,
      coverCost: roundCurrency(item.coverCost),
      labourCost: 0,
      totalCost: roundCurrency(item.coverCost),
      costPerPacket,
    };
  });

  return {
    productId: productionAllocation.productId,
    productName: productionAllocation.productName,
    totalProductionKg: productionAllocation.totalProductionKg,
    batchCount: productionAllocation.batchCount,
    totalIngredientCost: productionAllocation.ingredientCost,
    allocatedOilCost: productionAllocation.allocatedOilCost,
    allocatedProductionWages: productionAllocation.allocatedProductionWages,
    allocatedCookingWages: productionAllocation.allocatedCookingWages ?? productionAllocation.allocatedProductionWages,
    allocatedPackingWages: productionAllocation.allocatedPackingWages ?? 0,
    allocatedBasicIngredientsCost: productionAllocation.allocatedBasicIngredientsCost ?? 0,
    totalProductionCost: productionAllocation.totalProductionCost,
    productionCostPerKg: productionAllocation.productionCostPerKg,
    totalPacketsPacked,
    totalWeightPackedKg,
    totalPackagingCost,
    totalPackingLabourCost: 0,
    totalPackingCost,
    totalCost,
    packetsBySize,
    unpackedKg,
    unpackedValuation,
  };
}


/**
 * High-precision unit cost rounding (up to 4 decimal places for packet materials and raw goods).
 */
export function roundUnitCost(value: number, decimals: number = 4): number {
  return roundTo(value, decimals);
}

/**
 * Special Mixture Preparation Costing.
 * Formula:
 * Total batch cost = Sum of the actual ingredient quantities consumed x applicable unit costs.
 * Actual cost per output unit = Total batch cost / Actual usable output quantity.
 * Example:
 * Total preparation cost: ₹600.
 * Expected output: 5 kg.
 * Actual usable output: 4.8 kg.
 * Actual cost per kg = ₹600 / 4.8 = ₹125.00.
 */
export function calculateSpecialMixtureCost(params: {
  ingredientsConsumed: Array<{
    actualQuantity: number;
    unitCost: number;
    unit?: string;
  }>;
  actualUsableOutput: number;
  plannedOutput?: number;
}): {
  totalBatchCost: number;
  actualCostPerUnit: number;
  wastageQuantity: number;
  wastagePercentage: number;
} {
  const totalBatchCost = roundCurrency(
    params.ingredientsConsumed.reduce((sum, item) => {
      const actualQty = Math.max(0, roundStock(item.actualQuantity));
      const cost = Math.max(0, item.unitCost);
      return sum + roundCurrency(actualQty * cost);
    }, 0)
  );

  const usableOutput = Math.max(0, roundStock(params.actualUsableOutput));
  const planned = params.plannedOutput !== undefined ? Math.max(0, roundStock(params.plannedOutput)) : usableOutput;

  // Actual cost per output unit is based on ACTUAL USABLE OUTPUT, not expected output
  const actualCostPerUnit = usableOutput > 0 ? roundCurrency(totalBatchCost / usableOutput) : 0;

  const wastageQuantity = Math.max(0, roundStock(planned - usableOutput));
  const wastagePercentage = planned > 0 ? roundTo((wastageQuantity / planned) * 100, 2) : 0;

  return {
    totalBatchCost,
    actualCostPerUnit,
    wastageQuantity,
    wastagePercentage,
  };
}

/**
 * Product Production Material Costing (Baking with Prepared Mixtures).
 * Total production material cost must include:
 * - Direct raw ingredients
 * - Prepared mixture quantities consumed at their recorded cost
 * - Other applicable production materials
 *
 * CRITICAL RULE: Never count raw ingredients used to prepare a mixture again when consuming that mixture.
 * Keep direct material cost separate from labour, packaging, and shared expenses.
 */
export function calculateProductProductionCost(params: {
  rawIngredientsConsumed: Array<{ actualQuantity: number; unitCost: number }>;
  mixturesConsumed: Array<{ actualQuantity: number; unitCost: number }>;
  otherMaterialsCost?: number;
  packagingCost?: number;
  packingLabourCost?: number;
  allocatedWages?: number;
  allocatedSharedExpenses?: number;
}): {
  directRawMaterialCost: number;
  directMixtureMaterialCost: number;
  totalDirectMaterialCost: number;
  totalPackagingCost: number;
  totalLabourCost: number;
  totalSharedExpenses: number;
  totalProductionCost: number;
} {
  const directRawMaterialCost = roundCurrency(
    params.rawIngredientsConsumed.reduce(
      (sum, item) => sum + roundCurrency(Math.max(0, item.actualQuantity) * Math.max(0, item.unitCost)),
      0
    )
  );

  const directMixtureMaterialCost = roundCurrency(
    params.mixturesConsumed.reduce(
      (sum, item) => sum + roundCurrency(Math.max(0, item.actualQuantity) * Math.max(0, item.unitCost)),
      0
    )
  );

  const otherMaterialsCost = roundCurrency(Math.max(0, params.otherMaterialsCost || 0));
  const totalDirectMaterialCost = roundCurrency(directRawMaterialCost + directMixtureMaterialCost + otherMaterialsCost);

  const totalPackagingCost = roundCurrency(Math.max(0, params.packagingCost || 0));
  const packingLabour = roundCurrency(Math.max(0, params.packingLabourCost || 0));
  const allocatedWages = roundCurrency(Math.max(0, params.allocatedWages || 0));
  const totalLabourCost = roundCurrency(packingLabour + allocatedWages);

  const totalSharedExpenses = roundCurrency(Math.max(0, params.allocatedSharedExpenses || 0));

  const totalProductionCost = roundCurrency(
    totalDirectMaterialCost + totalPackagingCost + totalLabourCost + totalSharedExpenses
  );

  return {
    directRawMaterialCost,
    directMixtureMaterialCost,
    totalDirectMaterialCost,
    totalPackagingCost,
    totalLabourCost,
    totalSharedExpenses,
    totalProductionCost,
  };
}

/**
 * Computes batch wastage and yield statistics.
 */
export function calculateWastageMetrics(
  plannedQuantity: number,
  actualUsableQuantity: number
): {
  plannedQuantity: number;
  actualUsableQuantity: number;
  wastageQuantity: number;
  wastagePercentage: number;
  yieldPercentage: number;
} {
  const planned = Math.max(0, roundStock(plannedQuantity));
  const usable = Math.max(0, roundStock(actualUsableQuantity));
  const wastageQuantity = Math.max(0, roundStock(planned - usable));
  const wastagePercentage = planned > 0 ? roundTo((wastageQuantity / planned) * 100, 2) : 0;
  const yieldPercentage = planned > 0 ? roundTo((usable / planned) * 100, 2) : 100;

  return {
    plannedQuantity: planned,
    actualUsableQuantity: usable,
    wastageQuantity,
    wastagePercentage,
    yieldPercentage,
  };
}
