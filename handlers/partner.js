const { User, Entry, Transaction, RafflePool } = require('../models');
const { Op } = require('sequelize');
const messageManager = require('../utils/messageManager');
// 🔧 Generate a referral code from first name + random digits
function generateReferralCode(firstName) {
  const sanitized = firstName.replace(/[^a-zA-Z0-9]/g, '').toUpperCase(); // Remove non-alphanumerics
  const trimmed = sanitized.slice(0, 8); // Limit to 8 characters
  const randomDigits = Math.floor(10000 + Math.random() * 90000); // 5-digit number
  return `${trimmed}${randomDigits}`;
}
// Partner bot start handler
async function handlePartnerStart(ctx) {
  const startParams = ctx.startPayload;
  const telegramId = ctx.from.id;
  const currentUsername = ctx.from.username || `user_${telegramId}`;
  const firstName = ctx.from.first_name || 'user';
  
  const ADMIN_ID = parseInt(process.env.ADMIN_ID, 10);
  let referrer = null;

  // Check referral code from start payload
  if (startParams && startParams.startsWith('ref_')) {
    const referralCode = startParams.replace('ref_', '');
    referrer = await User.findOne({ where: { referral_code: referralCode } });
  }

  // ❌ Block if no valid admin referral
  if (!referrer || referrer.telegram_id !== ADMIN_ID) {
    await ctx.reply("🚫 Invalid or unauthorized referral link. Only admin-issued links are valid for partners. Please contact Admin");
    return;
  }

  // ✅ Create or find user
  const [user, created] = await User.findOrCreate({
    where: { telegram_id: telegramId },
    defaults: {
      telegram_username: currentUsername,
      referral_code: generateReferralCode(firstName),
      referred_by: referrer.id,
    },
  });

  // Update username if it changed
  if (!created && user.telegram_username !== currentUsername) {
    user.telegram_username = currentUsername;
    await user.save();
  }

  // Ensure referral code exists
  if (!user.referral_code) {
    user.referral_code = generateReferralCode(firstName);
    await user.save();
  }

  // 🟩 If first-time registration
  if (created) {
    await ctx.reply("✅ Welcome! Your partner registration has been received.\nPlease wait for admin approval before accessing the partner dashboard.");
  } else {
    await ctx.reply("👋 Welcome back! Please contact admin if you haven’t been approved yet.");
  }
}

