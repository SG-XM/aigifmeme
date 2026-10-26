-- Empty-financial-database cutover. Populated databases require the reviewed pricing:update conversion instead.
--> statement-breakpoint
SELECT CASE WHEN NOT (NOT EXISTS (SELECT 1 FROM config WHERE name='video_credit_pricing_version' AND value='seedance-12s-v2')) OR (NOT EXISTS (SELECT 1 FROM credit) AND NOT EXISTS (SELECT 1 FROM "order") AND NOT EXISTS (SELECT 1 FROM subscription) AND NOT EXISTS (SELECT 1 FROM ai_task) AND NOT EXISTS (SELECT 1 FROM config WHERE name='initial_credits_amount' AND CAST(value AS INTEGER)>0)) THEN 1 ELSE abs(-9223372036854775808) END;
--> statement-breakpoint
UPDATE credit_top_up_product SET enabled=0, credits=(credits*37+2399)/2400 WHERE NOT EXISTS (SELECT 1 FROM config WHERE name='video_credit_pricing_version' AND value='seedance-12s-v2');
--> statement-breakpoint
UPDATE subscription_plan SET enabled=0, credits=(credits*37+2399)/2400 WHERE NOT EXISTS (SELECT 1 FROM config WHERE name='video_credit_pricing_version' AND value='seedance-12s-v2');
--> statement-breakpoint
INSERT INTO credit_top_up_product ("product_id","name","description","price_in_cents","currency","credits","credits_valid_days","enabled","sort") SELECT 'single_v2','Single','',999,'usd',10,0,1,10 WHERE NOT EXISTS (SELECT 1 FROM config WHERE name='video_credit_pricing_version' AND value='seedance-12s-v2');
--> statement-breakpoint
INSERT INTO credit_top_up_product ("product_id","name","description","price_in_cents","currency","credits","credits_valid_days","enabled","sort") SELECT 'duo_v2','Duo Pack','',2900,'usd',50,0,1,20 WHERE NOT EXISTS (SELECT 1 FROM config WHERE name='video_credit_pricing_version' AND value='seedance-12s-v2');
--> statement-breakpoint
INSERT INTO credit_top_up_product ("product_id","name","description","price_in_cents","currency","credits","credits_valid_days","enabled","sort") SELECT 'crew_v2','Crew Pack','',9900,'usd',350,0,1,30 WHERE NOT EXISTS (SELECT 1 FROM config WHERE name='video_credit_pricing_version' AND value='seedance-12s-v2');
--> statement-breakpoint
INSERT INTO credit_top_up_product ("product_id","name","description","price_in_cents","currency","credits","credits_valid_days","enabled","sort") SELECT 'studio_pack_v2','Studio Pack','',19900,'usd',900,0,1,40 WHERE NOT EXISTS (SELECT 1 FROM config WHERE name='video_credit_pricing_version' AND value='seedance-12s-v2');
--> statement-breakpoint
INSERT INTO credit_top_up_product ("product_id","name","description","price_in_cents","currency","credits","credits_valid_days","enabled","sort") SELECT 'label_v2','Label Pack','',49900,'usd',3000,0,1,50 WHERE NOT EXISTS (SELECT 1 FROM config WHERE name='video_credit_pricing_version' AND value='seedance-12s-v2');
--> statement-breakpoint
INSERT INTO subscription_plan ("product_id","name_en","name_zh","description_en","description_zh","features_en","features_zh","badge_en","badge_zh","price_in_cents","compare_at_price_in_cents","currency","interval","interval_count","credits","credits_valid_days","featured","enabled","sort") SELECT 'basic_monthly_v2','Basic','Basic','','','HD video, no watermark
Download & post anywhere
Credits refresh every month
Cancel anytime','高清视频，无水印
下载与分享
每月刷新积分
随时取消续费','','',2990,NULL,'usd','month',1,100,31,1,1,10 WHERE NOT EXISTS (SELECT 1 FROM config WHERE name='video_credit_pricing_version' AND value='seedance-12s-v2');
--> statement-breakpoint
INSERT INTO subscription_plan ("product_id","name_en","name_zh","description_en","description_zh","features_en","features_zh","badge_en","badge_zh","price_in_cents","compare_at_price_in_cents","currency","interval","interval_count","credits","credits_valid_days","featured","enabled","sort") SELECT 'basic_yearly_v2','Basic','Basic','','','HD video, no watermark
Download & post anywhere
All year’s credits up front
Cancel anytime','高清视频，无水印
下载与分享
全年积分一次发放
随时取消续费','','',10000,NULL,'usd','year',1,400,365,1,1,10 WHERE NOT EXISTS (SELECT 1 FROM config WHERE name='video_credit_pricing_version' AND value='seedance-12s-v2');
--> statement-breakpoint
INSERT INTO subscription_plan ("product_id","name_en","name_zh","description_en","description_zh","features_en","features_zh","badge_en","badge_zh","price_in_cents","compare_at_price_in_cents","currency","interval","interval_count","credits","credits_valid_days","featured","enabled","sort") SELECT 'pro_monthly_v2','Pro','Pro','','','HD video, no watermark
Download & post anywhere
Credits refresh every month
Cancel anytime','高清视频，无水印
下载与分享
每月刷新积分
随时取消续费','','',4990,NULL,'usd','month',1,300,31,0,1,20 WHERE NOT EXISTS (SELECT 1 FROM config WHERE name='video_credit_pricing_version' AND value='seedance-12s-v2');
--> statement-breakpoint
INSERT INTO subscription_plan ("product_id","name_en","name_zh","description_en","description_zh","features_en","features_zh","badge_en","badge_zh","price_in_cents","compare_at_price_in_cents","currency","interval","interval_count","credits","credits_valid_days","featured","enabled","sort") SELECT 'pro_yearly_v2','Pro','Pro','','','HD video, no watermark
Download & post anywhere
All year’s credits up front
Cancel anytime','高清视频，无水印
下载与分享
全年积分一次发放
随时取消续费','','',50000,NULL,'usd','year',1,4000,365,0,1,20 WHERE NOT EXISTS (SELECT 1 FROM config WHERE name='video_credit_pricing_version' AND value='seedance-12s-v2');
--> statement-breakpoint
INSERT INTO subscription_plan ("product_id","name_en","name_zh","description_en","description_zh","features_en","features_zh","badge_en","badge_zh","price_in_cents","compare_at_price_in_cents","currency","interval","interval_count","credits","credits_valid_days","featured","enabled","sort") SELECT 'studio_monthly_v2','Studio','Studio','','','HD video, no watermark
Download & post anywhere
Credits refresh every month
Cancel anytime','高清视频，无水印
下载与分享
每月刷新积分
随时取消续费','Best value','超值之选',9990,NULL,'usd','month',1,800,31,0,1,30 WHERE NOT EXISTS (SELECT 1 FROM config WHERE name='video_credit_pricing_version' AND value='seedance-12s-v2');
--> statement-breakpoint
INSERT INTO subscription_plan ("product_id","name_en","name_zh","description_en","description_zh","features_en","features_zh","badge_en","badge_zh","price_in_cents","compare_at_price_in_cents","currency","interval","interval_count","credits","credits_valid_days","featured","enabled","sort") SELECT 'studio_yearly_v2','Studio','Studio','','','HD video, no watermark
Download & post anywhere
All year’s credits up front
Cancel anytime','高清视频，无水印
下载与分享
全年积分一次发放
随时取消续费','Best value','超值之选',60000,NULL,'usd','year',1,6000,365,0,1,30 WHERE NOT EXISTS (SELECT 1 FROM config WHERE name='video_credit_pricing_version' AND value='seedance-12s-v2');
--> statement-breakpoint
DELETE FROM config WHERE name='video_credit_pricing_version' AND NOT EXISTS (SELECT 1 FROM config WHERE name='video_credit_pricing_version' AND value='seedance-12s-v2');
--> statement-breakpoint
INSERT INTO config (name,value) SELECT 'video_credit_pricing_version','seedance-12s-v2' WHERE NOT EXISTS (SELECT 1 FROM config WHERE name='video_credit_pricing_version' AND value='seedance-12s-v2');
