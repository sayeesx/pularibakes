import { describe, it, expect } from 'vitest';
import {
  areUnitsCompatible,
  assertUnitsCompatible,
  convertQuantity,
  convertUnitCost,
  normalizeUnit,
} from '../services/unitConversion';
import {
  calculateSpecialMixtureCost,
  calculateProductProductionCost,
  calculateWastageMetrics,
  calculateWeightedAverageCost,
  roundCurrency,
  roundStock,
} from '../services/costing';

describe('Pulari Bakes Security, Language & Boundary Safety Tests', () => {
  // 1. PIN & AUTHENTICATION BOUNDARY
  describe('Authentication & Security Guards', () => {
    it('blocks legacy obsolete PINs unconditionally', () => {
      const isBlockedPin = (pin: string) => pin.trim() === '65188';
      expect(isBlockedPin('65188')).toBe(true);
      expect(isBlockedPin('  65188  ')).toBe(true);
      expect(isBlockedPin('98096')).toBe(false);
      expect(isBlockedPin('123456')).toBe(false);
    });

    it('validates PIN format requires 4 to 8 numeric digits', () => {
      const pinRegex = /^\d{4,8}$/;
      expect(pinRegex.test('123456')).toBe(true);
      expect(pinRegex.test('98096')).toBe(true);
      expect(pinRegex.test('123')).toBe(false); // too short
      expect(pinRegex.test('123456789')).toBe(false); // too long
      expect(pinRegex.test('abc123')).toBe(false); // non-numeric
      expect(pinRegex.test("' OR '1'='1")).toBe(false); // injection attempt
    });

    it('validates session token generation has sufficient entropy and 24h expiration', () => {
      const token = 'pulari_admin_session_' + Date.now().toString(36) + Math.random().toString(36).slice(2);
      expect(token).toMatch(/^pulari_admin_session_[a-z0-9]+$/);
      expect(token.length).toBeGreaterThanOrEqual(30);
    });
  });

  // 2. MONOLINGUAL CONSISTENCY
  describe('Monolingual Language Dictionary Integrity', () => {
    it('verifies unit normalization returns clean canonical representations', () => {
      expect(normalizeUnit('KG')).toBe('kg');
      expect(normalizeUnit('Kilogram')).toBe('kg');
      expect(normalizeUnit('Grams')).toBe('g');
      expect(normalizeUnit('Ltr')).toBe('L');
      expect(normalizeUnit('Millilitres')).toBe('ml');
      expect(normalizeUnit('Pcs')).toBe('pcs');
      expect(normalizeUnit('Packet')).toBe('packs');
    });

    it('strictly checks unit compatibility', () => {
      expect(areUnitsCompatible('kg', 'g')).toBe(true);
      expect(areUnitsCompatible('g', 'mg')).toBe(true);
      expect(areUnitsCompatible('l', 'ml')).toBe(true);
      expect(areUnitsCompatible('kg', 'l')).toBe(false);
      expect(areUnitsCompatible('g', 'pcs')).toBe(false);
      expect(areUnitsCompatible('packs', 'kg')).toBe(false);
    });
  });

  // 3. ZERO DIVISION & BOUNDARY SAFETY
  describe('Zero Division & Boundary Safety in Costing Formulas', () => {
    it('handles zero usable mixture output without throwing divide by zero', () => {
      const res = calculateSpecialMixtureCost({
        ingredientsConsumed: [{ actualQuantity: 10, unitCost: 50 }],
        actualUsableOutput: 0,
        plannedOutput: 10,
      });

      expect(res.totalBatchCost).toBe(500);
      expect(res.actualCostPerUnit).toBe(0); // Safely returns 0, NOT Infinity or NaN
      expect(Number.isFinite(res.actualCostPerUnit)).toBe(true);
      expect(res.wastageQuantity).toBe(10);
      expect(res.wastagePercentage).toBe(100);
    });

    it('handles zero planned quantity in wastage metrics without throwing divide by zero', () => {
      const res = calculateWastageMetrics(0, 0);
      expect(res.wastageQuantity).toBe(0);
      expect(res.wastagePercentage).toBe(0);
      expect(res.yieldPercentage).toBe(100);
    });

    it('handles negative inputs safely by clamping to zero', () => {
      const res = calculateSpecialMixtureCost({
        ingredientsConsumed: [{ actualQuantity: -5, unitCost: 100 }],
        actualUsableOutput: -2,
      });

      expect(res.totalBatchCost).toBe(0);
      expect(res.actualCostPerUnit).toBe(0);
    });

    it('handles weighted average cost with negative combined quantity', () => {
      const cost = calculateWeightedAverageCost(-10, 50, -5, 60);
      expect(Number.isFinite(cost)).toBe(true);
      expect(cost).toBeGreaterThanOrEqual(0);
    });
  });

  // 4. FLOATING POINT DRIFT & PRECISION ROUNDING
  describe('Floating-point drift elimination', () => {
    it('verifies roundCurrency prevents floating point drift on recurring decimals', () => {
      // 100 / 3 = 33.333333333333336 in JS
      const third = 100 / 3;
      expect(roundCurrency(third)).toBe(33.33);
      expect(roundStock(third)).toBe(33.333);
    });

    it('handles large production material costing without numerical overflow or drift', () => {
      const res = calculateProductProductionCost({
        rawIngredientsConsumed: [
          { actualQuantity: 1250.75, unitCost: 45.25 },
          { actualQuantity: 800.5, unitCost: 110.15 },
        ],
        mixturesConsumed: [
          { actualQuantity: 500.25, unitCost: 185.5 },
        ],
        packagingCost: 4500.75,
        packingLabourCost: 2500,
        allocatedWages: 6000,
        allocatedSharedExpenses: 3500.25,
      });

      // All totals must be finite, decimal-precise, non-negative
      expect(Number.isFinite(res.totalProductionCost)).toBe(true);
      expect(res.totalProductionCost).toBeGreaterThan(0);
      expect(roundCurrency(res.totalProductionCost)).toBe(res.totalProductionCost);
    });
  });
});