module.exports = (bot) => {

    // Partner command handler
    bot.start(async (ctx) => {
        await handlePartnerStart(ctx);
    });

    bot.command('partner', async (ctx) => {
        try {
            const telegramId = ctx.from.id;
            
            // Cleanup previous messages first
            await cleanupSessionMessages(ctx, [
                'partnerDashboardId',
                'partnerTransactionsId',
                'withdrawConfirmId',
                'partnerReferralsId'
            ]);

            // Check if user is a partner
            const user = await User.findOne({
                where: { telegram_id: telegramId }
            });

            if (!user) {
                const msg = await messageManager.sendAndTrack(ctx, '❌ User not found in database.');
                ctx.session.partnerDashboardId = msg.message_id;
                return;
            }

            if (!user.partner) {
                const msg = await messageManager.sendAndTrack(ctx,
                    '🚫 You are not registered as a partner.\n\n' +
                    'To become a partner, please contact administration.'
                );
                ctx.session.partnerDashboardId = msg.message_id;
                return;
            }

            // Show partner dashboard
            await showPartnerDashboard(ctx, user);
            
        } catch (error) {
            console.error('Partner command error:', error);
            const msg = await messageManager.sendAndTrack(ctx, '❌ An error occurred. Please try again.');
            ctx.session.partnerDashboardId = msg.message_id;
        }
    });

  
    // Partner dashboard callback handler
    bot.action('partner_dashboard', async (ctx) => {
        try {
            await ctx.answerCbQuery();
            const telegramId = ctx.from.id;
            
            // Cleanup previous messages
            await cleanupSessionMessages(ctx, [
                'partnerDashboardId',
                'partnerTransactionsId',
                'withdrawConfirmId',
                'partnerReferralsId'
            ]);

            const user = await User.findOne({ where: { telegram_id: telegramId } });
            
            if (user && user.partner) {
                await showPartnerDashboard(ctx, user);
            } else {
                const msg = await messageManager.sendAndTrack(ctx, '❌ Partner access denied.');
                ctx.session.partnerDashboardId = msg.message_id;
            }
        } catch (error) {
            console.error('Partner dashboard error:', error);
            await ctx.answerCbQuery('❌ Error loading dashboard');
        }
    });

    // Withdraw commission handler
    bot.action('partner_withdraw', async (ctx) => {
        try {
            await ctx.answerCbQuery();
            const telegramId = ctx.from.id;
            
            // Cleanup previous messages but keep dashboard
            await cleanupSessionMessages(ctx, [
                'withdrawConfirmId',
                'partnerTransactionsId'
            ]);

            const user = await User.findOne({ where: { telegram_id: telegramId } });

            if (!user || !user.partner) {
                const msg = await messageManager.sendAndTrack(ctx, '❌ Partner not found');
                ctx.session.withdrawConfirmId = msg.message_id;
                return;
            }

            if (user.partner_commission <= 0) {
                const msg = await messageManager.sendAndTrack(ctx, '❌ No commission available to withdraw.');
                ctx.session.withdrawConfirmId = msg.message_id;
                return;
            }

            // Ask for confirmation
            const msg = await messageManager.sendAndTrack(ctx,
                `⚠️ *Withdrawal Confirmation*\n\n` +
                `You are about to withdraw: *₦${user.partner_commission}*\n\n` +
                `Are you sure you want to proceed?`,
                {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: '✅ Yes, Withdraw', callback_data: 'confirm_withdraw' },
                                { text: '❌ Cancel', callback_data: 'partner_dashboard' }
                            ]
                        ]
                    }
                }
            );
            ctx.session.withdrawConfirmId = msg.message_id;
        } catch (error) {
            console.error('Withdraw error:', error);
            await ctx.answerCbQuery('❌ Withdrawal error');
        }
    });

    // Confirm withdrawal handler
    bot.action('confirm_withdraw', async (ctx) => {
        try {
            await ctx.answerCbQuery();
            const telegramId = ctx.from.id;
            
            // Cleanup withdrawal confirmation message
            await cleanupSessionMessages(ctx, ['withdrawConfirmId']);

            const user = await User.findOne({ where: { telegram_id: telegramId } });
            
            if (!user || !user.partner) {
                const msg = await messageManager.sendAndTrack(ctx, '❌ Partner not found');
                ctx.session.partnerDashboardId = msg.message_id;
                return;
            }

            const commissionAmount = user.partner_commission;
            
            if (commissionAmount <= 0) {
                const msg = await messageManager.sendAndTrack(ctx, '❌ No commission available to withdraw.');
                ctx.session.partnerDashboardId = msg.message_id;
                return;
            }

            // Generate unique reference
            const reference = `PTW${Date.now()}${Math.random().toString(36).substr(2, 5)}`.toUpperCase();

            // Process withdrawal - reset commission to 0
            await User.update(
                { partner_commission: 0.00 },
                { where: { telegram_id: telegramId } }
            );

            // Create withdrawal transaction record
            await Transaction.create({
                user_id: telegramId,
                amount: commissionAmount,
                type: 'partner_withdrawal',
                status: 'processing',
                description: `Partner commission withdrawal`,
                reference: reference,
                metadata: {
                    withdrawal_type: 'partner_commission',
                    previous_balance: commissionAmount,
                    withdrawn_at: new Date()
                }
            });

            const successMsg = await messageManager.sendAndTrack(ctx,
                `✅ *Withdrawal Request Submitted!*\n\n` +
                `Amount: *₦${commissionAmount}*\n` +
                `Reference: ${reference}\n` +
                `Status: ⏳ Processing\n\n` +
                `Your commission balance has been reset to ₦0. The funds will be processed within 24-48 hours.`,
                { parse_mode: 'Markdown' }
            );

            // Return to dashboard after a brief delay
            setTimeout(async () => {
                await cleanupSessionMessages(ctx, ['partnerDashboardId']);
                const updatedUser = await User.findOne({ where: { telegram_id: telegramId } });
                await showPartnerDashboard(ctx, updatedUser);
            }, 2000);
            
        } catch (error) {
            console.error('Confirm withdraw error:', error);
            const msg = await messageManager.sendAndTrack(ctx, '❌ Withdrawal failed. Please try again.');
            ctx.session.partnerDashboardId = msg.message_id;
        }
    });

    // Transaction history handler
    bot.action('partner_transactions', async (ctx) => {
        try {
            await ctx.answerCbQuery();
            const telegramId = ctx.from.id;
            
            // Cleanup previous messages but keep dashboard accessible
            await cleanupSessionMessages(ctx, [
                'partnerTransactionsId',
                'withdrawConfirmId'
            ]);

            const user = await User.findOne({ where: { telegram_id: telegramId } });

            if (!user || !user.partner) {
                const msg = await messageManager.sendAndTrack(ctx, '❌ Partner not found');
                ctx.session.partnerTransactionsId = msg.message_id;
                return;
            }

            const transactions = await Transaction.findAll({
                where: { user_id: telegramId },
                order: [['created_at', 'DESC']],
                limit: 10
            });

            let transactionsText = `📊 *Transaction History*\n\n`;

            if (transactions.length === 0) {
                transactionsText += `No transactions found.`;
            } else {
                transactions.forEach((tx, index) => {
                    const date = tx.created_at.toLocaleDateString();
                    const typeMap = {
                        'partner_withdrawal': '💰 Withdrawal',
                        'entry_purchase': '🎫 Entry Purchase',
                        'prize_win': '🏆 Prize Win',
                        'refund': '↩️ Refund',
                        'other': '📝 Other'
                    };
                    const statusIcon = tx.status === 'completed' ? '✅' : 
                                    tx.status === 'processing' ? '⏳' : 
                                    tx.status === 'failed' ? '❌' : '⏱️';
                    
                    transactionsText += `${statusIcon} *${typeMap[tx.type] || tx.type}*\n`;
                    transactionsText += `Amount: ₦${tx.amount}\n`;
                    transactionsText += `Status: ${tx.status}\n`;
                    transactionsText += `Date: ${date}\n`;
                    if (tx.reference) transactionsText += `Ref: ${tx.reference}\n`;
                    transactionsText += `\n`;
                });
            }

            const msg = await messageManager.sendAndTrack(ctx, transactionsText, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '⬅️ Back to Dashboard', callback_data: 'partner_dashboard' }]
                    ]
                }
            });
            ctx.session.partnerTransactionsId = msg.message_id;
        } catch (error) {
            console.error('Transaction history error:', error);
            await ctx.answerCbQuery('❌ Error loading transactions');
        }
    });
  
    // View partner referrals
    bot.action('partner_referrals', async (ctx) => {
            try {
                await ctx.answerCbQuery();
                const telegramId = ctx.from.id;
                await cleanupSessionMessages(ctx, [
                    'partnerDashboardId',
                    'partnerTransactionsId',
                    'withdrawConfirmId'
                ]);

                const partner = await User.findOne({ where: { telegram_id: telegramId } });
                if (!partner || !partner.partner) {
                    const msg = await messageManager.sendAndTrack(ctx, '❌ Partner not found.');
                    ctx.session.partnerReferralsId = msg.message_id;
                    return;
                }

                // Fetch referrals based on increment id, not telegram_id
                const referrals = await User.findAll({
                    where: { referred_by: partner.id },
                    order: [['createdAt', 'DESC']],
                    limit: 50
                });

                let referralText = `👥 *Your Referrals*\n\n`;
                if (referrals.length === 0) {
                    referralText += `No referrals yet. Share your referral link to invite users!`;
                } else {
                    referrals.forEach((ref, i) => {
                        const joinedDate = ref.createdAt ? ref.createdAt.toLocaleDateString() : 'N/A';
                        referralText += `${i + 1}. @${ref.telegram_username || ref.first_name || 'User'}\n`;
                        referralText += `🆔 ID: ${ref.id}\n📅 Joined: ${joinedDate}\n\n`;
                    });
                }

                const msg = await messageManager.sendAndTrack(ctx, referralText, {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [[{ text: '⬅️ Back to Dashboard', callback_data: 'partner_dashboard' }]]
                    }
                });
                ctx.session.partnerReferralsId = msg.message_id;
            } catch (error) {
                console.error('Partner referrals error:', error);
                await ctx.answerCbQuery('❌ Error loading referrals');
            }
    });

};

