
// handlers/giveaway.js
const db = require('../models');
const axios = require('axios');

// Constants
const REQUIRED_CHANNEL = process.env.GIVEAWAY_CHANNEL || '@modulo_giveaway';
const ENTRY_FEE = 2000; // N2000 entry fee

// Helper functions (same as before, but updated for campaigns)
async function isUserInChannel(ctx, channelUsername) {
  try {
    const member = await ctx.telegram.getChatMember(channelUsername, ctx.from.id);
    return ['member', 'administrator', 'creator'].includes(member.status);
  } catch (error) {
    console.error("⚠️ Error checking channel membership:", error.message);
    return false;
  }
}

async function fetchBanksFromPaystack_() {
  try {
    const response = await axios.get('https://api.paystack.co/bank', {
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SEC_TEST}`
      }
    });
    return response.data.data;
  } catch (error) {
    console.error('Error fetching banks:', error);
    return [];
  }
}
const { getRedisClient } = require("../bot/botInstance");
async function fetchBanksFromPaystack() {
  const redisClient = getRedisClient();

  try {
    // first check redis before hitting Paystack
    const cacheKey = "paystack:banks";
    const cachedBanks = await redisClient.get(cacheKey);

    if (cachedBanks) {
      // console.log('yesssssssssss')
      return JSON.parse(cachedBanks);
    }
// console.log('noooooooooooooooo')
    // if not cached, call Paystack
    const response = await axios.get("https://api.paystack.co/bank", {
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SEC_TEST}`,
      },
    });

    const banks = response.data.data;

    // save to redis with expiry
    await redisClient.set(cacheKey, JSON.stringify(banks), "EX", 3600);

    return banks;
  } catch (error) {
    console.error("Error fetching banks:", error);
    return [];
  }
}

async function verifyAccountWithPaystack(accountNumber, bankCode) {
  try {
    const response = await axios.get(
      `https://api.paystack.co/bank/resolve?account_number=${accountNumber}&bank_code=${bankCode}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SEC_TEST}`
        }
      }
    );
    return response.data;
  } catch (error) {
    console.error('Error verifying account:', error);
    throw error;
  }
}

// Get next entry number for current active campaign
async function getNextEntryNumber(campaignId) {
  try {
    const lastEntry = await db.GiveawayEntry.findOne({
      where: { campaign_id: campaignId },
      order: [['entry_number', 'DESC']]
    });
    return lastEntry ? lastEntry.entry_number + 1 : 1;
  } catch (error) {
    console.error('Error getting next entry number:', error);
    return 1;
  }
}

// Get active campaign
async function getActiveCampaign() {
  try {
    return await db.GiveawayCampaign.findOne({
      where: { is_active: true }
    });
  } catch (error) {
    console.error('Error getting active campaign:', error);
    return null;
  }
}

// Check if user has bank details for current campaign
async function hasBankDetails(telegramId, campaignId) {
  try {
    const entry = await db.GiveawayEntry.findOne({ 
      where: { 
        telegram_id: telegramId, 
        campaign_id: campaignId 
      } 
    });
    return entry && entry.account_number && entry.bank_name && entry.account_holder_name;
  } catch (error) {
    console.error('Error checking bank details:', error);
    return false;
  }
}

// Get user bank details for current campaign
async function getUserBankDetails(telegramId, campaignId) {
  try {
    const entry = await db.GiveawayEntry.findOne({ 
      where: { 
        telegram_id: telegramId, 
        campaign_id: campaignId 
      } 
    });
    if (entry && entry.account_number && entry.bank_name && entry.account_holder_name) {
      return {
        account_number: entry.account_number,
        bank_name: entry.bank_name,
        account_holder_name: entry.account_holder_name,
        paid: entry.paid,
        entry_number: entry.entry_number
      };
    }
    return null;
  } catch (error) {
    console.error('Error getting bank details:', error);
    return null;
  }
}

