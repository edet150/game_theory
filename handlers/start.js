const { User, Winning, Entry, Week , sequelize} = require('../models');
const { showStartScreen, cleanupSelectionMessages } = require('../startFunction');
const messageManager = require('../utils/messageManager');
const { sendError, sendSuccess } = require('../utils/responseUtils');
const { Op } = require("sequelize");
const { getbotInstance, getRedisClient } = require('../bot/botInstance.js');
const redis = getRedisClient();
const fs = require('fs');
const path = require('path');
module.exports = (bot) => {


bot.command('how_it_works', async (ctx) => {


  // Send image from local `/images` folder in your project root
  const imagePath = "./images/block.jpg"; // adjust path if needed
  await messageManager.sendPhotoAndTrack(ctx, imagePath, {
    caption:
      '🎭 <b>The Rules of the Game</b>\n\n' +
      'Every Sunday at 6:00 PM WAT, we select <b>one strategist (winner)</b> from each pool.\n\n' +
      '1️⃣ <b>Winning Number</b>: The last 4 digits of the first Bitcoin block hash mined after 6:00 PM.\n\n' +
      '2️⃣ <b>Exact Match Wins</b>: Exact 4 digits = instant win.\n\n' +
      '3️⃣ <b>Inverse Match</b>: If no exact, we check reversed digits.\n\n' +
      '4️⃣ <b>Modulo Fallback</b>: If no match, we divide the winning number by total entries and take the remainder as the winner’s position. ' +
      'Example (from image above): 9293 (winning number) with 100 entries → remainder 93, so the <b>93rd entry</b> wins. Always guarantees a winner.\n\n' +
      '🪑 <b>What is Position?</b>\n' +
      'Think of position like seats in a row. The first entry is seat 1, the second entry is seat 2, and so on. ' +
      'If modulo gives us 93, it simply means the person sitting in seat 93 wins.\n\n' +
      '💡 <b>Strategy Tip</b>: Spread your entries across different positions. This gives you more coverage and better chances if modulo decides the winner.\n\n' +
      '✅ <b>Transparency</b>: Anyone can verify the winning number at btcscan.org.\n',
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [
        [{ text: "🔙 Back", callback_data: "start_over" }]
      ]
    }
  });
});

