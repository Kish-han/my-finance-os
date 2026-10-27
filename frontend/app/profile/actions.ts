"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { validateDisplayName } from "@/lib/auth/user-display";

export type ProfileActionResult = {
  success: boolean;
  message?: string;
  error?: string;
  displayName?: string;
  pendingEmail?: string;
};

/**
 * Updates the user's display name stored in Supabase Auth user_metadata.
 */
export async function updateDisplayNameAction(
  formData: FormData
): Promise<ProfileActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      success: false,
      error: "Authentication required. Please sign in again.",
    };
  }

  const rawName = String(formData.get("displayName") ?? "");
  const validationError = validateDisplayName(rawName);
  if (validationError) {
    return {
      success: false,
      error: validationError,
    };
  }

  const trimmedName = rawName.trim();

  const { error: updateError } = await supabase.auth.updateUser({
    data: {
      ...user.user_metadata,
      display_name: trimmedName,
    },
  });

  if (updateError) {
    return {
      success: false,
      error: updateError.message || "Failed to update display name.",
    };
  }

  // Refresh active session so any decoded JWT tokens reflect the updated metadata
  try {
    await supabase.auth.refreshSession();
  } catch {
    // Non-fatal if session refresh fails
  }

  revalidatePath("/", "layout");
  revalidatePath("/profile");

  return {
    success: true,
    message: "Display name updated successfully.",
    displayName: trimmedName,
  };
}

/**
 * Requests an email change through Supabase Auth.
 * Supabase handles sending verification links to confirm the change.
 */
export async function requestEmailChangeAction(
  formData: FormData
): Promise<ProfileActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user || !user.email) {
    return {
      success: false,
      error: "Authentication required. Please sign in again.",
    };
  }

  const newEmail = String(formData.get("newEmail") ?? "").trim().toLowerCase();

  if (!newEmail || !newEmail.includes("@") || !newEmail.includes(".")) {
    return {
      success: false,
      error: "Please enter a valid email address.",
    };
  }

  if (newEmail === user.email.toLowerCase()) {
    return {
      success: false,
      error: "New email must be different from your current email.",
    };
  }

  const requestHeaders = await headers();
  const origin = requestHeaders.get("origin") ?? "http://localhost:3000";

  const { error: updateError } = await supabase.auth.updateUser(
    { email: newEmail },
    { emailRedirectTo: `${origin}/auth/callback` }
  );

  if (updateError) {
    return {
      success: false,
      error: updateError.message || "Failed to request email change.",
    };
  }

  revalidatePath("/profile");

  return {
    success: true,
    message: `Confirmation link dispatched. Please check ${newEmail} to verify your new email address.`,
    pendingEmail: newEmail,
  };
}

/**
 * Updates the user's password after verifying their current password.
 */
export async function updatePasswordAction(
  formData: FormData
): Promise<ProfileActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user || !user.email) {
    return {
      success: false,
      error: "Authentication required. Please sign in again.",
    };
  }

  const currentPassword = String(formData.get("currentPassword") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (!currentPassword || !newPassword || !confirmPassword) {
    return {
      success: false,
      error: "All password fields are required.",
    };
  }

  if (newPassword.length < 8) {
    return {
      success: false,
      error: "New password must be at least 8 characters long.",
    };
  }

  if (newPassword !== confirmPassword) {
    return {
      success: false,
      error: "New password and confirmation do not match.",
    };
  }

  if (newPassword === currentPassword) {
    return {
      success: false,
      error: "New password must be different from your current password.",
    };
  }

  // 1. Verify current credentials before proceeding
  const { error: verifyError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  });

  if (verifyError) {
    return {
      success: false,
      error: "Current password is incorrect. Please verify and try again.",
    };
  }

  // 2. Commit the new password
  const { error: updateError } = await supabase.auth.updateUser({
    password: newPassword,
  });

  if (updateError) {
    return {
      success: false,
      error: updateError.message || "Failed to update password.",
    };
  }

  return {
    success: true,
    message: "Password changed successfully. Your account is secured.",
  };
}
