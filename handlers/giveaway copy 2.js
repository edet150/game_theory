// handlers/giveaway.js
const db = require('../models');
const axios = require('axios');

// Constants
const REQUIRED_CHANNEL = process.env.GIVEAWAY_CHANNEL || '@modulo_giveaway';
const TWITTER_LINK = process.env.TWITTER_PINNED_TWEET || 'https://twitter.com/yourpage/status/123456789';

// Helper functions
async function isUserInChannel(ctx, channelUsername) {
  try {
    const member = await ctx.telegram.getChatMember(channelUsername, ctx.from.id);
    return ['member', 'administrator', 'creator'].includes(member.status);
  } catch (error) {
    console.error("⚠️ Error checking channel membership:", error.message);
    return false;
  }
}

const { getRedisClient } = require("../bot/botInstance");
async function fetchBanksFromPaystack() {
  const redisClient = getRedisClient();

  try {
    const cacheKey = "paystack:banks";
    const cachedBanks = await redisClient.get(cacheKey);

    if (cachedBanks) {
      return JSON.parse(cachedBanks);
    }

    const response = await axios.get("https://api.paystack.co/bank", {
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SEC_TEST}`,
      },
    });

    const banks = response.data.data;
    await redisClient.set(cacheKey, JSON.stringify(banks), "EX", 3600);
    return banks;
  } catch (error) {
    console.error("Error fetching banks:", error);
    return [];
  }
}

async function verifyAccountWithPaystack(accountNumber, bankCode) {
  console.log(accountNumber)
  console.log(accountNumber)
  console.log(accountNumber)
  console.log(accountNumber)
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
    console.error('Error verifying account:');
    throw error;
  }
}

// Get next entry number for campaign
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

// Get visible campaigns
async function getVisibleCampaigns() {
  try {
    return await db.GiveawayCampaign.findAll({
      where: { 
        status: { [db.Sequelize.Op.ne]: 'closed' }
      },
      order: [
        ['status', 'DESC'],
        ['prize_amount', 'DESC']
      ]
    });
  } catch (error) {
    console.error('Error getting visible campaigns:', error);
    return [];
  }
}

// Check campaign requirements
async function checkCampaignRequirements(ctx, campaign) {
  const userId = ctx.from.id;
  
  // Check channel membership
  const isInChannel = await isUserInChannel(ctx, REQUIRED_CHANNEL);
  if (!isInChannel) {
    return { met: false, message: "channel" };
  }
  
  // Check referral requirements
  if (campaign.referral_requirement > 0) {
    const user = await db.User.findOne({ where: { telegram_id: userId } });
    if (!user || user.total_referrals < campaign.referral_requirement) {
      return { 
        met: false, 
        message: "referral",
        required: campaign.referral_requirement,
        current: user ? user.total_referrals : 0
      };
    }
  }
  
  return { met: true };
}

// Create or update user in database
async function ensureUserExists(ctx) {
  const userId = ctx.from.id;
  
  try {
    let user = await db.User.findOne({ where: { telegram_id: userId } });
    
    if (!user) {
      user = await db.User.create({
        telegram_id: userId,
        telegram_username: ctx.from.username,
        first_name: ctx.from.first_name,
        last_name: ctx.from.last_name || ''
      });
    }
    
    return user;
  } catch (error) {
    console.error('Error ensuring user exists:', error);
    throw error;
  }
}

// Check if user has bank details for campaign
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

// Get user bank details for campaign
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

// Format account number for display (****last4)
function formatAccountNumber(accountNumber) {
  if (!accountNumber || accountNumber.length < 4) return accountNumber;
  return '*'.repeat(accountNumber.length - 4) + accountNumber.slice(-4);
}

// Format name for display (first name only)
function formatName(fullName) {
  if (!fullName) return 'User';
  return fullName.split(' ')[0];
}

// Format date to words
function formatDateToWords(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });
}

// Show campaign selection menu
async function showCampaignSelectionMenu(ctx) {
  const campaigns = await getVisibleCampaigns();
  
  if (campaigns.length === 0) {
    await ctx.reply(
      "❌ There are no available giveaways at the moment.\n\n" +
      "Please check back later for new campaigns!"
    );
    return;
  }

  let message = "<b>🎁 Available Giveaways</b>\n\n";
  const keyboard = [];

  campaigns.forEach(campaign => {
    const isActive = campaign.status === 'active';
    const referralReq = campaign.referral_requirement > 0 ? `👥 ${campaign.referral_requirement}+ refs` : '✅ No refs needed';
    
    message += 
      `${isActive ? '🟢' : '⚪'} <b>${campaign.name}</b>\n` +
      `💰 <b>Prize:</b> N${campaign.prize_amount} | ${referralReq}\n` +
      `📅 <b>Status:</b> ${isActive ? 'Active' : 'Coming Soon'}\n\n`;

    keyboard.push([
      { 
        text: `${isActive ? '🎯' : '👀'} ${campaign.name} - N${campaign.prize_amount}`, 
        callback_data: `select_campaign:${campaign.id}` 
      }
    ]);
  });

  await ctx.reply(message, {
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: keyboard }
  });
}

// Show giveaway steps instructions
async function showGiveawaySteps(ctx, campaign) {
  const steps = [
    "1. ✅ Join our giveaway channel",
    "2. 🎯 Select your preferred giveaway", 
    "3. 🏦 Setup your bank account",
    "4. 🎫 Get your giveaway seat"
  ].join("\n");

  await ctx.reply(
    `<b>🎁 ${campaign.name}</b>\n\n` +
    `💰 <b>Prize:</b> N${campaign.prize_amount}\n` +
    `⏰ <b>Ends:</b> ${campaign.getFormattedEndDate ? campaign.getFormattedEndDate() : formatDateToWords(campaign.end_date)}\n\n` +
    `<b>Steps to Participate:</b>\n${steps}`,
    {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [{ text: "✅ Verify Channel & Continue", callback_data: `verify_for_campaign:${campaign.id}` }]
        ]
      }
    }
  );
}

// Show giveaway position (final screenshot message)
async function showGiveawayPosition(ctx, campaign) {
  const userId = ctx.from.id;
  const userDetails = await getUserBankDetails(userId, campaign.id);
  
  if (!userDetails) {
    await ctx.reply("Please set up your bank account first.");
    return;
  }
  
  try {
    const totalEntries = await db.GiveawayEntry.count({
      where: { campaign_id: campaign.id }
    });

    const displayName = formatName(userDetails.account_holder_name);
    const displayAccount = formatAccountNumber(userDetails.account_number);
    console.log(campaign)
    await ctx.reply(
      `<b>🎁 Your Giveaway Position</b>\n\n` +
      `🏆 <b>Campaign:</b> ${campaign.name}\n` +
      `💰 <b>Prize:</b> N${campaign.prize_amount}\n` +
      `📋 <b>Your Position:</b> #${userDetails.entry_number}\n` +
      `👤 <b>Name:</b> ${displayName}\n` +
      `🏦 <b>Account:</b> ${displayAccount}\n` +
      `📊 <b>Bank:</b> ${userDetails.bank_name}\n` +
      `👥 <b>Total Participants:</b> ${campaign.id}\n` +
      `⏰ <b>Ends:</b> ${campaign.getFormattedEndDate ? campaign.getFormattedEndDate() : formatDateToWords(campaign.end_date)}\n\n` +
      `<b>📸 To Complete Your Entry:</b>\n` +
      `1. Take a screenshot of this message\n` +
      `2. Comment it under our <a href="${TWITTER_LINK}">pinned tweet</a>\n` +
      `3. Retweet our pinned tweet\n` +
      `4. Winners will be selected at random from the comment section\n\n` +
      `Good luck! 🍀`,
      {
        parse_mode: "HTML",
        disable_web_page_preview: true,
        reply_markup: {
          inline_keyboard: [
            [{ text: "🔄 Refresh Position", callback_data: `select_campaign:${campaign.id}` }],
            [{ text: "🏦 Update Details", callback_data: `giveaway_bank_setup:${campaign.id}` }]
          ]
        }
      }
    );
    
  } catch (error) {
    console.error('Error showing position:', error);
    await ctx.reply("❌ Error retrieving your position. Please try again.");
  }
}