bot.action('how_it_works', async (ctx) => {
  await ctx.answerCbQuery();

  // Send image from local `/images` folder in your project root
  const imagePath = "./images/block.jpg"; // adjust path if needed
  await messageManager.sendPhotoAndTrack(ctx, imagePath, {
    caption:
      '🎭 <b>The Rules of the Game</b>\n\n' +
      'Every Sunday at 6:00 PM WAT, we select <b>one strategist (winner)</b> from each pool.\n\n' +
      '1️⃣ <b>Winning Number</b>: The last 4 digits of the first Bitcoin block hash mined after 6:00 PM.\n\n' +
      '2️⃣ <b>Exact Match Wins</b>: Exact 4 digits = instant win.\n\n' +
      '3️⃣ <b>Inverse Match</b>: If no exact, we check reversed digits.\n\n' +
      '4️⃣ <b>Modulo Fallback</b>: If no match, we divide the winning number by total entries and take the remainder as the winner’s position. ' +
      'Example (from image above): 9293 (winning number) with 100 entries → remainder 93, so the <b>93rd entry</b> wins. Always guarantees a winner.\n\n' +
      '🪑 <b>What is Position?</b>\n' +
      'Think of position like seats in a row. The first entry is seat 1, the second entry is seat 2, and so on. ' +
      'If modulo gives us 93, it simply means the person sitting in seat 93 wins.\n\n' +
      '💡 <b>Strategy Tip</b>: Spread your entries across different positions. This gives you more coverage and better chances if modulo decides the winner.\n\n' +
      '✅ <b>Transparency</b>: Anyone can verify the winning number at btcscan.org.\n',
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [
        [{ text: "🔙 Back", callback_data: "start_over" }]
      ]
    }
  });
});




  bot.action('how_it_work', async (ctx) => {
    await ctx.answerCbQuery();
      const imagePath = path.join(__dirname, 'images', 'how_it_works.jpg');
    const message = await messageManager.sendAndTrack(ctx, 
      '🎭 <b>The Rules of the Game</b>\n\n' +
      'Every Sunday at 6:00 PM WAT, we select <b>one strategist (winner)</b> from each pool. The system is built on fairness and transparency.\n\n' +
      
      '1️⃣ <b>Winning Number</b>: We take the first Bitcoin block hash mined after 6:00 PM. The <b>last 4 digits</b> of this hash form the winning number.\n\n' +
      
      '2️⃣ <b>Exact Match Wins</b>: If any entry matches those 4 digits exactly, that player wins instantly.\n\n' +
      
      '3️⃣ <b>Inverse Match (Fairness Fallback)</b>: If no exact match exists, we look for entries that match the <b>inverse</b> of the winning number. ' +
      '(Example: If winning number is 1234, we look for entries with 4321)\n\n' +
      
      '4️⃣ <b>Game Theory Balance</b>: If no exact or inverse match, we map the number to the pool size using modulo arithmetic. ' +
      'This guarantees a winner every single round.\n\n' +
      
      '5️⃣ <b>Verify the Winning Number</b>: Anyone can check the block hash on btcscan.org to confirm fairness.\n\n',
      
      // '✅ This isn\'t luck alone — it\'s strategy, randomness, and transparency working together.', 
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
        if (ctx.session.welcomeMessageId) {
          try {
    
              try {
                await ctx.deleteMessage(ctx.session.welcomeMessageId);
                // delete ctx.session.welcomeMessageId;
              } catch (err) {
                console.log('Could not delete confirmation message:', err.message);
              }

          } catch (error) {
            console.log('Could not schedule confirmation message deletion:', error.message);
          }
        }

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
        console.log(winning)
        if (winning) {
          prizeMoney = `₦${winning.winning_amount.toLocaleString()}`;
        }
      }
      const cleanedPrizeMoney = prizeMoney.replace(/[^0-9.-]+/g, ''); // removes commas, $, etc.

      const numericPrizeMoney = Number(cleanedPrizeMoney);
      console.log('weekCode', numericPrizeMoney)
      // Compose welcome message
      const welcomeText =
          `👋 Welcome to <b>Game Theory </b>\n\n` +
          `Where numbers meet strategy.\n\n` +
          `<b>This Round:</b>  ${weekLabel}\n` +
          `<b>Winner Gets:</b>  ₦${numericPrizeMoney.toLocaleString()}\n\n` +
          `<b>Entry Window:</b>  Monday–Saturday\n` +
          `<b>Result Drop:</b>  Sunday 6:00 PM (Africa/Lagos)\n\n` +
          `Choose your arena below to make your move:`

      // Send welcome message
      const welcomeMessage = await ctx.reply(welcomeText, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
                  [{ text: 'How It Works', callback_data: 'how_it_works' }],
                [{ text: 'Alpha Arena (₦200 per entry)', callback_data: `select_pool:Alpha` }],
                               [{ text: 'Beta Arena (₦500 per 5 entries)', callback_data: `select_pool:Beta` }],
                [{ text: 'HighRollers Arena (₦1000 per 15 entries)', callback_data: `select_pool:HighRollers` }],
                [{ text: '🔒 Bonus Arena (₦1000 for 25 entries)', callback_data: `select_pool:Bonus` }],
                  [{ text: 'My Entries', callback_data: 'view_entries' }],
                  [{ text: 'Referral Dashboard', callback_data: 'referral_dashboard' }],
                  [
                { text: '🏦 Setup Bank Account', callback_data: 'bank_setup' },
                { text: '📋 My Bank Details', callback_data: 'bank_details' }
              ],
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
  `⚡ *Winner Gets:*  ₦${Number(prizeMoney).toLocaleString()}\n\n` +
  `⏰ *Play Window:*  Monday–Saturday\n` +
  `📢 *Result Drop:*  Sunday 6:00 PM (Africa/Lagos)\n\n` +
  `Choose your arena below to make your move:`,
        {
          parse_mode: 'markdown',
          reply_markup: {
               inline_keyboard: [
                  // [{ text: 'How It Works', callback_data: 'how_it_works' }],
                [{ text: 'Alpha Arena (₦200 / entry)', callback_data: `select_pool:Alpha` }],
                [{ text: 'Beta Arena (₦500 for 5 entries)', callback_data: `select_pool:Beta` }],
                [{ text: 'HighRollers Arena (₦1000 for 15 entries)', callback_data: `select_pool:HighRollers` }],
                // [{ text: '🔒 Bonus Arena (₦1000 for 25 entries)', callback_data: `select_pool:Bonus` }],
                  // [{ text: 'My Entries', callback_data: 'view_entries' }],
                  // [{ text: 'Referral Dashboard', callback_data: 'referral_dashboard' }],
              //     [
              //   { text: '🏦 Setup Bank Account', callback_data: 'bank_setup' },
              //   { text: '📋 My Bank Details', callback_data: 'bank_details' }
              // ],
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
  handleUserReferral(ctx)
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

  // 🔁 Verify button callback
bot.action("verify_channel", async (ctx) => {
  await ctx.answerCbQuery("Checking… ⏳");

  const isInChannel = await isUserInChannel(ctx, REQUIRED_CHANNEL);

  if (!isInChannel) {
    return await ctx.reply(
      `<b>❌ Error:</b> You haven’t joined our channel yet.\n\n` +
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
  // const fullName = [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(" ");
  // 🎉 Send a welcome message to the channel

try {
  const fullName = [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(" ");

  await ctx.telegram.sendMessage(
    REQUIRED_CHANNEL, // channel username or numeric ID
`🎉 Please welcome <a href="tg://user?id=${ctx.from.id}">${fullName}</a>!  
      
They just verified and joined our community 🚀`,
    {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "🎭 Return to Game Theory Bot",
              url: `https://t.me/${process.env.BOT_NAME}`
            }
          ]
        ]
      }
    }
  );
} catch (err) {
  console.error("⚠️ Could not send welcome message to channel:", err.message);
}

});


// 🔧 Extracted function to handle your referral + start logic
// async function handleReferralAndStart(ctx) {
//   const isLocked = await redis.get('entries_locked');
//   if (isLocked) {
//     return await ctx.reply('🔒 Entries are currently locked. Please try again later.');
//   }

//   const startParams = ctx.startPayload;
//   let referrer = null;

//   if (startParams && startParams.startsWith('ref_')) {
//     const referralCode = startParams.replace('ref_', '');
//     referrer = await User.findOne({ where: { referral_code: referralCode } });
//   }

//   const telegramId = ctx.from.id;
//   const telegramUsername = ctx.from.username || `user_${telegramId}`;

//   const [user, created] = await User.findOrCreate({
//     where: { telegram_id: telegramId },
//     defaults: { 
//       telegram_username: telegramUsername,
//       referred_by: referrer ? referrer.id : null,
//       referral_code: telegramUsername,
//     }
//   });

//   if (!created && !user.referral_code) {
//     user.referral_code = Math.random().toString(36).substring(2, 10).toUpperCase();
//     await user.save();
//   }

//   if (referrer && created) {
//     referrer.total_referrals += 1;
//     await referrer.save();
//     await sendSuccess(ctx, `🎉 Welcome! You were referred by ${referrer.telegram_username}`);
//   }

//   if (!created && referrer && !user.referred_by) {
//     user.referred_by = referrer.id;
//     await user.save();

//     referrer.total_referrals += 1;
//     await referrer.save();
//   }

//   await showStartScreen(ctx);
// }

  async function handleReferralAndStart(ctx) {
  const isLocked = await redis.get('entries_locked');
  // if (isLocked) {
  //   return await ctx.reply('🔒 Entries are currently locked.  Please try again later.');
  // }

  const user = await handleUserReferral(ctx);

  await showStartScreen(ctx);
}

  
async function handleUserReferral(ctx) {
  const startParams = ctx.startPayload;
  let referrer = null;

  if (startParams && startParams.startsWith('ref_')) {
    const referralCode = startParams.replace('ref_', '');
    referrer = await User.findOne({ where: { referral_code: referralCode } });
  }

  const telegramId = ctx.from.id;
  const currentUsername = ctx.from.username || `user_${telegramId}`;
  const firstName = ctx.from.first_name || 'user';

  const [user, created] = await User.findOrCreate({
    where: { telegram_id: telegramId },
    defaults: {
      telegram_username: currentUsername,
      referred_by: referrer ? referrer.id : null,
      referral_code: generateReferralCode(firstName),
    },
  });

  // 🔄 Update username if it has changed
  if (!created && user.telegram_username !== currentUsername) {
    user.telegram_username = currentUsername;
    await user.save();
  }

  // 🔑 Ensure referral_code exists
  if (!user.referral_code) {
    user.referral_code = generateReferralCode(firstName);
    await user.save();
  }

  // 🤝 Handle referral logic
  if (referrer && created) {
    referrer.total_referrals += 1;
    await referrer.save();
    await sendSuccess(ctx, `🎉 Welcome! You were referred by ${referrer.telegram_username}`);
  }

  // ⚙️ Assign referrer for existing user (only once)
  if (!created && referrer && !user.referred_by) {
    user.referred_by = referrer.id;
    await user.save();

    referrer.total_referrals += 1;
    await referrer.save();
  }

  return {
  user,
  created,
  referrer,
};

}

// 🔧 Generate a referral code from first name + random digits
function generateReferralCode(firstName) {
  const sanitized = firstName.replace(/[^a-zA-Z0-9]/g, '').toUpperCase(); // Remove non-alphanumerics
  const trimmed = sanitized.slice(0, 8); // Limit to 8 characters
  const randomDigits = Math.floor(10000 + Math.random() * 90000); // 5-digit number
  return `${trimmed}${randomDigits}`;
}




};