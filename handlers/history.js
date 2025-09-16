// handlers/history.js
const redisService = require('../services/redisService');
const { User, RafflePool, Entry, Week, sequelize } = require('../models');
const { Op } = require("sequelize");
module.exports = (bot) => {
    // Command to view all entries
    bot.command('my_entries', async (ctx) => {
        try {
            const entries = await redisService.getFinalizedEntries(ctx.from.id);
            
            if (entries.length === 0) {
                return ctx.reply('You have no active entries. Purchase some with /start');
            }

            let message = '📋 Your Entries:\n\n';
            
            entries.forEach((entry, index) => {
                message += `🎯 **Entry ${index + 1}**\n`;
                message += `🏷️ **Arena:** ${entry.poolName}\n`;
                message += `🔢 **Numbers:** ${entry.numbers.join(', ')}\n`;
                message += `📊 **Quantity:** ${entry.quantity}\n`;
                message += `🎲 **Method:** ${entry.method}\n`;
                message += `🏆 **Week:** ${entry.lottery_week_number}\n`;
                message += `⏰ **Date:** ${new Date(entry.timestamp).toLocaleString()}\n`;
                message += '─'.repeat(30) + '\n\n';
            });

            ctx.reply(message, { parse_mode: 'Markdown' });

        } catch (error) {
            console.error('Error fetching entries:', error);
            ctx.reply('❌ Could not retrieve your entries. Please try again.');
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
    const userId = ctx.from.id;

    // 1. Get user's entries from DB
    const userEntries = await Entry.findAll({
      where: { user_id: userId, status: 'paid' },
      order: [['id', 'ASC']],
      include: [{ model: RafflePool }]
    });

    if (userEntries.length === 0) {
      return ctx.reply('You have no active entries. Purchase some with /start');
    }

    // 2. Determine the week_code (assume from the first entry)
    const weekCode = userEntries[0].week_code;

    // 3. Get all entries for this week
    const allEntries = await Entry.findAll({
      where: { week_code: weekCode, status: 'paid' },
      order: [['id', 'ASC']]
    });

    // 4. Build map of entry_id -> absolute position
    const positionMap = new Map();
    allEntries.forEach((entry, idx) => {
      positionMap.set(entry.id, idx + 1); // start positions at 1
    });

    // 5. Build message with 2 entries per line
    let message = `📋 Your Entries (Week ${weekCode}):\n\n`;

    userEntries.forEach((entry, index) => {
      const pos = positionMap.get(entry.id) || '?';
      const entryText =
        `🎯 Entry ${index + 1} (POS ${pos})\n` +
        `🏷️ Arena: ${entry.RafflePool?.name || 'N/A'}\n` +
        `🔢 Number: ${entry.entry_number}\n` +
        `⏰ Date: ${new Date(entry.created_at).toLocaleString()}\n`;

      // Group entries in pairs
      if (index % 2 === 0) {
        message += entryText; // first in pair
      } else {
        message += entryText + '\n' + '─'.repeat(30) + '\n\n'; // close the pair
      }
    });

    // If odd number of entries, add separator at end
    if (userEntries.length % 2 !== 0) {
      message += '\n' + '─'.repeat(30) + '\n\n';
    }

    await ctx.reply(message);

  } catch (error) {
    console.error('Error fetching entries:', error);
    await ctx.reply('❌ Could not retrieve your entries. Please try again.');
  }
});



};