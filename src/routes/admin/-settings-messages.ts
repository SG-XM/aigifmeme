import { m } from '@/paraglide/messages.js';

type Message = () => string;

// Settings are data-driven, but the message compiler can only tree-shake
// statically referenced keys. Keep the complete registry explicit and fall
// back to the English metadata for any future custom setting.
const TAB_MESSAGES: Record<string, Message> = {
  general: m['admin.settings.tabs.general'],
  auth: m['admin.settings.tabs.auth'],
  payment: m['admin.settings.tabs.payment'],
  email: m['admin.settings.tabs.email'],
  storage: m['admin.settings.tabs.storage'],
  ai: m['admin.settings.tabs.ai'],
  analytics: m['admin.settings.tabs.analytics'],
  ads: m['admin.settings.tabs.ads'],
  customer_service: m['admin.settings.tabs.customer_service'],
  custom: m['admin.settings.tabs.custom'],
};

const GROUP_MESSAGES: Record<string, Message> = {
  appinfo: m['admin.settings.groups.appinfo.title'],
  user_role: m['admin.settings.groups.user_role.title'],
  credit: m['admin.settings.groups.credit.title'],
  email_auth: m['admin.settings.groups.email_auth.title'],
  google_auth: m['admin.settings.groups.google_auth.title'],
  github_auth: m['admin.settings.groups.github_auth.title'],
  basic_payment: m['admin.settings.groups.basic_payment.title'],
  stripe: m['admin.settings.groups.stripe.title'],
  creem: m['admin.settings.groups.creem.title'],
  paypal: m['admin.settings.groups.paypal.title'],
  alipay: m['admin.settings.groups.alipay.title'],
  wechat: m['admin.settings.groups.wechat.title'],
  email_general: m['admin.settings.groups.email_general.title'],
  resend: m['admin.settings.groups.resend.title'],
  cloudflare_email: m['admin.settings.groups.cloudflare_email.title'],
  r2: m['admin.settings.groups.r2.title'],
  agent_llm: m['admin.settings.groups.agent_llm.title'],
  image_generation: m['admin.settings.groups.image_generation.title'],
  video_generation: m['admin.settings.groups.video_generation.title'],
  openai: m['admin.settings.groups.openai.title'],
  anthropic: m['admin.settings.groups.anthropic.title'],
  replicate: m['admin.settings.groups.replicate.title'],
  fal: m['admin.settings.groups.fal.title'],
  grouter: m['admin.settings.groups.grouter.title'],
  kie: m['admin.settings.groups.kie.title'],
  apimart: m['admin.settings.groups.apimart.title'],
  google_analytics: m['admin.settings.groups.google_analytics.title'],
  plausible: m['admin.settings.groups.plausible.title'],
  clarity: m['admin.settings.groups.clarity.title'],
  adsense: m['admin.settings.groups.adsense.title'],
  crisp: m['admin.settings.groups.crisp.title'],
  tawk: m['admin.settings.groups.tawk.title'],
};

