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
    '🎭 <b>The Rules of the Game</b>\n\n' +
    'Every Sunday at 6:00 PM WAT, we select <b>one strategist (winner)</b> from each pool. The system is built on fairness and transparency.\n\n' +
    
    '1️⃣ <b>Winning Number</b>: We take the first Bitcoin block hash mined after 6:00 PM Lagos Time. The <b>last 4 digits</b> of this hash form the winning number.\n\n' +
    
    '2️⃣ <b>Exact Match Wins</b>: If any entry matches those 4 digits exactly, that player wins instantly.\n\n' +
    
    '3️⃣ <b>Inverse Match (Fairness Fallback)</b>: If no exact match exists, we look for entries that match the <b>inverse</b> of the winning number. ' +
    '(Example: If winning number is 1234, we look for entries with 4321)\n\n' +
    
    '4️⃣ <b>Game Theory Balance</b>: If no exact or inverse match, we map the number to the pool size using modulo arithmetic. ' +
    'This guarantees a winner every single round.\n\n' +
    
    '5️⃣ <b>Verify the Winning Number</b>: Anyone can check the block hash on btcscan.org to confirm fairness.\n\n' +
    
    '✅ This isn\'t luck alone — it\'s strategy, randomness, and transparency working together.', 
    {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [{ text: "🔙 Back", callback_data: "start_over" }]
        ]
      }
    }
  );
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
        `<b>Prize Amount:</b>  ${prizeMoney}\n\n` +
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
                [{ text: 'My Entries', callback_data: 'view_entries' }],
                [{ text: 'Referral Dashboard', callback_data: 'referral_dashboard' }],
        ]
      }
    });

  
    // Store the welcome message ID for future cleanup
    ctx.session.welcomeMessageId = welcomeMessage.message_id;
    
  } catch (error) {
    console.error('Error fetching week information:', error);

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
        let prizeMoney = "₦100,000"; // Default value
    if (weekCode) {
      const winning = await Winning.findOne({
        where: { week_code: weekCode }
      });

      if (winning) {
        prizeMoney = `₦${winning.winning_amount.toLocaleString()}`;
      }
    }

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
          [{ text: 'Alpha Arena (₦100/entry)', callback_data: `select_pool:Alpha` }],
          [{ text: '🔒 Beta Arena (₦500/10 entries)', callback_data: `select_pool:Beta` }],
        //   [{ text: '🔒 HighRollers Arena (₦1000/ 20 entries)', callback_data: `select_pool:HighRollers` }],
          [{ text: 'How It Works', callback_data: 'how_it_works' }],
          [{ text: 'My Entries', callback_data: 'view_entries' }],
          [{ text: 'Referral Dashboard', callback_data: 'referral_dashboard' }],
        ]
        }
      }
    );

    ctx.session.welcomeMessageId = fallbackMessage.message_id;
  }
});
  
  
  // 🔍 Utility to check membership
async function isUserInChannel(ctx, channelUsername) {
  try {
    const member = await ctx.telegram.getChatMember(channelUsername, ctx.from.id);
    return ['member', 'administrator', 'creator'].includes(member.status);
  } catch (error) {
    console.error("⚠️ Error checking channel membership:", error.message);
    return false;
  }
}

const REQUIRED_CHANNEL = `@${process.env.CHANNEL_NAME}`; // <-- replace with your channel

