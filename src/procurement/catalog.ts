/**
 * The fixed 30-SKU corrugated packaging catalog.
 *
 * This is the ONLY source of valid SKUs in the system. The RFx builder AI
 * may select subsets of this catalog conversationally, but it must never
 * invent a new SKU or description. Both the seed script and the RFx builder
 * import from here so there is exactly one definition of the catalog.
 */

export type CatalogItem = {
  sku: string;
  description: string;
  ply: number;
  gsm: number;
  burstingStrength: number;
  defaultAnnualQuantity: number;
  unit: string;
};

export const SKU_CATALOG: CatalogItem[] = [
  { sku: "CP-001", description: "3-ply mailer box 600x400x300", ply: 3, gsm: 300, burstingStrength: 5.2, defaultAnnualQuantity: 15000, unit: "pcs" },
  { sku: "CP-002", description: "3-ply shipping carton 500x350x250", ply: 3, gsm: 320, burstingStrength: 5.4, defaultAnnualQuantity: 18000, unit: "pcs" },
  { sku: "CP-003", description: "5-ply export box 800x600x450", ply: 5, gsm: 420, burstingStrength: 9.8, defaultAnnualQuantity: 22000, unit: "pcs" },
  { sku: "CP-004", description: "5-ply corrugated pad 1200x800x20", ply: 5, gsm: 460, burstingStrength: 11.2, defaultAnnualQuantity: 21000, unit: "pcs" },
  { sku: "CP-005", description: "2-ply tray insert 400x300x150", ply: 2, gsm: 220, burstingStrength: 3.6, defaultAnnualQuantity: 16000, unit: "pcs" },
  { sku: "CP-006", description: "3-ply FEFCO-style die box 650x450x320", ply: 3, gsm: 310, burstingStrength: 5.8, defaultAnnualQuantity: 17000, unit: "pcs" },
  { sku: "CP-007", description: "4-ply heavy carton 750x550x420", ply: 4, gsm: 390, burstingStrength: 8.6, defaultAnnualQuantity: 19000, unit: "pcs" },
  { sku: "CP-008", description: "7-ply display shipper 900x700x500", ply: 7, gsm: 500, burstingStrength: 14.2, defaultAnnualQuantity: 12000, unit: "pcs" },
  { sku: "CP-009", description: "3-ply inner pack 320x220x120", ply: 3, gsm: 280, burstingStrength: 4.4, defaultAnnualQuantity: 26000, unit: "pcs" },
  { sku: "CP-010", description: "2-ply brochure mailer 270x190x40", ply: 2, gsm: 200, burstingStrength: 3.2, defaultAnnualQuantity: 30000, unit: "pcs" },
  { sku: "CP-011", description: "5-ply bottle shipper 520x400x300", ply: 5, gsm: 440, burstingStrength: 10.6, defaultAnnualQuantity: 14000, unit: "pcs" },
  { sku: "CP-012", description: "4-ply telescopic carton 620x420x220", ply: 4, gsm: 360, burstingStrength: 7.8, defaultAnnualQuantity: 16000, unit: "pcs" },
  { sku: "CP-013", description: "3-ply e-commerce box 430x300x180", ply: 3, gsm: 290, burstingStrength: 4.7, defaultAnnualQuantity: 28000, unit: "pcs" },
  { sku: "CP-014", description: "5-ply appliance carton 980x680x540", ply: 5, gsm: 480, burstingStrength: 12.5, defaultAnnualQuantity: 9000, unit: "pcs" },
  { sku: "CP-015", description: "3-ply food tray box 350x260x180", ply: 3, gsm: 270, burstingStrength: 4.1, defaultAnnualQuantity: 24000, unit: "pcs" },
  { sku: "CP-016", description: "4-ply protective sleeve 1100x450x12", ply: 4, gsm: 350, burstingStrength: 7.2, defaultAnnualQuantity: 11000, unit: "pcs" },
  { sku: "CP-017", description: "2-ply folding carton 240x180x90", ply: 2, gsm: 190, burstingStrength: 2.8, defaultAnnualQuantity: 32000, unit: "pcs" },
  { sku: "CP-018", description: "6-ply crate liner 1250x850x30", ply: 6, gsm: 520, burstingStrength: 15.1, defaultAnnualQuantity: 8000, unit: "pcs" },
  { sku: "CP-019", description: "5-ply multi-pack carton 760x520x360", ply: 5, gsm: 430, burstingStrength: 10.1, defaultAnnualQuantity: 15000, unit: "pcs" },
  { sku: "CP-020", description: "3-ply dashboard carton 610x410x210", ply: 3, gsm: 300, burstingStrength: 5.3, defaultAnnualQuantity: 18000, unit: "pcs" },
  { sku: "CP-021", description: "4-ply promotional shipper 680x480x260", ply: 4, gsm: 370, burstingStrength: 8.1, defaultAnnualQuantity: 13000, unit: "pcs" },
  { sku: "CP-022", description: "2-ply retail mailer 400x260x120", ply: 2, gsm: 210, burstingStrength: 3.4, defaultAnnualQuantity: 27000, unit: "pcs" },
  { sku: "CP-023", description: "6-ply pallet wrap box 1300x900x400", ply: 6, gsm: 540, burstingStrength: 15.8, defaultAnnualQuantity: 7000, unit: "pcs" },
  { sku: "CP-024", description: "3-ply shoe carton 440x310x220", ply: 3, gsm: 295, burstingStrength: 4.9, defaultAnnualQuantity: 22000, unit: "pcs" },
  { sku: "CP-025", description: "4-ply art print mailer 520x360x80", ply: 4, gsm: 340, burstingStrength: 6.7, defaultAnnualQuantity: 10000, unit: "pcs" },
  { sku: "CP-026", description: "5-ply fruit tray carton 450x320x230", ply: 5, gsm: 410, burstingStrength: 9.2, defaultAnnualQuantity: 17000, unit: "pcs" },
  { sku: "CP-027", description: "3-ply static-safe box 500x350x260", ply: 3, gsm: 330, burstingStrength: 6.3, defaultAnnualQuantity: 12000, unit: "pcs" },
  { sku: "CP-028", description: "4-ply bakery carton 280x220x160", ply: 4, gsm: 360, burstingStrength: 7.3, defaultAnnualQuantity: 21000, unit: "pcs" },
  { sku: "CP-029", description: "5-ply industrial parts box 860x620x410", ply: 5, gsm: 470, burstingStrength: 11.9, defaultAnnualQuantity: 8500, unit: "pcs" },
  { sku: "CP-030", description: "3-ply medical kit carton 330x220x150", ply: 3, gsm: 315, burstingStrength: 5.7, defaultAnnualQuantity: 12500, unit: "pcs" },
];

export const CATALOG_SKU_SET = new Set(SKU_CATALOG.map((item) => item.sku));

export function getCatalogItem(sku: string): CatalogItem | undefined {
  return SKU_CATALOG.find((item) => item.sku === sku);
}

/**
 * Renders the catalog as a compact text block for LLM prompts.
 * Keep this in every catalog-matching prompt so the model never has to
 * recall SKUs from memory.
 */
export function renderCatalogForPrompt(): string {
  return SKU_CATALOG.map(
    (item) =>
      `${item.sku}: ${item.description} (${item.ply}-ply, ${item.gsm} GSM, default ${item.defaultAnnualQuantity.toLocaleString("en-IN")} ${item.unit}/yr)`,
  ).join("\n");
}