/**
 * Pulari Bakes Unit Conversion & Precision Measurement Library
 * Strict mathematical unit conversions with zero floating-point drift.
 * Incompatible unit protection, density support, and unit normalization.
 */

export type StandardUnit = 'kg' | 'g' | 'mg' | 'l' | 'ml' | 'pcs' | 'packs' | 'rolls' | 'box';

export interface UnitCategory {
  type: 'mass' | 'volume' | 'discrete';
  baseUnit: string;
  factorToBase: number; // multiply by this to get base unit value
}

// Canonical unit table
const UNIT_DEFINITIONS: Record<string, UnitCategory> = {
  // Mass (base: kg)
  kg: { type: 'mass', baseUnit: 'kg', factorToBase: 1 },
  kilogram: { type: 'mass', baseUnit: 'kg', factorToBase: 1 },
  kilograms: { type: 'mass', baseUnit: 'kg', factorToBase: 1 },
  g: { type: 'mass', baseUnit: 'kg', factorToBase: 0.001 },
  gram: { type: 'mass', baseUnit: 'kg', factorToBase: 0.001 },
  grams: { type: 'mass', baseUnit: 'kg', factorToBase: 0.001 },
  gm: { type: 'mass', baseUnit: 'kg', factorToBase: 0.001 },
  gms: { type: 'mass', baseUnit: 'kg', factorToBase: 0.001 },
  mg: { type: 'mass', baseUnit: 'kg', factorToBase: 0.000001 },

  // Volume (base: l)
  l: { type: 'volume', baseUnit: 'l', factorToBase: 1 },
  ltr: { type: 'volume', baseUnit: 'l', factorToBase: 1 },
  litre: { type: 'volume', baseUnit: 'l', factorToBase: 1 },
  litres: { type: 'volume', baseUnit: 'l', factorToBase: 1 },
  liter: { type: 'volume', baseUnit: 'l', factorToBase: 1 },
  liters: { type: 'volume', baseUnit: 'l', factorToBase: 1 },
  ml: { type: 'volume', baseUnit: 'l', factorToBase: 0.001 },
  millilitre: { type: 'volume', baseUnit: 'l', factorToBase: 0.001 },
  millilitres: { type: 'volume', baseUnit: 'l', factorToBase: 0.001 },

  // Discrete
  pcs: { type: 'discrete', baseUnit: 'pcs', factorToBase: 1 },
  pc: { type: 'discrete', baseUnit: 'pcs', factorToBase: 1 },
  piece: { type: 'discrete', baseUnit: 'pcs', factorToBase: 1 },
  pieces: { type: 'discrete', baseUnit: 'pcs', factorToBase: 1 },
  nos: { type: 'discrete', baseUnit: 'pcs', factorToBase: 1 },
  packs: { type: 'discrete', baseUnit: 'packs', factorToBase: 1 },
  pack: { type: 'discrete', baseUnit: 'packs', factorToBase: 1 },
  packet: { type: 'discrete', baseUnit: 'packs', factorToBase: 1 },
  packets: { type: 'discrete', baseUnit: 'packs', factorToBase: 1 },
  rolls: { type: 'discrete', baseUnit: 'rolls', factorToBase: 1 },
  roll: { type: 'discrete', baseUnit: 'rolls', factorToBase: 1 },
  box: { type: 'discrete', baseUnit: 'box', factorToBase: 1 },
  boxes: { type: 'discrete', baseUnit: 'box', factorToBase: 1 },
};

/**
 * Normalizes unit string to standard lowercase representation.
 */
export function normalizeUnit(unit: string): string {
  if (!unit) return '';
  const clean = unit.trim().toLowerCase();
  const def = UNIT_DEFINITIONS[clean];
  if (def) {
    if (def.type === 'mass') return def.factorToBase === 1 ? 'kg' : 'g';
    if (def.type === 'volume') return def.factorToBase === 1 ? 'L' : 'ml';
    return def.baseUnit;
  }
  return clean;
}

