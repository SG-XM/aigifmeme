-- Hidden name-your-price chips for retention experiment retention-name-price-v1.
-- Insert-only: does not change single_retention_v2 (control, live price may be $6.99).
-- Stripe checkout uses dynamic price_data from these catalog amounts. No Stripe Price objects.
--> statement-breakpoint
INSERT OR IGNORE INTO credit_top_up_product
  (product_id, name, description, name_es, description_es, price_in_cents, currency, credits, credits_valid_days, enabled, sort)
VALUES
  ('single_retention_name_499', 'Name your price · $4.99', 'One-time name-your-price offer: 10 credits for one Standard video. Choose this price in the 30-minute retention offer. No subscription.', 'Ponle precio · $4.99', 'Oferta única: 10 créditos para un vídeo Standard. Elige este precio en la oferta de 30 minutos. Sin suscripción.', 499, 'usd', 10, 0, 1, 1000),
  ('single_retention_name_599', 'Name your price · $5.99', 'One-time name-your-price offer: 10 credits for one Standard video. Choose this price in the 30-minute retention offer. No subscription.', 'Ponle precio · $5.99', 'Oferta única: 10 créditos para un vídeo Standard. Elige este precio en la oferta de 30 minutos. Sin suscripción.', 599, 'usd', 10, 0, 1, 1001),
  ('single_retention_name_799', 'Name your price · $7.99', 'One-time name-your-price offer: 10 credits for one Standard video. Choose this price in the 30-minute retention offer. No subscription.', 'Ponle precio · $7.99', 'Oferta única: 10 créditos para un vídeo Standard. Elige este precio en la oferta de 30 minutos. Sin suscripción.', 799, 'usd', 10, 0, 1, 1002),
  ('single_retention_name_999', 'Name your price · $9.99', 'One-time name-your-price offer: 10 credits for one Standard video. Choose this price in the 30-minute retention offer. No subscription.', 'Ponle precio · $9.99', 'Oferta única: 10 créditos para un vídeo Standard. Elige este precio en la oferta de 30 minutos. Sin suscripción.', 999, 'usd', 10, 0, 1, 1003);
--> statement-breakpoint
INSERT OR IGNORE INTO ab_experiment
  (id, key, name, scene, product_scope, status, active_scene, b_percent, window_days, created_at)
VALUES
  ('b7e1c4a2-6f3d-4a8e-9c21-5d0e8f1a47b2', 'retention-name-price-v1', 'Retention name your price', 'video-retention-offer-v2', 'topup', 'draft', NULL, 50, 7, 1792454400000);
