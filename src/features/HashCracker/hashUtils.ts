export type HashAlgorithm = "SHA-1" | "SHA-256" | "SHA-384" | "SHA-512";

export type RecoveryAlgorithm = HashAlgorithm | "auto";

export interface HashFormatHint {
  name: string;
  confidence: "high" | "medium";
  note: string;
}

const HEX_REGEX = /^[a-f0-9]+$/i;

function toHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function hashText(input: string, algorithm: HashAlgorithm): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest(algorithm, data);
  return toHex(digest);
}

export function normalizeHash(input: string): string {
  return input.trim().toLowerCase();
}

export function detectHashFormats(input: string): HashFormatHint[] {
  const value = normalizeHash(input);
  if (!value) {
    return [];
  }

  const hints: HashFormatHint[] = [];

  if (HEX_REGEX.test(value)) {
    if (value.length === 32) {
      hints.push({
        name: "MD5",
        confidence: "high",
        note: "32-character hexadecimal hash.",
      });
    }
    if (value.length === 40) {
      hints.push({
        name: "SHA-1",
        confidence: "high",
        note: "40-character hexadecimal hash.",
      });
    }
    if (value.length === 56) {
      hints.push({
        name: "SHA-224",
        confidence: "medium",
        note: "56-character hexadecimal hash.",
      });
    }
    if (value.length === 64) {
      hints.push({
        name: "SHA-256",
        confidence: "high",
        note: "64-character hexadecimal hash.",
      });
    }
    if (value.length === 96) {
      hints.push({
        name: "SHA-384",
        confidence: "high",
        note: "96-character hexadecimal hash.",
      });
    }
    if (value.length === 128) {
      hints.push({
        name: "SHA-512",
        confidence: "high",
        note: "128-character hexadecimal hash.",
      });
    }
  }

  if (/^\$2[abxy]?\$\d{2}\$/.test(value)) {
    hints.push({
      name: "bcrypt",
      confidence: "high",
      note: "Looks like bcrypt format with work factor prefix.",
    });
  }

  if (/^\$argon2(id|i|d)\$/.test(value)) {
    hints.push({
      name: "Argon2",
      confidence: "high",
      note: "Argon2 encoded hash string.",
    });
  }

  return hints;
}

export function resolveRecoveryAlgorithm(
  selected: RecoveryAlgorithm,
  targetHash: string,
): HashAlgorithm | null {
  if (selected !== "auto") {
    return selected;
  }

  const normalized = normalizeHash(targetHash);
  if (!HEX_REGEX.test(normalized)) {
    return null;
  }

  if (normalized.length === 40) {
    return "SHA-1";
  }
  if (normalized.length === 64) {
    return "SHA-256";
  }
  if (normalized.length === 96) {
    return "SHA-384";
  }
  if (normalized.length === 128) {
    return "SHA-512";
  }

  return null;
}
