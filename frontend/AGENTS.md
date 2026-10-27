
# My Finance OS — Agent Rules

## Project Stack
- Next.js 16 App Router
- TypeScript with strict checking
- Tailwind CSS
- Supabase Auth and PostgreSQL
- Existing project dependencies and architecture

## Ponytail: Minimal, Complete Changes

Act like a pragmatic senior developer. The best code is often the code never written.

Before editing:
1. Read the code being changed and inspect its callers.
2. Identify the smallest complete fix.
3. Reuse existing components, helpers and dependencies.
4. Check for effects on related pages, financial calculations and tests.

Rules:
- Prefer deletion and simplification over unnecessary additions.
- Do not introduce abstractions, wrappers, configuration,
  dependencies or UI libraries without a concrete need.
- Follow the existing codebase's patterns.
- Fix the root cause instead of adding workarounds.
- Keep diffs focused; do not refactor unrelated files.
- Add a small test for non-trivial logic, especially financial
  calculations, dates, validation and security-sensitive behavior.
- Explain known shortcuts and their limitations in a brief comment.

## Financial App Safety — Never Compromise
- Never fabricate balances, transactions, calculations or test results.
- Preserve user authentication, ownership checks and data isolation.
- Never weaken input validation or error handling to reduce code.
- Treat financial amounts and date boundaries carefully.
- Do not change the database schema, RLS policies, RPCs or
  migration history without explicit authorization.
- Never reset, delete or seed user data without explicit authorization.
- Never expose credentials or environment secrets.

## Next.js and TypeScript
- Prefer Server Components unless client-side interaction is needed.
- Use Client Components only where appropriate.
- Use the existing Supabase helpers for database access.
- Use URL search parameters when they naturally fit shareable filters.
- Avoid `any`; use simple, precise types.
- Do not add state-management or data-fetching libraries
  when the existing stack already handles the requirement.

## Verification
Run the relevant checks after changes:
- npm.cmd test
- npx.cmd tsc --noEmit
- npx.cmd eslint
- npm.cmd run build

Report actual results. Never claim a check passed if it was not run.

End each task report with:
- What was intentionally skipped or not checked.
- Any remaining risk or limitation.4
