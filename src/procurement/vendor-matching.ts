export interface VendorMatchInput {
  id: string;
  name: string;
}

export interface VendorMatchSuggestion {
  vendorId: string | null;
  confidence: "high" | "low" | "none";
  reason: string;
}

/**
 * Normalises a string the same way the seed script builds its lookup keys:
 * lowercased, then all whitespace/punctuation that could separate words
 * stripped. Used for substring containment checks.
 */
export function normaliseKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[^a-z0-9]+/g, "");
}

/**
 * Suggests a vendor from a filename using substring match against vendor
 * names. Always returns the highest-confidence match; if nothing matches
 * confidently, returns `vendorId: null` so the UI can prompt the user to
 * pick one manually.
 *
 * Rules:
 *   1. Normalise both filename and vendor name to a single alphanumeric key.
 *   2. If a vendor key is fully contained in the filename key, high confidence.
 *   3. Else if the longest shared substring is at least 4 chars, low confidence.
 *   4. Else no match.
 */
export function suggestVendorFromFilename(
  filename: string,
  vendors: VendorMatchInput[],
): VendorMatchSuggestion {
  if (!filename || vendors.length === 0) {
    return { vendorId: null, confidence: "none", reason: "No vendors available" };
  }

  const fileKey = normaliseKey(filename);
  if (fileKey.length === 0) {
    return { vendorId: null, confidence: "none", reason: "Filename is empty after normalisation" };
  }

  let high: { vendor: VendorMatchInput; reason: string } | null = null;
  let bestSubstring: { vendor: VendorMatchInput; length: number; reason: string } | null = null;

  for (const vendor of vendors) {
    const vendorKey = normaliseKey(vendor.name);
    if (!vendorKey) continue;

    if (fileKey.includes(vendorKey)) {
      high = {
        vendor,
        reason: `Filename contains '${vendor.name}'`,
      };
      break;
    }

    const sharedLength = longestSharedSubstringLength(fileKey, vendorKey);
    if (sharedLength >= 4 && (!bestSubstring || sharedLength > bestSubstring.length)) {
      bestSubstring = {
        vendor,
        length: sharedLength,
        reason: `Filename partially matches '${vendor.name}' — please confirm`,
      };
    }
  }

  if (high) {
    return { vendorId: high.vendor.id, confidence: "high", reason: high.reason };
  }

  if (bestSubstring) {
    return { vendorId: bestSubstring.vendor.id, confidence: "low", reason: bestSubstring.reason };
  }

  return { vendorId: null, confidence: "none", reason: "No vendor name detected in filename" };
}

/** Longest contiguous shared substring between two strings. O(n*m) but fine for short inputs. */
function longestSharedSubstringLength(a: string, b: string): number {
  const n = a.length;
  const m = b.length;
  if (n === 0 || m === 0) return 0;

  let best = 0;
  let current = 0;
  for (let i = 0; i < n; i++) {
    current = 0;
    for (let j = 0; j < m; j++) {
      if (a[i] === b[j]) {
        current++;
        if (current > best) best = current;
      } else {
        current = 0;
      }
    }
  }
  return best;
}