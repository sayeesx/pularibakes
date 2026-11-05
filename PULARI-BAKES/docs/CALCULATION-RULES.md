# Pulari Bakes Production Management System
## Calculation Audit & Business Logic Rules (Section 14)

---

## 1. Mathematical Standards & Arithmetic Precision

### Core Precision Directives
To eliminate IEEE 754 double-precision floating-point arithmetic errors (such as `0.1 + 0.2 = 0.30000000000000004`):
1. **Quantity Precision**: All inventory and physical recipe measurements are rounded to **3 decimal places** (`roundStock(val)`, precision: 0.001 kg = 1 gram, 0.001 L = 1 ml).
2. **Currency Precision**: All intermediate and final monetary totals are rounded to **2 decimal places** (`roundCurrency(val)`, precision: ₹0.01 = 1 paisa).
3. **High-Precision Material Rates**: Raw ingredient and packet pouch unit costs are maintained up to **4 decimal places** (`roundUnitCost(val)`, precision: ₹0.0001) to prevent compounding truncation errors across large batches.
4. **Rounding Implementation**:
   $$\text{roundTo}(v, d) = \frac{\lfloor (v + \epsilon) \cdot 10^d + 0.5 \rfloor}{10^d}$$
   Where $\epsilon = \text{Number.EPSILON} \approx 2.22 \times 10^{-16}$.

---

## 2. Business Formula Catalogue

### Formula 1: Unit Conversion & Unit Normalization
* **Formula**:
  $$\text{Converted Quantity} = \text{Quantity} \times \left( \frac{\text{factorToBase}_{\text{from}}}{\text{factorToBase}_{\text{to}}} \right)$$
  For Mass $\leftrightarrow$ Volume with Density ($\rho$ in kg/L):
  $$\text{Mass (kg)} = \text{Volume (L)} \times \rho$$
  $$\text{Volume (L)} = \frac{\text{Mass (kg)}}{\rho}$$
* **Explanation**: Standardizes all mass, volume, and discrete measurements before costing. Strictly rejects incompatible conversions (e.g. converting mass to discrete pieces or mass to volume without density).
* **Input Fields**:
  - `quantity`: `number` (Source value)
  - `fromUnit`: `'kg' | 'g' | 'mg' | 'l' | 'ml' | 'pcs' | 'packs'`
  - `toUnit`: `'kg' | 'g' | 'mg' | 'l' | 'ml' | 'pcs' | 'packs'`
  - `densityKgPerL` (Optional): Specific gravity of liquids (e.g. coconut oil $\approx 0.91$ kg/L)
* **Example Calculation**:
  - Convert 750 grams to kilograms: $750 \times 0.001 = 0.75\text{ kg}$.
  - Convert 10 Litres of oil ($\rho = 0.91$) to kg: $10 \times 0.91 = 9.1\text{ kg}$.
  - Convert cost ₹60/kg to grams: $60 \times 0.001 = ₹0.06\text{/g}$.
* **Expected Output**: Decimal-precise converted value.
* **Related Tables**: `public.unit_conversions`, `public.ingredients`.
* **Automated Test Reference**: `src/tests/business_logic_validation.test.ts` (Suite 1: Ingredient Unit Conversions).

---

### Formula 2: Weighted Average Costing (WAC) for Purchases
* **Formula**:
  $$\text{New Average Cost} = \frac{(\text{Current Stock} \times \text{Current Avg Cost}) + (\text{Purchased Qty} \times \text{Purchased Unit Cost})}{\text{Current Stock} + \text{Purchased Qty}}$$
* **Explanation**: Re-values inventory upon new supplier purchases. If previous stock was $\le 0$, the new purchase price becomes the new unit cost. Consumption does not alter unit cost.
* **Input Fields**:
  - `currentStock`: `number` (kg/L/pcs)
  - `currentAvgCost`: `number` (₹/unit)
  - `purchasedQty`: `number` (kg/L/pcs)
  - `purchasedUnitCost`: `number` (₹/unit)