const FIELD_MESSAGES: Record<string, Message> = {
  app_name: m['admin.settings.fields.app_name'],
  app_description: m['admin.settings.fields.app_description'],
  app_url: m['admin.settings.fields.app_url'],
  initial_role_enabled: m['admin.settings.fields.initial_role_enabled'],
  initial_role_name: m['admin.settings.fields.initial_role_name'],
  initial_credits_enabled: m['admin.settings.fields.initial_credits_enabled'],
  initial_credits_amount: m['admin.settings.fields.initial_credits_amount'],
  initial_credits_valid_days:
    m['admin.settings.fields.initial_credits_valid_days'],
  initial_credits_description:
    m['admin.settings.fields.initial_credits_description'],
  signup_ip_daily_limit: m['admin.settings.fields.signup_ip_daily_limit'],
  email_auth_enabled: m['admin.settings.fields.email_auth_enabled'],
  email_verification_enabled:
    m['admin.settings.fields.email_verification_enabled'],
  invite_code_required: m['admin.settings.fields.invite_code_required'],
  desktop_auth_schemes: m['admin.settings.fields.desktop_auth_schemes'],
  google_auth_enabled: m['admin.settings.fields.google_auth_enabled'],
  google_one_tap_enabled: m['admin.settings.fields.google_one_tap_enabled'],
  google_client_id: m['admin.settings.fields.google_client_id'],
  google_client_secret: m['admin.settings.fields.google_client_secret'],
  github_auth_enabled: m['admin.settings.fields.github_auth_enabled'],
  github_client_id: m['admin.settings.fields.github_client_id'],
  github_client_secret: m['admin.settings.fields.github_client_secret'],
  select_payment_enabled: m['admin.settings.fields.select_payment_enabled'],
  default_payment_provider: m['admin.settings.fields.default_payment_provider'],
  stripe_enabled: m['admin.settings.fields.stripe_enabled'],
  stripe_secret_key: m['admin.settings.fields.stripe_secret_key'],
  stripe_publishable_key: m['admin.settings.fields.stripe_publishable_key'],
  stripe_signing_secret: m['admin.settings.fields.stripe_signing_secret'],
  creem_enabled: m['admin.settings.fields.creem_enabled'],
  creem_environment: m['admin.settings.fields.creem_environment'],
  creem_api_key: m['admin.settings.fields.creem_api_key'],
  creem_signing_secret: m['admin.settings.fields.creem_signing_secret'],
  creem_product_ids_mapping:
    m['admin.settings.fields.creem_product_ids_mapping'],
  creem_test_amount: m['admin.settings.fields.creem_test_amount'],
  paypal_enabled: m['admin.settings.fields.paypal_enabled'],
  paypal_client_id: m['admin.settings.fields.paypal_client_id'],
  paypal_client_secret: m['admin.settings.fields.paypal_client_secret'],
  paypal_webhook_id: m['admin.settings.fields.paypal_webhook_id'],
  paypal_environment: m['admin.settings.fields.paypal_environment'],
  paypal_test_amount: m['admin.settings.fields.paypal_test_amount'],
  alipay_enabled: m['admin.settings.fields.alipay_enabled'],
  alipay_app_id: m['admin.settings.fields.alipay_app_id'],
  alipay_private_key: m['admin.settings.fields.alipay_private_key'],
  alipay_public_key: m['admin.settings.fields.alipay_public_key'],
  alipay_notify_url: m['admin.settings.fields.alipay_notify_url'],
  alipay_test_amount: m['admin.settings.fields.alipay_test_amount'],
  wechat_enabled: m['admin.settings.fields.wechat_enabled'],
  wechat_app_id: m['admin.settings.fields.wechat_app_id'],
  wechat_mch_id: m['admin.settings.fields.wechat_mch_id'],
  wechat_api_v3_key: m['admin.settings.fields.wechat_api_v3_key'],
  wechat_private_key: m['admin.settings.fields.wechat_private_key'],
  wechat_serial_no: m['admin.settings.fields.wechat_serial_no'],
  wechat_notify_url: m['admin.settings.fields.wechat_notify_url'],
  wechat_test_amount: m['admin.settings.fields.wechat_test_amount'],
  email_provider: m['admin.settings.fields.email_provider'],
  resend_api_key: m['admin.settings.fields.resend_api_key'],
  resend_sender_email: m['admin.settings.fields.resend_sender_email'],
  cloudflare_email_api_token:
    m['admin.settings.fields.cloudflare_email_api_token'],
  cloudflare_email_account_id:
    m['admin.settings.fields.cloudflare_email_account_id'],
  cloudflare_email_sender_email:
    m['admin.settings.fields.cloudflare_email_sender_email'],
  r2_access_key: m['admin.settings.fields.r2_access_key'],
  r2_secret_key: m['admin.settings.fields.r2_secret_key'],
  r2_bucket_name: m['admin.settings.fields.r2_bucket_name'],
  r2_upload_path: m['admin.settings.fields.r2_upload_path'],
  r2_endpoint: m['admin.settings.fields.r2_endpoint'],
  r2_domain: m['admin.settings.fields.r2_domain'],
  default_llm_provider: m['admin.settings.fields.default_llm_provider'],
  agent_model: m['admin.settings.fields.agent_model'],
  default_image_provider: m['admin.settings.fields.default_image_provider'],
  default_video_provider: m['admin.settings.fields.default_video_provider'],
  openai_base_url: m['admin.settings.fields.openai_base_url'],
  openai_api_key: m['admin.settings.fields.openai_api_key'],
  anthropic_base_url: m['admin.settings.fields.anthropic_base_url'],
  anthropic_api_key: m['admin.settings.fields.anthropic_api_key'],
  replicate_api_token: m['admin.settings.fields.replicate_api_token'],
  fal_api_key: m['admin.settings.fields.fal_api_key'],
  grouter_base_url: m['admin.settings.fields.grouter_base_url'],
  grouter_api_key: m['admin.settings.fields.grouter_api_key'],
  grouter_model_map: m['admin.settings.fields.grouter_model_map'],
  kie_api_key: m['admin.settings.fields.kie_api_key'],
  apimart_api_key: m['admin.settings.fields.apimart_api_key'],
  google_analytics_id: m['admin.settings.fields.google_analytics_id'],
  plausible_domain: m['admin.settings.fields.plausible_domain'],
  plausible_src: m['admin.settings.fields.plausible_src'],
  clarity_project_id: m['admin.settings.fields.clarity_project_id'],
  adsense_code: m['admin.settings.fields.adsense_code'],
  crisp_enabled: m['admin.settings.fields.crisp_enabled'],
  crisp_website_id: m['admin.settings.fields.crisp_website_id'],
  tawk_enabled: m['admin.settings.fields.tawk_enabled'],
  tawk_property_id: m['admin.settings.fields.tawk_property_id'],
  tawk_widget_id: m['admin.settings.fields.tawk_widget_id'],
};

