import mammoth from "mammoth";
import * as XLSX from "xlsx";

export type PreparedDocumentKind = "image" | "pdf" | "text-derived";

export type PreparedDocument = {
  documentKind: PreparedDocumentKind;
  mediaType: string;
  contentText: string;
  mediaBase64?: string;
  originalSize: number;
};

const imageTypes = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif", "image/bmp", "image/tiff"]);
const pdfType = "application/pdf";

export function getDocumentKind(fileName: string, mediaType: string): PreparedDocumentKind {
  const extension = fileName.toLowerCase().split(".").pop() ?? "";
  if (mediaType === pdfType || extension === "pdf") return "pdf";
  if (mediaType.startsWith("image/") || imageTypes.has(mediaType)) return "image";
  return "text-derived";
}

export async function prepareDocument(file: File): Promise<PreparedDocument> {
  const mediaType = file.type || "application/octet-stream";
  const documentKind = getDocumentKind(file.name, mediaType);
  const bytes = new Uint8Array(await file.arrayBuffer());

  if (documentKind === "image" || documentKind === "pdf") {
    return {
      documentKind,
      mediaType,
      contentText: "",
      mediaBase64: Buffer.from(bytes).toString("base64"),
      originalSize: file.size,
    };
  }

  const extension = file.name.toLowerCase().split(".").pop() ?? "";
  if (extension === "docx" || mediaType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    const result = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
    return { documentKind, mediaType, contentText: result.value, originalSize: file.size };
  }

  if (["xlsx", "xls", "xlsm"].includes(extension) || mediaType.includes("spreadsheet") || mediaType.includes("excel")) {
    const workbook = XLSX.read(bytes, { type: "array", cellDates: true });
    const contentText = workbook.SheetNames.map((sheetName) => {
      const sheet = workbook.Sheets[sheetName];
      return `SHEET: ${sheetName}\n${XLSX.utils.sheet_to_csv(sheet)}`;
    }).join("\n\n");
    return {
      documentKind,
      mediaType,
      contentText,
      mediaBase64: Buffer.from(bytes).toString("base64"),
      originalSize: file.size,
    };
  }

  return {
    documentKind,
    mediaType,
    contentText: new TextDecoder().decode(bytes),
    originalSize: file.size,
  };
}
