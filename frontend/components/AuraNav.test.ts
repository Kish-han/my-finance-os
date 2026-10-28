import { describe, it, expect } from "vitest";
import { getAuraNavActiveState } from "./AuraNav";

describe("AuraNav: Active Navigation State Routing", () => {
  it("activates Recurring when on /transactions/recurring and deactivates general Transactions", () => {
    const state = getAuraNavActiveState("/transactions/recurring");
    expect(state.isRecurring).toBe(true);
    expect(state.isTransactions).toBe(false);
    expect(state.isVault).toBe(false);
    expect(state.isCards).toBe(false);
    expect(state.isLoans).toBe(false);
    expect(state.isAccounts).toBe(false);
  });

  it("activates Recurring on nested query parameters and interactions", () => {
    const state = getAuraNavActiveState("/transactions/recurring?created=1&tab=upcoming");
    expect(state.isRecurring).toBe(true);
    expect(state.isTransactions).toBe(false);
  });

  it("activates Recurring on nested subroutes under /transactions/recurring", () => {
    const state = getAuraNavActiveState("/transactions/recurring/123/edit");
    expect(state.isRecurring).toBe(true);
    expect(state.isTransactions).toBe(false);
  });

  it("activates Transactions when on /transactions and deactivates Recurring", () => {
    const state = getAuraNavActiveState("/transactions");
    expect(state.isTransactions).toBe(true);
    expect(state.isRecurring).toBe(false);
    expect(state.isVault).toBe(false);
  });

  it("activates Transactions when on /transactions/new (unified entry) and deactivates Recurring", () => {
    const state = getAuraNavActiveState("/transactions/new");
    expect(state.isTransactions).toBe(true);
    expect(state.isRecurring).toBe(false);
  });

  it("activates Transactions when on /transactions/history and deactivates Recurring", () => {
    const state = getAuraNavActiveState("/transactions/history");
    expect(state.isTransactions).toBe(true);
    expect(state.isRecurring).toBe(false);
  });

  it("activates Vault/Dashboard when on /", () => {
    const state = getAuraNavActiveState("/");
    expect(state.isDashboard).toBe(true);
    expect(state.isVault).toBe(true);
    expect(state.isTransactions).toBe(false);
    expect(state.isRecurring).toBe(false);
  });

  it("activates Cards when on /cards or /cards/activity", () => {
    const state1 = getAuraNavActiveState("/cards");
    expect(state1.isCards).toBe(true);
    expect(state1.isRecurring).toBe(false);

    const state2 = getAuraNavActiveState("/cards/activity");
    expect(state2.isCards).toBe(true);
    expect(state2.isRecurring).toBe(false);
  });

  it("activates Loans when on /emi and nested loan routes", () => {
    const state1 = getAuraNavActiveState("/emi");
    expect(state1.isLoans).toBe(true);

    const state2 = getAuraNavActiveState("/emi/schedule");
    expect(state2.isLoans).toBe(true);

    const state3 = getAuraNavActiveState("/emi/payments");
    expect(state3.isLoans).toBe(true);
  });

  it("activates Accounts when on /accounts", () => {
    const state = getAuraNavActiveState("/accounts");
    expect(state.isAccounts).toBe(true);
    expect(state.isRecurring).toBe(false);
  });

  it("safely handles null, empty, or unknown paths", () => {
    const nullState = getAuraNavActiveState(null);
    expect(nullState.isRecurring).toBe(false);
    expect(nullState.isTransactions).toBe(false);
    expect(nullState.isVault).toBe(false);

    const unknownState = getAuraNavActiveState("/unknown-path");
    expect(unknownState.isRecurring).toBe(false);
    expect(unknownState.isTransactions).toBe(false);
    expect(unknownState.isVault).toBe(false);
  });
});