// Modified /start command
bot.start(async (ctx) => {
  await cleanupSelectionMessages(ctx);

  try {
    const isInChannel = await isUserInChannel(ctx, REQUIRED_CHANNEL);

    if (!isInChannel) {
      // If not in channel, show join + verify buttons
      return await ctx.reply(
`🎉 <b>Welcome!</b> To enjoy the full experience, please join our official channel.

<b>Inside the channel, you’ll get:</b>  
  - 🏆 <b>Winner announcements</b> (see who’s winning in real time!)
   
  - 🎁 <b>Exclusive offers</b> and bonus opportunities
   
  - 🔔 <b>Updates</b> on new draws and promotions
   
  - 👥 <b>Transparency</b>: see entries made by other players and total winning amounts  

  👉 <b>Join now</b> and then click <b>✅ Verify</b> to unlock access!`,
       {
          parse_mode: "HTML",
          disable_web_page_preview: true,
          reply_markup: {
            inline_keyboard: [
              [{ text: "📢 Join Channel", url: `https://t.me/${REQUIRED_CHANNEL.replace('@','')}` }],
              [{ text: " Verify", callback_data: "verify_channel" }]
            ]
          }
        }
      );
    }

    // ✅ Already in channel → proceed directly
    await handleReferralAndStart(ctx);

  } catch (error) {
    console.error('❌ Error in start command:', error);
    await sendError(ctx, 'Something went wrong. Please try again.');
  }
});

  // // 🔁 Verify button callback
  // bot.action("verify_channel", async (ctx) => {
  //   await ctx.answerCbQuery("Checking… ⏳");

  //   const isInChannel = await isUserInChannel(ctx, REQUIRED_CHANNEL);

  //   if (!isInChannel) {
  //     return await ctx.reply(
  //         `<b>❌ Error:</b> You havent joined our channel yet\n\n `+
  //         `To enjoy the full experience, please join our official channel.`,
  //       {
  //           parse_mode: "HTML",
  //           disable_web_page_preview: true,
  //           reply_markup: {
  //             inline_keyboard: [
  //               [{ text: "📢 Join Channel", url: `https://t.me/${REQUIRED_CHANNEL.replace('@','')}` }],
  //               [{ text: " Verify", callback_data: "verify_channel" }]
  //             ]
  //           }
  //         }
  //       );
  //   }

  //   // ✅ Verified → continue
  //   // await ctx.reply("✅ Verified! Welcome aboard 🎉");
  //   await sendSuccess(ctx, `✅ Verified! Welcome aboard 🎉`);
  //   await handleReferralAndStart(ctx);
  // });
  // 🔁 Verify button callback
bot.action("verify_channel", async (ctx) => {
  await ctx.answerCbQuery("Checking… ⏳");

  const isInChannel = await isUserInChannel(ctx, REQUIRED_CHANNEL);

  if (!isInChannel) {
    return await ctx.reply(
      `<b>❌ Error:</b> You haven’t joined our channel yet.<br><br>` +
      `To enjoy the full experience, please join our official channel.`,
      {
        parse_mode: "HTML",
        disable_web_page_preview: true,
        reply_markup: {
          inline_keyboard: [
            [{ text: "📢 Join Channel", url: `https://t.me/${REQUIRED_CHANNEL.replace('@','')}` }],
            [{ text: "Verify", callback_data: "verify_channel" }]
          ]
        }
      }
    );
  }

  // ✅ Verified → continue
  await sendSuccess(ctx, `✅ Verified! Welcome aboard 🎉`);
  await handleReferralAndStart(ctx);

  // 🎉 Send a welcome message to the channel
  try {
    await ctx.telegram.sendMessage(
      REQUIRED_CHANNEL, // channel username or numeric ID
      `🎉 Please welcome <a href="tg://user?id=${ctx.from.id}">${ctx.from.first_name}</a>!  
      
      They just verified and joined our community 🚀`,
      { parse_mode: "HTML" }
    );
  } catch (err) {
    console.error("⚠️ Could not send welcome message to channel:", err.message);
  }
});


// 🔧 Extracted function to handle your referral + start logic
async function handleReferralAndStart(ctx) {
  const isLocked = await redis.get('entries_locked');
  if (isLocked) {
    return await ctx.reply('🔒 Entries are currently locked. Please try again later.');
  }

  const startParams = ctx.startPayload;
  let referrer = null;

  if (startParams && startParams.startsWith('ref_')) {
    const referralCode = startParams.replace('ref_', '');
    referrer = await User.findOne({ where: { referral_code: referralCode } });
  }

  const telegramId = ctx.from.id;
  const telegramUsername = ctx.from.username || `user_${telegramId}`;

  const [user, created] = await User.findOrCreate({
    where: { telegram_id: telegramId },
    defaults: { 
      telegram_username: telegramUsername,
      referred_by: referrer ? referrer.id : null,
      referral_code: telegramUsername,
    }
  });

  if (!created && !user.referral_code) {
    user.referral_code = Math.random().toString(36).substring(2, 10).toUpperCase();
    await user.save();
  }

  if (referrer && created) {
    referrer.total_referrals += 1;
    await referrer.save();
    await sendSuccess(ctx, `🎉 Welcome! You were referred by ${referrer.telegram_username}`);
  }

  if (!created && referrer && !user.referred_by) {
    user.referred_by = referrer.id;
    await user.save();

    referrer.total_referrals += 1;
    await referrer.save();
  }

  await showStartScreen(ctx);
}

};