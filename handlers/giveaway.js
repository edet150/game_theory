
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

async function fetchBanksFromPaystack() {
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

  // ... (rest of the handlers remain similar but updated with campaign logic)

  console.log('✅ Enhanced Giveaway handlers registered for bot2');
};