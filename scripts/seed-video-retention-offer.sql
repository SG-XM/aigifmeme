-- Additive, idempotent data seed: visible in admin, hidden from the public catalog.
-- 10 credits, no recurring subscription. Checkout must start within 30 minutes.
INSERT OR IGNORE INTO credit_top_up_product
  (product_id, name, description, name_es, description_es, price_in_cents, currency, credits, credits_valid_days, enabled, sort)
VALUES
  ('single_retention_v2', 'FileMeta Wipe credits', 'One-time offer: 10 credits. Start checkout within 30 minutes. No subscription.', 'Créditos de FileMeta Wipe', 'Oferta única: 10 créditos. Inicia el pago en 30 minutos. Sin suscripción.', 799, 'usd', 10, 0, 1, 999),
  ('single_retention_name_499', 'FileMeta Wipe credits · $4.99', 'One-time offer: 10 credits. Choose this price in the 30-minute offer. No subscription.', 'Créditos de FileMeta Wipe · $4.99', 'Oferta única: 10 créditos. Elige este precio en la oferta de 30 minutos. Sin suscripción.', 499, 'usd', 10, 0, 1, 1000),
  ('single_retention_name_599', 'FileMeta Wipe credits · $5.99', 'One-time offer: 10 credits. Choose this price in the 30-minute offer. No subscription.', 'Créditos de FileMeta Wipe · $5.99', 'Oferta única: 10 créditos. Elige este precio en la oferta de 30 minutos. Sin suscripción.', 599, 'usd', 10, 0, 1, 1001),
  ('single_retention_name_799', 'FileMeta Wipe credits · $7.99', 'One-time offer: 10 credits. Choose this price in the 30-minute offer. No subscription.', 'Créditos de FileMeta Wipe · $7.99', 'Oferta única: 10 créditos. Elige este precio en la oferta de 30 minutos. Sin suscripción.', 799, 'usd', 10, 0, 1, 1002),
  ('single_retention_name_999', 'FileMeta Wipe credits · $9.99', 'One-time offer: 10 credits. Choose this price in the 30-minute offer. No subscription.', 'Créditos de FileMeta Wipe · $9.99', 'Oferta única: 10 créditos. Elige este precio en la oferta de 30 minutos. Sin suscripción.', 999, 'usd', 10, 0, 1, 1003);
