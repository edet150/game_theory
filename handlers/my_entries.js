const { User, Entry, RafflePool } = require('../models');

module.exports = (bot) => {
  bot.command('my_entries', async (ctx) => {
    const telegramId = ctx.from.id;

    try {
      const user = await User.findOne({ where: { telegram_id: telegramId } });
      if (!user) {
        return ctx.reply("You don't have any entries yet. Use /start to begin!");
      }

      const entries = await Entry.findAll({
        where: { user_id: user.id },
        include: [{
          model: RafflePool,
          attributes: ['name']
        }]
      });

      if (entries.length === 0) {
        return ctx.reply("You haven't purchased any entries yet. Use /start to begin!");
      }

      const entriesByPool = entries.reduce((acc, entry) => {
        const poolName = entry.RafflePool.name;
        if (!acc[poolName]) {
          acc[poolName] = [];
        }
        acc[poolName].push(entry.entry_number);
        return acc;
      }, {});

      let replyMessage = '📝 Your Entries:\n\n';
      for (const pool in entriesByPool) {
        replyMessage += `**${pool} Arena:**\n`;
        replyMessage += `${entriesByPool[pool].sort((a, b) => a - b).join(', ')}\n\n`;
      }

      ctx.reply(replyMessage, { parse_mode: 'markdown' });

    } catch (error) {
      console.error('Error handling /my_entries:', error);
      ctx.reply('Oops! Something went wrong while retrieving your entries. Please try again later.');
    }
  });
};