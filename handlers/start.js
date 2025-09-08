const { User, Winning, Entry, Week , sequelize} = require('../models');
const { showStartScreen, cleanupSelectionMessages } = require('../startFunction');
const messageManager = require('../utils/messageManager');
const { sendError, sendSuccess } = require('../utils/responseUtils');
const { Op } = require("sequelize");
const { getbotInstance, getRedisClient } = require('../bot/botInstance.js');
const redis = getRedisClient();
module.exports = (bot) => {


bot.action('how_it_works', async (ctx) => {
    await ctx.answerCbQuery();  
    const message = await messageManager.sendAndTrack(ctx, 
        '🎉 *How Winners Are Selected*\n\n' +
        'We pick *one winner* from each of our three pools every Saturday at 3:00 PM. The process is fully transparent and based on the Bitcoin blockchain.\n\n' +
        '1️⃣ *Winning Number*: After the draw time, we take the hash of the first Bitcoin block mined. A section of this hash is used as the winning number for each pool.\n\n' +
        '2️⃣ *Exact Match First*: If a player\'s entry exactly matches the winning number, they win instantly.\n\n' +
        '3️⃣ *Guaranteed Winner*: If no exact match, we apply the winning number to the pool size using the modulo operator. This fairly maps the number to one of the entries, ensuring there is always a winner.\n\n' +
        '4️⃣ *Verify Yourself*: Anyone can check the block hash on a public blockchain explorer like blockchain.com to confirm the result.\n\n' +
        '✅ This means the process is random, transparent, and impossible to manipulate.'
    );
});

// Modified start command
bot.start(async (ctx) => {
  await cleanupSelectionMessages(ctx);
  
  try {
       // Check if entries are locked
        const isLocked = await redis.get('entries_locked');
        if (isLocked) {
            return await ctx.reply('🔒 Entries are currently locked. Please try again later.');
        }

        // Check for referral parameter
        const startParams = ctx.startPayload;
        let referrer = null;
        
        if (startParams && startParams.startsWith('ref_')) {
            const referralCode = startParams.replace('ref_', '');
            referrer = await User.findOne({ where: { referral_code: referralCode } });
        }

        const telegramId = ctx.from.id;
        const telegramUsername = ctx.from.username || `user_${telegramId}`;


      // Create or update user with referral info
        const [user, created] = await User.findOrCreate({
            where: { telegram_id: telegramId },
            defaults: { 
                telegram_username: telegramUsername,
                referred_by: referrer ? referrer.id : null,
                referral_code:telegramUsername, // Add referral code generation
            }
        });
    
         // If user already exists but doesn't have a referral code, generate one
        if (!created && !user.referral_code) {
            user.referral_code = Math.random().toString(36).substring(2, 10).toUpperCase();
            await user.save();
        }

        // If user was referred and this is their first time
        if (referrer && created) {
            // Update referrer's stats
            referrer.total_referrals += 1;
            await referrer.save();
            
            // Send welcome message to new user
            await sendSuccess(ctx, `🎉 Welcome! You were referred by ${referrer.telegram_username}`);
        }

        // Update existing user if needed
        if (!created && referrer && !user.referred_by) {
            user.referred_by = referrer.id;
            await user.save();
            
            referrer.total_referrals += 1;
            await referrer.save();
        }

        await showStartScreen(ctx);

    } catch (error) {
        console.error('Error in start command:', error);
        await sendError(ctx, 'Something went wrong. Please try again.');
    }
});

  
bot.action("start_over", async (ctx) => {
  await ctx.answerCbQuery();
  
  try {
    // Delete the bot's prompt message if it exists
    if (ctx.session.startPromptMessageId) {
      try {
        await ctx.telegram.deleteMessage(ctx.chat.id, ctx.session.startPromptMessageId);
      } catch (error) {
        console.log('Could not delete prompt message:', error.message);
      }
      delete ctx.session.startPromptMessageId;
    }
    
    // Delete the current message with the button
    if (ctx.callbackQuery && ctx.callbackQuery.message) {
      try {
        await ctx.deleteMessage();
      } catch (error) {
        console.log('Could not delete callback message:', error.message);
      }
    }
  } catch (error) {
    console.log('Error deleting messages:', error.message);
  }
  
  // Clear session (but keep some essential data if needed)
  const essentialData = {
    // Preserve any data you want to keep across sessions
  };
  ctx.session = essentialData;
  
  try {
    // Fetch latest week info
        const today = new Date();
  
          // Get current week (based on dates)
          const currentWeek = await Week.findOne({
          where: {
              starts_at: { [Op.lte]: today },
              ends_at: { [Op.gte]: today }
          }
          });
    // If no current week found, get the latest week
    let weekLabel = 'Current Week';
    let weekCode = '';
    
    if (currentWeek) {
      weekLabel = `${currentWeek.week_name} (Week ${currentWeek.week_number}, ${currentWeek.year})`;
      weekCode = currentWeek.code;
    } else {
      // Fallback: get the most recent week
      const latestWeek = await Week.findOne({
        order: [['createdAt', 'DESC']]
      });
      if (latestWeek) {
        weekLabel = `${latestWeek.week_name} (Week ${latestWeek.week_number}, ${latestWeek.year})`;
        weekCode = latestWeek.code;
      }
    }

    // Fetch current week's winning record using the weekCode
    let prizeMoney = "₦100,000"; // Default value
    if (weekCode) {
      const winning = await Winning.findOne({
        where: { week_code: weekCode }
      });

      if (winning) {
        prizeMoney = `₦${winning.winning_amount.toLocaleString()}`;
      }
    }

    // Compose welcome message
    const welcomeText = `👋 Welcome to *Alpha Entries*!  
Get a chance to win exciting jackpots every Saturday 🎉  

📅 *This Week:* ${weekLabel}  
💰 *Prize Pool:* ${prizeMoney}  

Please select your draw below to enter:`;

    // Send welcome message
    const welcomeMessage = await ctx.reply(welcomeText, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '💰 Alpha Draw (₦100/entry)', callback_data: `select_pool:Alpha` }],
          [{ text: 'ℹ️ How It Works', callback_data: 'how_it_works' }],
          [{ text: '📋 My Entries', callback_data: 'view_entries' }],
          [{ text: '🎯 Referral Dashboard', callback_data: 'referral_dashboard' }],
        ]
      }
    });
  
    // Store the welcome message ID for future cleanup
    ctx.session.welcomeMessageId = welcomeMessage.message_id;
    
  } catch (error) {
    console.error('Error fetching week information:', error);
    // Fallback welcome message if there's an error
    const fallbackMessage = await ctx.reply(
      `👋 Welcome to *Alpha Entries*!  
Get a chance to win exciting jackpots every Saturday 🎉  

Please select your draw below to enter:`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '💰 Alpha Draw (₦100/entry)', callback_data: `select_pool:Alpha` }],
            [{ text: 'ℹ️ How It Works', callback_data: 'how_it_works' }],
            [{ text: '📋 My Entries', callback_data: 'view_entries' }],
            [{ text: '🎯 Referral Dashboard', callback_data: 'referral_dashboard' }],
          ]
        }
      }
    );
    ctx.session.welcomeMessageId = fallbackMessage.message_id;
  }
});
};