const TIP_MESSAGES: Record<string, Message> = {
  signup_ip_daily_limit: m['admin.settings.tips.signup_ip_daily_limit'],
  default_llm_provider: m['admin.settings.tips.default_llm_provider'],
  agent_model: m['admin.settings.tips.agent_model'],
  default_image_provider: m['admin.settings.tips.default_image_provider'],
  default_video_provider: m['admin.settings.tips.default_video_provider'],
  openai_base_url: m['admin.settings.tips.openai_base_url'],
  anthropic_base_url: m['admin.settings.tips.anthropic_base_url'],
  google_one_tap_enabled: m['admin.settings.tips.google_one_tap_enabled'],
  creem_product_ids_mapping: m['admin.settings.tips.creem_product_ids_mapping'],
  r2_upload_path: m['admin.settings.tips.r2_upload_path'],
  r2_endpoint: m['admin.settings.tips.r2_endpoint'],
  grouter_model_map: m['admin.settings.tips.grouter_model_map'],
  plausible_domain: m['admin.settings.tips.plausible_domain'],
  plausible_src: m['admin.settings.tips.plausible_src'],
  clarity_project_id: m['admin.settings.tips.clarity_project_id'],
  adsense_code: m['admin.settings.tips.adsense_code'],
};

function messageOrFallback(
  messages: Record<string, Message>,
  key: string,
  fallback: string
) {
  return messages[key]?.() ?? fallback;
}

export function settingTabLabel(name: string, fallback: string) {
  return messageOrFallback(TAB_MESSAGES, name, fallback);
}

export function settingGroupLabel(name: string, fallback: string) {
  return messageOrFallback(GROUP_MESSAGES, name, fallback);
}

export function settingFieldLabel(name: string, fallback: string) {
  return messageOrFallback(FIELD_MESSAGES, name, fallback);
}

export function settingTip(name: string, fallback?: string) {
  return messageOrFallback(TIP_MESSAGES, name, fallback ?? '');
}
