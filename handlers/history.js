// handlers/history.js
const redisService = require('../services/redisService');
const { User, RafflePool, Entry, Week, sequelize } = require('../models');
const { Op } = require("sequelize");
module.exports = (bot) => {
    // Command to view all entries
    bot.command('my_entries', async (ctx) => {
  try {
    // 1. Find user by telegram_id
    const user = await User.findOne({ where: { telegram_id: ctx.from.id } });
    if (!user) {
      return ctx.reply('❌ No user account found for your Telegram ID.');
    }
    const userId = user.id;

    // 2. Fetch latest week info
    const today = new Date();

    let currentWeek = await Week.findOne({
      where: {
        starts_at: { [Op.lte]: today },
        ends_at: { [Op.gte]: today }
      }
    });

    if (!currentWeek) {
      currentWeek = await Week.findOne({
        order: [['ends_at', 'DESC']]
      });
    }

    if (!currentWeek) {
      return ctx.reply('❌ No week found in the database.');
    }

    let weekLabel = currentWeek.week_name || 'Current Week';
    let weekCode = currentWeek.code;

    // 3. Get user's entries for that week
    const userEntries = await Entry.findAll({
      where: { user_id: userId, status: 'paid', week_code: weekCode },
      order: [['id', 'ASC']],
      include: [{ model: RafflePool }]
    });

    if (userEntries.length === 0) {
      return ctx.reply('You have no active entries. Purchase some with /start');
    }

    // 4. Get all entries for this week (to calculate positions)
    const allEntries = await Entry.findAll({
      where: { week_code: weekCode, status: 'paid' },
      order: [['id', 'ASC']]
    });

    const positionMap = new Map();
    allEntries.forEach((entry, idx) => {
      positionMap.set(entry.id, idx + 1); // positions start at 1
    });

    // 5. Build message
    let message = `*${weekLabel}* (Code: *${weekCode}*)\n`;
    message += `You have *${userEntries.length}* active entries:\n\n`;

    userEntries.forEach((entry, index) => {
      const pos = positionMap.get(entry.id) || '?';
      message +=
        `*🎯 Entry ${index + 1}* (POS *${pos}*)\n` +
        `🏷️ *Arena:* *${entry.RafflePool?.name || 'N/A'}*\n` +
        `🔢 *Number:* *${entry.entry_number}*\n` +
        `⏰ *Date:* *${new Date(entry.createdAt).toLocaleString()}*\n` +
        '─'.repeat(30) + '\n\n';
    });

    await ctx.reply(message, { parse_mode: 'Markdown' });

  } catch (error) {
    console.error('Error fetching entries:', error);
    await ctx.reply('❌ Could not retrieve your entries. Please try again.');
  }
    });

    // Button handler for viewing entries
const keyboard = {
  reply_markup: {
    inline_keyboard: [
      [{ text: "🔄 Start Over", callback_data: "start_over" }],
      [{ text: "🎯 Referral Dashboard", callback_data: "referral_dashboard" }]
    ]
  }
};

bot.action('view_entries', async (ctx) => {
  await ctx.answerCbQuery();

  try {
    // 1. Find user by telegram_id
    const user = await User.findOne({ where: { telegram_id: ctx.from.id } });
    if (!user) {
      return ctx.reply('❌ No user account found for your Telegram ID.');
    }
    const userId = user.id;

    // 2. Fetch latest week info
    const today = new Date();

    let currentWeek = await Week.findOne({
      where: {
        starts_at: { [Op.lte]: today },
        ends_at: { [Op.gte]: today }
      }
    });

    if (!currentWeek) {
      currentWeek = await Week.findOne({
        order: [['ends_at', 'DESC']]
      });
    }

    if (!currentWeek) {
      return ctx.reply('❌ No week found in the database.');
    }

    let weekLabel = currentWeek.week_name || 'Current Week';
    let weekCode = currentWeek.code;

    // 3. Get user's entries for that week
    const userEntries = await Entry.findAll({
      where: { user_id: userId, status: 'paid', week_code: weekCode },
      order: [['id', 'ASC']],
      include: [{ model: RafflePool }]
    });

    if (userEntries.length === 0) {
      return ctx.reply('You have no active entries. Purchase some with /start');
    }

    // 4. Get all entries for this week (to calculate positions)
    const allEntries = await Entry.findAll({
      where: { week_code: weekCode, status: 'paid' },
      order: [['id', 'ASC']]
    });

    const positionMap = new Map();
    allEntries.forEach((entry, idx) => {
      positionMap.set(entry.id, idx + 1); // positions start at 1
    });

    // 5. Build message
    let message = `*${weekLabel}* (Code: *${weekCode}*)\n`;
    message += `You have *${userEntries.length}* active entries:\n\n`;

    userEntries.forEach((entry, index) => {
      const pos = positionMap.get(entry.id) || '?';
      message +=
        `*🎯 Entry ${index + 1}* (POS *${pos}*)\n` +
        `🏷️ *Arena:* *${entry.RafflePool?.name || 'N/A'}*\n` +
        `🔢 *Number:* *${entry.entry_number}*\n` +
        `⏰ *Date:* *${new Date(entry.createdAt).toLocaleString()}*\n` +
        '─'.repeat(30) + '\n\n';
    });

    await ctx.reply(message, { parse_mode: 'Markdown' });

  } catch (error) {
    console.error('Error fetching entries:', error);
    await ctx.reply('❌ Could not retrieve your entries. Please try again.');
  }
});



};