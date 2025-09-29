// handlers/giveaway.js
const db = require('../models');
const axios = require('axios');
const { Op } = require("sequelize");

// Constants
const REQUIRED_CHANNEL = process.env.GIVEAWAY_CHANNEL || '@modulo_giveaway';
const TWITTER_LINK = process.env.TWITTER_PINNED_TWEET || 'https://x.com/Modulo_hq/status/1972356451437040053';

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
    console.error('Error verifying account:', error.response?.data);
    
    // Check if it's a 422 error (account number and bank don't match)
    if (error.response?.status === 422) {
      const errorMessage = error.response?.data?.message || 'Account number and bank do not match';
      throw new Error(`BANK_ACCOUNT_MISMATCH: ${errorMessage}`);
    }
    
    // Check for other specific Paystack errors
    if (error.response?.data?.message) {
      throw new Error(`PAYSTACK_ERROR: ${error.response.data.message}`);
    }
    
    // Generic error
    throw new Error('Failed to verify account. Please try again.');
  }
}
// Get next entry number for campaign
// async function getNextEntryNumber(campaignId, startOfWeek, endOfWeek) {
//   try {
//     const lastEntry = await db.GiveawayEntry.findOne({
//       where: {
//         campaign_id: campaignId,
//         created_at: { [Op.between]: [startOfWeek, endOfWeek] }
//       },
//       order: [["entry_number", "DESC"]],
//     });

//     return lastEntry ? lastEntry.entry_number + 1 : 1;
//   } catch (error) {
//     console.error("Error getting next entry number:", error);
//     return 1;
//   }
// }
async function getNextEntryNumber(campaignId, startOfWeek, endOfWeek) {
  const transaction = await db.sequelize.transaction();
  
  try {
    // Lock the entries for this campaign and week to prevent race conditions
    const lastEntry = await db.GiveawayEntry.findOne({
      where: {
        campaign_id: campaignId,
        created_at: { [db.Sequelize.Op.between]: [startOfWeek, endOfWeek] }
      },
      order: [["entry_number", "DESC"]],
      lock: transaction.LOCK.UPDATE,
      transaction
    });

    const nextEntryNumber = lastEntry ? lastEntry.entry_number + 1 : 1;
    
    await transaction.commit();
    return nextEntryNumber;
    
  } catch (error) {
    await transaction.rollback();
    console.error("Error getting next entry number:", error);
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

// Get user referral stats
// Get user referral stats using the Users table with proper association
async function getUserReferralStats(telegramId) {
  try {
    const user = await db.User.findOne({ 
      where: { telegram_id: telegramId },
      include: [{
        model: db.User,
        as: 'Referrals',
        attributes: ['id', 'telegram_username', 'telegram_id', 'createdAt'] // Only fields that exist in model
      }]
    });
    
    if (!user) return null;
    
    return {
      total_referrals: user.total_referrals,
      active_referrals: user.active_referrals,
      referral_code: user.referral_code,
      referrals: user.Referrals || []
    };
  } catch (error) {
    console.error('Error getting referral stats:', error);
    return null;
  }
}

// Show referral stats
async function showReferralStats(ctx) {
  const stats = await getUserReferralStats(ctx.from.id);
  
  if (!stats) {
    await ctx.reply("❌ Error loading your referral information.");
    return;
  }

  const referralLink = `https://t.me/${ctx.botInfo.username}?start=ref-${stats.referral_code}`;
  
  let message = `<b>📤 Your Referral Stats</b>\n\n`;
  message += `👥 <b>Total Referrals:</b> ${stats.total_referrals}\n`;
  message += `🟢 <b>Active Referrals:</b> ${stats.active_referrals}\n`;
  message += `🔗 <b>Your Referral Code:</b> <code>${stats.referral_code}</code>\n\n`;
  message += `<b>Your Referral Link:</b>\n<code>${referralLink}</code>\n\n`;
  
  if (stats.referrals.length > 0) {
    message += `<b>Recent Referrals:</b>\n`;
    
    // Since we don't have names stored, we'll show what we have
    stats.referrals.slice(0, 5).forEach((ref, index) => {
      const username = ref.telegram_username ? `@${ref.telegram_username}` : `User ${ref.telegram_id}`;
      const date = new Date(ref.createdAt).toLocaleDateString();
      message += `${index + 1}. ${username} - ${date}\n`;
    });
    
    if (stats.referrals.length > 5) {
      message += `\n... and ${stats.referrals.length - 5} more`;
    }
  } else {
    message += `You haven't referred anyone yet. Share your link to start earning!`;
  }

  await ctx.reply(message, {
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [
        // [{ text: " Copy Referral Link", callback_data: "copy_referral_link" }],
        [{ text: " Refresh Stats", callback_data: "show_referral_stats" }],
        [{ text: " Back to Giveaways", callback_data: "refresh_campaigns" }]
      ]
    }
  });
}
// Show campaign selection menu
async function showCampaignSelectionMenu_(ctx) {
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
        text: `${isActive ? '🎯' : ''} ${campaign.name} - N${campaign.prize_amount}`, 
        callback_data: `select_campaign:${campaign.id}` 
      }
    ]);
  });

  // Add referral button to all menus
  keyboard.push([
    { text: "📤 My Referrals", callback_data: "show_referral_stats" }
  ]);

  await ctx.reply(message, {
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: keyboard }
  });
}

