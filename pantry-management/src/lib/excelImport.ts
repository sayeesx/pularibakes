import * as XLSX from 'xlsx';
import { Ingredient, Product } from '../types';

export interface ExtractedPurchaseItem {
  ingredientId: string;
  ingredientName: string;
  amount: number;
  costPerUnit: number;
  unit: string;
}

export interface PurchaseExtractionResult {
  matched: ExtractedPurchaseItem[];
  unmatched: Array<{ rawName: string; amount: number; cost: number }>;
}

function normalizeName(str: string): string {
  return (str || '')
    .toLowerCase()
    .replace(/[\(\)\[\]_.,\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function parsePurchasesExcel(
  file: File,
  ingredients: Ingredient[]
): Promise<PurchaseExtractionResult> {
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];

  const rows: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

  const matched: ExtractedPurchaseItem[] = [];
  const unmatched: Array<{ rawName: string; amount: number; cost: number }> = [];

  const ingMap = new Map<string, Ingredient>();
  for (const ing of ingredients) {
    ingMap.set(normalizeName(ing.name), ing);
  }

  for (const row of rows) {
    let rawName = '';
    let amount = 0;
    let cost = 0;

    for (const [key, val] of Object.entries(row)) {
      const k = normalizeName(key);
      const v = typeof val === 'string' ? val.trim() : val;

      if (k.includes('item') || k.includes('ingredient') || k.includes('name') || k.includes('ചേരുവ') || k.includes('പേര്')) {
        rawName = String(v);
      } else if (k.includes('amount') || k.includes('quantity') || k.includes('qty') || k.includes('അളവ്')) {
        const num = parseFloat(String(v));
        if (!isNaN(num)) amount = num;
      } else if (k.includes('cost') || k.includes('price') || k.includes('rate') || k.includes('വില') || k.includes('നിരക്ക്')) {
        const num = parseFloat(String(v));
        if (!isNaN(num)) cost = num;
      }
    }

    if (!rawName && !amount) continue;

    const normRaw = normalizeName(rawName);
    let matchedIng = ingMap.get(normRaw);

    if (!matchedIng && normRaw.length > 2) {
      for (const [key, ing] of ingMap.entries()) {
        if (key.includes(normRaw) || normRaw.includes(key)) {
          matchedIng = ing;
          break;
        }
      }
    }

    if (matchedIng && amount > 0) {
      matched.push({
        ingredientId: matchedIng.id,
        ingredientName: matchedIng.name,
        amount,
        costPerUnit: cost > 0 ? cost : matchedIng.avgCostPerUnit || 0,
        unit: matchedIng.unit || 'kg',
      });
    } else if (rawName && (amount > 0 || cost > 0)) {
      unmatched.push({ rawName, amount, cost });
    }
  }

  return { matched, unmatched };
}

export function downloadPurchasesTemplate(ingredients: Ingredient[]): void {
  const activeIngs = ingredients.filter(
    (i) => i.isActive && !i.name.includes('കൂലി') && !i.name.includes('wages')
  );

  const sampleData = activeIngs.map((i) => ({
    'ചേരുവ (Ingredient Name)': i.name,
    'വാങ്ങിയ അളവ് (Quantity)': '',
    'യൂണിറ്റ് നിരക്ക് (Unit Cost / Price ₹)': i.avgCostPerUnit || '',
    'യൂണിറ്റ് (Unit)': i.unit || 'kg',
  }));

  const worksheet = XLSX.utils.json_to_sheet(sampleData);
  worksheet['!cols'] = [
    { wch: 30 },
    { wch: 22 },
    { wch: 25 },
    { wch: 15 },
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Purchases');
  XLSX.writeFile(workbook, 'Pulari_Purchases_Template.xlsx');
}

export interface ExtractedProductItem {
  name: string;
  sku?: string;
  unit: string;
  currentStock: number;
  wholesalePrice: number;
}

export async function parseProductsExcel(file: File): Promise<ExtractedProductItem[]> {
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];

  const rows: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
  const products: ExtractedProductItem[] = [];

  for (const row of rows) {
    let name = '';
    let sku = '';
    let unit = 'kg';
    let currentStock = 0;
    let wholesalePrice = 0;

    for (const [key, val] of Object.entries(row)) {
      const k = normalizeName(key);
      const v = typeof val === 'string' ? val.trim() : val;

      if (k.includes('product') || k.includes('item') || k.includes('name') || k.includes('ഉൽപ്പന്നം') || k.includes('പേര്')) {
        name = String(v);
      } else if (k.includes('sku') || k.includes('code') || k.includes('കോഡ്')) {
        sku = String(v);
      } else if (k.includes('unit') || k.includes('യൂണിറ്റ്')) {
        unit = String(v).toLowerCase() || 'kg';
      } else if (k.includes('stock') || k.includes('quantity') || k.includes('qty') || k.includes('സ്റ്റോക്ക്')) {
        const num = parseFloat(String(v));
        if (!isNaN(num)) currentStock = num;
      } else if (k.includes('price') || k.includes('cost') || k.includes('rate') || k.includes('വില')) {
        const num = parseFloat(String(v));
        if (!isNaN(num)) wholesalePrice = num;
      }
    }

    if (name.trim()) {
      products.push({
        name: name.trim(),
        sku: sku.trim() || undefined,
        unit: unit || 'kg',
        currentStock: Math.max(0, currentStock),
        wholesalePrice: Math.max(0, wholesalePrice),
      });
    }
  }

  return products;
}

export function downloadProductsTemplate(existingProducts: Product[] = []): void {
  const sampleData = (existingProducts.length > 0 ? existingProducts : [
    { name: 'ദാൽ മിക്സ്ചർ', sku: 'PB-DAL-01', unit: 'kg', currentStock: 50, wholesalePrice: 180 },
    { name: 'കേരള ബനാന ചിപ്സ് (Banana Chips)', sku: 'PB-BC-01', unit: 'kg', currentStock: 30, wholesalePrice: 220 },
    { name: 'മുറുക്ക് (Murukku)', sku: 'PB-MUR-01', unit: 'kg', currentStock: 25, wholesalePrice: 160 },
  ]).map((p) => ({
    'ഉൽപ്പന്നം (Product Name)': p.name,
    'കോഡ് (Code / SKU)': p.sku || '',
    'യൂണിറ്റ് (Unit)': p.unit || 'kg',
    'സ്റ്റോക്ക് (Current Stock)': p.currentStock || 0,
    'വില / ചിലവ് (Wholesale Price ₹)': p.wholesalePrice || 0,
  }));

  const worksheet = XLSX.utils.json_to_sheet(sampleData);
  worksheet['!cols'] = [
    { wch: 32 },
    { wch: 18 },
    { wch: 12 },
    { wch: 22 },
    { wch: 25 },
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Products');
  XLSX.writeFile(workbook, 'Pulari_Products_Template.xlsx');
}
