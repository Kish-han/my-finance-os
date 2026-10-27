import { describe, expect, it } from "vitest";
import {
  resolveDisplayName,
  resolveCardholderName,
  validateDisplayName,
} from "./user-display";

describe("User display name resolution", () => {
  it("prefers display_name from user_metadata", () => {
    const user = {
      email: "kishan@example.com",
      user_metadata: {
        display_name: "Kishan Prasad",
      },
    };
    expect(resolveDisplayName(user)).toBe("Kishan Prasad");
  });

  it("trims surrounding whitespace from display_name", () => {
    const user = {
      email: "kishan@example.com",
      user_metadata: {
        display_name: "  Kishan Prasad  ",
      },
    };
    expect(resolveDisplayName(user)).toBe("Kishan Prasad");
  });

  it("falls back to full_name or name if display_name is not set", () => {
    const userWithFullName = {
      email: "alex@example.com",
      user_metadata: {
        full_name: "Alexander Hamilton",
      },
    };
    expect(resolveDisplayName(userWithFullName)).toBe("Alexander Hamilton");

    const userWithName = {
      email: "eliza@example.com",
      user_metadata: {
        name: "Elizabeth Schuyler",
      },
    };
    expect(resolveDisplayName(userWithName)).toBe("Elizabeth Schuyler");
  });

  it("falls back to claims metadata if root user_metadata is empty", () => {
    const user = {
      claims: {
        email: "morgan@example.com",
        user_metadata: {
          display_name: "J.P. Morgan",
        },
      },
    };
    expect(resolveDisplayName(user)).toBe("J.P. Morgan");
  });

  it("falls back to email local part if metadata has no name", () => {
    const userWithEmptyMeta = {
      email: "kishan.dev@example.com",
      user_metadata: {},
    };
    expect(resolveDisplayName(userWithEmptyMeta)).toBe("kishan.dev");

    const userWithoutMeta = {
      email: "investor99@fintech.io",
    };
    expect(resolveDisplayName(userWithoutMeta)).toBe("investor99");
  });

  it("returns fallback User if user or email is null/undefined", () => {
    expect(resolveDisplayName(null)).toBe("User");
    expect(resolveDisplayName(undefined)).toBe("User");
    expect(resolveDisplayName({ email: "" })).toBe("User");
  });

  it("formats cardholder name in uppercase", () => {
    const user = {
      email: "julian@bank.com",
      user_metadata: {
        display_name: "Julian Althorp",
      },
    };
    expect(resolveCardholderName(user)).toBe("JULIAN ALTHORP");
  });

  it("falls back to PRIVATE CLIENT for empty/generic cardholder name", () => {
    expect(resolveCardholderName(null)).toBe("PRIVATE CLIENT");
    expect(resolveCardholderName({ email: "" })).toBe("PRIVATE CLIENT");
  });
});

describe("Display name validation", () => {
  it("rejects blank or whitespace-only names", () => {
    expect(validateDisplayName("")).toBe("Display name cannot be blank.");
    expect(validateDisplayName("   ")).toBe("Display name cannot be blank.");
  });

  it("rejects names shorter than 2 characters", () => {
    expect(validateDisplayName("a")).toBe(
      "Display name must be at least 2 characters long."
    );
  });

  it("rejects names longer than 50 characters", () => {
    const longName = "A".repeat(51);
    expect(validateDisplayName(longName)).toBe(
      "Display name cannot exceed 50 characters."
    );
  });

  it("accepts valid display names", () => {
    expect(validateDisplayName("Kishan")).toBeNull();
    expect(validateDisplayName("Kishan Prasad")).toBeNull();
    expect(validateDisplayName("  Alexander H.  ")).toBeNull();
  });
});