// Function to show partner dashboard
async function showPartnerDashboard(ctx, user) {
    try {
        // Get current week start and end dates
        const now = new Date();
        const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay()));
        const endOfWeek = new Date(now.setDate(now.getDate() - now.getDay() + 6));

        // Get referrals count

       const totalReferrals = await User.count({ where: { referred_by: user.id } });

        // Get referrals who made entries this week
        const weeklyActiveReferrals = await User.count({
            where: { 
                referred_by: user.telegram_id
            },
            include: [{
                model: Entry,
                where: {
                    createdAt: {
                        [Op.between]: [startOfWeek, endOfWeek]
                    }
                },
                required: true
            }]
        });

        // Get recent transactions
        const recentWithdrawals = await Transaction.findAll({
            where: { 
                user_id: user.telegram_id,
                type: 'partner_withdrawal'
            },
            order: [['created_at', 'DESC']],
            limit: 3
        });

        // Generate referral link
        const referralLink = `https://t.me/${process.env.GIVEAWAY_BOT_NAME}?start=ref_${user.referral_code}`;
        const referralLink2 = `https://t.me/${process.env.BOT_NAME}?start=ref_${user.referral_code}`;
        const referralCode = `ref_${user.referral_code}`;

        let dashboardText = 
            `👥 *Partner Dashboard*\n\n` +
            `💰 *Commission Balance:* ₦${user.partner_commission}\n` +
            `👥 *Total Referrals:* ${totalReferrals}\n` +
            `📈 *Active This Week:* ${weeklyActiveReferrals}\n` +
            `📅 *Partnership Started:* ${user.partner_start_date ? user.partner_start_date.toDateString() : 'Not yet'}\n\n` +
            `🔗 *Your Giveaway Referral Link:*\n\`${referralLink}\`\n\n` +
            `🔗 *Your Raffle Draw Referral Link:*\n\`${referralLink2}\`\n\n` +
            `📋 *Your Referral Code:*\n\`${referralCode}\``;

        // Add recent withdrawals if any
        if (recentWithdrawals.length > 0) {
            dashboardText += `\n\n📊 *Recent Withdrawals:*\n`;
            recentWithdrawals.forEach((tx, index) => {
                const date = tx.created_at.toLocaleDateString();
                const statusIcon = tx.status === 'completed' ? '✅' : 
                                tx.status === 'processing' ? '⏳' : '❌';
                dashboardText += `${statusIcon} ₦${tx.amount} - ${tx.status} - ${date}\n`;
            });
        }

        const keyboard = {
            inline_keyboard: [
                [{ text: '💰 Withdraw Commission', callback_data: 'partner_withdraw' }],
                [{ text: '📊 Transaction History', callback_data: 'partner_transactions' }],
                [{ text: '👥 View Referrals', callback_data: 'partner_referrals' }],
                [{ text: '🔄 Refresh', callback_data: 'partner_dashboard' }]
            ]
        };

        // Edit existing message or send new one
        if (ctx.updateType === 'callback_query' && ctx.session.partnerDashboardId) {
            try {
                await ctx.editMessageText(dashboardText, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard
                });
            } catch (error) {
                // If edit fails, send new message
                const msg = await messageManager.sendAndTrack(ctx, dashboardText, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard
                });
                ctx.session.partnerDashboardId = msg.message_id;
            }
        } else {
            const msg = await messageManager.sendAndTrack(ctx, dashboardText, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
            ctx.session.partnerDashboardId = msg.message_id;
        }

    } catch (error) {
        console.error('Show dashboard error:', error);
        const msg = await messageManager.sendAndTrack(ctx, '❌ Error loading dashboard. Please try again.');
        ctx.session.partnerDashboardId = msg.message_id;
    }
}

// Cleanup function matching your pattern
async function cleanupSessionMessages(ctx, messageKeys) {
    for (const key of messageKeys) {
        if (ctx.session[key]) {
            try {
                await ctx.deleteMessage(ctx.session[key]);
            } catch (e) {
                console.log(`Could not delete ${key}:`, e.message);
            }
            ctx.session[key] = null;
        }
    }
}

// Export the commission update function for use in other handlers


