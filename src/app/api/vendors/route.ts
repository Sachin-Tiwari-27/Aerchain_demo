import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

/**
 * Returns the vendor list used by the invite timeline and any other surface
 * that needs to display who will be invited. Falls back to the seeded fixture
 * list when the DB is empty so the demo still works.
 */
export async function GET() {
  if (!supabase) {
    return NextResponse.json({ success: true, vendors: fallbackVendors() });
  }

  try {
    const { data, error } = await supabase
      .from("vendors")
      .select("id, name, contact_name, contact_email")
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);

    const vendors = (data ?? []).filter((v) => v.id && v.name);
    return NextResponse.json({ success: true, vendors: vendors.length > 0 ? vendors : fallbackVendors() });
  } catch (err) {
    return NextResponse.json({
      success: true,
      vendors: fallbackVendors(),
      warning: err instanceof Error ? err.message : "vendors fetch failed",
    });
  }
}

function fallbackVendors() {
  return [
    { id: "karnavati", name: "Karnavati Packaging", contact_name: "Aisha Mehta", contact_email: "aisha@karnavatipackaging.in" },
    { id: "apex", name: "Apex Corrugates", contact_name: "Rohit Nair", contact_email: "rohit@apexcorrugates.in" },
    { id: "maharashtra", name: "Maharashtra BoxWorks", contact_name: "Neha Shah", contact_email: "neha@maharashtraboxworks.in" },
    { id: "bharat", name: "Bharat Carton Group", contact_name: "Vikram Iyer", contact_email: "vikram@bharatcarton.in" },
    { id: "punjab", name: "Punjab Fibre Solutions", contact_name: "Simran Kaur", contact_email: "simran@punjabfibre.in" },
  ];
}