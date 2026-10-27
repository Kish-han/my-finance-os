/**
 * Optional Additional Charges Helper for Loans and Credit Card EMIs
 *
 * Provides validation, extraction, and display helpers for optional upfront
 * or one-time fees (e.g., processing fees, EMI conversion charges, administrative fees).
 *
 * CRITICAL FINANCIAL SAFETY RULE:
 * Additional charges are strictly isolated from reducing-balance loan principal,
 * interest rate calculations, and monthly amortization schedules.
 */

export interface AdditionalChargesResult {
  chargesPaise: number;
  description: string | null;
  hasCharges: boolean;
}

export interface ChargeValidationResult {
  isValid: boolean;
  chargesPaise: number;
  description: string | null;
  errorMessage?: string;
}

const CHARGES_TAG_PREFIX = "<!-- aura:charges:";
const CHARGES_TAG_SUFFIX = " -->";

/**
 * Validates optional additional charges amount and description.
 *
 * Rules:
 * - Empty/whitespace/blank amount is accepted and defaults to 0 paise.
 * - Non-empty amount must be a non-negative decimal with up to 2 decimal places.
 * - Value in paise must be a safe integer >= 0.
 * - Description is optional, max 120 characters after trimming.
 */
export function validateAdditionalCharges(
  chargesRupeesInput: unknown,
  descriptionInput: unknown
): ChargeValidationResult {
  const rawRupees = String(chargesRupeesInput ?? "").trim();
  const rawDesc = String(descriptionInput ?? "").trim();

  // Validate description length
  if (rawDesc.length > 120) {
    return {
      isValid: false,
      chargesPaise: 0,
      description: null,
      errorMessage: "Charge description cannot exceed 120 characters.",
    };
  }

  const description = rawDesc.length > 0 ? rawDesc : null;

  // Empty charges input defaults to 0 paise
  if (rawRupees === "") {
    return {
      isValid: true,
      chargesPaise: 0,
      description,
    };
  }

  // Validate rupee format: non-negative number with optional 1-2 decimal places
  if (!/^\d{1,12}(\.\d{1,2})?$/.test(rawRupees)) {
    return {
      isValid: false,
      chargesPaise: 0,
      description: null,
      errorMessage:
        "Additional charges must be a valid non-negative amount (e.g. 500 or 1250.50).",
    };
  }

  const rupees = Number(rawRupees);
  const paise = Math.round(rupees * 100);

  if (!Number.isFinite(rupees) || !Number.isSafeInteger(paise) || paise < 0) {
    return {
      isValid: false,
      chargesPaise: 0,
      description: null,
      errorMessage: "Additional charges must be a non-negative amount.",
    };
  }

  return {
    isValid: true,
    chargesPaise: paise,
    description,
  };
}

/**
 * Parses embedded charges metadata from a debt's notes string.
 */
export function parseChargesFromNotes(
  notes: string | null | undefined
): { chargesPaise: number; description: string | null } | null {
  if (!notes) return null;

  const startIndex = notes.indexOf(CHARGES_TAG_PREFIX);
  if (startIndex === -1) return null;

  const endIndex = notes.indexOf(
    CHARGES_TAG_SUFFIX,
    startIndex + CHARGES_TAG_PREFIX.length
  );
  if (endIndex === -1) return null;

  const rawJson = notes.slice(
    startIndex + CHARGES_TAG_PREFIX.length,
    endIndex
  );

  try {
    const parsed = JSON.parse(rawJson);
    const paise = Number(parsed.paise);
    const desc =
      typeof parsed.description === "string" && parsed.description.trim()
        ? parsed.description.trim()
        : null;

    if (Number.isFinite(paise) && paise >= 0) {
      return {
        chargesPaise: Math.round(paise),
        description: desc,
      };
    }
  } catch {
    // Malformed JSON ignored
  }

  return null;
}

/**
 * Removes internal charges marker from user-facing notes.
 */
export function stripChargesFromNotes(
  notes: string | null | undefined
): string {
  if (!notes) return "";

  const startIndex = notes.indexOf(CHARGES_TAG_PREFIX);
  if (startIndex === -1) return notes;

  const endIndex = notes.indexOf(
    CHARGES_TAG_SUFFIX,
    startIndex + CHARGES_TAG_PREFIX.length
  );
  if (endIndex === -1) return notes;

  const before = notes.slice(0, startIndex);
  const after = notes.slice(endIndex + CHARGES_TAG_SUFFIX.length);

  return `${before}${after}`.trim();
}

/**
 * Embeds charges metadata into notes if database columns are not yet provisioned.
 * If charges are 0 and description is null, removes existing markers.
 */
export function embedChargesInNotes(
  notes: string | null | undefined,
  chargesPaise: number,
  description: string | null | undefined
): string | null {
  const cleanNotes = stripChargesFromNotes(notes);
  const cleanDesc = description ? description.trim() : null;

  if (chargesPaise <= 0 && !cleanDesc) {
    return cleanNotes.length > 0 ? cleanNotes : null;
  }

  const payload = JSON.stringify({
    paise: chargesPaise,
    description: cleanDesc,
  });

  const marker = `${CHARGES_TAG_PREFIX}${payload}${CHARGES_TAG_SUFFIX}`;

  if (cleanNotes.length === 0) {
    return marker;
  }

  return `${cleanNotes}\n${marker}`;
}

/**
 * Extracts additional charge details from a debt record.
 * Prioritizes first-class database columns; falls back to embedded notes metadata.
 */
export function extractAdditionalCharges(debt: {
  additional_charges_paise?: number | string | null;
  charge_description?: string | null;
  additionalChargesPaise?: number | null;
  chargeDescription?: string | null;
  notes?: string | null;
}): AdditionalChargesResult {
  const rawColPaise =
    debt.additional_charges_paise ?? debt.additionalChargesPaise;
  const colPaise =
    rawColPaise !== undefined && rawColPaise !== null
      ? Number(rawColPaise)
      : null;

  const rawColDesc = debt.charge_description ?? debt.chargeDescription;
  const colDesc =
    typeof rawColDesc === "string" && rawColDesc.trim().length > 0
      ? rawColDesc.trim()
      : null;

  // 1. Column exists and has positive charges or description
  if (colPaise !== null && !Number.isNaN(colPaise)) {
    const validPaise = Math.max(0, Math.round(colPaise));
    if (validPaise > 0 || colDesc !== null) {
      return {
        chargesPaise: validPaise,
        description: colDesc,
        hasCharges: validPaise > 0 || colDesc !== null,
      };
    }
  }

  // 2. Check notes fallback (if database columns were not yet migrated on write)
  if (debt.notes) {
    const parsed = parseChargesFromNotes(debt.notes);
    if (parsed && (parsed.chargesPaise > 0 || parsed.description !== null)) {
      return {
        chargesPaise: parsed.chargesPaise,
        description: parsed.description,
        hasCharges: true,
      };
    }
  }

  return {
    chargesPaise: 0,
    description: null,
    hasCharges: false,
  };
}
