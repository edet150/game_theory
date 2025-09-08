// bot.js
const { Telegraf, Markup } = require('telegraf');
const Redis = require('ioredis');

let botInstance = null;
let redisClient = null;

function initializeBot() {
  if (botInstance) return botInstance; // prevent re-init

  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  if (!BOT_TOKEN) {
    console.error('Error: TELEGRAM_BOT_TOKEN environment variable is not set.');
    process.exit(1);
  }

  botInstance = new Telegraf(BOT_TOKEN);
  console.log('✅ Telegram bot initialized');

  // Create Redis client
  redisClient = new Redis({
    host: process.env.TELEGRAM_SESSION_HOST || '127.0.0.1',
    port: process.env.TELEGRAM_SESSION_PORT || 6379,
    password: process.env.REDIS_PASSWORD || null,
    db: 0,
  });

  // Attach Redis session middleware
  botInstance.use(async (ctx, next) => {
    const chatId = ctx.chat?.id || ctx.from?.id;
    if (!chatId) return next();

    const sessionKey = `session:${chatId}`;
    try {
      const sessionData = await redisClient.get(sessionKey);
      ctx.session = sessionData ? JSON.parse(sessionData) : {};
    } catch (error) {
      console.error('Redis session error:', error);
      ctx.session = {};
    }

    await next();

    try {
      if (!ctx.session || Object.keys(ctx.session).length === 0) {
        await redisClient.del(sessionKey);
      } else {
        await redisClient.set(sessionKey, JSON.stringify(ctx.session), 'EX', 3600);
      }
    } catch (error) {
      console.error('Redis save error:', error);
    }
  });

  // Example: session counter middleware (optional)
  botInstance.use(async (ctx, next) => {
    ctx.session.counter = ctx.session.counter || 0;
    ctx.session.counter++;
    console.log('Session counter:', ctx.session.counter);
    return next();
  });

  return botInstance;
}

// ✅ Auto-initialize right here
initializeBot();

function getbotInstance() {
  if (!botInstance) throw new Error('Bot instance not initialized yet');
  return botInstance;
}

function getRedisClient() {
  if (!redisClient) throw new Error('Redis client not initialized yet');
  return redisClient;
}

// Export both bot + Markup globally usable
module.exports = {
  getbotInstance,
  getRedisClient,
  Markup
};
