import { z } from "zod";

export const rfxSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  category: z.string().min(1),
  description: z.string().optional(),
  status: z.enum([
    "DRAFT",
    "READY_FOR_REVIEW",
    "APPROVED",
    "SENT",
    "RESPONSES_RECEIVED",
    "EVALUATION",
    "AWARD_RECOMMENDED",
    "COMPLETED",
  ]),
  currency: z.string().default("INR"),
  max_lead_time_days: z.number().int().nonnegative().optional(),
  max_vendor_share: z.number().nonnegative().optional(),
  minimum_awarded_vendors: z.number().int().nonnegative().optional(),
});

export const lineItemSchema = z.object({
  id: z.string().uuid(),
  rfx_id: z.string().uuid(),
  sku: z.string().min(1),
  description: z.string().optional(),
  ply: z.number().int().positive().optional(),
  gsm: z.number().int().positive().optional(),
  bursting_strength: z.number().nonnegative().optional(),
  bursting_strength_unit: z.string().optional(),
  length_mm: z.number().int().nonnegative().optional(),
  width_mm: z.number().int().nonnegative().optional(),
  height_mm: z.number().int().nonnegative().optional(),
  annual_quantity: z.number().nonnegative().optional(),
  unit: z.string().optional(),
});

export const vendorSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  contact_name: z.string().optional(),
  contact_email: z.string().email().optional(),
  status: z.enum(["ACTIVE", "WATCHLIST", "INACTIVE"]).default("ACTIVE"),
});

export const currentContractPriceSchema = z.object({
  id: z.string().uuid(),
  rfx_id: z.string().uuid(),
  line_item_id: z.string().uuid(),
  price: z.number().nonnegative(),
  unit: z.string().min(1),
  currency: z.string().min(3),
});
