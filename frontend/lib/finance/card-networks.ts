/**
 * Card network definitions, validation, and display formatters for AURA Wealth.
 */

export const CARD_NETWORKS = [
  "Visa",
  "Mastercard",
  "RuPay",
  "American Express",
  "Diners Club",
  "Other",
] as const;

export type CardNetwork = (typeof CARD_NETWORKS)[number];

/**
 * Validates if a string matches one of the supported card networks.
 */
export function isValidCardNetwork(value: unknown): value is CardNetwork {
  return typeof value === "string" && (CARD_NETWORKS as readonly string[]).includes(value);
}

/**
 * Formats the card network for display with a fallback.
 */
export function formatCardNetwork(value?: string | null): string {
  if (!value || !value.trim()) return "Not set";
  return value.trim();
}

/**
 * Formats the cardholder name for display with a fallback.
 */
export function formatCardholderName(
  value?: string | null,
  fallback = "Not set"
): string {
  if (!value || !value.trim()) return fallback;
  return value.trim().toUpperCase();
}

/**
 * Resolves the visual brand monogram identifier for physical card styling.
 * Prioritizes the saved card network, falling back to name/bank text heuristics.
 */
export function resolveCardBrand(
  cardNetwork?: string | null,
  cardName?: string,
  bankName?: string
): "VISA" | "MASTERCARD" | "RUPAY" | "AMEX" | "DINERS" | "OTHER" {
  if (cardNetwork) {
    const net = cardNetwork.toLowerCase();
    if (net.includes("visa")) return "VISA";
    if (net.includes("mastercard")) return "MASTERCARD";
    if (net.includes("rupay")) return "RUPAY";
    if (net.includes("american express") || net.includes("amex")) return "AMEX";
    if (net.includes("diners")) return "DINERS";
    return "OTHER";
  }

  // Fallback heuristic based on card title or bank name
  const text = `${cardName ?? ""} ${bankName ?? ""}`.toLowerCase();
  if (text.includes("rupay")) return "RUPAY";
  if (text.includes("mastercard") || text.includes("master")) return "MASTERCARD";
  if (text.includes("amex") || text.includes("american express")) return "AMEX";
  if (text.includes("diners")) return "DINERS";
  return "VISA";
}
