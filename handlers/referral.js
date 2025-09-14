// handlers/referral.js
const { User, Entry, RafflePool, Week } = require('../models');
const { showStartScreen, showBonusEntrySelection } = require('../startFunction');
const { sendError, sendSuccess, sendTemporaryMessage } = require('../utils/responseUtils');
// Modified showPoolSelection function
// Function to award bonus entries when referrals make purchases
async function awardReferralBonus(referrerId) {
    try {
        const referrer = await User.findByPk(referrerId);
        if (referrer) {
            referrer.bonus_entries += 1;
            referrer.active_referrals += 1;
            await referrer.save();
            
            // Notify referrer
            const bot = require('../bot'); // Import your bot instance
            try {
                await bot.telegram.sendMessage(
                    referrer.telegram_id,
                    `🎉 Your referral just made a purchase! You received 1 bonus entry. Total: ${referrer.bonus_entries}`,
                    { parse_mode: 'HTML' }
                );
            } catch (error) {
                console.log('Could not notify referrer:', error.message);
            }
        }
    } catch (error) {
        console.error('Error awarding referral bonus:', error);
    }
}

// Call this function when a referred user makes their first purchase
// Add this to your payment success handler
async function showPoolSelection(ctx) {
    // const pools = await RafflePool.findAll({ where: { is_active: true } });
    const pools = await RafflePool.findAll();
    
    let message = ctx.session.bonusEntryFlow ?
        `<b>🎯 Select Arena for Bonus Entries</b>\n\nYou're using ${ctx.session.quantity} bonus entries. Select your Arena:` :
        `<b>🎯 Select a Draw Arena</b>\n\nChoose which Arena you want to enter:`;

    const keyboard = {
        reply_markup: {
            inline_keyboard: pools.map(pool => [
                { 
                    text: `💰 ${pool.name} (₦${pool.price_per_entry})`, 
                    callback_data: `select_pool:${pool.name}` 
                }
            ])
        }
    };

    // Add back button
    keyboard.reply_markup.inline_keyboard.push([
        { text: '🔙 Back', callback_data: ctx.session.bonusEntryFlow ? 'use_bonus_entries' : 'back_to_main' }
    ]);

    await ctx.editMessageText(message, { 
        parse_mode: 'HTML', 
        reply_markup: keyboard.reply_markup 
    });
}
module.exports = (bot) => {
    // Referral dashboard
    bot.action('referral_dashboard', async (ctx) => {
        await await ctx.answerCbQuery();
        
        try {
            const user = await User.findOne({ where: { telegram_id: ctx.from.id } });
            if (!user) {
                return sendError(ctx, 'User not found. Please start again with /start');
            }

            await showReferralDashboard(ctx, user);
        } catch (error) {
            console.error('Error showing referral dashboard:', error);
            sendError(ctx, 'Failed to load referral dashboard');
        }
    });

    // Show referral dashboard
    async function showReferralDashboard(ctx, user) {
        const referralLink = `https://t.me/${ctx.botInfo.username}?start=ref_${user.referral_code}`;
        
        // Get referred users with entries
        const referredUsers = await User.findAll({
            where: { referred_by: user.id },
            include: [{
                model: Entry,
                where: { status: 'paid' },
                required: false
            }]
        });

        const message = `
<b>🎯 Your Referral Dashboard</b>

<b>📊 Statistics:</b>
• Your Referral Code: <code>${user.referral_code}</code>
• Total Referrals: ${user.total_referrals}
• Active Referrals: ${user.active_referrals}
• Bonus Entries Available: ${user.bonus_entries}

<b>👥 Your Referred Users:</b>
${referredUsers.length > 0 ? referredUsers.map(u =>
            `• ${u.telegram_username} - ${u.Entries?.length || 0} entries`
        ).join('\n') : 'No referrals yet'}

<b>📋 How it works:</b>
• Share your link below
• Earn the same number of bonus entries as your friend’s first purchase (e.g., if they buy 6 entries, you get 6 bonus entries)
• Use bonus entries for free plays

<b>🔗 Your referral link: (tap and hold to copy)</b>
<code>${referralLink}</code>
        `;

        const keyboard = {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '📋 Copy Referral Link', callback_data: 'copy_referral_link' }],
                    [{ text: '🎁 Use Bonus Entries', callback_data: 'use_bonus_entries' }],
                    [{ text: '👥 View Referral Details', callback_data: 'view_referral_details' }],
                    [{ text: '🔙 Back to Main', callback_data: 'back_to_main' }]
                ]
            }
        };

        // Edit or send new message
        if (ctx.callbackQuery) {
            await ctx.editMessageText(message, {
                parse_mode: 'HTML',
                reply_markup: keyboard.reply_markup
            });
        } else {
            const msg = await ctx.reply(message, {
                parse_mode: 'HTML',
                reply_markup: keyboard.reply_markup
            });
            if (!ctx.session.referralMessages) ctx.session.referralMessages = [];
            ctx.session.referralMessages.push(msg.message_id);
        }
    }

    // Copy referral link
    bot.action('copy_referral_link', async (ctx) => {
        await await ctx.answerCbQuery();
        
        const user = await User.findOne({ where: { telegram_id: ctx.from.id } });
        if (!user) return;

        const referralLink = `https://t.me/${ctx.botInfo.username}?start=ref_${user.referral_code}`;
        
        await sendSuccess(ctx, `Referral link copied to clipboard! Share: ${referralLink}`);
    });

    // Use bonus entries
    bot.action('use_bonus_entries', async (ctx) => {
        await await ctx.answerCbQuery();
        
        const user = await User.findOne({ where: { telegram_id: ctx.from.id } });
        if (!user || user.bonus_entries === 0) {
            return sendError(ctx, 'No bonus entries available');
        }

        ctx.session.bonusEntryFlow = true;
        ctx.session.availableBonusEntries = user.bonus_entries;
        
        await showBonusEntrySelection(ctx, user);
    });

    // View referral details
    bot.action('view_referral_details', async (ctx) => {
        await await ctx.answerCbQuery();
        
        const user = await User.findOne({ where: { telegram_id: ctx.from.id } });
        const referredUsers = await User.findAll({
            where: { referred_by: user.id },
            include: [{
                model: Entry,
                where: { status: 'paid' },
                required: false
            }]
        });

        const message = `
<b>👥 Detailed Referral Information</b>

${referredUsers.map(u => `
<b>${u.telegram_username}:</b>
• Joined: ${u.createdAt.toLocaleDateString()}
• Total Entries: ${u.Entries?.length || 0}
• Status: ${u.Entries?.length > 0 ? 'Active 🟢' : 'Inactive 🔴'}
`).join('\n')}

<b>💎 Bonus Entries Breakdown:</b>
• Available: ${user.bonus_entries}
• Earned from referrals: ${user.total_referrals}
        `;

        const keyboard = {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🔙 Back to Dashboard', callback_data: 'referral_dashboard' }]
                ]
            }
        };

        await ctx.editMessageText(message, {
            parse_mode: 'HTML',
            reply_markup: keyboard.reply_markup
        });
    });

    // Back to main
    bot.action('back_to_main', async (ctx) => {
        await await ctx.answerCbQuery();
        await showStartScreen(ctx); // Your existing function
    });
    // Handle bonus quantity selection
    // Handle bonus quantity selection
    bot.action(/^bonus_quantity:(\d+)/, async (ctx) => {
        await await ctx.answerCbQuery();
        const quantity = parseInt(ctx.match[1], 10);
    
        const user = await User.findOne({ where: { telegram_id: ctx.from.id } });
    
        if (quantity > user.bonus_entries) {
            return sendError(ctx, `You only have ${user.bonus_entries} bonus entries available`);
        }

        ctx.session.quantity = quantity;
        ctx.session.bonusEntryFlow = true;
    
        // Proceed to assignment method selection (random or choose)
        await showAssignmentMethodSelection(ctx);
    });


    // Custom bonus quantity
    bot.action('bonus_custom', async (ctx) => {
        await await ctx.answerCbQuery();
    
        const user = await User.findOne({ where: { telegram_id: ctx.from.id } });
    
        ctx.session.waitingForBonusQuantity = true;
        await sendTemporaryMessage(ctx,
            `Please enter how many bonus entries you want to use (1-${user.bonus_entries}):`,
            15000
        );
    });

    // Handle custom bonus quantity input
    // bot.on('message', async (ctx) => {
    //     if (ctx.session.waitingForBonusQuantity && ctx.message.text) {
    //         const quantity = parseInt(ctx.message.text, 10);
    //         const user = await User.findOne({ where: { telegram_id: ctx.from.id } });
        
    //         if (isNaN(quantity) || quantity < 1 || quantity > user.bonus_entries) {
    //             return sendError(ctx, `Please enter a valid number between 1 and ${user.bonus_entries}`);
    //         }

    //         ctx.session.quantity = quantity;
    //         ctx.session.bonusEntryFlow = true;
    //         ctx.session.waitingForBonusQuantity = false;
        
    //         // Delete the input message
    //         try {
    //             await ctx.deleteMessage();
    //         } catch (error) {
    //             console.log('Could not delete message:', error.message);
    //         }
        
    //         // Proceed to assignment method selection
    //         await showAssignmentMethodSelection(ctx);
    //     }
    // });
}

// Bonus entry selection

    async function showAssignmentMethodSelection(ctx) {
        const message = `
        <b>🎯 How would you like to assign your ${ctx.session.quantity} entries?</b>

        Choose how you want your bonus entries to be assigned:
    `;
        // DEFAULT ASSIGN METHOS IS ALPHA POOL
        ctx.session.poolName = 'Alpha';
        ctx.session.bonusEntryFlow = true;
        const keyboard = {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '🎲 Random Pick', callback_data: 'assign_method:random' },
                        { text: 'I\'ll Choose My Numbers', callback_data: 'assign_method:choose' }
                    ],
                    [
                        { text: '🔙 Back', callback_data: 'use_bonus_entries' }
                    ]
                ]
            }
        };

        await ctx.editMessageText(message, {
            parse_mode: 'HTML',
            reply_markup: keyboard.reply_markup
        });
    }
