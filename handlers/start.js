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
      '🎭 *The Rules of the Game*\n\n' +
      'Every Saturday at 3:00 PM WAT, we select *one strategist (winner)* from each pool. The system is built on fairness and transparency, powered by the Bitcoin blockchain.\n\n' +
      '1️⃣ *Signal Number*: We take the first Bitcoin block hash mined after noon (12:00 PM WAT). The *last 4 digits* of this hash form the winning number.\n\n' +
      '2️⃣ *Exact Strategy Wins*: If your entry matches those 4 digits, you win instantly.\n\n' +
      '3️⃣ *Game Theory Balance*: If no exact match, we map the number to the pool size using modulo. This guarantees a winner every round.\n\n' +
      '4️⃣ *Verify the Play*: Anyone can check the block hash on explorers like blockchain.com to confirm fairness.\n\n' +
      '✅ This isn’t luck alone — it’s strategy, randomness, and transparency working together.'
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
    const welcomeText = `👋 Welcome to *Alpha Plays*!  
    Step into the game and test your strategy every Saturday 🎉  

    📅 *This Week:* ${weekLabel}  
    💰 *Prize Pool:* ${prizeMoney}  

    Choose your arena below to make a move:`;

    // Send welcome message
    const welcomeMessage = await ctx.reply(welcomeText, {
      parse_mode: 'MarkdownV2',
      reply_markup: {
        inline_keyboard: [
          [{ text: '💰 Alpha Arena (₦100/play)', callback_data: `select_pool:Alpha` }],
          [{ text: 'ℹ️ How It Works', callback_data: 'how_it_works' }],
          [{ text: '📋 My Plays', callback_data: 'view_entries' }],
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
    Step into the game and test your strategy every Saturday 🎉  

    Choose your arena below to make a move:`,
      {
        parse_mode: 'MarkdownV2',
        reply_markup: {
          inline_keyboard: [
            [{ text: '💰 Alpha Arena (₦100/play)', callback_data: `select_pool:Alpha` }],
            [{ text: 'ℹ️ How It Works', callback_data: 'how_it_works' }],
            [{ text: '📋 My Plays', callback_data: 'view_entries' }],
            [{ text: '🎯 Referral Dashboard', callback_data: 'referral_dashboard' }],
          ]
        }
      }
    );

    ctx.session.welcomeMessageId = fallbackMessage.message_id;
  }
});
};