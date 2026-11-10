import 'dotenv/config';

const num = (v, d) => (v === undefined || v === '' ? d : Number(v));
const list = (v) => (v || '').split(',').map((s) => s.trim()).filter(Boolean);

export const config = {
  port: num(process.env.PORT, 8080),
  env: process.env.NODE_ENV || 'development',
  publicUrl: process.env.PUBLIC_URL || 'http://localhost:8080',
  corsOrigins: list(process.env.CORS_ORIGINS),
  jwtSecret: process.env.JWT_SECRET || 'dev-secret',
  currency: process.env.CURRENCY || 'COP',
  storage: { driver: process.env.STORAGE_DRIVER || 'local', dir: process.env.UPLOAD_DIR || './uploads' },
  whatsapp: {
    token: process.env.WHATSAPP_TOKEN,
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
    appSecret: process.env.WHATSAPP_APP_SECRET,
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN,
    graph: `https://graph.facebook.com/${process.env.WHATSAPP_GRAPH_VERSION || 'v21.0'}`,
    allowed: list(process.env.WHATSAPP_ALLOWED_NUMBERS),
    sendAck: process.env.WHATSAPP_SEND_ACK === 'true',
  },
  google: {
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    exportFolder: process.env.GOOGLE_EXPORT_FOLDER_ID,
  },
  ai: {
    anthropicKey: process.env.ANTHROPIC_API_KEY,
    model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5',
    stt: process.env.STT_PROVIDER || 'none',
    openaiKey: process.env.OPENAI_API_KEY,
  },
  alegra: {
    email: process.env.ALEGRA_EMAIL,
    token: process.env.ALEGRA_TOKEN,
    defaultCategoryId: process.env.ALEGRA_DEFAULT_CATEGORY_ID, // cuenta contable para productos sin ítem en Alegra
    bankAccountId: process.env.ALEGRA_BANK_ACCOUNT_ID,         // cuenta de banco/caja para registrar pagos
    warehouseId: process.env.ALEGRA_WAREHOUSE_ID,
    creditDays: num(process.env.ALEGRA_CREDIT_DAYS, 30),
    taxIds: { 19: process.env.ALEGRA_TAX_IVA19_ID, 5: process.env.ALEGRA_TAX_IVA5_ID, 8: process.env.ALEGRA_TAX_INC8_ID },
    defaultClientId: process.env.ALEGRA_DEFAULT_CLIENT_ID, // contacto "Consumidor final"
    webhookSecret: process.env.ALEGRA_WEBHOOK_SECRET || 'cambia-este-secreto',
    syncCron: process.env.ALEGRA_SYNC_CRON || '*/30 * * * *',
    autoPush: process.env.ALEGRA_AUTO_PUSH === 'true',
  },
  insights: {
    dailyCron: process.env.INSIGHTS_DAILY_CRON || '30 22 * * *',
    sendToWhatsApp: list(process.env.INSIGHTS_WHATSAPP_TO),
  },
  rules: {
    serviceLevel: num(process.env.SERVICE_LEVEL, 0.95),
    autoApplyConfidence: num(process.env.AUTO_APPLY_CONFIDENCE, 0.85),
    autoApplyEnabled: process.env.AUTO_APPLY_ENABLED === 'true',
    duplicateWindowHours: num(process.env.DUPLICATE_WINDOW_HOURS, 12),
    minorPct: num(process.env.MINOR_DIFF_PCT, 0.05),
    minorAbs: num(process.env.MINOR_DIFF_ABS, 1),
  },
};
