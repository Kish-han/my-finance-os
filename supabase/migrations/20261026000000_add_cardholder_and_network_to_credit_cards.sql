-- Migration: Add cardholder_name and card_network to credit_cards
-- Description: Adds cardholder_name (name printed on card) and card_network (Visa, Mastercard, RuPay, etc.)
-- Reversible: Execute the rollback script at the bottom of this file.

ALTER TABLE credit_cards
  ADD COLUMN IF NOT EXISTS cardholder_name TEXT,
  ADD COLUMN IF NOT EXISTS card_network TEXT;

-- Enforce valid card networks
ALTER TABLE credit_cards
  DROP CONSTRAINT IF EXISTS credit_cards_card_network_check;

ALTER TABLE credit_cards
  ADD CONSTRAINT credit_cards_card_network_check
  CHECK (card_network IS NULL OR card_network IN ('Visa', 'Mastercard', 'RuPay', 'American Express', 'Diners Club', 'Other'));

COMMENT ON COLUMN credit_cards.cardholder_name IS 'The cardholder name printed on the physical card';
COMMENT ON COLUMN credit_cards.card_network IS 'Payment network brand: Visa, Mastercard, RuPay, American Express, Diners Club, or Other';

-- ============================================================================
-- Rollback Instructions:
-- To reverse this migration, execute:
-- ALTER TABLE credit_cards
--   DROP CONSTRAINT IF EXISTS credit_cards_card_network_check,
--   DROP COLUMN IF EXISTS cardholder_name,
--   DROP COLUMN IF EXISTS card_network;
-- ============================================================================