async function showCampaignSelectionMenu(ctx) {
  const campaigns = await getVisibleCampaigns();
  
  if (campaigns.length === 0) {
    await ctx.reply(
      "There are no available giveaways at the moment.\n\n" +
      "Please check back later for new campaigns!"
    );
    return;
  }

  let message = "<b>Available Giveaways</b>\n\n";
  const keyboard = [];

  campaigns.forEach(campaign => {
    const isActive = campaign.status === 'active';
    const referralReq = campaign.referral_requirement > 0 ? `${campaign.referral_requirement}+ refs` : 'No refs needed';
    
    message += 
      `${isActive ? '🟢' : '⚪'} <b>${campaign.name}</b>\n` +
      `Prize: N${campaign.prize_amount} | ${referralReq}\n` +
      `Status: ${isActive ? 'Active' : 'Coming Soon'}\n\n`;

     keyboard.push([
      { 
        text: `${isActive ? '🎯' : ''} ${campaign.name} - N${campaign.prize_amount}`, 
        callback_data: `select_campaign:${campaign.id}` 
      }
    ]);
  });

  // Add referral button
  keyboard.push([
    { text: "My Referrals", callback_data: "show_referral_stats" }
  ]);

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
          [{ text: "✅ Verify Channel & Continue", callback_data: `verify_for_campaign:${campaign.id}` }],
          [{ text: "📤 My Referrals", callback_data: "show_referral_stats" }]
        ]
      }
    }
  );
}

// Show bank account confirmation
async function showBankAccountConfirmation(ctx, bankDetails, campaignId) {
  await ctx.reply(
    `<b>🏦 Confirm Your Bank Account</b>\n\n` +
    `Please verify that these details are correct:\n\n` +
    `🏦 <b>Bank:</b> ${bankDetails.bank_name}\n` +
    `👤 <b>Account Name:</b> ${bankDetails.account_holder_name}\n` +
    `🔢 <b>Account Number:</b> ${bankDetails.account_number}\n\n` +
    `Is this your correct bank account? `,
    {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            { text: "✅ Yes, Continue", callback_data: `confirm_bank:${campaignId}` },
            { text: "❌ No, Try Again", callback_data: `giveaway_bank_setup:${campaignId}` }
          ],
          [{ text: "📤 My Referrals", callback_data: "show_referral_stats" }]
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
    
    await ctx.reply(
      `<b>🎁 Your Giveaway Position</b>\n\n` +
      `🏆 <b>Campaign:</b> ${campaign.name}\n` +
      `💰 <b>Prize:</b> N${campaign.prize_amount}\n` +
      `📋 <b>Your Position:</b> #${userDetails.entry_number}\n` +
      `👤 <b>Name:</b> ${displayName}\n` +
      `🏦 <b>Account:</b> ${displayAccount}\n` +
      `📊 <b>Bank:</b> ${userDetails.bank_name}\n` +
      // `👥 <b>Total Participants:</b> ${totalEntries}\n` +
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
            [{ text: "🏦 Update Details", callback_data: `giveaway_bank_setup:${campaign.id}` }],
            [{ text: "📤 My Referrals", callback_data: "show_referral_stats" }]
          ]
        }
      }
    );
    
  } catch (error) {
    console.error('Error showing position:', error);
    await ctx.reply("❌ Error retrieving your position. Please try again.");
  }
}