// Show main giveaway menu
async function showGiveawayMainMenu(ctx, campaign) {
  await ctx.reply(
    `<b>🎁 ${campaign.name}</b>\n\n` +
    `💰 <b>Prize:</b> N${campaign.prize_amount}\n` +
    `🎫 <b>Entry Fee:</b> N${campaign.entry_fee}\n\n` +
    `Click below to get your entry position:`,
    {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [{ text: "🎯 Get My Position", callback_data: "get_giveaway_entry" }],
          [{ text: "🏦 Update Bank Account", callback_data: "giveaway_bank_setup" }],
          [{ text: "ℹ️ Check My Status", callback_data: "giveaway_check_account" }]
        ]
      }
    }
  );
}

module.exports = (bot) => {
  const giveawayBankSetupState = new Map();

  // Start command for bot2
  bot.start(async (ctx) => {
    console.log('Giveaway bot start command received');
    const userId = ctx.from.id;
    
    // Check if there's an active campaign
    const campaign = await getActiveCampaign();
    if (!campaign) {
      await ctx.reply(
        "❌ There are no active giveaways at the moment.\n\n" +
        "Please check back later or contact admin."
      );
      return;
    }
    console.log(campaign)
    // Check channel membership first
    const isInChannel = await isUserInChannel(ctx, REQUIRED_CHANNEL);
    
    if (!isInChannel) {
      await ctx.reply(
        `<b>🎁 ${campaign.name}</b>\n\n` +
        `💰 <b>Prize:</b> N${campaign.prize_amount}\n\n` +
        `To participate, you need to join our official channel first.\n\n` +
        `Join the channel below and then click "Verify":`,
        {
          parse_mode: "HTML",
          disable_web_page_preview: true,
          reply_markup: {
            inline_keyboard: [
              [{ text: "📢 Join Channel", url: `https://t.me/${REQUIRED_CHANNEL.replace('@','')}` }],
              [{ text: "✅ Verify", callback_data: "verify_channel" }]
            ]
          }
        }
      );
      return;
    }
    
    // Check if user has bank details for current campaign
    const hasBank = await hasBankDetails(userId, campaign.id);
    
    if (!hasBank) {
      await ctx.reply(
        `<b>🎁 ${campaign.name}</b>\n\n` +
        `💰 <b>Prize:</b> N${campaign.prize_amount}\n` +
        `🎫 <b>Entry Fee:</b> N${campaign.entry_fee}\n\n` +
        `You've joined our channel! 🎉\n\n` +
        `Set up your bank account to participate:`,
        {
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [{ text: "🏦 Setup Bank Account", callback_data: "giveaway_bank_setup" }],
              [{ text: "🔄 Check Status", callback_data: "giveaway_check_bank" }]
            ]
          }
        }
      );
      return;
    }
    
    // User has joined channel and has bank details - show main giveaway menu
    await showGiveawayMainMenu(ctx, campaign);
  });

  // Get giveaway entry/position
  bot.action("get_giveaway_entry", async (ctx) => {
    await ctx.answerCbQuery();
    
    const userId = ctx.from.id;
    const campaign = await getActiveCampaign();
    
    if (!campaign) {
      await ctx.reply("❌ No active giveaway campaign found.");
      return;
    }
    
    // Double-check channel membership and bank details
    const isInChannel = await isUserInChannel(ctx, REQUIRED_CHANNEL);
    if (!isInChannel) {
      await ctx.reply("Please verify your channel membership first using /start");
      return;
    }
    
    const userDetails = await getUserBankDetails(userId, campaign.id);
    if (!userDetails) {
      await ctx.reply("Please set up your bank account first using /start");
      return;
    }
    
    try {
      // Get total entries for this campaign
      const totalEntries = await db.GiveawayEntry.count({
        where: { campaign_id: campaign.id }
      });
      
      // Show position details
      await ctx.reply(
        `<b>🎁 Your Giveaway Position</b>\n\n` +
        `📋 <b>Position:</b> #${userDetails.entry_number}\n` +
        `👤 <b>Username:</b> ${ctx.from.username || ctx.from.first_name}\n` +
        `🏦 <b>Account:</b> ${userDetails.account_number}\n` +
        `📊 <b>Bank:</b> ${userDetails.bank_name}\n` +
        `👥 <b>Total Participants:</b> ${totalEntries}\n\n` +
        `<b>📸 Instructions:</b>\n` +
        `1. Screenshot this message\n` +
        `2. Post it as a comment under our tweet\n` +
        `3. Tag 3 friends\n` +
        `4. Use hashtag #${campaign.name.replace(/\s+/g, '')}\n\n` +
        `Good luck! 🍀`,
        {
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [{ text: "🔄 Refresh Position", callback_data: "get_giveaway_entry" }],
              [{ text: "🏦 Update Details", callback_data: "giveaway_bank_setup" }]
            ]
          }
        }
      );
      
    } catch (error) {
      console.error('Error getting giveaway entry:', error);
      await ctx.reply("❌ Error retrieving your position. Please try again.");
    }
  });
  // Bank setup for giveaway
  bot.action("giveaway_bank_setup", async (ctx) => {
    await ctx.answerCbQuery();
    const userId = ctx.from.id;
    giveawayBankSetupState.set(userId, { step: 'account_number' });

    await ctx.reply(
      '🏦 Let\'s set up your bank account for giveaway winnings.\n\n' +
      'Please enter your 10-digit account number:',
      { reply_markup: { force_reply: true } }
    );
  });

  // Check bank status
  bot.action("giveaway_check_bank", async (ctx) => {
    await ctx.answerCbQuery();
    
    const hasBank = await hasBankDetails(ctx.from.id);
    
    if (hasBank) {
      await ctx.reply("✅ Your bank account is already set up and verified!");
      await showGiveawayMainMenu(ctx);
    } else {
      await ctx.reply("❌ You haven't set up your bank account yet.");
    }
  });
