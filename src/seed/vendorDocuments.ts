/**
 * Seed vendor documents with realistic messy data
 * per PRD Section 5
 */

export const vendorDocuments = {
  vendorA: {
    filename: "Vendor_A_Quote_2024.txt",
    fileType: "text/plain",
    content: `VENDOR A - QUOTATION FOR CORRUGATED PACKAGING
RFx ID: CP-2024-Q4
Date: 2024-09-01

PRICING SCHEDULE (Valid for 12 months from acceptance)

SKU,Description,Ply,GSM,BS,Qty/Year,Price/Piece,Unit,Currency
CP-001,Small D2C Shipping Box,3,120,16,120000,₹8.50,piece,INR
CP-002,Medium D2C Shipping Box,3,120,20,95000,₹12.75,piece,INR
CP-003,Large D2C Shipping Box,3,120,24,78000,₹16.00,piece,INR
CP-004,Small 5-Ply Export Box,5,150,32,42000,₹15.25,piece,INR
CP-005,Medium 5-Ply Export Box,5,150,40,58000,₹21.50,piece,INR
CP-006,Large 5-Ply Export Box,5,150,48,36000,₹28.75,piece,INR
CP-007,Produce Crate,3,135,22,145000,₹9.00,piece,INR
CP-008,Heavy-Duty Box,5,180,50,24000,₹32.00,piece,INR
CP-009,Cold-Chain Outer Box,5,170,45,18000,₹29.50,piece,INR
CP-010,E-Commerce Return Box,3,110,14,67000,₹7.25,piece,INR
CP-011,Divider Strip,2,80,8,380000,₹1.50,piece,INR
CP-012,Protective Insert,1,70,5,220000,₹0.95,piece,INR
CP-013,Small Shipping Box (White),3,120,16,55000,₹9.00,piece,INR
CP-014,Medium Shipping Box (White),3,120,20,42000,₹13.50,piece,INR
CP-015,Large Shipping Box (White),3,120,24,38000,₹17.00,piece,INR
CP-016,Premium Export Box 5-Ply,5,160,35,28000,₹24.00,piece,INR
CP-017,Reinforced/Export Grade,5,180,52,15000,₹35.50,piece,INR
CP-018,Fold Carton (RSC),3,125,18,92000,₹10.75,piece,INR
CP-019,Custom Print Box (3-ply),3,120,16,48000,₹11.50,piece,INR
CP-020,Custom Print Box (5-ply),5,150,40,32000,₹25.75,piece,INR
CP-021,Retail Mailer Box,2,110,12,156000,₹3.50,piece,INR
CP-022,Bulk Transport Box,5,180,50,22000,₹34.00,piece,INR
CP-023,Stacked Tray,3,130,20,110000,₹8.50,piece,INR
CP-024,Nested Tray,3,130,20,98000,₹9.25,piece,INR
CP-025,Full Partition Box,5,160,36,44000,₹26.50,piece,INR
CP-026,Half Partition Box,5,160,36,36000,₹20.00,piece,INR
CP-027,Economy Return Box,3,100,12,85000,₹6.50,piece,INR
CP-028,Premium Return Box,3,125,18,62000,₹8.75,piece,INR
CP-029,Corrugated Wrap,2,80,8,420000,₹0.85,piece,INR
CP-030,Edge Protector,2,70,6,310000,₹1.25,piece,INR

QUESTIONNAIRE RESPONSES:
1. Quality certifications: ISO 9001:2015, ISO 14001:2015
2. Lead time for standard orders: 10 days
3. Lead time for rush orders (premium): 5 days
4. Minimum order quantity: 5,000 pieces per SKU
5. Payment terms: 30 days NET, 2% discount for 15-day payment
6. Environmental compliance: FSC certified, water-based inks
7. Customization capacity: Yes, up to 5 colors, setup fee ₹15,000
8. Freight included: FOB our facility (Pune)
9. Price lock period: 12 months
10. References: Three existing customers can be provided

NOTES:
All prices are ex-works from our Pune facility. Freight at actual cost (typically ₹0.80-₹1.20 per kg).
Quality guaranteed per IS 5155 specifications.
This quotation is valid for 60 days from the date above.
`,
    vendor: "Vendor A",
    archetype: "clean",
  },
  vendorB: {
    filename: "Vendor_B_Response.txt",
    fileType: "text/plain",
    content: `VENDOR B - QUOTE RESPONSE

Quote prepared for: CP-2024-Q4
Responding vendor: Vendor B (Gujarat Operations)

PARTIAL QUOTATION - 24 of 30 SKUs quoted below:

Item | SKU | Description | Qty/Year | Price | Unit | Notes
1 | CP-001 | Small D2C Box | 120000 | 8.75 | piece/INR | Standard quality
2 | CP-002 | Medium D2C Box | 95000 | 13.00 | piece/INR | Standard quality
3 | CP-003 | Large D2C Box | 78000 | 16.50 | piece/INR | Stock item
4 | CP-004 | Small 5-Ply Export | 42000 | 15.75 | piece/INR | Available
5 | CP-005 | Medium 5-Ply Export | 58000 | 22.00 | piece/INR | Lead time 7 days
6 | CP-006 | Large 5-Ply Export | 36000 | 29.50 | piece/INR | Custom order
7 | CP-007 | Produce Crate | 145000 | 9.50 | piece/INR | Fast supplier
8 | CP-008 | Heavy-Duty Box | 24000 | 33.00 | piece/INR | 14-day lead time
9 | CP-009 | Cold-Chain Box | 18000 | 30.50 | piece/INR | Insulation lining available
10 | CP-010 | E-Commerce Return | 67000 | 7.50 | piece/INR | We like this one
11 | CP-011 | Divider Strip | 380000 | 1.60 | piece/INR | Good supply
12 | CP-013 | Small Shipping (White) | 55000 | 9.25 | piece/INR | Premium paper
13 | CP-014 | Medium Shipping (White) | 42000 | 14.00 | piece/INR | New design
14 | CP-015 | Large Shipping (White) | 38000 | 17.50 | piece/INR | Discounted for volume
15 | CP-016 | Premium Export 5-Ply | 28000 | 24.50 | piece/INR | Best quality
16 | CP-017 | Reinforced/Export Grade | 15000 | 36.25 | piece/INR | Heavy duty, 14-day lead
17 | CP-018 | Fold Carton (RSC) | 92000 | 11.00 | piece/INR | Quick ship
18 | CP-019 | Custom Print 3-ply | 48000 | 12.00 | piece/INR | Printing included
19 | CP-020 | Custom Print 5-ply | 32000 | 26.50 | piece/INR | Full color available
20 | CP-021 | Retail Mailer Box | 156000 | 3.75 | piece/INR | Bulk friendly
21 | CP-022 | Bulk Transport Box | 22000 | 35.00 | piece/INR | Strong supplier
22 | CP-023 | Stacked Tray | 110000 | 8.75 | piece/INR | Good value
23 | CP-024 | Nested Tray | 98000 | 9.75 | piece/INR | Also stocked
24 | CP-025 | Full Partition Box | 44000 | 27.00 | piece/INR | Customizable

ITEMS NOT QUOTED:
- CP-012 (Protective Insert) - We can substitute with 3-ply variant instead of 1-ply (PROBLEM ITEM)
- CP-026 (Half Partition Box) - Out of scope, recommend full partition instead
- CP-027 (Economy Return Box) - Discontinued, recommend CP-010 instead
- CP-028 (Premium Return Box) - Can quote if minimum order 10,000 units
- CP-029 (Corrugated Wrap) - Not our specialty, refer to packaging specialists
- CP-030 (Edge Protector) - Minimum order 50,000 units

QUESTIONNAIRE (brief answers):
Q1: ISO 9001 certified, working on 14001
Q2: Standard lead: 12 days, Rush: 6 days
Q3: MOQ: 8,000-10,000 by item
Q4: Payment: 45 days standard, 2.5% for 30-day settlement
Q5: Customization available for orders >15,000 units
Q6: Freight: DDP available at 3% upcharge, or FOB Ahmedabad

NOTE: Pricing is ex-works. Valid for 30 days. We understand you're with A now but we think
we can offer better value. IMPORTANT: Our CP-012 substitute is 3-ply minimum, may not meet
your quality requirements if you specifically need 1-ply. Worth discussion.
`,
    vendor: "Vendor B",
    archetype: "qualified-with-exception",
  },
  vendorC: {
    filename: "Vendor_C_Proposal.txt",
    fileType: "text/plain",
    content: `VENDOR C - PROPOSAL FOR RFQ CP-2024-Q4

Dear Procurement Team,

Thank you for the opportunity to quote. We have reviewed your requirements and can provide
competitive pricing for most SKUs. Please note our response includes some conditional terms.

EXECUTIVE SUMMARY:
We can supply approximately 28 of your 30 SKUs at highly competitive rates. Our value
proposition is built on volume discounts and long-term partnerships. We also offer a conditional
3% rebate if your volume meets or exceeds projected demand by 5%.

PRICING TABLE:
The following pricing assumes an annual commitment and incorporates a base 2% discount for
advance payment arrangements.

SKU,Description,Price per Unit,Currency,Quantity/Year,Notes
CP-001,Small D2C Box,₹8.25,INR,120000,Standard stock item
CP-002,Medium D2C Box,₹12.50,INR,95000,Fast turnaround
CP-003,Large D2C Box,₹15.75,INR,78000,Reliable supply
CP-004,Small 5-Ply Export,₹14.75,INR,42000,Premium grade
CP-005,Medium 5-Ply Export,₹21.00,INR,58000,Popular item
CP-006,Large 5-Ply Export,₹27.75,INR,36000,Specialty item
CP-007,Produce Crate,₹8.75,INR,145000,Best sellers
CP-008,Heavy-Duty Box,₹31.50,INR,24000,Subject to SLA (see below)
CP-009,Cold-Chain Box,₹29.00,INR,18000,Subject to SLA (see below)
CP-010,E-Commerce Return,₹7.00,INR,67000,Stock item
CP-011,Divider Strip,₹1.45,INR,380000,Bulk commodity
CP-012,Protective Insert,₹0.90,INR,220000,Lowest cost option
CP-013,Small Shipping White,₹8.80,INR,55000,Premium paper grade
CP-014,Medium Shipping White,₹13.25,INR,42000,Premium paper grade
CP-015,Large Shipping White,₹16.50,INR,38000,Premium paper grade
CP-016,Premium Export 5-Ply,₹23.50,INR,28000,Top quality
CP-017,Reinforced/Export,₹35.00,INR,15000,Maximum durability
CP-018,Fold Carton RSC,₹10.50,INR,92000,Quick ship
CP-019,Custom Print 3-ply,₹11.75,INR,48000,Printing costs included
CP-020,Custom Print 5-ply,₹25.50,INR,32000,Full color included
CP-021,Retail Mailer,₹3.25,INR,156000,Economy option
CP-022,Bulk Transport,₹33.75,INR,22000,Heavy supply
CP-023,Stacked Tray,₹8.25,INR,110000,Stock item
CP-024,Nested Tray,₹9.00,INR,98000,Stock item
CP-025,Full Partition,₹26.00,INR,44000,Customizable
CP-026,Half Partition,₹19.50,INR,36000,Also available
CP-027,Economy Return,₹6.25,INR,85000,Budget option
CP-028,Premium Return,₹8.50,INR,62000,Premium finish

ITEMS WITH CONDITIONAL SLA:
CP-008 and CP-009 are subject to raw-paper availability. Standard lead time is 12 days,
but if market conditions tighten, lead time may extend to 18-21 days. We will communicate
any delays within 48 hours of order placement.

REBATE STRUCTURE:
We offer a 3% rebate on total annual invoice value IF your actual volume meets or exceeds
95% of the projected quantities listed above. This rebate will be processed quarterly.

QUESTIONNAIRE RESPONSES:
1. Quality certifications: ISO 9001 (renewed annually)
2. Lead time: Standard 12 days, Rush 6 days at 8% premium
3. Minimum order: 3,000 units per SKU
4. Payment: Net 30, or Net 15 with 1.5% discount
5. Customization: Yes, for orders >10,000 units
6. Environmental: We use 60% recycled fiber, FSC working toward certification
7. Freight: FOB Mumbai warehouse or DDP negotiable on volumes >100 tons/month
8. Any other offerings: We can provide dedicated account management and quarterly business reviews

COMMITMENT:
We are eager to partner with you and believe our combination of pricing, service, and
reliability makes us the right choice for a long-term partnership.

Best regards,
Vendor C Sales Team
`,
    vendor: "Vendor C",
    archetype: "conditional",
  },
  vendorD: {
    filename: "Vendor_D_Quote.txt",
    fileType: "text/plain",
    content: `VENDOR D - PRICING QUOTE

RFQ: CP-2024-Q4
Prepared: 2024-09-02
Valid until: 2024-10-02

VENDOR D operates across India with warehouses in Delhi, Mumbai, Bangalore. Pricing below is variable by region.

PRICING:
Most of our pricing is per kilogram, not per piece. This is because we sell by weight and then cut/fold per your specs.

Standard items:
- 3-ply corrugated: ₹42/kg
- 5-ply corrugated: ₹65/kg
- 2-ply lightweight: ₹28/kg

Some items are quoted per unit in mixed currencies:
CP-001 (Small D2C Box): $0.28/unit (approx ₹23/unit based on current rate, but varies)
CP-002 (Medium D2C Box): $0.38/unit (approx ₹31.50/unit)
CP-003 (Large D2C Box): $0.46/unit (approx ₹38.50/unit)
CP-007 (Produce Crate): ₹1,850/100 pieces
CP-008 (Heavy-Duty): ₹2,200/100 pieces (variable, depends on freight)
CP-010 (Return Box): ₹750/100 pieces or $0.10/piece

FREIGHT:
Freight is typically NOT included. Freight charges are:
- Local delivery (Delhi/NCR): ₹0.50/kg
- Pan-India delivery: ₹1.00-₹1.50/kg
- OR we can add ₹8,000/truckload if you consolidate

We also quote some items as:
CP-011 (Dividers): ₹14,500 per 10,000 pieces
CP-021 (Retail Mailer): ₹52,000 per 15,000 pieces

QUESTIONNAIRE:
- Lead time: 8-10 days for stock items
- For custom specs: 14-21 days
- MOQ: Flexible, 2,000-5,000 by item
- Payment: 15 days NET, no discount for early payment (cash upfront for new customers)
- Certifications: ISO 9001 in process (expected by Dec 2024)
- Environmental: We recycle scrap, no formal FSC yet
- Customization: Yes, but higher setup costs (₹10,000-₹25,000 depending on print/die)
- Freight: As noted above, separate line item

NOTES:
Our prices are the lowest in the market, but require careful logistics coordination because
of the mix of weight-based and unit-based pricing. We can negotiate volume discounts for
orders >150 tons/year. We have supplied to 3-4 similar companies in Bangalore; references available.

No long-term price lock available; prices may adjust quarterly based on fiber cost index.

Contact: sales@vendor-d.in for clarifications.
`,
    vendor: "Vendor D",
    archetype: "mixed-units-currencies",
  },
  vendorE: {
    filename: "Vendor_E_Price_Sheet.png",
    fileType: "image/png",
    content: `[IMAGE TRANSCRIPTION - This would be a scanned/photographed price sheet]

VENDOR E - QUOTATION (SCAN OF HANDWRITTEN & PRINTED SHEET)

RFQ CP-2024-Q4 | Date: Sept 3, 2024

CORRUGATED PACKAGING PRICING:

3-Ply Boxes (20-30 GSM):
  Small D2C   ₹8.80/pc
  Medium D2C  ₹13.20/pc
  Large D2C   ₹16.80/pc

5-Ply Boxes (40-50 GSM):
  Small Export    ₹16.00/pc
  Medium Export   ₹22.40/pc
  Large Export    ₹29.60/pc

Specialty Items:
  Produce Crate   ₹9.20/pc
  Heavy-Duty Box  ₹32.50/pc [HANDWRITTEN NOTE: "30-day lead time, best quality"]
  Cold-Chain      ₹30.00/pc [HANDWRITTEN: "requires advance notice"]
  Return Box      ₹7.50/pc
  Dividers (1000 pcs) ₹1,450
  Inserts (1000 pcs)  ₹950

Trays & Custom:
  Stacked Tray    ₹8.80/pc
  Nested Tray     ₹9.50/pc
  Partition Boxes ₹26.50/pc (full), ₹20.00/pc (half)
  Economy Return  ₹6.80/pc
  Premium Return  ₹9.00/pc
  Mailer Box      ₹3.50/pc
  Edge Protect.   ₹1.30/pc

FREIGHT:
  Freight ₹8,000/truckload (20 tons capacity) or ₹0.80/kg for smaller lots
  [HANDWRITTEN: "Rush delivery premium +15%"]

LEAD TIME:
  **30 DAYS MINIMUM FOR MOST ITEMS** [in red ink]
  Standard supply: 4-5 weeks
  Rush (with 15% premium): 2-3 weeks max
  Heavy-Duty & Cold-Chain: 30 days minimum, possibly longer

QUESTIONNAIRE:
  Q1: ISO 9001, ISO 14001 certified
  Q2: Lead time: See above (30 days is our standard)
  Q3: MOQ: Flexible, typically 5,000 units per item
  Q4: Payment: 60 days NET with 1% discount for 30-day
  Q5: Customization: Available with 4-week lead time
  Q6: Freight: See above
  Q7: Environmental: 70% recycled content, working on FSC

SPECIAL NOTES:
  - We are a newer supplier, established 2022
  - Quality is excellent per our test certificates (available)
  - Minimum annual commitment ₹10 lakh preferred
  - We can match competitor pricing if shown the quote [HANDWRITTEN: "negotiate"]
  - Warranty: 6 months on manufacturing defects

Contact: +91-98765-43210 (call or WhatsApp for best response)
`,
    vendor: "Vendor E",
    archetype: "image-messy-lead-time",
  },
};

export async function seedVendorDocuments(rfxId: string, vendorIds: Record<string, string>) {
  /**
   * This is a reference for seeding vendor documents.
   * In production, documents would be uploaded by vendors.
   * For the prototype, we use these templates as content for extraction tests.
   */
  return Object.entries(vendorDocuments).map(([key, doc]) => ({
    rfxId,
    vendorId: vendorIds[doc.vendor.toLowerCase().replace(" ", "")] || "",
    filename: doc.filename,
    fileType: doc.fileType,
    content: doc.content,
    vendor: doc.vendor,
    archetype: doc.archetype,
  }));
}
