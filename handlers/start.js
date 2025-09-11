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
    'Every Sunday at 6:00 PM WAT, we select *one strategist (winner)* from each pool. The system is built on fairness and transparency.\n\n' +
    
    '1️⃣ *Winning Number*: We take the first Bitcoin block hash mined after 6:00 PM Lagos Time. The *last 4 digits* of this hash form the winning number.\n\n' +
    
    '2️⃣ *Exact Match Wins*: If any entry matches those 4 digits exactly, that player wins instantly.\n\n' +
    
    '3️⃣ *Inverse Match (Fairness Fallback)*: If no exact match exists, we look for entries that match the *inverse* of the winning number. ' +
    '(Example: If winning number is 1234, we look for entries with 4321)\n\n' +
    
    '4️⃣ *Game Theory Balance*: If no exact or inverse match, we map the number to the pool size using modulo arithmetic. ' +
    'This guarantees a winner every single round.\n\n' +
    
    '5️⃣ *Verify the Winning Number*: Anyone can check the block hash on btcscan.org to confirm fairness.\n\n' +
    
    '✅ This isn\'t luck alone — it\'s strategy, randomness, and transparency working together.', 
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: "⬅️ Back", callback_data: "start" }]
        ]
      }
    }
  );
});


// Modified start command
bot.start(async (ctx) => {
  await cleanupSelectionMessages(ctx);
try {
    // Check if entries are locked
    const isLocked = await redis.get('entries_locked');
    if (isLocked) {
        console.log("⛔ Entries are locked.");
        return await ctx.reply('🔒 Entries are currently locked. Please try again later.');
    }

    // Check for referral parameter
    const startParams = ctx.startPayload;
    let referrer = null;

    console.log("👉 Start params:", startParams);

    if (startParams && startParams.startsWith('ref_')) {
        const referralCode = startParams.replace('ref_', '');
        console.log("🔑 Extracted referralCode:", referralCode);
        referrer = await User.findOne({ where: { referral_code: referralCode } });
        console.log("👥 Referrer found:", referrer ? referrer.toJSON() : null);
    }

    const telegramId = ctx.from.id;
    const telegramUsername = ctx.from.username || `user_${telegramId}`;

    console.log("🙋 User Telegram ID:", telegramId, "Username:", telegramUsername);

    // Create or update user with referral info
    const [user, created] = await User.findOrCreate({
        where: { telegram_id: telegramId },
        defaults: { 
            telegram_username: telegramUsername,
            referred_by: referrer ? referrer.id : null,
            referral_code: telegramUsername, // ⚠️ Might need random generator
        }
    });

    console.log("🆕 User created?:", created);
    console.log("📌 User record after findOrCreate:", user.toJSON());

    // If user already exists but doesn't have a referral code
    if (!created && !user.referral_code) {
        console.log("⚡ Assigning new referral code to existing user");
        user.referral_code = Math.random().toString(36).substring(2, 10).toUpperCase();
        await user.save();
    }

    // If user was referred and this is their first time
    if (referrer && created) {
        console.log(`🎉 New user referred by: ${referrer.telegram_username} (ID: ${referrer.id})`);
        referrer.total_referrals += 1;
        await referrer.save();
        await sendSuccess(ctx, `🎉 Welcome! You were referred by ${referrer.telegram_username}`);
    }

    // Update existing user if they didn’t already have a referrer
    if (!created && referrer && !user.referred_by) {
        console.log(`🔗 Adding referrer to existing user: ${referrer.id}`);
        user.referred_by = referrer.id;
        await user.save();

        referrer.total_referrals += 1;
        await referrer.save();
    }

    console.log("✅ Done handling referral flow for user:", user.id);

    await showStartScreen(ctx);

} catch (error) {
    console.error('❌ Error in start command:', error);
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
        weekLabel = `${latestWeek.week_number} `;
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
    const welcomeText =
        `👋 Welcome to <b>Game Theory </b>\n\n` +
        `Where numbers meet strategy.\n\n` +
        `<b>This Round:</b>  ${weekLabel}\n` +
        `<b>Prize Pool:</b>  ${prizeMoney}\n\n` +
        `<b>Play Window:</b>  Monday–Friday\n` +
        `<b>Result Drop:</b>  Sunday 6:00 PM (Africa/Lagos)\n\n` +
        `Choose your arena below to make your move:`

    // Send welcome message
    const welcomeMessage = await ctx.reply(welcomeText, {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
         [{ text: 'Alpha Arena (₦100/entry)', callback_data: `select_pool:Alpha` }],
                [{ text: '🔒 Beta Arena (₦500/10 entries)', callback_data: `select_pool:Beta` }],
                [{ text: 'How It Works', callback_data: 'how_it_works' }],
                [{ text: 'My Moves', callback_data: 'view_entries' }],
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

`👋 Welcome to *Game Theory* Where numbers meet strategy 🎭\n` +
`Where numbers meet strategy.\n\n` +
`📅 *This Round:* ${weekLabel}\n` +
`⚡ *Price Pool:* prizeMoney\n\n` +
`⏰ *Play Window:* Monday–Friday\n` +
`📢 *Result Drop:* Sunday 6:00 PM (Africa/Lagos)\n\n` +
`Choose your arena below to make your move:`,
      {
        parse_mode: 'markdown',
        reply_markup: {
           inline_keyboard: [
          [{ text: '💰 Alpha Arena (₦100/entry)', callback_data: `select_pool:Alpha` }],
          [{ text: '🔒 Beta Arena (₦500/10 entries)', callback_data: `select_pool:Beta` }],
        //   [{ text: '🔒 HighRollers Arena (₦1000/ 20 entries)', callback_data: `select_pool:HighRollers` }],
          [{ text: 'ℹ️ How It Works', callback_data: 'how_it_works' }],
          [{ text: '📋 My Moves', callback_data: 'view_entries' }],
          [{ text: '🎯 Referral Dashboard', callback_data: 'referral_dashboard' }],
        ]
        }
      }
    );

    ctx.session.welcomeMessageId = fallbackMessage.message_id;
  }
});
};