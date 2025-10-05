const { User, Entry, Transaction, RafflePool } = require('../models');
const { Op } = require('sequelize');
const messageManager = require('../utils/messageManager');

module.exports = (bot) => {

bot.action('admin_manage_partners', async (ctx) => {
  try {
    const users = await User.findAll({
      attributes: ['id', 'telegram_id', 'telegram_username', 'partner'],
      order: [['createdAt', 'DESC']],
      limit: 50
    });

    if (users.length === 0) {
      return ctx.reply('⚠️ No users found.');
    }

    const keyboard = [];
    for (let i = 0; i < users.length; i += 3) {
      const rowPromises = users.slice(i, i + 3).map(async (u) => {
        try {
          const chat = await ctx.telegram.getChat(u.telegram_id);
          const name = chat.first_name || chat.username || 'User';
          return {
            text: `${name} ${u.partner ? '✅' : '❌'}`,
            callback_data: `admin_view_partner_${u.id}`
          };
        } catch (err) {
          console.warn(`⚠️ Could not fetch name for ${u.telegram_id}`);
          return {
            text: `${u.telegram_username || 'Unknown'} ${u.partner ? '✅' : '❌'}`,
            callback_data: `admin_view_partner_${u.id}`
          };
        }
      });

      const row = await Promise.all(rowPromises);
      keyboard.push(row);
    }

    await ctx.reply('👥 All Users (✅ = Partner, ❌ = Not Partner)\n\nTap a name to manage:', {
      reply_markup: { inline_keyboard: keyboard }
    });

  } catch (error) {
    console.error('Error listing partners:', error);
    ctx.reply('❌ Could not load users.');
  }
});


  
bot.action(/admin_approve_partner_(\d+)/, async (ctx) => {
  const userId = ctx.match[1];
  await User.update(
    { partner: true, partner_start_date: new Date() },
    { where: { id: userId } }
  );
  await ctx.reply('✅ Partner approved successfully.');
});

bot.action(/admin_remove_partner_(\d+)/, async (ctx) => {
  const userId = ctx.match[1];
  await User.update({ partner: false }, { where: { id: userId } });
  await ctx.reply('🚫 Partner removed successfully.');
});



bot.action(/admin_view_partner_(\d+)/, async (ctx) => {
  const userId = ctx.match[1];
  const user = await User.findByPk(userId);
  if (!user) return ctx.reply('❌ User not found.');

  let firstName = 'Unknown';
  try {
    const chat = await ctx.telegram.getChat(user.telegram_id);
    firstName = chat.first_name || chat.username || 'User';
  } catch {
    console.warn(`⚠️ Could not fetch Telegram name for ${user.telegram_id}`);
  }

  const info = `👤 <b>${firstName}</b>\n`
    + `💬 Username: @${user.telegram_username || 'N/A'}\n`
    + `🆔 Telegram ID: ${user.telegram_id}\n`
    + `🏷️ Status: ${user.partner ? '✅ Partner' : '❌ Not Partner'}`;

  const buttons = user.partner
    ? [[{ text: '❌ Remove Partner', callback_data: `admin_remove_partner_${userId}` }]]
    : [[{ text: '✅ Approve as Partner', callback_data: `admin_approve_partner_${userId}` }]];

  await ctx.replyWithHTML(info, { reply_markup: { inline_keyboard: buttons } });
});




bot.action(/admin_partner_(\d+)/, async (ctx) => {
    const userId = ctx.match[1];
    const user = await User.findByPk(userId);
    if (!user) return ctx.answerCbQuery('User not found');

    const keyboard = [
        [
            { text: '✅ Approve Partner', callback_data: `approve_partner_${userId}` },
            { text: '❌ Remove Partner', callback_data: `remove_partner_${userId}` }
        ],
        [{ text: '⬅️ Back', callback_data: 'admin_manage_partners' }]
    ];

    await ctx.editMessageText(
        `👤 <b>${user.telegram_username}</b>\nID: ${user.id}\nReferral Code: ${user.referral_code}\n\nChoose an action:`,
        { parse_mode: 'HTML', reply_markup: { inline_keyboard: keyboard } }
    );
});

bot.action(/approve_partner_(\d+)/, async (ctx) => {
    const userId = ctx.match[1];
    const user = await User.findByPk(userId);
    if (!user) return ctx.answerCbQuery('User not found');

    user.partner = true;
    user.partner_start_date = new Date();
    await user.save();

    await ctx.editMessageText(`✅ ${user.telegram_username} has been approved as a partner.`);
});

bot.action(/remove_partner_(\d+)/, async (ctx) => {
    const userId = ctx.match[1];
    const user = await User.findByPk(userId);
    if (!user) return ctx.answerCbQuery('User not found');

    user.partner = false;
    await user.save();

    await ctx.editMessageText(`🚫 ${user.telegram_username} has been removed as a partner.`);
});

}