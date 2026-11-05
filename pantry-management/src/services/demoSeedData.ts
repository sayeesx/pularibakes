import { Ingredient, Product, Recipe } from '../types';

// ==============================================================================
// PULARI BAKES INITIAL CATALOGUE & SAMPLE TEST DATA
// ==============================================================================

export const INITIAL_PRODUCTS: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>[] = [
  { name: 'ദാൽ മിക്സ്ചർ', unit: 'kg', currentStock: 50, isActive: true },
  { name: 'ദാൽ സേവ', unit: 'kg', currentStock: 50, isActive: true },
  { name: 'കടല മിക്സ്ചർ', unit: 'kg', currentStock: 50, isActive: true },
  { name: 'പയോളി മിക്സ്ചർ', unit: 'kg', currentStock: 50, isActive: true },
  { name: 'പെരി പെരി മിക്സ്ചർ', unit: 'kg', currentStock: 0, isActive: true },
  { name: 'First മിക്സ്ചർ', unit: 'kg', currentStock: 0, isActive: true },
  { name: 'സാമ്പാർ SP', unit: 'kg', currentStock: 0, isActive: true },
  { name: 'ചിപ്പി മിക്സ്ചർ', unit: 'kg', currentStock: 0, isActive: true },
  { name: 'റോസ്റ്റ്', unit: 'kg', currentStock: 0, isActive: true },
  { name: 'പട്ടാണി', unit: 'kg', currentStock: 0, isActive: true },
  { name: 'ഒബിസി', unit: 'kg', currentStock: 0, isActive: true },
  { name: 'കമ്പ്യൂട്ടർ മിക്സ്ചർ', unit: 'kg', currentStock: 0, isActive: true },
  { name: 'ചോളം സ്വീറ്റ് മിക്സ്ചർ', unit: 'kg', currentStock: 0, isActive: true },
  { name: 'ചോളം മസാല മിക്സ്ചർ', unit: 'kg', currentStock: 0, isActive: true },
  { name: 'പട്ടാണി മിക്സ്ചർ', unit: 'kg', currentStock: 0, isActive: true },
  { name: '3kg കിറ്റ് മിക്സ്ചർ', unit: 'kg', currentStock: 0, isActive: true },
  { name: 'എപ്സോ കിറ്റ് മിക്സ്ചർ', unit: 'kg', currentStock: 0, isActive: true },
  { name: 'മണി കടല', unit: 'kg', currentStock: 0, isActive: true },
  { name: 'മുളക് മിക്സ്ചർ', unit: 'kg', currentStock: 0, isActive: true },
  { name: 'സുടാൻ മിക്സ്ചർ', unit: 'kg', currentStock: 0, isActive: true },
  { name: 'ചില്ലി മിക്സ്ചർ', unit: 'kg', currentStock: 0, isActive: true },
  { name: 'PT മിക്സ്ചർ', unit: 'kg', currentStock: 0, isActive: true },
  { name: 'Sr മിക്സ്ചർ', unit: 'kg', currentStock: 0, isActive: true },
  { name: 'SPSR മിക്സ്ചർ', unit: 'kg', currentStock: 0, isActive: true },
  { name: 'സാമ്പാർ LC', unit: 'kg', currentStock: 0, isActive: true },
  { name: 'ജീൻസ്', unit: 'kg', currentStock: 0, isActive: true },
  { name: 'ഗാർലിക്ക് pv', unit: 'kg', currentStock: 0, isActive: true },
  { name: 'Sp മിക്സ്ചർ', unit: 'kg', currentStock: 0, isActive: true },
];

