export function qualifySupplier(input: {
  isQualityPass: boolean;
  leadTimeDays: number;
  moqOk: boolean;
  mandatorySpecPass: boolean;
  minRequiredVendors: number;
  sharePercent: number;
}) {
  const reasons: string[] = [];

  if (!input.isQualityPass) reasons.push("Quality questionnaire failed");
  if (!input.mandatorySpecPass) reasons.push("Mandatory specification failed");
  if (!input.moqOk) reasons.push("MOQ not satisfied");
  if (input.leadTimeDays > 14) reasons.push("Lead time exceeds 14-day policy");
  if (input.sharePercent > 70) reasons.push("Vendor share exceeds concentration cap");

  if (reasons.length > 0) {
    return { status: "fails" as const, reasons };
  }

  if (input.minRequiredVendors > 0 && input.sharePercent >= 70) {
    return { status: "review" as const, reasons: ["Share is at the concentration limit"] };
  }

  return { status: "qualified" as const, reasons: [] };
}