//   // Message handler for bot2 bank setup
//   bot.on('text', async (ctx, next) => {
//   // Skip commands
//   if (ctx.message.text.startsWith('/')) {
//     console.log('Skipping command:', ctx.message.text);
//     return next() // Let Telegraf handle commands normally
//   }
  
//   console.log('Regular message handler:', ctx.message.text);
  
//   // This will only handle non-command text messages
//   await ctx.reply(
//     'Welcome! Use /start to begin the giveaway process or use the menu buttons.'
//   );
// });
// Add this middleware to handle state management properly
bot.use(async (ctx, next) => {
  // Only process text messages
  if (!ctx.message || !ctx.message.text) {
    return next();
  }

  // Skip commands
  if (ctx.message.text.startsWith('/')) {
    console.log('Skipping command:', ctx.message.text);
    return next();
  }

  const userId = ctx.from.id;
  const state = giveawayBankSetupState.get(userId);

  // If no state, let other handlers process the message
  if (!state) {
    return next();
  }

  // We have a state, so handle the bank setup flow
  // Handle account number input
  if (state.step === 'account_number') {
    const text = ctx.message.text.trim();
    
    if (!/^\d{10}$/.test(text)) {
      await ctx.reply('❌ Please enter a valid 10-digit account number:');
      return;
    }
    
    state.account_number = text;
    state.step = 'awaiting_bank_name_prefix';
    giveawayBankSetupState.set(userId, state);
    
    await ctx.reply(
      '✅ Account number received.\n\n' +
      'Now enter the *first 3 letters* of your bank name (e.g. "zen" for Zenith Bank):',
      { parse_mode: 'Markdown' }
    );
    return;
  }

  // Handle bank name prefix
  if (state.step === 'awaiting_bank_name_prefix') {
    const prefix = ctx.message.text.trim().toLowerCase();

    if (!/^[a-z]{3,}$/.test(prefix)) {
      await ctx.reply('❌ Please enter at least 3 letters of your bank name.');
      return;
    }

    try {
      const banks = await fetchBanksFromPaystack();
      const matches = banks.filter(b => b.name.toLowerCase().startsWith(prefix));

      if (matches.length === 0) {
        await ctx.reply('❌ No banks found with that name. Try again:');
        return;
      }

      state.step = 'bank_selection';
      state.matchedBanks = matches;
      giveawayBankSetupState.set(userId, state);

      const bankButtons = matches.map(bank => [
        { text: bank.name, callback_data: `giveaway_select_bank:${bank.code}` }
      ]);

      await ctx.reply(
        `🏦 Found ${matches.length} bank(s). Please select:`,
        { reply_markup: { inline_keyboard: bankButtons } }
      );
    } catch (error) {
      console.error('Error fetching banks:', error);
      await ctx.reply('❌ Error fetching banks. Please try again later.');
      giveawayBankSetupState.delete(userId);
    }
    return;
  }

  // Invalid state, clear it and let other handlers process
  giveawayBankSetupState.delete(userId);
  return next();
});

