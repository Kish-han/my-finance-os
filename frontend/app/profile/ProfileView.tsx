"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  User,
  Mail,
  Lock,
  KeyRound,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  Copy,
  Check,
  ArrowLeft,
  Loader2,
  Save,
  Clock,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  updateDisplayNameAction,
  requestEmailChangeAction,
  updatePasswordAction,
  type ProfileActionResult,
} from "./actions";

interface ProfileViewProps {
  initialDisplayName: string;
  email: string;
  userId: string;
  createdAt: string;
  pendingNewEmail?: string | null;
}

export function ProfileView({
  initialDisplayName,
  email,
  userId,
  createdAt,
  pendingNewEmail: initialPendingEmail,
}: ProfileViewProps) {
  const router = useRouter();

  // Personal Information State
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [namePending, startNameTransition] = useTransition();
  const [nameResult, setNameResult] = useState<ProfileActionResult | null>(null);

  // Email Settings State
  const [newEmail, setNewEmail] = useState("");
  const [pendingEmail, setPendingEmail] = useState<string | null>(
    initialPendingEmail ?? null
  );
  const [emailPending, startEmailTransition] = useTransition();
  const [emailResult, setEmailResult] = useState<ProfileActionResult | null>(null);

  // Password & Security State
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordPending, startPasswordTransition] = useTransition();
  const [passwordResult, setPasswordResult] = useState<ProfileActionResult | null>(null);

  // Copy User ID State
  const [copiedId, setCopiedId] = useState(false);

  function copyUserId() {
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(userId);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    }
  }

  // Handle Display Name Submit
  function handleNameSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setNameResult(null);

    const formData = new FormData(e.currentTarget);
    startNameTransition(async () => {
      const res = await updateDisplayNameAction(formData);
      setNameResult(res);
      if (res.success) {
        if (res.displayName) {
          setDisplayName(res.displayName);
        }
        router.refresh();
      }
    });
  }

  // Handle Email Change Submit
  function handleEmailSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setEmailResult(null);

    const formData = new FormData(e.currentTarget);
    startEmailTransition(async () => {
      const res = await requestEmailChangeAction(formData);
      setEmailResult(res);
      if (res.success && res.pendingEmail) {
        setPendingEmail(res.pendingEmail);
        setNewEmail("");
        router.refresh();
      }
    });
  }

  // Handle Password Submit
  function handlePasswordSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPasswordResult(null);

    const formData = new FormData(e.currentTarget);
    startPasswordTransition(async () => {
      const res = await updatePasswordAction(formData);
      setPasswordResult(res);
      if (res.success) {
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      }
    });
  }

  // Format account created date
  function formatAccountDate(dateStr: string): string {
    try {
      return new Intl.DateTimeFormat("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      }).format(new Date(dateStr));
    } catch {
      return dateStr;
    }
  }

  const avatarInitial = displayName.charAt(0).toUpperCase() || email.charAt(0).toUpperCase() || "U";

  return (
    <div className="space-y-8">
      {/* Navigation breadcrumb */}
      <div className="flex items-center justify-between">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Dashboard</span>
        </Link>

        <span className="text-[10px] font-mono uppercase tracking-widest text-[#4edea3]">
          ACCOUNT SECURITY · ACTIVE
        </span>
      </div>

      {/* Header Profile Identity Hero */}
      <section className="aura-card-obsidian relative overflow-hidden rounded-[2.5rem] p-6 sm:p-8 shadow-2xl backdrop-blur-2xl border border-white/10">
        <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-[#10b981]/15 blur-3xl animate-pulse-glow" />
        <div className="pointer-events-none absolute -left-20 -bottom-20 h-64 w-64 rounded-full bg-[#8b5cf6]/10 blur-3xl animate-pulse-glow" />

        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-5">
          <div className="flex items-center gap-4">
            {/* Monogram Avatar */}
            <div className="flex h-16 w-16 sm:h-20 sm:w-20 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#4edea3] via-[#10b981] to-[#003824] text-[#003824] font-black text-2xl sm:text-3xl shadow-lg shadow-emerald-500/30 ring-2 ring-white/30">
              {avatarInitial}
            </div>

            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white">
                  {displayName}
                </h1>
                <Badge
                  variant="outline"
                  className="border-emerald-500/30 text-emerald-400 bg-emerald-500/10 text-[10px] uppercase font-bold py-0.5 px-2"
                >
                  VERIFIED CLIENT
                </Badge>
              </div>

              <p className="text-xs sm:text-sm font-mono text-slate-400">
                {email}
              </p>

              <p className="text-[11px] text-slate-500 flex items-center gap-1.5 pt-0.5">
                <Clock className="h-3 w-3 text-slate-400" />
                <span>Member since {formatAccountDate(createdAt)}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-center">
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs font-mono text-slate-300">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
              <span>SUPABASE AUTH V2</span>
            </span>
          </div>
        </div>
      </section>

      {/* =========================================================
          SECTION 1: Personal Information
      ========================================================= */}
      <section className="aura-panel p-6 sm:p-7 space-y-5">
        <div className="flex items-center gap-2.5 border-b border-white/10 pb-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
            <User className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-bold tracking-tight text-white">
              Personal Information
            </h2>
            <p className="text-xs text-slate-400">
              Your public display identity throughout AURA Wealth and embossed card stacks
            </p>
          </div>
        </div>

        {/* Feedback alert */}
        {nameResult && (
          <div
            role={nameResult.success ? "status" : "alert"}
            className={`flex items-center gap-3 p-4 rounded-2xl text-xs font-semibold backdrop-blur-xl border ${
              nameResult.success
                ? "bg-emerald-950/40 border-emerald-500/30 text-emerald-300"
                : "bg-rose-950/40 border-rose-500/30 text-rose-300"
            }`}
          >
            {nameResult.success ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
            )}
            <p>{nameResult.message || nameResult.error}</p>
          </div>
        )}

        <form onSubmit={handleNameSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Display Name Input */}
            <div className="space-y-1.5">
              <label
                htmlFor="displayName"
                className="block text-xs font-bold uppercase tracking-wider text-slate-300"
              >
                Display Name
              </label>
              <input
                id="displayName"
                name="displayName"
                type="text"
                required
                minLength={2}
                maxLength={50}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="e.g. Kishan Prasad"
                disabled={namePending}
                className="w-full rounded-xl bg-white/5 border border-white/15 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[#4edea3]/60 focus:ring-1 focus:ring-[#4edea3]/30 transition-all disabled:opacity-50"
              />
              <p className="text-[11px] text-slate-500">
                Shown on the dashboard greeting, navigation bar, and physical credit card stack.
              </p>
            </div>

            {/* Read-only Current Email */}
            <div className="space-y-1.5">
              <label
                htmlFor="currentEmailStatic"
                className="block text-xs font-bold uppercase tracking-wider text-slate-300"
              >
                Account Email
              </label>
              <div className="relative">
                <input
                  id="currentEmailStatic"
                  type="email"
                  readOnly
                  value={email}
                  className="w-full rounded-xl bg-white/[0.02] border border-white/10 px-4 py-2.5 text-sm font-mono text-slate-400 cursor-not-allowed select-all"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold uppercase tracking-wider text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                  Primary
                </span>
              </div>
              <p className="text-[11px] text-slate-500">
                To change your email address, use the Email Settings section below.
              </p>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={namePending}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-5 py-2.5 text-xs font-bold text-slate-950 shadow-md shadow-emerald-500/20 hover:brightness-110 active:scale-95 transition-all disabled:opacity-60 cursor-pointer"
            >
              {namePending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  <span>Save Changes</span>
                </>
              )}
            </button>
          </div>
        </form>
      </section>

      {/* =========================================================
          SECTION 2: Email Settings
      ========================================================= */}
      <section className="aura-panel p-6 sm:p-7 space-y-5">
        <div className="flex items-center gap-2.5 border-b border-white/10 pb-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-cyan-500/15 text-cyan-400 border border-cyan-500/30">
            <Mail className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-bold tracking-tight text-white">
              Email Settings
            </h2>
            <p className="text-xs text-slate-400">
              Request an email update securely. Verification links will be dispatched before the change takes effect.
            </p>
          </div>
        </div>

        {/* Pending email change banner */}
        {pendingEmail && (
          <div className="flex items-start gap-3 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs backdrop-blur-xl">
            <Clock className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-bold">Pending Email Confirmation</p>
              <p className="text-amber-200/90 leading-relaxed">
                A verification link has been sent to <strong className="text-white font-mono">{pendingEmail}</strong>.
                Your login email will remain <span className="font-mono text-white">{email}</span> until verified.
              </p>
            </div>
          </div>
        )}

        {/* Feedback alert */}
        {emailResult && (
          <div
            role={emailResult.success ? "status" : "alert"}
            className={`flex items-center gap-3 p-4 rounded-2xl text-xs font-semibold backdrop-blur-xl border ${
              emailResult.success
                ? "bg-emerald-950/40 border-emerald-500/30 text-emerald-300"
                : "bg-rose-950/40 border-rose-500/30 text-rose-300"
            }`}
          >
            {emailResult.success ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
            )}
            <p>{emailResult.message || emailResult.error}</p>
          </div>
        )}

        <form onSubmit={handleEmailSubmit} className="space-y-4">
          <div className="space-y-1.5 max-w-lg">
            <label
              htmlFor="newEmail"
              className="block text-xs font-bold uppercase tracking-wider text-slate-300"
            >
              New Email Address
            </label>
            <input
              id="newEmail"
              name="newEmail"
              type="email"
              required
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="e.g. new.email@example.com"
              disabled={emailPending}
              className="w-full rounded-xl bg-white/5 border border-white/15 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400/60 focus:ring-1 focus:ring-cyan-400/30 transition-all disabled:opacity-50"
            />
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Supabase sends an authorization email to confirm ownership. Depending on your security configuration, confirmation may be required from both accounts.
            </p>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={emailPending || !newEmail.trim()}
              className="inline-flex items-center gap-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 px-5 py-2.5 text-xs font-bold text-white transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              {emailPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Requesting...</span>
                </>
              ) : (
                <>
                  <Mail className="h-4 w-4 text-cyan-400" />
                  <span>Request Email Change</span>
                </>
              )}
            </button>
          </div>
        </form>
      </section>

      {/* =========================================================
          SECTION 3: Password and Security
      ========================================================= */}
      <section className="aura-panel p-6 sm:p-7 space-y-5">
        <div className="flex items-center gap-2.5 border-b border-white/10 pb-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#8b5cf6]/15 text-[#d0bcff] border border-[#8b5cf6]/30">
            <KeyRound className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-bold tracking-tight text-white">
              Password & Security
            </h2>
            <p className="text-xs text-slate-400">
              Update your account master password. Passwords are encrypted and never stored in application memory.
            </p>
          </div>
        </div>

        {/* Feedback alert */}
        {passwordResult && (
          <div
            role={passwordResult.success ? "status" : "alert"}
            className={`flex items-center gap-3 p-4 rounded-2xl text-xs font-semibold backdrop-blur-xl border ${
              passwordResult.success
                ? "bg-emerald-950/40 border-emerald-500/30 text-emerald-300"
                : "bg-rose-950/40 border-rose-500/30 text-rose-300"
            }`}
          >
            {passwordResult.success ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
            )}
            <p>{passwordResult.message || passwordResult.error}</p>
          </div>
        )}

        <form onSubmit={handlePasswordSubmit} className="space-y-4">
          <div className="space-y-4 max-w-lg">
            {/* Current Password */}
            <div className="space-y-1.5">
              <label
                htmlFor="currentPassword"
                className="block text-xs font-bold uppercase tracking-wider text-slate-300"
              >
                Current Password
              </label>
              <div className="relative">
                <input
                  id="currentPassword"
                  name="currentPassword"
                  type={showCurrentPassword ? "text" : "password"}
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter current password"
                  disabled={passwordPending}
                  className="w-full rounded-xl bg-white/5 border border-white/15 px-4 py-2.5 pr-11 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[#d0bcff]/60 focus:ring-1 focus:ring-[#d0bcff]/30 transition-all disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors p-1"
                  title={showCurrentPassword ? "Hide password" : "Show password"}
                >
                  {showCurrentPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            {/* New Password */}
            <div className="space-y-1.5">
              <label
                htmlFor="newPassword"
                className="block text-xs font-bold uppercase tracking-wider text-slate-300"
              >
                New Password
              </label>
              <div className="relative">
                <input
                  id="newPassword"
                  name="newPassword"
                  type={showNewPassword ? "text" : "password"}
                  required
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  disabled={passwordPending}
                  className="w-full rounded-xl bg-white/5 border border-white/15 px-4 py-2.5 pr-11 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[#d0bcff]/60 focus:ring-1 focus:ring-[#d0bcff]/30 transition-all disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors p-1"
                  title={showNewPassword ? "Hide password" : "Show password"}
                >
                  {showNewPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              <p className="text-[11px] text-slate-500">
                Minimum 8 characters. Use letters, numbers, and symbols for maximum entropy.
              </p>
            </div>

            {/* Confirm New Password */}
            <div className="space-y-1.5">
              <label
                htmlFor="confirmPassword"
                className="block text-xs font-bold uppercase tracking-wider text-slate-300"
              >
                Confirm New Password
              </label>
              <div className="relative">
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  required
                  minLength={8}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter new password"
                  disabled={passwordPending}
                  className="w-full rounded-xl bg-white/5 border border-white/15 px-4 py-2.5 pr-11 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[#d0bcff]/60 focus:ring-1 focus:ring-[#d0bcff]/30 transition-all disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors p-1"
                  title={showConfirmPassword ? "Hide password" : "Show password"}
                >
                  {showConfirmPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              {newPassword && confirmPassword && (
                <div className="pt-1">
                  {newPassword === confirmPassword ? (
                    <span className="text-[11px] text-emerald-400 flex items-center gap-1 font-medium">
                      <Check className="h-3 w-3" /> Passwords match
                    </span>
                  ) : (
                    <span className="text-[11px] text-rose-400 font-medium">
                      Passwords do not match
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={
                passwordPending ||
                !currentPassword ||
                !newPassword ||
                !confirmPassword ||
                newPassword !== confirmPassword
              }
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:brightness-110 px-5 py-2.5 text-xs font-bold text-white transition-all shadow-md shadow-violet-500/20 active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              {passwordPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Updating Password...</span>
                </>
              ) : (
                <>
                  <Lock className="h-4 w-4" />
                  <span>Update Password</span>
                </>
              )}
            </button>
          </div>
        </form>
      </section>

      {/* =========================================================
          SECTION 4: Account Information
      ========================================================= */}
      <section className="aura-panel p-6 sm:p-7 space-y-4">
        <div className="flex items-center gap-2.5 border-b border-white/10 pb-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/5 text-slate-300 border border-white/10">
            <Sparkles className="h-4 w-4 text-amber-400" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-bold tracking-tight text-white">
              Account Information
            </h2>
            <p className="text-xs text-slate-400">
              Read-only system identifiers and telemetry metadata
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* User ID */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 flex flex-col justify-between">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                User Identifier (UUID)
              </span>
              <p className="mt-1 font-mono text-xs text-white break-all select-all">
                {userId}
              </p>
            </div>
            <div className="mt-3 pt-2 border-t border-white/5 flex items-center justify-between">
              <span className="text-[10px] text-slate-500 font-mono">SUPABASE UUID</span>
              <button
                type="button"
                onClick={copyUserId}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-300 hover:text-white transition-colors cursor-pointer"
              >
                {copiedId ? (
                  <>
                    <Check className="h-3 w-3 text-emerald-400" />
                    <span className="text-emerald-400 font-bold">Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3" />
                    <span>Copy ID</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Account Created Date */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 flex flex-col justify-between">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Account Created
              </span>
              <p className="mt-1 text-sm font-bold text-white">
                {formatAccountDate(createdAt)}
              </p>
            </div>
            <div className="mt-3 pt-2 border-t border-white/5 flex items-center justify-between text-[11px] text-slate-500">
              <span>Status</span>
              <span className="text-emerald-400 font-semibold flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Active Session
              </span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
