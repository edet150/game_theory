// bot.js
const { Telegraf, Markup } = require('telegraf');
const Redis = require('ioredis');

let botInstance2 = null;
let redisClient2 = null;

function initializeBot() {
  if (botInstance2) return botInstance2; // prevent re-init

  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN2;
  if (!BOT_TOKEN) {
    console.error('Error: TELEGRAM_BOT_TOKEN environment variable is not set.');
    process.exit(1);
  }

  botInstance2 = new Telegraf(BOT_TOKEN);
  console.log('✅ Telegram bot initialized');

  // Create Redis client
  redisClient2 = new Redis({
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD || null,
    db: 0,
  });

  // Attach Redis session middleware
  // Attach Redis session middleware
  botInstance2.use(async (ctx, next) => {
    const chatId = ctx.chat?.id || ctx.from?.id;
    if (!chatId) return next();

    const sessionKey = `session:${chatId}`;
    try {
      const sessionData = await redisClient2.get(sessionKey); // ✅ use redisClient2
      ctx.session = sessionData ? JSON.parse(sessionData) : {};
    } catch (error) {
      console.error('Redis session error:', error);
      ctx.session = {};
    }

    await next();

    try {
      if (!ctx.session || Object.keys(ctx.session).length === 0) {
        await redisClient2.del(sessionKey); // ✅ use redisClient2
      } else {
        await redisClient2.set(sessionKey, JSON.stringify(ctx.session), 'EX', 3600); // ✅ use redisClient2
      }
    } catch (error) {
      console.error('Redis save error:', error);
    }
  });


  // Example: session counter middleware (optional)
  botInstance2.use(async (ctx, next) => {
    ctx.session.counter = ctx.session.counter || 0;
    ctx.session.counter++;
    console.log('Session counter:', ctx.session.counter);
    return next();
  });

  return botInstance2;
}

// ✅ Auto-initialize right here
initializeBot();

function getbotInstance2() {
  if (!botInstance2) throw new Error('Bot instance not initialized yet');
  return botInstance2;
}

function getRedisClient2() {
  if (!redisClient2) throw new Error('Redis client not initialized yet');
  return redisClient2;
}

// Export both bot + Markup globally usable
module.exports = {
  getbotInstance2,
  getRedisClient2,
  Markup
};