* **Example Calculation**:
  - Current stock: 100 kg @ ₹40.00 (Total value: ₹4,000)
  - New purchase: 50 kg @ ₹46.00 (Total purchase: ₹2,300)
  - Total stock: $100 + 50 = 150\text{ kg}$
  - New Average Cost: $\frac{4000 + 2300}{150} = \frac{6300}{150} = ₹42.00\text{/kg}$.
* **Related Tables**: `public.ingredients`, `public.stock_movements`.
* **Automated Test Reference**: `src/tests/business_logic_validation.test.ts` (Suite 2: Weighted Average Purchase Costing).

---

### Formula 3: Special Mixture Batch Preparation Costing
* **Formula**:
  $$\text{Total Batch Cost} = \sum_{i=1}^{n} (\text{Actual Consumed Quantity}_i \times \text{Unit Cost}_i)$$
  $$\text{Actual Cost Per Usable Unit} = \frac{\text{Total Batch Cost}}{\text{Actual Usable Output Quantity}}$$
* **Explanation**: Computes the true financial cost of intermediate cooked mixtures (e.g. Plum Cake Mixture, Whipping Cream, Butter Cream). Critically, unit cost is calculated based on **actual usable output**, not expected theoretical output.
* **Input Fields**:
  - `ingredientsConsumed`: Array of consumed items with `actualQuantity` and `unitCost`.
  - `actualUsableOutput`: Actual weight of usable mixture produced (kg).
  - `plannedOutput`: Theoretical target output (kg).
* **Example Calculation (from Requirement Section 14.B)**:
  - Total preparation cost: ₹600.00
  - Expected output: 5.0 kg
  - Actual usable output: 4.8 kg
  - Actual cost per kg: $\frac{600}{4.8} = ₹125.00\text{/kg}$.
* **Expected Output**: `totalBatchCost: 600.00`, `actualCostPerUnit: 125.00`, `wastageQuantity: 0.2`, `wastagePercentage: 4.00%`.
* **Related Tables**: `public.special_mixtures`, `public.special_mixture_batches`, `public.special_mixture_consumption`.
* **Automated Test Reference**: `src/tests/business_logic_validation.test.ts` (Suite 4: Actual Mixture Output Costing).

---

### Formula 4: Zero Double-Counting Production Costing
* **Formula**:
  $$\text{Total Direct Material Cost} = \text{Cost of Direct Raw Materials} + \text{Cost of Prepared Mixtures Consumed}$$
  $$\text{Total Production Cost} = \text{Total Direct Material Cost} + \text{Packaging Cost} + \text{Packing Labour} + \text{Allocated Shared Expenses}$$
* **Explanation**: When baking cakes or snacks that incorporate prepared intermediate mixtures, **only the mixture stock is deducted at its recorded unit cost**. Raw ingredients used earlier to prepare the mixture are **NEVER re-deducted**, guaranteeing zero double-counting.
* **Input Fields**:
  - `rawIngredientsConsumed`: Array of direct items (e.g. dry fruits, cashews).
  - `mixturesConsumed`: Array of prepared intermediate mixtures (e.g. 10 kg Plum Mixture @ ₹150/kg).
* **Example Calculation**:
  - Direct raw ingredients: 2 kg cashews @ ₹700 = ₹1,400 + 0.5 kg essence @ ₹200 = ₹100 $\rightarrow$ ₹1,500
  - Prepared mixture: 10 kg Plum Mixture @ ₹150 $\rightarrow$ ₹1,500
  - Total direct material cost: $1500 + 1500 = ₹3,000.00$
  - Packaging + Labour + Overhead: ₹600
  - Total Production Cost: $3000 + 600 = ₹3,600.00$.
* **Related Tables**: `public.production_runs`, `public.production_consumption`, `public.production_mixture_consumption`, `public.products`.
* **Automated Test Reference**: `src/tests/business_logic_validation.test.ts` (Suite 6 & Suite 7).