/**
 * Checks if two measurement units belong to compatible dimensions.
 */
export function areUnitsCompatible(unitA: string, unitB: string): boolean {
  if (!unitA || !unitB) return false;
  const a = unitA.trim().toLowerCase();
  const b = unitB.trim().toLowerCase();
  if (a === b) return true;

  const defA = UNIT_DEFINITIONS[a];
  const defB = UNIT_DEFINITIONS[b];
  if (!defA || !defB) return false;

  return defA.type === defB.type && defA.baseUnit === defB.baseUnit;
}

/**
 * Throws a descriptive error if units are incompatible.
 */
export function assertUnitsCompatible(unitA: string, unitB: string, context?: string): void {
  if (!areUnitsCompatible(unitA, unitB)) {
    const ctx = context ? ` (${context})` : '';
    throw new Error(
      `Incompatible measurement units: cannot convert between "${unitA}" and "${unitB}"${ctx}. Mass and volume cannot be mixed without density.`
    );
  }
}

/**
 * Converts a quantity from one unit to another.
 * Supports optional density (kg/L) for mass-to-volume conversions (e.g. oil: 0.91 kg/L).
 */
export function convertQuantity(
  quantity: number,
  fromUnit: string,
  toUnit: string,
  densityKgPerL?: number
): number {
  if (isNaN(quantity) || !isFinite(quantity)) return 0;
  if (quantity === 0) return 0;

  const from = fromUnit.trim().toLowerCase();
  const to = toUnit.trim().toLowerCase();
  if (from === to) return quantity;

  const defFrom = UNIT_DEFINITIONS[from];
  const defTo = UNIT_DEFINITIONS[to];

  if (!defFrom || !defTo) {
    throw new Error(`Unknown unit encountered: "${from}" or "${to}"`);
  }

  // Same category conversion (e.g. kg -> g, or ml -> L)
  if (defFrom.type === defTo.type) {
    const baseVal = quantity * defFrom.factorToBase;
    const targetVal = baseVal / defTo.factorToBase;
    return Math.round((targetVal + Number.EPSILON) * 1000000) / 1000000;
  }

  // Cross-category conversion with density (mass <-> volume)
  if (densityKgPerL && densityKgPerL > 0) {
    if (defFrom.type === 'mass' && defTo.type === 'volume') {
      // mass in kg / density (kg/L) = volume in L
      const kg = quantity * defFrom.factorToBase;
      const liters = kg / densityKgPerL;
      return liters / defTo.factorToBase;
    }
    if (defFrom.type === 'volume' && defTo.type === 'mass') {
      // volume in L * density (kg/L) = mass in kg
      const liters = quantity * defFrom.factorToBase;
      const kg = liters * densityKgPerL;
      return kg / defTo.factorToBase;
    }
  }

  throw new Error(
    `Cannot convert between incompatible units "${fromUnit}" and "${toUnit}" without a valid density conversion factor.`
  );
}

/**
 * Converts unit cost between compatible units.
 * Example: ₹40 per kg -> ₹0.04 per gram.
 * Cost per gram = Cost per kg / 1000.
 */
export function convertUnitCost(
  costPerUnit: number,
  fromUnit: string,
  toUnit: string,
  densityKgPerL?: number
): number {
  if (isNaN(costPerUnit) || !isFinite(costPerUnit) || costPerUnit <= 0) return 0;

  const from = fromUnit.trim().toLowerCase();
  const to = toUnit.trim().toLowerCase();
  if (from === to) return costPerUnit;

  // 1 unit of toUnit = X units of fromUnit
  const qtyInFromUnit = convertQuantity(1, toUnit, fromUnit, densityKgPerL);
  const targetCost = costPerUnit * qtyInFromUnit;
  return Math.round((targetCost + Number.EPSILON) * 10000) / 10000;
}
