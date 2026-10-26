ALTER TABLE `credit_top_up_product` ADD `name_es` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `credit_top_up_product` ADD `description_es` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `post` ADD `title_es` text;--> statement-breakpoint
ALTER TABLE `post` ADD `description_es` text;--> statement-breakpoint
ALTER TABLE `post` ADD `content_es` text;--> statement-breakpoint
ALTER TABLE `subscription_plan` ADD `name_es` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `subscription_plan` ADD `description_es` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `subscription_plan` ADD `features_es` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `subscription_plan` ADD `badge_es` text DEFAULT '' NOT NULL;--> statement-breakpoint
UPDATE `subscription_plan` SET
  `name_es` = CASE `product_id`
    WHEN 'basic_monthly_v2' THEN 'Básico'
    WHEN 'basic_yearly_v2' THEN 'Básico'
    WHEN 'lite_monthly' THEN 'Lite'
    WHEN 'lite_yearly' THEN 'Lite'
    WHEN 'pro_monthly' THEN 'Pro'
    WHEN 'pro_yearly' THEN 'Pro'
    WHEN 'pro_monthly_v2' THEN 'Pro'
    WHEN 'pro_yearly_v2' THEN 'Pro'
    WHEN 'studio_monthly_v2' THEN 'Studio'
    WHEN 'studio_yearly_v2' THEN 'Studio'
    WHEN 'ultra_monthly' THEN 'Ultra'
    WHEN 'ultra_yearly' THEN 'Ultra'
    ELSE `name_en`
  END,
  `description_es` = CASE `product_id`
    WHEN 'lite_monthly' THEN 'Para creadores ocasionales'
    WHEN 'lite_yearly' THEN 'Para creadores ocasionales'
    WHEN 'pro_monthly' THEN 'Para profesionales'
    WHEN 'pro_yearly' THEN 'Para profesionales'
    WHEN 'ultra_monthly' THEN 'Para quienes crean con frecuencia'
    WHEN 'ultra_yearly' THEN 'Para quienes crean con frecuencia'
    ELSE ''
  END,
  `features_es` = CASE
    WHEN `product_id` IN ('basic_yearly_v2', 'pro_yearly_v2', 'studio_yearly_v2')
      THEN 'Video HD sin marca de agua' || char(10) || 'Descarga y publica donde quieras' || char(10) || 'Créditos de todo el año por adelantado' || char(10) || 'Cancela cuando quieras'
    WHEN `product_id` IN ('basic_monthly_v2', 'pro_monthly_v2', 'studio_monthly_v2')
      THEN 'Video HD sin marca de agua' || char(10) || 'Descarga y publica donde quieras' || char(10) || 'Los créditos se renuevan cada mes' || char(10) || 'Cancela cuando quieras'
    WHEN `product_id` IN ('lite_monthly', 'lite_yearly', 'pro_monthly', 'pro_yearly', 'ultra_monthly', 'ultra_yearly')
      THEN 'Texto a video e imagen a video' || char(10) || 'Todos los modelos de video' || char(10) || 'Descarga gratuita y licencia comercial'
    ELSE ''
  END,
  `badge_es` = CASE `product_id`
    WHEN 'pro_monthly' THEN 'Popular'
    WHEN 'studio_monthly_v2' THEN 'Mejor relación calidad-precio'
    WHEN 'studio_yearly_v2' THEN 'Mejor relación calidad-precio'
    ELSE ''
  END
WHERE `product_id` IN (
  'basic_monthly_v2', 'basic_yearly_v2',
  'lite_monthly', 'lite_yearly',
  'pro_monthly', 'pro_yearly', 'pro_monthly_v2', 'pro_yearly_v2',
  'studio_monthly_v2', 'studio_yearly_v2',
  'ultra_monthly', 'ultra_yearly'
);--> statement-breakpoint
UPDATE `credit_top_up_product` SET
  `name_es` = CASE `product_id`
    WHEN 'credits_10' THEN '10 USD en créditos'
    WHEN 'credits_50' THEN '50 USD en créditos'
    WHEN 'credits_100' THEN '100 USD en créditos'
    WHEN 'single_v2' THEN 'Paquete individual'
    WHEN 'duo_v2' THEN 'Paquete doble'
    WHEN 'crew_v2' THEN 'Paquete para equipo'
    WHEN 'studio_pack_v2' THEN 'Paquete Studio'
    WHEN 'label_v2' THEN 'Paquete Label'
    ELSE `name`
  END,
  `description_es` = CASE `product_id`
    WHEN 'credits_10' THEN 'Paquete de recarga de 10 USD en créditos'
    WHEN 'credits_50' THEN 'Paquete de recarga de 50 USD en créditos'
    WHEN 'credits_100' THEN 'Paquete de recarga de 100 USD en créditos'
    ELSE ''
  END
WHERE `product_id` IN (
  'credits_10', 'credits_50', 'credits_100',
  'single_v2', 'duo_v2', 'crew_v2', 'studio_pack_v2', 'label_v2'
);