// Show referral stats


module.exports = (bot) => {
  const giveawayBankSetupState = new Map();
  const userLastMessage = new Map();

  // Helper to delete previous message and track new one
  async function sendMessageWithCleanup(ctx, message, extra = {}) {
    const userId = ctx.from.id;
    const lastMessageId = userLastMessage.get(userId);
    
    try {
      if (lastMessageId && ctx.updateType === 'callback_query') {
        await ctx.deleteMessage(lastMessageId);
      }
    } catch (error) {
      // Message might already be deleted, ignore
    }
    
    const newMessage = await ctx.reply(message, extra);
    userLastMessage.set(userId, newMessage.message_id);
    return newMessage;
  }

  // Start command
  bot.start(async (ctx) => {
    console.log('Giveaway bot start command received');
    await sendMessageWithCleanup(ctx, "Welcome to Modulo Giveaway!", {});
    await showCampaignSelectionMenu(ctx);
  });

  bot.action("start_over", async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.deleteMessage(); // Delete the current message
  await showCampaignSelectionMenu(ctx); // Call the same function as /start
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
        
        await sendMessageWithCleanup(ctx, message, { parse_mode: "HTML" });
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
      await sendMessageWithCleanup(ctx,
        `Please join our channel to continue:\n\nhttps://t.me/${REQUIRED_CHANNEL.replace('@','')}`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: "✅ I've Joined", callback_data: `verify_for_campaign:${campaignId}` }],
              [{ text: "📤 My Referrals", callback_data: "show_referral_stats" }]
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
        await sendMessageWithCleanup(ctx,
          `<b>🎁 ${campaign.name}</b>\n\n` +
          `💰 <b>Prize:</b> N${campaign.prize_amount}\n\n` +
          `❌ <b>Referral Requirement Not Met</b>\n` +
          `You need ${requirements.required} referrals, but you only have ${requirements.current}.\n\n` +
          `Share your referral link to invite friends and qualify!`,
          {
            parse_mode: "HTML",
            reply_markup: {
              inline_keyboard: [
                [{ text: "📤 Get Referral Link", callback_data: "show_referral_stats" }],
                [{ text: "🔄 Check Again", callback_data: `select_campaign:${campaignId}` }],
                [{ text: "📤 My Referrals", callback_data: "show_referral_stats" }]
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
      await sendMessageWithCleanup(ctx,
        `<b>🎁 ${campaign.name}</b>\n\n` +
        `💰 <b>Prize:</b> N${campaign.prize_amount}\n\n` +
        `✅ <b>Requirements Met!</b>\n\n` +
        `Set up your bank account to participate:`,
        {
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [{ text: "🏦 Setup Bank Account", callback_data: `giveaway_bank_setup:${campaignId}` }],
              [{ text: "📤 My Referrals", callback_data: "show_referral_stats" }]
            ]
          }
        }
      );
      return;
    }
    
    // User has everything, show position
    await showGiveawayPosition(ctx, campaign);
  });

  // Bank setup handler
  bot.action(/giveaway_bank_setup:(\d+)/, async (ctx) => {
    await ctx.answerCbQuery();
    const campaignId = parseInt(ctx.match[1]);
    const userId = ctx.from.id;
    
    giveawayBankSetupState.set(userId, { 
      step: 'account_number',
      campaignId: campaignId 
    });

    await sendMessageWithCleanup(ctx,
      '🏦 Let\'s set up your bank account for giveaway winnings.\n\n' +
      'Please enter your 10-digit account number:',
      { reply_markup: { force_reply: true } }
    );
  });

  // Bank confirmation handler
