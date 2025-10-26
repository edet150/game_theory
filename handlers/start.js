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

bot.command("ad_statistics", async (ctx) => {
  const input = ctx.message.text.split(" ")[1];
  if (input) {
    const key = `ads:${input}`;
    const members = await redis.smembers(key);
    if (!members.length) return ctx.reply(`No users for ad=${input}`);

    let list = `📋 <b>Ad ${input} Users</b>\n\n`;
    members.forEach((m, i) => {
      const u = JSON.parse(m);
      list += `${i + 1}. @${u.username} (${u.telegramId})\n`;
    });
    return ctx.reply(list, { parse_mode: "HTML" });
  }

  // otherwise show summary
  const keys = await redis.keys("ads:*");
  if (!keys.length) return ctx.reply("📊 No ad data yet.");

  let summary = "📢 <b>Ad Campaign Stats</b>\n\n";
  for (const key of keys) {
    const adCode = key.split(":")[1];
    const members = await redis.smembers(key);
    summary += `🆔 <b>Ad ${adCode}</b>\n👥 ${members.length} unique users\n\n`;
  }

  await ctx.reply(summary, { parse_mode: "HTML" });
});
bot.command('cd1', async (ctx) => {
  try {
    const telegram_id = ctx.chat.id;
    const id = ctx.message.text.split(' ')[1]; // e.g. /confirm 12345

    // You can fetch the data for this id if needed
    // const summary_data = await getSummaryById(id);

    const summaryMessage = `
🟢 *ENTRY CONFIRMATION SUMMARY*

◎ *Draw:* Mega Raffle Draw
◎ *Price per entry:* ₦500 per entry
◎ *Entries purchased:* 5
◎ *Selection method:* Auto Pick
◎ *Your numbers:* 12, 34, 45, 56, 67
◎ *Entry positions:* 1st, 2nd, 3rd, 4th, 5th

◎ *Entry time:* October 19, 2025, 4:30 PM
◎ *Raffle Week:* Week 42
◎ *Status:* Confirmed and paid.
◎ *How It Works:* You can win with your number or position — click /howitworks to see more.

💡 *Remember: The Raffle Draw takes place on 26th October, 2025 at 6:00 PM*
`;

    // Send the GIF first
    await ctx.replyWithAnimation({ source: '../images/Congratulations.gif' });

    // Then send the confirmation message
    await ctx.telegram.sendMessage(telegram_id, summaryMessage, { parse_mode: 'Markdown' });

  } catch (err) {
    console.error('Error sending confirmation message:', err);
    ctx.reply('⚠️ An error occurred while sending the confirmation.');
  }
});
bot.command('cd2', async (ctx) => {
  try {
    const telegram_id = ctx.chat.id;
    const id = ctx.message.text.split(' ')[1]; // e.g. /confirm 12345

    // You can fetch the data for this id if needed
    // const summary_data = await getSummaryById(id);

    const summaryMessage = `
🟢 *ENTRY CONFIRMATION SUMMARY*

◎ *Draw:* Mega Raffle Draw
◎ *Price per entry:* ₦500 per entry
◎ *Entries purchased:* 5
◎ *Selection method:* Auto Pick
◎ *Your numbers:* 12, 34, 45, 56, 67
◎ *Entry positions:* 1st, 2nd, 3rd, 4th, 5th

◎ *Entry time:* October 19, 2025, 4:30 PM
◎ *Raffle Week:* Week 42
◎ *Status:* Confirmed and paid.
◎ *How It Works:* You can win with your number or position — click /howitworks to see more.

💡 *Remember: The Raffle Draw takes place on 26th October, 2025 at 6:00 PM*
`;

    // Send the GIF first
    await ctx.replyWithAnimation({ source: './images/deposit.mp4' });

    // Then send the confirmation message
    await ctx.telegram.sendMessage(telegram_id, summaryMessage, { parse_mode: 'Markdown' });

  } catch (err) {
    console.error('Error sending confirmation message:', err);
    ctx.reply('⚠️ An error occurred while sending the confirmation.');
  }
});