export const INITIAL_INGREDIENTS: Omit<Ingredient, 'id' | 'createdAt' | 'updatedAt'>[] = [
  // Basic Shared Daily Ingredients
  { name: 'ഓയിൽ', category: 'basic', unit: 'L', currentStock: 100, minStock: 20, avgCostPerUnit: 150, isActive: true },
  { name: 'അണ്ടി തോട്', category: 'basic', unit: 'kg', currentStock: 100, minStock: 10, avgCostPerUnit: 80, isActive: true },
  { name: 'ചിപ്പ്ളി പൊടി', category: 'basic', unit: 'kg', currentStock: 100, minStock: 10, avgCostPerUnit: 60, isActive: true },
  { name: 'കറിവേപ്പില', category: 'basic', unit: 'kg', currentStock: 50, minStock: 5, avgCostPerUnit: 40, isActive: true },
  { name: 'കൂലി', category: 'basic', unit: 'pcs', currentStock: 500, minStock: 50, avgCostPerUnit: 2, isActive: true },
  { name: 'കൂലി പാക്കിങ്', category: 'basic', unit: 'pcs', currentStock: 500, minStock: 50, avgCostPerUnit: 1.5, isActive: true },
  { name: 'ഉപ്പ്', category: 'basic', unit: 'kg', currentStock: 100, minStock: 10, avgCostPerUnit: 20, isActive: true },

  // Recipe-Specific & Other Ingredients with Sample Stock
  { name: 'അരിപ്പൊടി പൊള്ളാച്ചി', category: 'other', unit: 'kg', currentStock: 150, minStock: 20, avgCostPerUnit: 42, isActive: true },
  { name: 'മൈദ', category: 'other', unit: 'kg', currentStock: 120, minStock: 20, avgCostPerUnit: 38, isActive: true },
  { name: 'പൂള പൊടി', category: 'other', unit: 'kg', currentStock: 100, minStock: 15, avgCostPerUnit: 45, isActive: true },
  { name: 'പൂള പൊടി പൊള്ളാച്ചി', category: 'other', unit: 'kg', currentStock: 100, minStock: 15, avgCostPerUnit: 48, isActive: true },
  { name: 'പൂള പൊടി 2nd', category: 'other', unit: 'kg', currentStock: 100, minStock: 15, avgCostPerUnit: 40, isActive: true },
  { name: 'മസൂർ', category: 'other', unit: 'kg', currentStock: 100, minStock: 15, avgCostPerUnit: 95, isActive: true },
  { name: 'Black Salt', category: 'other', unit: 'kg', currentStock: 80, minStock: 10, avgCostPerUnit: 85, isActive: true },
  { name: 'കടല പൊടി സൂരജ്', category: 'other', unit: 'kg', currentStock: 150, minStock: 20, avgCostPerUnit: 72, isActive: true },
  { name: 'കടല പൊടി 99', category: 'other', unit: 'kg', currentStock: 100, minStock: 20, avgCostPerUnit: 70, isActive: true },
  { name: 'മുളക് പൊടി', category: 'other', unit: 'kg', currentStock: 80, minStock: 10, avgCostPerUnit: 240, isActive: true },
  { name: 'കടല ഫസ്റ്റ്', category: 'other', unit: 'kg', currentStock: 120, minStock: 20, avgCostPerUnit: 82, isActive: true },
  { name: 'കടല 2nd', category: 'other', unit: 'kg', currentStock: 120, minStock: 20, avgCostPerUnit: 74, isActive: true },
  { name: 'അരിപ്പൊടി 2nd', category: 'other', unit: 'kg', currentStock: 100, minStock: 15, avgCostPerUnit: 36, isActive: true },
  { name: 'പട്ടാണി', category: 'other', unit: 'kg', currentStock: 100, minStock: 15, avgCostPerUnit: 65, isActive: true },
  { name: 'ഉണ്ട പൊട്ട്', category: 'other', unit: 'kg', currentStock: 100, minStock: 15, avgCostPerUnit: 75, isActive: true },
  { name: 'പൊട്ട് കടല', category: 'other', unit: 'kg', currentStock: 100, minStock: 15, avgCostPerUnit: 75, isActive: true },
  { name: 'ചെറുപയർ', category: 'other', unit: 'kg', currentStock: 100, minStock: 15, avgCostPerUnit: 110, isActive: true },
  { name: 'മമ്പയർ', category: 'other', unit: 'kg', currentStock: 100, minStock: 15, avgCostPerUnit: 85, isActive: true },
  { name: 'ദാൽ പരിപ്പ്', category: 'other', unit: 'kg', currentStock: 100, minStock: 15, avgCostPerUnit: 90, isActive: true },
  { name: 'സാമ്പാർ പൊടി', category: 'other', unit: 'kg', currentStock: 50, minStock: 10, avgCostPerUnit: 160, isActive: true },
  { name: 'മഞ്ഞൾ പൊടി', category: 'other', unit: 'kg', currentStock: 50, minStock: 10, avgCostPerUnit: 180, isActive: true },
  { name: 'ഗരം മസാല', category: 'other', unit: 'kg', currentStock: 50, minStock: 10, avgCostPerUnit: 320, isActive: true },
  { name: 'ബിരിയാണി മസാല', category: 'other', unit: 'kg', currentStock: 50, minStock: 10, avgCostPerUnit: 300, isActive: true },
  { name: 'ചിക്കൻ മസാല', category: 'other', unit: 'kg', currentStock: 50, minStock: 10, avgCostPerUnit: 280, isActive: true },
  { name: 'മീറ്റ് മസാല', category: 'other', unit: 'kg', currentStock: 50, minStock: 10, avgCostPerUnit: 280, isActive: true },
  { name: 'കായം', category: 'other', unit: 'kg', currentStock: 50, minStock: 5, avgCostPerUnit: 400, isActive: true },
  { name: 'സദ്യ പൊടി', category: 'other', unit: 'kg', currentStock: 50, minStock: 10, avgCostPerUnit: 140, isActive: true },
  { name: 'അയമോദകം', category: 'other', unit: 'kg', currentStock: 50, minStock: 5, avgCostPerUnit: 150, isActive: true },
  { name: 'കരിം ജീരകം', category: 'other', unit: 'kg', currentStock: 50, minStock: 5, avgCostPerUnit: 220, isActive: true },
  { name: 'കമ്പ്യൂട്ടർ', category: 'other', unit: 'kg', currentStock: 100, minStock: 15, avgCostPerUnit: 55, isActive: true },
  { name: 'ചോളം', category: 'other', unit: 'kg', currentStock: 100, minStock: 15, avgCostPerUnit: 45, isActive: true },
  { name: 'ഒബിസി', category: 'other', unit: 'kg', currentStock: 100, minStock: 15, avgCostPerUnit: 50, isActive: true },
  { name: 'പഞ്ചസാര പൊടി', category: 'other', unit: 'kg', currentStock: 100, minStock: 15, avgCostPerUnit: 48, isActive: true },
  { name: 'വെളുത്തുള്ളി', category: 'other', unit: 'kg', currentStock: 50, minStock: 10, avgCostPerUnit: 120, isActive: true },
  { name: 'ചീറുള്ളി', category: 'other', unit: 'kg', currentStock: 50, minStock: 10, avgCostPerUnit: 90, isActive: true },
  { name: 'വലിയ ഉള്ളി', category: 'other', unit: 'kg', currentStock: 100, minStock: 15, avgCostPerUnit: 35, isActive: true },
  { name: 'ഉരുള കിഴങ്ങു', category: 'other', unit: 'kg', currentStock: 100, minStock: 15, avgCostPerUnit: 30, isActive: true },
  { name: 'കളർ', category: 'other', unit: 'kg', currentStock: 20, minStock: 2, avgCostPerUnit: 250, isActive: true },
];