// // Now register your other message handlers AFTER the state middleware
// Replace your current message handler with this:

    // Bank selection callback - UPDATED to only use GiveawayEntry table
    bot.action(/giveaway_select_bank:(.+)/, async (ctx) => {
      await ctx.answerCbQuery();
      const bankCode = ctx.match[1];
      const userId = ctx.from.id;
      const state = giveawayBankSetupState.get(userId);
  
      if (!state || !state.matchedBanks) {
        await ctx.reply('❌ Session expired. Please start over with /start');
        giveawayBankSetupState.delete(userId);
        return;
      }
  
      const selectedBank = state.matchedBanks.find(bank => bank.code === bankCode);
      if (!selectedBank) {
        await ctx.reply('❌ Invalid bank selection. Please try again.');
        return;
      }
  
      try {
        // Verify account with Paystack
        const verification = await verifyAccountWithPaystack(state.account_number, bankCode);
        
        if (verification.status === true) {
          // Check if user already has a giveaway entry
          let entry = await db.GiveawayEntry.findOne({ where: { telegram_id: userId } });
          
          if (entry) {
            // Update existing entry
            entry.account_number = state.account_number;
            entry.bank_name = selectedBank.name;
            entry.account_holder_name = verification.data.account_name;
            await entry.save();
          } else {
            // Create new giveaway entry
            const entryNumber = await getNextEntryNumber();
            entry = await db.GiveawayEntry.create({
              telegram_id: userId,
              username: ctx.from.username || `${ctx.from.first_name}${ctx.from.last_name ? ' ' + ctx.from.last_name : ''}`,
              first_name: ctx.from.first_name,
              last_name: ctx.from.last_name || '',
              account_number: state.account_number,
              bank_name: selectedBank.name,
              account_holder_name: verification.data.account_name,
              entry_number: entryNumber
            });
          }
  
          giveawayBankSetupState.delete(userId);
          
          await ctx.reply(
            `✅ Bank account verified successfully!\n\n` +
            `🏦 <b>Bank:</b> ${selectedBank.name}\n` +
            `👤 <b>Account Name:</b> ${verification.data.account_name}\n` +
            `🔢 <b>Account Number:</b> ${state.account_number}\n\n` +
            `Your account is now ready for the giveaway! 🎉`,
            { parse_mode: 'HTML' }
          );
          
          await showGiveawayMainMenu(ctx);
        }
      } catch (error) {
        console.error('Error verifying account:', error);
        await ctx.reply(
          '❌ Error verifying account. Please check your account number and bank selection, then try again.'
        );
      }
    });

  console.log('✅ Enhanced Giveaway handlers registered for bot2');
};