bot.action(/confirm_bank:(\d+)/, async (ctx) => {
  await ctx.answerCbQuery();
  const campaignId = parseInt(ctx.match[1]);
  const userId = ctx.from.id;
  const state = giveawayBankSetupState.get(userId);

  if (!state || !state.verifiedBankDetails) {
    await ctx.answerCbQuery('❌ Session expired. Please start over.', { show_alert: true });
    return;
  }

  const transaction = await db.sequelize.transaction();
  
  try {
    // -------------------------
    // 1. Define week boundaries
    // -------------------------
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - (now.getDay() === 0 ? 6 : now.getDay() - 1)); 
    startOfWeek.setHours(0, 0, 0, 0);

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);

    // -------------------------
    // 2. Check if already joined this week WITH LOCK
    // -------------------------
    const existingThisWeek = await db.GiveawayEntry.findOne({
      where: {
        telegram_id: userId,
        campaign_id: campaignId,
        created_at: { [db.Sequelize.Op.between]: [startOfWeek, endOfWeek] }
      },
      transaction,
      lock: transaction.LOCK.UPDATE
    });

    if (existingThisWeek) {
      await transaction.rollback();
      await ctx.answerCbQuery("❌ You already joined this week's giveaway!", { show_alert: true });
      return;
    }

    // -------------------------
    // 3. Get next entry number for this week WITH LOCK
    // -------------------------
    const lastEntry = await db.GiveawayEntry.findOne({
      where: {
        campaign_id: campaignId,
        created_at: { [db.Sequelize.Op.between]: [startOfWeek, endOfWeek] }
      },
      order: [["entry_number", "DESC"]],
      transaction,
      lock: transaction.LOCK.UPDATE
    });

    const entryNumber = lastEntry ? lastEntry.entry_number + 1 : 1;

    // -------------------------
    // 4. Save new entry
    // -------------------------
    await db.GiveawayEntry.create({
      telegram_id: userId,
      username: ctx.from.username || `${ctx.from.first_name}${ctx.from.last_name ? ' ' + ctx.from.last_name : ''}`,
      first_name: ctx.from.first_name,
      last_name: ctx.from.last_name || '',
      account_number: state.verifiedBankDetails.account_number,
      bank_name: state.verifiedBankDetails.bank_name,
      account_holder_name: state.verifiedBankDetails.account_holder_name,
      entry_number: entryNumber,
      campaign_id: campaignId
    }, { transaction });

    await transaction.commit();
    giveawayBankSetupState.delete(userId);
    
    await ctx.answerCbQuery("✅ Bank account confirmed!", { show_alert: true });

    const campaign = await db.GiveawayCampaign.findByPk(campaignId);
    await showGiveawayPosition(ctx, campaign);

  } catch (error) {
    await transaction.rollback();
    console.error('Error saving bank details:', error);
    
    if (error.name === 'SequelizeUniqueConstraintError') {
      await ctx.answerCbQuery('❌ Entry number conflict. Please try again.', { show_alert: true });
    } else {
      await ctx.answerCbQuery('❌ Error saving details. Please try again.', { show_alert: true });
    }
  }
});

  // Show referral stats
  bot.action("show_referral_stats", async (ctx) => {
    await ctx.answerCbQuery();
    await showReferralStats(ctx);
  });

  // Copy referral link
  bot.action("copy_referral_link", async (ctx) => {
    await ctx.answerCbQuery("📋 Referral link copied to clipboard!", { show_alert: true });
    // Note: You can't actually copy to clipboard in Telegram, but this gives user feedback
  });

  // Refresh campaigns
  bot.action("refresh_campaigns", async (ctx) => {
    await ctx.answerCbQuery();
    await showCampaignSelectionMenu(ctx);
  });

  // Bank selection handler
  bot.action(/giveaway_select_bank_:(.+):(\d+)/, async (ctx) => {
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
  console.log('bank selected')
    const selectedBank = state.matchedBanks.find(bank => bank.code === bankCode);
    if (!selectedBank) {
      await ctx.answerCbQuery('❌ Invalid bank selection.', { show_alert: true });
      return;
    }
  console.log('bank selected')
    try {
      const verification = await verifyAccountWithPaystack(state.account_number, bankCode);
      console.log(verification)
      if (verification.status === true) {
        // Store verified bank details in state for confirmation
        state.verifiedBankDetails = {
          account_number: state.account_number,
          bank_name: selectedBank.name,
          account_holder_name: verification.data.account_name
        };
        giveawayBankSetupState.set(userId, state);
        
        // Show confirmation instead of directly saving
        await showBankAccountConfirmation(ctx, state.verifiedBankDetails, campaignId);
      }
    } catch (error) {
      console.error('Error verifying account:');
      await ctx.answerCbQuery('❌ Error verifying account. Please check details and try again.', { show_alert: true });
    }
  });


  // Bank selection handler
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
      // Store verified bank details in state for confirmation
      state.verifiedBankDetails = {
        account_number: state.account_number,
        bank_name: selectedBank.name,
        account_holder_name: verification.data.account_name
      };
      giveawayBankSetupState.set(userId, state);
      
      // Show confirmation instead of directly saving
      await showBankAccountConfirmation(ctx, state.verifiedBankDetails, campaignId);
    }
  } catch (error) {
    console.error('Error verifying account:', error.message);
    
    // Handle specific error types
    if (error.message.includes('BANK_ACCOUNT_MISMATCH')) {
      await ctx.answerCbQuery('❌ Account number and bank do not match.', { show_alert: true });
      
      // Reset to account number step so user can try again
      giveawayBankSetupState.set(userId, { 
        step: 'account_number',
        campaignId: campaignId 
      });
      
      await sendMessageWithCleanup(ctx,
        '❌ The account number and bank do not match.\n\nPlease enter your 10-digit account number again:',
        { reply_markup: { force_reply: true } }
      );
    } else if (error.message.includes('PAYSTACK_ERROR')) {
      await ctx.answerCbQuery(`❌ ${error.message.replace('PAYSTACK_ERROR: ', '')}`, { show_alert: true });
      
      // Reset to account number step for any Paystack error
      giveawayBankSetupState.set(userId, { 
        step: 'account_number',
        campaignId: campaignId 
      });
      
      await sendMessageWithCleanup(ctx,
        '❌ Error verifying account. Please enter your 10-digit account number again:',
        { reply_markup: { force_reply: true } }
      );
    } else {
      await ctx.answerCbQuery('❌ Error verifying account. Please try again.', { show_alert: true });
      
      // Reset to account number step for generic errors too
      giveawayBankSetupState.set(userId, { 
        step: 'account_number',
        campaignId: campaignId 
      });
      
      await sendMessageWithCleanup(ctx,
        '❌ Error verifying account. Please enter your 10-digit account number again:',
        { reply_markup: { force_reply: true } }
      );
    }
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
      
      await sendMessageWithCleanup(ctx,
        '✅ Account number received.\n\n' +
        'Now enter the *first 3 letters* of your bank name (e.g. "zen" for Zenith Bank):',
        { parse_mode: 'Markdown', reply_markup: { force_reply: true } }
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
          { text: bank.name, callback_data: `giveaway_select_bank:${bank.code}:${state.campaignId}` }
        ]);

        // Add referral button
        bankButtons.push([{ text: "📤 My Referrals", callback_data: "show_referral_stats" }]);

        await sendMessageWithCleanup(ctx,
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