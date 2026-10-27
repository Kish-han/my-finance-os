import { describe, it, expect } from "vitest";
import {
  CARD_NETWORKS,
  isValidCardNetwork,
  formatCardNetwork,
  formatCardholderName,
  resolveCardBrand,
} from "./card-networks";

describe("card-networks", () => {
  it("defines the 6 required card networks", () => {
    expect(CARD_NETWORKS).toEqual([
      "Visa",
      "Mastercard",
      "RuPay",
      "American Express",
      "Diners Club",
      "Other",
    ]);
  });

  describe("isValidCardNetwork", () => {
    it("returns true for all supported networks", () => {
      for (const net of CARD_NETWORKS) {
        expect(isValidCardNetwork(net)).toBe(true);
      }
    });

    it("returns false for unsupported or malformed values", () => {
      expect(isValidCardNetwork("Discover")).toBe(false);
      expect(isValidCardNetwork("visa")).toBe(false); // Case sensitive check
      expect(isValidCardNetwork("")).toBe(false);
      expect(isValidCardNetwork(null)).toBe(false);
      expect(isValidCardNetwork(undefined)).toBe(false);
      expect(isValidCardNetwork(123)).toBe(false);
    });
  });

  describe("formatCardNetwork", () => {
    it("formats network cleanly", () => {
      expect(formatCardNetwork("Visa")).toBe("Visa");
      expect(formatCardNetwork("  Mastercard  ")).toBe("Mastercard");
    });

    it("falls back to 'Not set' when empty or absent", () => {
      expect(formatCardNetwork(null)).toBe("Not set");
      expect(formatCardNetwork(undefined)).toBe("Not set");
      expect(formatCardNetwork("   ")).toBe("Not set");
    });
  });

  describe("formatCardholderName", () => {
    it("formats cardholder name in uppercase", () => {
      expect(formatCardholderName("Kishan Prasad")).toBe("KISHAN PRASAD");
      expect(formatCardholderName("  aditya verma  ")).toBe("ADITYA VERMA");
    });

    it("falls back to custom fallback or 'Not set' when empty", () => {
      expect(formatCardholderName(null)).toBe("Not set");
      expect(formatCardholderName("   ")).toBe("Not set");
      expect(formatCardholderName(undefined, "PRIVATE CLIENT")).toBe("PRIVATE CLIENT");
    });
  });

  describe("resolveCardBrand", () => {
    it("resolves explicitly saved network", () => {
      expect(resolveCardBrand("Visa")).toBe("VISA");
      expect(resolveCardBrand("Mastercard")).toBe("MASTERCARD");
      expect(resolveCardBrand("RuPay")).toBe("RUPAY");
      expect(resolveCardBrand("American Express")).toBe("AMEX");
      expect(resolveCardBrand("Diners Club")).toBe("DINERS");
      expect(resolveCardBrand("Other")).toBe("OTHER");
    });

    it("falls back to card name and bank name text heuristic when network is not set", () => {
      expect(resolveCardBrand(null, "Tata Neu RuPay Card", "HDFC Bank")).toBe("RUPAY");
      expect(resolveCardBrand(null, "World Safari Master Card", "RBL Bank")).toBe("MASTERCARD");
      expect(resolveCardBrand(null, "Membership Rewards Amex", "American Express")).toBe("AMEX");
      expect(resolveCardBrand(null, "Diners Club Black", "HDFC Bank")).toBe("DINERS");
      expect(resolveCardBrand(null, "Sapphiro Card", "ICICI Bank")).toBe("VISA");
    });
  });
});