---

### Formula 5: Batch Wastage & Yield Percentage
* **Formula**:
  $$\text{Wastage Quantity} = \max(0, \text{Planned Quantity} - \text{Actual Usable Quantity})$$
  $$\text{Wastage Percentage} = \left( \frac{\text{Wastage Quantity}}{\text{Planned Quantity}} \right) \times 100$$
  $$\text{Yield Percentage} = \left( \frac{\text{Actual Usable Quantity}}{\text{Planned Quantity}} \right) \times 100$$
* **Explanation**: Accurately tracks production scrap and shrinkage without double-counting raw materials. The cost of unusable waste is absorbed directly into the usable unit output cost.
* **Input Fields**:
  - `plannedQuantity`: `number` (kg)
  - `actualUsableQuantity`: `number` (kg)
* **Example Calculation**:
  - Planned: 50 kg, Actual usable: 47.5 kg
  - Wastage: $50 - 47.5 = 2.5\text{ kg}$ ($5.00\%$)
  - Yield: $\frac{47.5}{50} \times 100 = 95.00\%$.
* **Related Tables**: `public.production_runs`, `public.special_mixture_batches`.
* **Automated Test Reference**: `src/tests/business_logic_validation.test.ts` (Suite 8: Wastage Calculations).

---

### Formula 6: Continuous Oil Balance & Cook's Carry-Forward Workflow
* **Formula**:
  $$\text{Net Oil Consumed} = \text{Oil Used During Production} - \text{Leftover Oil Returned to Stock}$$
  $$\text{Final Oil Stock (Today's Closing)} = \text{Previous Available Stock} - \text{Net Oil Consumed}$$
  $$\text{Daily Oil Expense} = \text{Net Oil Consumed} \times \text{Oil Cost Per kg}$$
  $$\text{Tomorrow's Opening Oil Stock} = \text{Today's Final Oil Stock}$$
* **Explanation**: Reflects the real-world bakery cooking floor workflow. Oil poured into frying pans during production is deducted, but unused oil measured and returned at shift end is added back to stock.
* **Input Fields**:
  - `previousAvailableStockKg`: Opening stock or previous closing balance (kg)
  - `oilUsedKg`: Quantity taken from storeroom into pans (kg)
  - `leftoverOilKg`: Clean oil left in pans at end of day (kg)
  - `oilCostPerKg`: Weighted average cost of cooking oil (₹/kg)
* **Example Calculation**:
  - Previous available: 30 kg
  - Oil used: 10 kg
  - Leftover: 4 kg
  - Net consumed: $10 - 4 = 6\text{ kg}$
  - Final stock: $30 - 6 = 24\text{ kg}$ (Carried forward to tomorrow)
  - Daily Oil Expense: $6\text{ kg} \times ₹140\text{/kg} = ₹840.00$.
* **Related Tables**: `public.daily_closings`, `public.ingredients`.
* **Automated Test Reference**: `src/tests/business_logic_validation.test.ts` (Suite 11: Oil Carry-Forward Workflow).

---

### Formula 7: Weighted Shared Expense Allocation with Exact Penny Reconciliation
* **Formula**:
  $$\text{Weight Ratio}_j = \frac{\text{Product Production (kg)}_j}{\sum_{k=1}^m \text{Product Production (kg)}_k}$$
  For items $j = 1 \dots (m - 1)$:
  $$\text{Allocated Cost}_j = \text{roundCurrency}(\text{Total Shared Expense} \times \text{Weight Ratio}_j)$$
  For the final item $m$ (Exact Penny Reconciliation):
  $$\text{Allocated Cost}_m = \text{Total Shared Expense} - \sum_{j=1}^{m-1} \text{Allocated Cost}_j$$
* **Explanation**: Shared daily expenses (Oil, Cooking Wages, Gas, Packing Wages) are distributed across batches according to production weight. Fractional paise rounding discrepancies are absorbed by the final product so that the sum of allocations **strictly equals** the daily expenditure.
* **Input Fields**:
  - `productsSummary`: List of products with total output kg and batch counts.
  - `dailyOilExpense`: Total daily oil cost (₹)
  - `dailyProductionWages`: Total daily wages (₹)
* **Example Calculation**:
  - 3 products produced with 10 kg each (Total: 30 kg, each 33.333%)
  - Total shared expense: ₹1,000.00
  - Product 1: $\text{roundCurrency}(1000 \times 1/3) = ₹333.33$
  - Product 2: $\text{roundCurrency}(1000 \times 1/3) = ₹333.33$
  - Product 3: $1000.00 - (333.33 + 333.33) = ₹333.34$
  - Total Allocated: $333.33 + 333.33 + 333.34 = ₹1,000.00$ (Zero discrepancy).
* **Related Tables**: `public.daily_cost_allocations`, `public.daily_closings`.
* **Automated Test Reference**: `src/tests/business_logic_validation.test.ts` (Suite 9 & Suite 10).

---

### Formula 8: Packet Packaging, Bulk Separation & Unpacked Stock Valuation
* **Formula**:
  $$\text{Total Weight Packed (kg)} = \sum (\text{Packets Packed}_s \times \text{Packet Size Weight (kg)}_s)$$
  $$\text{Unpacked Bulk Stock (kg)} = \max(0, \text{Total Production (kg)} - \text{Total Weight Packed (kg)})$$
  $$\text{Unpacked Bulk Valuation} = \text{Unpacked Bulk Stock} \times \text{Production Cost Per kg}$$
  $$\text{Cost Per Packet}_s = (\text{Packet Size Weight}_s \times \text{Production Cost Per kg}) + \text{Cover Unit Cost}_s + \text{Packing Labour Rate}_s$$
* **Explanation**: Separates bulk production cost from packaging costs. Maintains accurate asset valuation for product inventory remaining in bulk bins prior to pouch sealing.
* **Input Fields**:
  - `productionAllocation`: Production cost and output weight.
  - `packingRecords`: Packets sealed, cover costs, and piece-rate labour.
* **Example Calculation**:
  - 50 kg produced @ ₹100.00/kg bulk cost
  - Packed into 200g packets (100 packets = 20 kg)
  - Packed into 500g packets (20 packets = 10 kg)
  - Total packed: 30 kg; Unpacked bulk remaining: $50 - 30 = 20\text{ kg}$
  - Unpacked Valuation: $20\text{ kg} \times ₹100\text{/kg} = ₹2,000.00$
  - Cost for 200g packet: $(0.2 \times 100) + 2.00\text{ cover} + 1.00\text{ labour} = ₹23.00\text{/packet}$.
* **Related Tables**: `public.packing_records`, `public.packaging_items`, `public.products`.
* **Automated Test Reference**: `src/tests/calculations.test.ts` (Packet Packaging & Output Valuation).

---

### Formula 9: Inventory Double-Entry Ledger Equation
* **Formula**:
  $$\text{Closing Balance} = \text{Opening Balance} + \sum \text{Purchases} + \sum \text{Production Inflow} - \sum \text{Consumption} - \sum \text{Wastage} \pm \sum \text{Adjustments}$$
* **Explanation**: Every physical stock change must originate from an immutable, traceable stock movement record in `public.stock_movements`. Negative stock balances are strictly prohibited by database constraints (`CHECK (current_stock >= 0)`).
* **Input Fields**:
  - `previousBalance`: Balance before transaction
  - `quantityDelta`: Positive (inflow) or negative (outflow)
* **Related Tables**: `public.stock_movements`, `public.ingredients`, `public.products`, `public.special_mixtures`.
* **Automated Test Reference**: `src/tests/business_logic_validation.test.ts` (Suite 12: Inventory Opening and Closing Balances).
