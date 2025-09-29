// botFactory.js
const { Telegraf, Markup } = require('telegraf');
const Redis = require('ioredis');

function createBot(token) {
  const bot = new Telegraf(token);
  const redisClient = new Redis({
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD || null,
    db: 0,
  });

  bot.use(async (ctx, next) => {
    const chatId = ctx.chat?.id || ctx.from?.id;
    if (!chatId) return next();

    const sessionKey = `session:${chatId}`;
    try {
      const sessionData = await redisClient.get(sessionKey);
      ctx.session = sessionData ? JSON.parse(sessionData) : {};
    } catch {
      ctx.session = {};
    }

    await next();

    try {
      if (!ctx.session || Object.keys(ctx.session).length === 0) {
        await redisClient.del(sessionKey);
      } else {
        await redisClient.set(sessionKey, JSON.stringify(ctx.session), 'EX', 3600);
      }
    } catch {}
  });

  return { bot, redisClient, Markup };
}

module.exports = { createBot };
