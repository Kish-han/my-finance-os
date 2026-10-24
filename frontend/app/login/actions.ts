
"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function login(formData: FormData) {
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const password = String(formData.get("password") ?? "");

    if (!email || !password) {
        redirect("/login?error=missing-fields");
    }

    const supabase = await createClient();

    const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
    });

    if (error) {
        redirect("/login?error=sign-in-failed");
    }

    revalidatePath("/", "layout");
    redirect("/");
}

export async function signup(formData: FormData) {
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const password = String(formData.get("password") ?? "");

    if (!email || !password) {
        redirect("/login?error=missing-fields");
    }

    if (password.length < 8) {
        redirect("/login?error=password-too-short");
    }

    const supabase = await createClient();
    const requestHeaders = await headers();
    const origin =
        requestHeaders.get("origin") ?? "http://localhost:3000";

    const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
            emailRedirectTo: `${origin}/auth/callback`,
        },
    });

    if (error) {
        redirect("/login?error=sign-up-failed");
    }

    if (data.session) {
        revalidatePath("/", "layout");
        redirect("/");
    }

    redirect("/login?message=check-email");
}

export async function logout() {
    const supabase = await createClient();

    await supabase.auth.signOut();

    revalidatePath("/", "layout");
    redirect("/login");
}