export const INITIAL_RECIPES: Recipe[] = [
  // 1. ദാൽ മിക്സ്ചർ
  {
    id: 'recipe-dal-mixture',
    productId: 'prod-1', // maps to 'ദാൽ മിക്സ്ചർ'
    productName: 'ദാൽ മിക്സ്ചർ',
    version: 1,
    baseOutputQuantity: 10,
    baseOutputUnit: 'kg',
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ingredients: [
      { ingredientId: 'ing-9', ingredientName: 'അരിപ്പൊടി പൊള്ളാച്ചി', quantity: 3, unit: 'kg' },
      { ingredientId: 'ing-10', ingredientName: 'മൈദ', quantity: 2, unit: 'kg' },
      { ingredientId: 'ing-11', ingredientName: 'പൂള പൊടി', quantity: 2, unit: 'kg' },
      { ingredientId: 'ing-14', ingredientName: 'മസൂർ', quantity: 2.5, unit: 'kg' },
      { ingredientId: 'ing-15', ingredientName: 'Black Salt', quantity: 0.5, unit: 'kg' },
    ],
  },
  // 2. ദാൽ സേവ
  {
    id: 'recipe-dal-seva',
    productId: 'prod-2', // maps to 'ദാൽ സേവ'
    productName: 'ദാൽ സേവ',
    version: 1,
    baseOutputQuantity: 10,
    baseOutputUnit: 'kg',
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ingredients: [
      { ingredientId: 'ing-9', ingredientName: 'അരിപ്പൊടി പൊള്ളാച്ചി', quantity: 4, unit: 'kg' },
      { ingredientId: 'ing-10', ingredientName: 'മൈദ', quantity: 3, unit: 'kg' },
      { ingredientId: 'ing-11', ingredientName: 'പൂള പൊടി', quantity: 2.5, unit: 'kg' },
      { ingredientId: 'ing-15', ingredientName: 'Black Salt', quantity: 0.5, unit: 'kg' },
    ],
  },
  // 3. കടല മിക്സ്ചർ
  {
    id: 'recipe-kadala-mixture',
    productId: 'prod-3', // maps to 'കടല മിക്സ്ചർ'
    productName: 'കടല മിക്സ്ചർ',
    version: 1,
    baseOutputQuantity: 10,
    baseOutputUnit: 'kg',
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ingredients: [
      { ingredientId: 'ing-9', ingredientName: 'അരിപ്പൊടി പൊള്ളാച്ചി', quantity: 2, unit: 'kg' },
      { ingredientId: 'ing-16', ingredientName: 'കടല പൊടി സൂരജ്', quantity: 3, unit: 'kg' },
      { ingredientId: 'ing-18', ingredientName: 'മുളക് പൊടി', quantity: 0.5, unit: 'kg' },
      { ingredientId: 'ing-19', ingredientName: 'കടല ഫസ്റ്റ്', quantity: 2.5, unit: 'kg' },
      { ingredientId: 'ing-20', ingredientName: 'കടല 2nd', quantity: 2, unit: 'kg' },
    ],
  },
  // 4. പയോളി മിക്സ്ചർ
  {
    id: 'recipe-payyoli-mixture',
    productId: 'prod-4', // maps to 'പയോളി മിക്സ്ചർ'
    productName: 'പയോളി മിക്സ്ചർ',
    version: 1,
    baseOutputQuantity: 10,
    baseOutputUnit: 'kg',
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ingredients: [
      { ingredientId: 'ing-9', ingredientName: 'അരിപ്പൊടി പൊള്ളാച്ചി', quantity: 2, unit: 'kg' },
      { ingredientId: 'ing-12', ingredientName: 'പൂള പൊടി പൊള്ളാച്ചി', quantity: 2, unit: 'kg' },
      { ingredientId: 'ing-18', ingredientName: 'മുളക് പൊടി', quantity: 0.5, unit: 'kg' },
      { ingredientId: 'ing-16', ingredientName: 'കടല പൊടി സൂരജ്', quantity: 2, unit: 'kg' },
      { ingredientId: 'ing-19', ingredientName: 'കടല ഫസ്റ്റ്', quantity: 2, unit: 'kg' },
      { ingredientId: 'ing-20', ingredientName: 'കടല 2nd', quantity: 1.5, unit: 'kg' },
    ],
  },
];
