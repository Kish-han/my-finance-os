export type UserMetadataLike = {
  display_name?: unknown;
  full_name?: unknown;
  name?: unknown;
  [key: string]: unknown;
};

export type UserLike = {
  email?: string | null;
  user_metadata?: UserMetadataLike | null;
  claims?: {
    email?: string | null;
    user_metadata?: UserMetadataLike | null;
    [key: string]: unknown;
  } | null;
};

/**
 * Resolves the friendly display name for a user.
 * Priority:
 * 1. user.user_metadata.display_name (trimmed)
 * 2. user.user_metadata.full_name (trimmed)
 * 3. user.user_metadata.name (trimmed)
 * 4. user.claims.user_metadata.display_name (trimmed)
 * 5. user.claims.user_metadata.full_name / name (trimmed)
 * 6. Email local part (e.g. "kishan" from "kishan@example.com")
 * 7. Fallback to "User"
 */
export function resolveDisplayName(user?: UserLike | null): string {
  if (!user) return "User";

  const metadata = user.user_metadata ?? user.claims?.user_metadata;

  if (metadata) {
    if (typeof metadata.display_name === "string" && metadata.display_name.trim().length > 0) {
      return metadata.display_name.trim();
    }
    if (typeof metadata.full_name === "string" && metadata.full_name.trim().length > 0) {
      return metadata.full_name.trim();
    }
    if (typeof metadata.name === "string" && metadata.name.trim().length > 0) {
      return metadata.name.trim();
    }
  }

  const email = user.email ?? user.claims?.email;
  if (typeof email === "string" && email.includes("@")) {
    const localPart = email.split("@")[0].trim();
    if (localPart.length > 0) {
      return localPart;
    }
  }

  return "User";
}

/**
 * Formats a display name suitable for physical/embossed credit cards.
 * Returns uppercase string, trimmed, fallback to "PRIVATE CLIENT".
 */
export function resolveCardholderName(user?: UserLike | null): string {
  const name = resolveDisplayName(user);
  if (!name || name === "User") return "PRIVATE CLIENT";
  return name.toUpperCase();
}

/**
 * Validates a display name candidate.
 * Returns an error string if invalid, or null if valid.
 */
export function validateDisplayName(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) {
    return "Display name cannot be blank.";
  }
  if (trimmed.length < 2) {
    return "Display name must be at least 2 characters long.";
  }
  if (trimmed.length > 50) {
    return "Display name cannot exceed 50 characters.";
  }
  return null;
}