bot.command('how_it_works', async (ctx) => {


  // Send image from local `/images` folder in your project root
  const imagePath = "./images/block.jpg"; // adjust path if needed
  await messageManager.sendPhotoAndTrack(ctx, imagePath, {
    caption:
      '🎭 <b>The Rules of the Game</b>\n\n' +
      'Every Sunday at 6:00 PM WAT, we select <b>one strategist (winner)</b> from each Draw.\n\n' +
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
bot.command('howitworks', async (ctx) => {


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
    const isInChannel = await isUserInChannel(ctx, REQUIRED_CHANNEL);

    if (!isInChannel) {
     return await ctx.reply(
        `<b>Join our official channel</b> — this is where winners are announced every Sunday.\n\n` +
        `◎ Watch live winner updates\n` +
        `◎ Get notified about new draws\n` +
        `◎ See total entries and prizes\n\n` +
        `<b>Steps:</b>\n` +
        `1️⃣ Click <b>Join Channel</b> and join the channel\n` +
        `2️⃣ Return here and tap <b>✅ Verify</b> to continue.`,
        {
          parse_mode: "HTML",
          disable_web_page_preview: true,
          reply_markup: {
            inline_keyboard: [
              [{ text: "📢 Join Channel", url: `https://t.me/${REQUIRED_CHANNEL.replace('@', '')}` }],
              [{ text: "✅ Verify", callback_data: "verify_channel" }],
            ],
          },
        }
      );
    }

    // ✅ Already in channel → proceed directly
    await handleReferralAndStart(ctx);

  } catch (error) {
    console.error('❌ Error in start command:', error);
    await sendError(ctx, 'Something went wrong. Please try again.');
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
  `👋 Welcome to <b>Modulo Raffle Draw</b>!\n\n` +
  `<b>This Week:</b> ${weekLabel}\n` +
  `<b>Jackpot Prize:</b> ₦${Number(prizeMoney).toLocaleString()}\n\n` +
  `<b>Entries Open:</b> Monday to Saturday\n` +
  `<b>Winner Announcement:</b> Sunday by 6:00 PM (Africa/Lagos)\n\n` +
  `🎯 <b>How It Works:</b>\n` +
  `1️⃣ Select an Draw below to enter the raffle\n` +
  `2️⃣ Each Draw includes different entry amounts and prices\n` +
  `3️⃣ Wait for the winner announcement on Sunday!\n\n` +
  `💡 <b>Tip:</b> The more entries you have, the better your chances of winning this week’s jackpot!\n\n` +
  `👇 Choose your Draw to begin:`;

const welcomeMessage = await ctx.reply(welcomeText, {
  parse_mode: 'HTML',
  reply_markup: {
    inline_keyboard: [
        [{ text: '🎟 Single Draw – ₦200 for 1 entry', callback_data: `select_pool:Single` }],
        [{ text: '💰 Value Draw – ₦500 for 5 entries', callback_data: `select_pool:Value` }],
        [{ text: '🔥 Mega Draw – ₦1000 for 15 entries (Best Value!)', callback_data: `select_pool:Mega` }],
        // [{ text: '💸 Refer & Earn – Get 10% per referral', callback_data: `refer_and_earn` }]

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
  `👋 Welcome to *Game Theory* — where numbers meet strategy.\n\n` +
  `📅 *This Round:* ${weekLabel}\n` +
  `💰 *Jackpot Prize:* ₦${Number(prizeMoney).toLocaleString()}\n\n` +
  `⏰ *Entries Open:* Monday–Saturday\n` +
  `🏆 *Winner Announced:* Sunday by 6:00 PM (Africa/Lagos)\n\n` +
  `🎯 *How It Works:*\n` +
  `1️⃣ Select a draw category below\n` +
  `2️⃣ Get your entry ticket(s)\n` +
  `3️⃣ Wait for the Sunday draw to see if you’ve won!\n\n` +
  `💡 *Tip:* The more entries you have, the higher your chance of winning!\n\n` +
  `👇 Choose your draw category to begin:`,
  {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: '🎟 Single Draw – ₦200 for 1 entry', callback_data: `select_pool:Single` }],
        [{ text: '💰 Value Draw – ₦500 for 5 entries', callback_data: `select_pool:Value` }],
        [{ text: '🔥 Mega Draw – ₦1000 for 15 entries (Best Value!)', callback_data: `select_pool:Mega` }],
        // [{ text: '💸 Refer & Earn – Get 10% per referral', callback_data: `refer_and_earn` }]
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
async function handleUserReferral(ctx) {
  console.log("🚀 [handleUserReferral] Start");
  const startParams = ctx.startPayload; // e.g. "ref_778&ad=001"
  let referrer = null;
  let adCode = null;
  let isNewUser = false;

  console.log("📦 startParams =", startParams);

if (startParams) {
  console.log('🌍 startParams =', startParams); // e.g. "ref_official_iso" or "ref_official_iso-ad-001"

  // ✅ Extract referral code (everything after "ref_" until end or until "-ad-")
  let referralCode = null;
  adCode = null;

  if (startParams.includes('-ad-')) {
    // Format: ref_CODE-ad-ADCODE
    const refMatch = startParams.match(/ref_([\w-]+?)-ad-/);
    const adMatch = startParams.match(/-ad-([\w-]+)/);
    
    referralCode = refMatch ? refMatch[1] : null;
    adCode = adMatch ? adMatch[1] : null;
  } else {
    // Format: ref_CODE (no ad code)
    const refMatch = startParams.match(/ref_([\w-]+)/);
    referralCode = refMatch ? refMatch[1] : null;
  }

  console.log('🎯 Extracted referralCode =', referralCode);
  console.log('🎯 Extracted adCode =', adCode);

  // Find referrer if referral code exists
  if (referralCode) {
    referrer = await User.findOne({ where: { referral_code: referralCode } });
    console.log('👤 Referrer found:', referrer ? referrer.telegram_username : 'NOT FOUND');
  }
}
  const telegramId = ctx.from.id;
  const currentUsername = ctx.from.username || `user_${telegramId}`;
  const firstName = ctx.from.first_name || 'user';

  console.log("💬 Telegram info:", { telegramId, currentUsername, firstName });

  // Check if user exists FIRST
  let user = await User.findOne({ where: { telegram_id: telegramId } });
  
  if (!user) {
    console.log("🆕 Creating NEW user");
    // User doesn't exist - create with referral data
    user = await User.create({
      telegram_id: telegramId,
      telegram_username: currentUsername,
      referred_by: referrer ? referrer.id : null,
      referral_code: generateReferralCode(firstName),
    });
    isNewUser = true;
    console.log("🧾 NEW user created:", user.toJSON());
  } else {
    console.log("✅ EXISTING user found:", user.toJSON());
    // Update username if changed
    if (user.telegram_username !== currentUsername) {
      console.log("✏️ Updating username from", user.telegram_username, "to", currentUsername);
      user.telegram_username = currentUsername;
      await user.save();
    }
  }

  // 🎯 AD CODE TRACKING - ONLY for new users (first time creation)
  if (adCode && isNewUser) {
    const redisKey = `ads:${adCode}`;
    console.log("🧠 Adding NEW user to redis ad tracking:", redisKey);
    await redis.sadd(redisKey, JSON.stringify({ 
      telegramId, 
      username: currentUsername,
      joined_at: new Date().toISOString()
    }));
    console.log("✅ Ad code tracked for new user");
  }

  // 🔗 REFERRAL PROCESSING - Only process if user is new AND has a referrer
  if (isNewUser && referrer && referrer.id !== user.id) {
    console.log("🔗 Processing referral for new user");
    
    // Update user's referred_by if not set
    if (!user.referred_by) {
      user.referred_by = referrer.id;
      await user.save();
      console.log("✅ User saved with referred_by =", user.referred_by);
    }

    // Increment referrer's total_referrals
    referrer.total_referrals += 1;
    await referrer.save();
    console.log("📈 Referrer total_referrals incremented to", referrer.total_referrals);

    await sendSuccess(ctx, `🎉 Welcome! You were referred by @${referrer.telegram_username}`);
  } else if (isNewUser && referrer) {
    console.log("🆕 New user with referrer");
    await sendSuccess(ctx, `🎉 Welcome! You were referred by @${referrer.telegram_username}`);
  } else if (isNewUser) {
    console.log("🆕 New user without referrer");
    await sendSuccess(ctx, `🎉 Welcome to the lottery!`);
  } else {
    console.log("ℹ️ Existing user - no referral processing needed");
  }

  console.log("✅ [handleUserReferral] Done - isNewUser:", isNewUser);
  return { user, created: isNewUser, referrer };
}


// Modified /start command
bot.start(async (ctx) => {
  try {
    await cleanupSelectionMessages(ctx);
    await handleUserReferral(ctx);

    const isInChannel = await isUserInChannel(ctx, REQUIRED_CHANNEL);

    if (!isInChannel) {
      return await ctx.reply(
        `<b>Join our official channel</b> — This is where <b>WINNERS</b> are announced <b>EVERY SUNDAY</b>.\n\n` +
        `◎ Get live winner updates\n` +
        `◎ Get notified about new draws\n` +
        `◎ See total entries and prizes\n\n` +
        `<b>Steps:</b>\n` +
        `1️⃣ Click <b>Join Channel</b> and join the channel\n` +
        `2️⃣ Return here and tap <b>✅ Verify</b> to continue.`,
        {
          parse_mode: "HTML",
          disable_web_page_preview: true,
          reply_markup: {
            inline_keyboard: [
              [{ text: "📢 Join Channel", url: `https://t.me/${REQUIRED_CHANNEL.replace('@', '')}` }],
              [{ text: "✅ Verify", callback_data: "verify_channel" }],
            ],
          },
        }
      );

    }

    // ✅ User already in channel → continue
    await handleReferralAndStart(ctx);

  } catch (error) {
    console.error("❌ Error in /start:", error);
    await sendError(ctx, "Something went wrong. Please try again.");
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
  await sendSuccess(ctx, `Verified! Welcome aboard 🎉`);
  await handleReferralAndStart(ctx);
  // const fullName = [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(" ");
  // 🎉 Send a welcome message to the channel

try {
  const fullName = [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(" ");

//   await ctx.telegram.sendMessage(
//     REQUIRED_CHANNEL, // channel username or numeric ID
// `🎉 Please welcome <a href="tg://user?id=${ctx.from.id}">${fullName}</a>!  
      
// They just verified and joined our community 🚀`,
//     {
//       parse_mode: "HTML",
//       reply_markup: {
//         inline_keyboard: [
//           [
//             {
//               text: "🎭 Return to Game Theory Bot",
//               url: `https://t.me/${process.env.BOT_NAME}`
//             }
//           ]
//         ]
//       }
//     }
//   );
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

  
async function handleUserReferral_(ctx) {
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