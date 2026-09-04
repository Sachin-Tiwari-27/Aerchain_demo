import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";

import { getDocumentKind, prepareDocument } from "./document-preparation";

test("classifies spreadsheets as text-derived", () => {
  assert.equal(
    getDocumentKind("supplier-quote.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
    "text-derived",
  );
});

test("classifies DOCX and supported text files as text-derived", () => {
  assert.equal(getDocumentKind("supplier-response.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"), "text-derived");
  assert.equal(getDocumentKind("supplier-response.txt", "text/plain"), "text-derived");
  assert.equal(getDocumentKind("supplier-response.csv", "text/csv"), "text-derived");
  assert.equal(getDocumentKind("supplier-response.json", "application/json"), "text-derived");
});

test("converts spreadsheet cells to text without retaining binary image media", async () => {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([["SKU", "Price"], ["CP-001", 12.5]]);
  XLSX.utils.book_append_sheet(workbook, sheet, "Quote");
  const bytes = XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  const file = {
    name: "supplier-quote.xlsx",
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    size: bytes.byteLength,
    arrayBuffer: async () => bytes,
  } as File;

  const prepared = await prepareDocument(file);

  assert.equal(prepared.documentKind, "text-derived");
  assert.equal(prepared.mediaBase64, undefined);
  assert.match(prepared.contentText, /SHEET: Quote/);
  assert.match(prepared.contentText, /CP-001,12.5/);
});

test("extracts text files without retaining binary media", async () => {
  const content = "SKU,Price\nCP-001,12.50";
  const bytes = new TextEncoder().encode(content);
  const file = {
    name: "supplier-quote.csv",
    type: "text/csv",
    size: bytes.byteLength,
    arrayBuffer: async () => bytes.buffer,
  } as File;

  const prepared = await prepareDocument(file);

  assert.equal(prepared.documentKind, "text-derived");
  assert.equal(prepared.contentText, content);
  assert.equal(prepared.mediaBase64, undefined);
});

test("rejects unsupported legacy Word binaries instead of decoding them as text", async () => {
  const bytes = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0]);
  const file = {
    name: "supplier-response.doc",
    type: "application/msword",
    size: bytes.byteLength,
    arrayBuffer: async () => bytes.buffer,
  } as File;

  await assert.rejects(prepareDocument(file), /Legacy \.doc files are not supported/);
});