module.exports = (bot) => {
  const giveawayBankSetupState = new Map();

  // Start command
  bot.start(async (ctx) => {
    console.log('Giveaway bot start command received');
    await showCampaignSelectionMenu(ctx);
  });

  // Campaign selection handler
  bot.action(/select_campaign:(\d+)/, async (ctx) => {
    await ctx.answerCbQuery();
    const campaignId = parseInt(ctx.match[1]);
    
    try {
      const campaign = await db.GiveawayCampaign.findByPk(campaignId);
      if (!campaign) {
        await ctx.answerCbQuery("❌ This giveaway is no longer available.", { show_alert: true });
        return;
      }

      // Ensure user exists in database
      await ensureUserExists(ctx);

      // Check if campaign is active
      if (!campaign.isActive || !campaign.isActive()) {
        let message = `❌ <b>${campaign.name}</b> is not currently running.\n\n`;
        
        if (campaign.start_date) {
          const startDate = formatDateToWords(campaign.start_date);
          message += `📅 <b>Starts:</b> ${startDate}\n`;
        }
        
        if (campaign.end_date) {
          const endDate = formatDateToWords(campaign.end_date);
          message += `⏰ <b>Ends:</b> ${endDate}\n`;
        }
        
        if (campaign.referral_requirement > 0) {
          const user = await db.User.findOne({ where: { telegram_id: ctx.from.id } });
          const userReferrals = user ? user.total_referrals : 0;
          message += `\n👥 <b>Requirement:</b> ${campaign.referral_requirement} referrals (You have: ${userReferrals})`;
        }
        
        message += `\n\nPlease check back later and watch our official Twitter page for announcements!`;
        
        await ctx.reply(message, { parse_mode: "HTML" });
        return;
      }

      // Show steps for active campaign
      await showGiveawaySteps(ctx, campaign);
      
    } catch (error) {
      console.error('Error handling campaign selection:', error);
      await ctx.answerCbQuery("❌ Error accessing giveaway.", { show_alert: true });
    }
  });

  // Verify channel for campaign
  bot.action(/verify_for_campaign:(\d+)/, async (ctx) => {
    await ctx.answerCbQuery();
    const campaignId = parseInt(ctx.match[1]);
    
    const isInChannel = await isUserInChannel(ctx, REQUIRED_CHANNEL);
    if (!isInChannel) {
      await ctx.answerCbQuery("❌ Please join the channel first.", { show_alert: true });
      await ctx.reply(
        `Please join our channel to continue:\n\nhttps://t.me/${REQUIRED_CHANNEL.replace('@','')}`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: "✅ I've Joined", callback_data: `verify_for_campaign:${campaignId}` }]
            ]
          }
        }
      );
      return;
    }
    
    // User is in channel, ensure they're in database
    await ensureUserExists(ctx);
    
    await ctx.answerCbQuery("✅ Channel verified!", { show_alert: true });
    
    // Check campaign requirements
    const campaign = await db.GiveawayCampaign.findByPk(campaignId);
    const requirements = await checkCampaignRequirements(ctx, campaign);
    
    if (!requirements.met) {
      if (requirements.message === "referral") {
        await ctx.reply(
          `<b>🎁 ${campaign.name}</b>\n\n` +
          `💰 <b>Prize:</b> N${campaign.prize_amount}\n\n` +
          `❌ <b>Referral Requirement Not Met</b>\n` +
          `You need ${requirements.required} referrals, but you only have ${requirements.current}.\n\n` +
          `Share your referral link to invite friends and qualify!`,
          {
            parse_mode: "HTML",
            reply_markup: {
              inline_keyboard: [
                [{ text: "📤 Get Referral Link", callback_data: "get_referral_link" }],
                [{ text: "🔄 Check Again", callback_data: `select_campaign:${campaignId}` }]
              ]
            }
          }
        );
      }
      return;
    }
    
    // All requirements met, check bank details
    const hasBank = await hasBankDetails(ctx.from.id, campaignId);
    
    if (!hasBank) {
      await ctx.reply(
        `<b>🎁 ${campaign.name}</b>\n\n` +
        `💰 <b>Prize:</b> N${campaign.prize_amount}\n\n` +
        `✅ <b>Requirements Met!</b>\n\n` +
        `Set up your bank account to participate:`,
        {
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [{ text: "🏦 Setup Bank Account", callback_data: `giveaway_bank_setup:${campaignId}` }]
            ]
          }
        }
      );
      return;
    }
    
    // User has everything, show position
    await ctx.deleteMessage();
    await showGiveawayPosition(ctx, campaign);
  });

  // Bank setup handler
  bot.action(/giveaway_bank_setup:(\d+)/, async (ctx) => {
    await ctx.answerCbQuery();
    // const campaignId = parseInt(ctx.match[1].split(':')[1]);
    const campaignId = parseInt(ctx.match[1]); // ← Remove the .split(':')[1]
    const userId = ctx.from.id;
    
    giveawayBankSetupState.set(userId, { 
      step: 'account_number',
      campaignId: campaignId 
    });

    await ctx.reply(
      '🏦 Let\'s set up your bank account for giveaway winnings.\n\n' +
      'Please enter your 10-digit account number:',
      { reply_markup: { force_reply: true } }
    );
  });

  // Get referral link
  bot.action("get_referral_link", async (ctx) => {
    await ctx.answerCbQuery();
    
    const user = await db.User.findOne({ where: { telegram_id: ctx.from.id } });
    const referralLink = `https://t.me/${ctx.botInfo.username}?start=ref-${user.referral_code}`;
    
    await ctx.reply(
      `<b>📤 Your Referral Link</b>\n\n` +
      `Share this link with friends to earn referral credits:\n\n` +
      `<code>${referralLink}</code>\n\n` +
      `Each friend who joins through your link counts toward your referral requirements!`,
      {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [{ text: "📋 Copy Link", callback_data: "copy_referral_link" }],
            [{ text: "🔄 Back to Giveaways", callback_data: "refresh_campaigns" }]
          ]
        }
      }
    );
  });

  // Refresh campaigns
  bot.action("refresh_campaigns", async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.deleteMessage();
    await showCampaignSelectionMenu(ctx);
  });
    // Bank selection handler
  bot.action(/giveaway_select_bank:(.+):(\d+)/, async (ctx) => {
    console.log('bank selected')
    await ctx.answerCbQuery();
    const bankCode = ctx.match[1];
    const campaignId = parseInt(ctx.match[2]);
    const userId = ctx.from.id;
    const state = giveawayBankSetupState.get(userId);

    if (!state || !state.matchedBanks) {
      await ctx.answerCbQuery('❌ Session expired. Please start over.', { show_alert: true });
      giveawayBankSetupState.delete(userId);
      return;
    }

    const selectedBank = state.matchedBanks.find(bank => bank.code === bankCode);
    if (!selectedBank) {
      await ctx.answerCbQuery('❌ Invalid bank selection.', { show_alert: true });
      return;
    }

    try {
      const verification = await verifyAccountWithPaystack(state.account_number, bankCode);
      
      if (verification.status === true) {
        // Get or create giveaway entry
        let entry = await db.GiveawayEntry.findOne({ 
          where: { 
            telegram_id: userId, 
            campaign_id: campaignId 
          } 
        });
        
        const entryNumber = await getNextEntryNumber(campaignId);
        
        if (entry) {
          entry.account_number = state.account_number;
          entry.bank_name = selectedBank.name;
          entry.account_holder_name = verification.data.account_name;
          entry.entry_number = entryNumber;
          await entry.save();
        } else {
          entry = await db.GiveawayEntry.create({
            telegram_id: userId,
            username: ctx.from.username || `${ctx.from.first_name}${ctx.from.last_name ? ' ' + ctx.from.last_name : ''}`,
            first_name: ctx.from.first_name,
            last_name: ctx.from.last_name || '',
            account_number: state.account_number,
            bank_name: selectedBank.name,
            account_holder_name: verification.data.account_name,
            entry_number: entryNumber,
            campaign_id: campaignId
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
        
        // Show final position
        const campaign = await db.GiveawayCampaign.findByPk(campaignId);
        await showGiveawayPosition(ctx, campaign);
      }
    } catch (error) {
      console.error('Error verifying account:', error);
      await ctx.answerCbQuery('❌ Error verifying account. Please check details and try again.', { show_alert: true });
    }
  });


  // Message handler for bank setup flow
  bot.use(async (ctx, next) => {
    if (!ctx.message || !ctx.message.text || ctx.message.text.startsWith('/')) {
      return next();
    }

    const userId = ctx.from.id;
    const state = giveawayBankSetupState.get(userId);

    if (!state) {
      return next();
    }

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
   
        console.log(state)
        console.log(`giveaway_select_bank:898:${state.campaignId}`)

        const bankButtons = matches.map(bank => [
          { text: bank.name, callback_data: `giveaway_select_bank:${bank.code}:${state.campaignId}` }
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

    giveawayBankSetupState.delete(userId);
    return next();
  });


  console.log('✅ Enhanced Giveaway handlers registered');
};