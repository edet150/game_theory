const { getbotInstance , Markup} = require('../bot/botInstance');
const bot = getbotInstance();
const { RafflePool, Entry, User, Payment, Week, sequelize } = require('../models');
const axios = require('axios');  
const { showStartScreen, awardReferralBonusIfFirstPurchase, deleteMessagesByIds } = require('../startFunction');
const messageManager = require('../utils/messageManager');
const { sendError, sendSuccess } = require('../utils/responseUtils');
// In handleSuccessfulPayment function
const redisService = require('../services/redisService');

async function updatePartnerCommission(userId, entryAmount, transaction = null) {
    try {
        console.log('🔍 [updatePartnerCommission] STARTING - userId:', userId, 'entryAmount:', entryAmount);

        // 1️⃣ Fetch the user who made the transaction
        const referredUser = await User.findOne({
            where: { id: userId },
            transaction
        });

        if (!referredUser) {
            console.log('⚠️ [updatePartnerCommission] User not found:', userId);
            return;
        }

        console.log('👤 [updatePartnerCommission] User found:', referredUser.id, 'Referred by:', referredUser.referred_by);

        // 2️⃣ Check if this user was referred by someone
        if (!referredUser.referred_by) {
            console.log('ℹ️ [updatePartnerCommission] User was not referred by anyone.');
            return;
        }

        // 3️⃣ Fetch the referrer (could be partner or normal user)
        const referrer = await User.findOne({
            where: { id: referredUser.referred_by },
            transaction
        });

        if (!referrer) {
            console.log('⚠️ [updatePartnerCommission] Referrer not found:', referredUser.referred_by);
            return;
        }

        console.log('✅ [updatePartnerCommission] Referrer found:', referrer.id, 'Partner status:', referrer.partner);

        // 4️⃣ Determine commission rate
        const commissionRate = referrer.partner ? 0.15 : 0.10;
        const commission = entryAmount * commissionRate;

        console.log('💰 [updatePartnerCommission] Calculating commission:', {
            entryAmount,
            commissionRate,
            commission
        });

        // 5️⃣ Update referrer’s commission
        await User.increment('partner_commission', {
            by: commission,
            where: { id: referrer.id },
            transaction
        });

        // 6️⃣ Set partner start date if partner but not yet started
        if (referrer.partner && !referrer.partner_start_date) {
            await User.update(
                { partner_start_date: new Date() },
                { where: { id: referrer.id }, transaction }
            );
        }

        // 7️⃣ Send Telegram notification
        if (referrer.telegram_id) {
            try {
                await bot.telegram.sendMessage(
                    referrer.telegram_id,
                    `🎉 Commission earned!\n\n` +
                    `Your referral just purchased entries worth ₦${entryAmount}\n` +
                    `💰 Commission: ₦${commission}\n` +
                    `(${referrer.partner ? 'Partner 15%' : 'Referral 10%'} rate applied)\n` +
                    `📊 Check your dashboard for details!`,
                    {
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: "👥 Dashboard", callback_data: "open_partner_dashboard" }]
                            ]
                        }
                    }
                );
                console.log('📱 [updatePartnerCommission] Notification sent successfully to Telegram ID:', referrer.telegram_id);
            } catch (notificationError) {
                console.log('❌ [updatePartnerCommission] Could not send Telegram notification:', notificationError.message);
            }
        } else {
            console.log('ℹ️ [updatePartnerCommission] Referrer has no telegram_id, skipping notification.');
        }

        console.log(`✅ [updatePartnerCommission] SUCCESS - ₦${commission} added to user ${referrer.id}`);

    } catch (error) {
        console.error('❌ [updatePartnerCommission] ERROR:', error.message);
        console.error(error.stack);
    }
}
async function updatePartnerFlatCommission(userId, entryAmount, transaction = null) {
    try {
        console.log('🔍 [updatePartnerFlatCommission] STARTING - userId:', userId, 'entryAmount:', entryAmount);

        // 1️⃣ Fetch the user who made the transaction
        const referredUser = await User.findOne({
            where: { id: userId },
            transaction
        });

        if (!referredUser) {
            console.log('⚠️ [updatePartnerFlatCommission] User not found:', userId);
            return;
        }

        console.log('👤 [updatePartnerFlatCommission] User found:', referredUser.id, 'Referred by:', referredUser.referred_by);

        // 2️⃣ Check if this user was referred by someone
        if (!referredUser.referred_by) {
            console.log('ℹ️ [updatePartnerFlatCommission] User was not referred by anyone.');
            return;
        }

        // 3️⃣ Check if this is the first transaction
        const previousTransactions = await Entry.count({
            where: { user_id: referredUser.id },
            transaction
        });

        if (previousTransactions > 1) {
            console.log('ℹ️ [updatePartnerFlatCommission] Not first transaction — no commission applied.');
            return;
        }

        // 4️⃣ Fetch the referrer
        const referrer = await User.findOne({
            where: { id: referredUser.referred_by },
            transaction
        });

        if (!referrer) {
            console.log('⚠️ [updatePartnerFlatCommission] Referrer not found:', referredUser.referred_by);
            return;
        }

        console.log('✅ [updatePartnerFlatCommission] Referrer found:', referrer.id);

        // 5️⃣ Flat commission logic
        const commission = 500;

        // 6️⃣ Update referrer’s commission
        await User.increment('partner_commission', {
            by: commission,
            where: { id: referrer.id },
            transaction
        });

        // 7️⃣ Set partner start date if applicable
        if (referrer.partner && !referrer.partner_start_date) {
            await User.update(
                { partner_start_date: new Date() },
                { where: { id: referrer.id }, transaction }
            );
        }

        // 8️⃣ Send Telegram notification
        if (referrer.telegram_id) {
            try {
                await bot.telegram.sendMessage(
                    referrer.telegram_id,
                    `🎉 Commission earned!\n\n` +
                    `Your referral just made their *first purchase* worth ₦${entryAmount}\n` +
                    `💰 You’ve earned a flat ₦${commission} commission!\n` +
                    `📊 Check your dashboard for details.`,
                    {
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: "👥 Dashboard", callback_data: "open_partner_dashboard" }]
                            ]
                        }
                    }
                );
                console.log('📱 [updatePartnerFlatCommission] Notification sent successfully to Telegram ID:', referrer.telegram_id);
            } catch (notificationError) {
                console.log('❌ [updatePartnerFlatCommission] Could not send Telegram notification:', notificationError.message);
            }
        } else {
            console.log('ℹ️ [updatePartnerFlatCommission] Referrer has no telegram_id, skipping notification.');
        }

        console.log(`✅ [updatePartnerFlatCommission] SUCCESS - ₦${commission} added to user ${referrer.id}`);

    } catch (error) {
        console.error('❌ [updatePartnerFlatCommission] ERROR:', error.message);
        console.error(error.stack);
    }
}



// Show confirmation summary before payment
async function showPaymentConfirmation(ctx) {
  const session = ctx.session;
  const pool = await RafflePool.findOne({ where: { name: session.poolName } });
  const methodName = session.assignmentMethod === 'choose' ? 'Manual Selection' : 'Random Assignment';
  const sortedNumbers = session.selectedNumbers ? [...session.selectedNumbers].sort((a, b) => a - b) : [];

  let totalAmount;

  if (session.quantity === pool.quantity) {
    // User is buying exactly the package size
    totalAmount = pool.price_per_entry;
  } else {
    // Derive per entry price from package
    const perEntryPrice = pool.price_per_entry / pool.quantity;
    totalAmount = perEntryPrice * session.quantity;
  }

  const confirmationMessage = `
🟢 *ORDER CONFIRMATION*

◎ *Draw:* ${pool.name}
◎ *Price:* ₦${pool.price_per_entry} for ${pool.quantity} entries
◎ *Entries purchased:* ${session.quantity}
◎ *Selection method:* ${methodName}
◎ *Your numbers:* ${sortedNumbers.join(', ')}

◎ *Total Amount:* ₦${totalAmount}

⚠️ *Please review your order before proceeding to payment.*
  `;

  // Delete previous confirmation if exists
  if (ctx.session.confirmationMessageId_) {
    try {
      await ctx.deleteMessage(ctx.session.confirmationMessageId_);
    } catch (e) {
      console.log("Previous confirmation already gone:", e.message);
    }
  }

  // Determine the callback data based on pool name
  const isAlpha = pool.name.toLowerCase() == 'Single';
  const editButton = {
    text: '✏️ Edit Selection',
    callback_data: isAlpha ? 'edit_selection' : '_edit_selection'
  };

  // Send new confirmation
  const confirmation = await ctx.reply(confirmationMessage, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: '✅ Confirm & Pay with Paystack', callback_data: 'proceed_to_payment' }],
        [editButton],
        [{ text: '🔄 Re-start Game Selection', callback_data: 'start_over' }]
      ]
    }
  });

  ctx.session.confirmationMessageId_ = confirmation.message_id;

  return confirmation;
}


async function initiatePayment(bot, ctx) {
    const session = ctx.session;
    try {
        const pool = await RafflePool.findOne({ where: { name: session.poolName } });
        if (!pool) return ctx.reply('⚠️ Pool not found.');

        // ✅ Correct calculation
        const unitPrice = pool.price_per_entry / pool.quantity;
        const totalAmount = unitPrice * session.quantity; // in naira
        const paystackAmount = Math.round(totalAmount * 100); // Paystack requires integer kobo


        const user = await User.findOne({ where: { telegram_id: ctx.from.id } });
        if (!user) return ctx.reply("⚠️ You must register first.");

        const currentLotteryWeek = await Week.findOne({
            order: [['week_number', 'DESC']]
        });
        if (!currentLotteryWeek) {
            return ctx.reply('⚠️ No active Game week found. Please try again later.');
        }

        const methodName = session.assignmentMethod === 'choose' ? 'Manual Selection' : 'Random Assignment';
        const sortedNumbers = session.selectedNumbers ? [...session.selectedNumbers].sort((a, b) => a - b) : [];

        const metadata = {
            telegram_id: ctx.from.id,
            user_id: user.id,
            pool_id: pool.id,
            pool_name: pool.name,
            price_per_entry: pool.price_per_entry,
            pool_quantity: pool.quantity,
            quantity: session.quantity,
            unit_price: unitPrice,
            total_amount: totalAmount,
            assignmentMethod: session.assignmentMethod,
            method_name: methodName,
            lottery_week_id: currentLotteryWeek.id,
            lottery_week_code: currentLotteryWeek.code,
            lottery_week_number: currentLotteryWeek.week_number,
            lottery_week_name: currentLotteryWeek.week_name,
            selectedNumbers: session.selectedNumbers || [],
            sorted_numbers: sortedNumbers,
            entry_time: new Date().toISOString(),
            summary_data: {
                pool_name: pool.name,
                unit_price: unitPrice,
                quantity: session.quantity,
                method_name: methodName,
                numbers: sortedNumbers,
                entry_time: new Date().toISOString()
            }
        };

        const paystackResponse = await axios.post(
            'https://api.paystack.co/transaction/initialize',
            {
                email: ctx.from.username ? `${ctx.from.username}@example.com` : `user${ctx.from.id}@example.com`,
                amount: paystackAmount,
                currency: 'NGN',
                callback_url: `${process.env.callback_url}/paymentredirect`,
                metadata: metadata
            },
            {
                headers: {
                    Authorization: `Bearer ${process.env.PAYSTACK_SEC_TEST}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        const paymentLink = paystackResponse.data.data.authorization_url;

        if (ctx.session.paymentMessageId) {
            try {
                await ctx.deleteMessage(ctx.session.paymentMessageId);
            } catch (e) {
                console.log("Previous payment message already gone:", e.message);
            }
        }

        const paymentMessage = await ctx.reply(
            `💳 Ready to complete your purchase!\n\n` +
            `Total: *₦${Number(totalAmount).toLocaleString()}*\n` +
            `Click the button below to proceed to payment:`,
            {
                parse_mode: "Markdown",
                reply_markup: {
                    inline_keyboard: [
                        [{ text: `💳 Pay ₦${Number(totalAmount).toLocaleString()}`, url: paymentLink }],
                        [{ text: `Click to Verify Payment`, callback_data: 'verify_payment' }],
                        [{ text: '↩️ Back to Confirmation screen', callback_data: 'back_to_confirmation' }]
                    ]
                }
            }
        );

        ctx.session.paymentMessageId = paymentMessage.message_id;

    } catch (error) {
        console.error('Error initiating payment:', error.response?.data || error.message);
        ctx.reply('⚠️ Failed to initiate payment. Please try again later.');
    }
}



  /**
   * Webhook handler or conceptual handler for successful Paystack payment
   * Call this when Paystack sends a callback for successful payment.
   */
  function formatUnitPrice(price) {
      let num = Number(price);
      if (isNaN(num)) return 'Invalid price';
      return `₦${num.toFixed(1)}`;
}
  // Helper function to get user's entry positions within specific pool
async function getUserEntryPositions(userId, poolId, weekCode, selectedNumbers, transaction = null) {
    try {
        const { Op } = require('sequelize');

        if (!userId || !poolId || !weekCode) {
            console.error('Missing required parameters:', { userId, poolId, weekCode });
            return [];
        }

        const cleanSelectedNumbers = (selectedNumbers || [])
            .map(num => parseInt(num))
            .filter(num => !isNaN(num) && num > 0);

        if (cleanSelectedNumbers.length === 0) {
            console.error('No valid numbers in selectedNumbers:', selectedNumbers);
            return [];
        }

        console.log(`📊 Getting positions for user ${userId}, pool ${poolId}, week ${weekCode}, numbers:`, cleanSelectedNumbers);

        // 🔹 Get all pool entries for the week
        const allPoolEntries = await Entry.findAll({
            where: {
                pool_id: poolId,
                week_code: weekCode,
                status: 'paid'
            },
            attributes: ['entry_number', 'user_id'],
            order: [['entry_number', 'ASC']],
            transaction
        });

        console.log(`Found ${allPoolEntries.length} total entries in pool ${poolId} for week ${weekCode}`);

        // 🔹 Build an ordered array of all entry numbers
        const allEntryNumbers = allPoolEntries.map(e => e.entry_number);

        // 🔹 Determine positions of the user’s selected numbers
        const results = cleanSelectedNumbers.map(num => {
            const position = allEntryNumbers.indexOf(num) + 1; // 1-based index
            const found = position > 0;

            return {
                entry_number: num,
                position: found ? position : null,
                exists_in_pool: found
            };
        });

        console.log('🏁 Final positions result:', results);
        return results;

    } catch (error) {
        console.error('❌ Error getting user pool entry positions:', error);
        return [];
    }
}


async function handleSuccessfulPayment(bot, paystackTransaction) {
    const t = await sequelize.transaction();

    try {
        const { id, reference, amount, metadata, status } = paystackTransaction;

        const { 
            telegram_id, 
            user_id, 
            pool_id, 
            quantity, 
            assignmentMethod, 
            selectedNumbers,
            lottery_week_id,
            lottery_week_number,
            lottery_week_name,
            lottery_week_code,
            summary_data
        } = metadata;

        const user = await User.findByPk(user_id, { transaction: t });
        const pool = await RafflePool.findByPk(pool_id, { transaction: t });
        const lotteryWeek = await Week.findByPk(lottery_week_id, { transaction: t });

        if (!user || !pool || !lotteryWeek) {
            throw new Error(`User, Pool, or Lottery Week not found`);
        }

        // Avoid duplicate processing
        const existingPayment = await Payment.findOne({
            where: { paystack_transaction_id: id },
            transaction: t
        });
        if (existingPayment) {
            console.log(`Payment with transaction ID ${id} already processed. Skipping.`);
            await t.commit();
            return;
        }

        // Create payment record
        const paymentRecord = await Payment.create({
            user_id: user.id,
            pool_id: pool.id,
            lottery_week_id: lotteryWeek.id,
            paystack_transaction_id: id,
            paystack_reference: reference,
            amount: amount / 100,
            status,
            quantity
        }, { transaction: t });

        // Create entries
        const result = await finalizeEntries(
            user.id,
            pool.id,
            selectedNumbers,
            lottery_week_code,
            lottery_week_name,
            id,
            false,
            t // ✅ pass transaction
        );

        if (!result.success) throw new Error(`Failed to create entries: ${result.message}`);

        // Referral + Partner
        await awardReferralBonusIfFirstPurchase(user.id, quantity, paymentRecord.id, bot, t);
        await updatePartnerFlatCommission(user.id, amount / 100, t);

        // ✅ Now safely get user entry positions WITHIN the same transaction
        console.log('🔍 [handleSuccessfulPayment] Calling getUserEntryPositions with:', {
            userId: user.id,
            poolId: pool.id,
            weekCode: lottery_week_code,
            selectedNumbers: selectedNumbers
        });

        const userEntryPositions = await getUserEntryPositions(
            user.id,
            pool.id,
            lottery_week_code,
            selectedNumbers,
            t // ✅ use the same transaction
        );

        console.log('📊 [handleSuccessfulPayment] Positions result:', userEntryPositions);

        // Commit transaction AFTER all operations complete
        await t.commit();

        // ✅ Safe to continue with post-processing (Redis + Telegram messages)
        const entryData = {
            numbers: selectedNumbers,
            poolId: pool.id,
            poolName: pool.name,
            method: summary_data.method_name,
            quantity: summary_data.quantity,
            lottery_week_id: lotteryWeek.id,
            lottery_week_number: lotteryWeek.week_number,
            payment_reference: reference,
            payment_amount: amount / 100,
        };

        await redisService.addFinalizedEntry(telegram_id, entryData);

        console.log(`✅ Processed transaction ${id}, entries created.`);

        // ---- Message Construction (unchanged) ----
        const positionsText = userEntryPositions.length
            ? userEntryPositions.map(e => `#${e.entry_number} (Pos: ${e.position})`).join(', ')
            : 'Pending update';

const summaryMessage = `
🟢 *ENTRY CONFIRMATION SUMMARY*

◎ *Draw:* ${summary_data.pool_name} Draw
◎ *Price per entry:* ${formatUnitPrice(summary_data.unit_price)}
◎ *Entries purchased:* ${summary_data.quantity}
◎ *Selection method:* ${summary_data.method_name}
◎ *Your numbers:* ${summary_data.numbers.join(', ')}
◎ *Entry positions:* ${positionsText}

◎ *Entry time:* ${new Date(summary_data.entry_time).toLocaleString()}
◎ *Lottery Week:* ${lottery_week_number}
◎ *Status:* Confirmed and paid.
◎ *How It Works:* You can win with your number or position click /howitworks to see more.

 💡 *Remember: The Raffle Draw takes place on 26th October, 2025 at 6:00 PM*
`;
      
    // Send the GIF first
    await ctx.replyWithAnimation({ source: '../images/deposit.mp4' });

    // Then send the confirmation message
    await ctx.telegram.sendMessage(telegram_id, summaryMessage, { parse_mode: 'Markdown' });

await bot.telegram.sendMessage(
  telegram_id,
  `💰 <b>Earn ₦500 Commission for every referral</b>

Invite friends to play and earn <b>10%</b> of whatever they spend - automatically, every time! 🔥  

Turn your network into <b>passive income</b> 💸  
No stress, no waiting - just steady earnings while others play.  

⚡ <b>Start now</b> — get your referral link and begin earning today! 🏆`,

  {
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [
        [{ text: "💸 Get My Referral Link", callback_data: "refer_and_earn" }],
        // [{ text: "📊 My Referrals", callback_data: "referral_dashboard" }],
        [{ text: "🏦 Setup Payouts", callback_data: "bank_setup" }],
        [{ text: "ℹ️ How It Works", callback_data: "how_it_works" }]
      ]
    }
  }
);



    } catch (error) {
        await t.rollback();
        console.error("❌ Error handling successful payment:", error);

        const telegramId = paystackTransaction.metadata?.telegram_id;
        if (telegramId) {
            await bot.telegram.sendMessage(
                telegramId,
                "❌ An error occurred while processing your payment. Please contact support."
            );
        }
    }
}



// ----------------- Utility -----------------

async function getAvailableNumbers(poolId, selectedNumbers = [], limit = 25) {
  const pool = await RafflePool.findByPk(poolId, { attributes: ['max_entries'] });
  if (!pool) return [];

  const maxEntries = pool.max_entries;
  const GRID_START = 2000;
  const GRID_END = 9999;
  const TOTAL_GRID = GRID_END - GRID_START + 1;

  // Ensure we don't exceed the grid cap
  const safeEntries = Math.min(maxEntries, TOTAL_GRID);

  const taken = await Entry.findAll({
    where: { pool_id: poolId, status: "paid" },
    attributes: ["entry_number"],
  });

  const takenSet = new Set(taken.map((t) => t.entry_number));
  const selectedSet = new Set(selectedNumbers);

  const poolNumbers = Array.from({ length: safeEntries }, (_, i) => GRID_START + i);

  const available = poolNumbers.filter((n) => !takenSet.has(n) && !selectedSet.has(n));

  available.sort(() => Math.random() - 0.5);

  return available.slice(0, limit); // returns 25 by default
}



function buildNumberGrid(numbers, selected = []) {
  const keyboard = [];
  for (let i = 0; i < numbers.length; i += 5) {
    const row = numbers.slice(i, i + 5).map((num) => {
      // The `isSelected` logic is no longer here because we are displaying selected numbers separately.
      // We are just showing available numbers.
      return Markup.button.callback(`${num}`, `choose_number:${num}`);
    });
    keyboard.push(row);
  }
  keyboard.push([
    Markup.button.callback("🔄 Refresh", "choose_refresh"),
    Markup.button.callback("✅ Done", "choose_done"),
  ]);
  return Markup.inlineKeyboard(keyboard);
}

// New function to build the grid for selected numbers
function buildSelectedNumbersGrid(selected) {
    const keyboard = [];
    if (selected.length === 0) {
        return Markup.inlineKeyboard([[{ text: "No numbers selected yet.", callback_data: "none" }]]);
    }
    
    // Create a row for each selected number with a remove button
    selected.sort((a, b) => a - b).forEach(num => {
        keyboard.push([
            Markup.button.callback(`❌ Remove ${num}`, `remove_number:${num}`)
        ]);
    });
    return Markup.inlineKeyboard(keyboard);
}

async function createEntries(
  ctx,
  userId,
  poolId,
  quantity,
  method,
  chosenNumbers = []
) {
  console.log(method)
  const pool = await RafflePool.findByPk(poolId);
  if (!pool) return ctx.reply("⚠️ Pool not found.");

  try {
    if (method === "choose") {
      // Logic for initiating the interactive 'chooses' method
      const available = await getAvailableNumbers(poolId);

      ctx.session.userId = userId;
      ctx.session.poolId = poolId;
      ctx.session.quantityLimit = quantity;
      ctx.session.selectedNumbers = [];

      console.log(ctx.session);

      await ctx.reply(
        `Please choose *${quantity}* numbers for the ${pool.name} pool:`,
        {
          parse_mode: "markdown",
          ...buildNumberGrid(available, [], quantity),
        }
      );
      // This is an interactive process, so we return here.
      // The final entry creation will be handled by a separate handler like `choose_done`.
      return;
    }

    // This section is for 'sequential' and 'random' methods,
    // which are fully automated and don't need user input.
    // The code below should only run when method is NOT 'chooses'.
    let assignedNumbers = [];

    // Correctly handle sequential and random assignment
    const latestEntry = await Entry.findOne({
      where: { pool_id: poolId },
      order: [["entry_number", "DESC"]],
      attributes: ["entry_number"],
    });

    let startNumber = (latestEntry ? latestEntry.entry_number : 0) + 1;
    for (let i = 0; i < quantity; i++) {
      assignedNumbers.push(startNumber + i);
    }
    if (method === "random") {
      assignedNumbers.sort(() => Math.random() - 0.5);
    }

    // Create the entries with the assigned numbers
    const entries = assignedNumbers.map((number) => ({
      user_id: userId,
      pool_id: poolId,
      entry_number: number,
      status: "paid",
    }));

    await Entry.bulkCreate(entries);
    await ctx.reply(
      `✅ Entries Created! Your entry numbers are: ${assignedNumbers.join(", ")}.`
    );
  } catch (error) {
    console.error("Error creating entries:", error);
    await ctx.reply(
      "❌ An error occurred while assigning your entries. Please contact support."
    );
  }
}
async function updateSelectionView(ctx, selectedNumbers, quantity) {
    const selectedText = `You have selected *${selectedNumbers.length}* of *${quantity}* numbers.`;
    
    // First, display or edit the message with the selected numbers grid
    // We check if the message ID is in the session to edit it, otherwise we send a new message.
    if (ctx.session.selectionMessageId) {
        await ctx.telegram.editMessageText(
            ctx.chat.id,
            ctx.session.selectionMessageId,
            null,
            selectedText,
            { parse_mode: 'markdown', reply_markup: buildSelectedNumbersGrid(selectedNumbers).reply_markup }
        );
    } else {
        const message = await ctx.reply(selectedText, {
            parse_mode: 'markdown',
            reply_markup: buildSelectedNumbersGrid(selectedNumbers).reply_markup
        });
        ctx.session.selectionMessageId = message.message_id;
    }
}

// Modified finalizeEntries function
// async function finalizeEntries(userId, poolId, numbers, lottery_week_code, lottery_week_name, transactionId = null, isBonus = false) {
//   try {
//     // Step 1: Fetch already taken numbers in this pool & week
//     const existingEntries = await Entry.findAll({
//       where: {
//         pool_id: poolId,
//         week_code: lottery_week_code,
//         entry_number: numbers
//       },
//       attributes: ["entry_number"]
//     });

//     const existingNumbers = new Set(existingEntries.map(e => e.entry_number));

//     // Step 2: Filter out numbers that are already taken
//     const uniqueNumbers = numbers.filter(num => !existingNumbers.has(num));

//     if (uniqueNumbers.length === 0) {
//       return { success: false, message: "All selected numbers are already taken." };
//     }

//     // Step 3: Prepare new entries
//     const entries = uniqueNumbers.map((num) => ({
//       user_id: userId,
//       pool_id: poolId,
//       entry_number: num,
//       week_code: lottery_week_code,
//       week_name: lottery_week_name,
//       transaction_id: transactionId,
//       status: "paid",
//       is_bonus_entry: isBonus
//     }));

//     // Step 4: Bulk insert only unique entries
//     await Entry.bulkCreate(entries);

//     // Step 5: Deduct bonus entries if needed
//     if (isBonus) {
//       await User.increment(
//         { bonus_entries: -uniqueNumbers.length },
//         { where: { id: userId } }
//       );
//     }

//     return { success: true, message: `Entries created: ${uniqueNumbers.join(", ")}` };
//   } catch (error) {
//     console.error("Error creating entries:", error);
//     return { success: false, message: "An error occurred while finalizing entries." };
//   }
// }

async function finalizeEntries(
  userId,
  poolId,
  numbers,
  lottery_week_code,
  lottery_week_name,
  transactionId = null,
  isBonus = false,
  transaction = null
) {
  try {
    // Step 1: Fetch already taken numbers
    const existingEntries = await Entry.findAll({
      where: {
        pool_id: poolId,
        week_code: lottery_week_code,
        entry_number: numbers
      },
      attributes: ["entry_number"],
      transaction
    });

    const existingNumbers = new Set(existingEntries.map(e => e.entry_number));

    // Step 2: Filter out already taken
    const uniqueNumbers = numbers.filter(num => !existingNumbers.has(num));
    if (uniqueNumbers.length === 0) {
      return { success: false, message: "All selected numbers are already taken." };
    }

    // Step 3: Prepare new entries
    const entries = uniqueNumbers.map((num) => ({
      user_id: userId,
      pool_id: poolId,
      entry_number: num,
      week_code: lottery_week_code,
      week_name: lottery_week_name,
      transaction_id: transactionId,
      status: "paid",
      is_bonus_entry: isBonus
    }));

    // Step 4: Bulk insert with SAME transaction
    await Entry.bulkCreate(entries, { transaction });

    // Step 5: Deduct bonus inside SAME transaction
    if (isBonus) {
      await User.increment(
        { bonus_entries: -uniqueNumbers.length },
        { where: { id: userId }, transaction }
      );
    }

    return { success: true, message: `Entries created: ${uniqueNumbers.join(", ")}` };
  } catch (error) {
    console.error("Error creating entries:", error);
    return { success: false, message: "An error occurred while finalizing entries." };
  }
}



function buildGrid(available, selected, quantity, method, finalized = false) {
  const keyboard = [];

  // 1. Add "Your Selection" heading
  keyboard.push([Markup.button.callback(`✅ Your Selections (${selected.length}/${quantity})`, "selection_header")]);

  // 2. Add the selected numbers grid
  if (selected.length > 0) {
    const sortedSelected = selected.sort((a, b) => a - b);
    for (let i = 0; i < sortedSelected.length; i += 3) {
      const row = sortedSelected.slice(i, i + 3).map((num) => {
        if (finalized) {
          // Disable remove button for finalized entries (no callback, just text)
          return Markup.button.callback(`✅ ${num}`, "no_action");
        } else {
          const callbackData = (method === 'choose') ? `remove_number:${num}` : `random_remove:${num}`;
          return Markup.button.callback(`❌ ${num}`, callbackData);
        }
      });
      keyboard.push(row);
    }
  } else {
    keyboard.push([Markup.button.callback("No numbers selected yet.", "selection_empty")]);
  }

  // 3. Add "Available Numbers" heading (only show if not finalized)
  if (!finalized) {
    keyboard.push([Markup.button.callback("Available Numbers:", "available_header")]);

    // 4. Add the available numbers grid
    for (let i = 0; i < available.length; i += 5) {
      const row = available.slice(i, i + 5).map((num) => {
        const callbackData = (method === 'choose') ? `choose_number:${num}` : `random_select:${num}`;
        return Markup.button.callback(`${num}`, callbackData);
      });
      keyboard.push(row);
    }

    // 5. Add action buttons
    keyboard.push([
      Markup.button.callback("🔄 Refresh", `refresh:${method}`),
      Markup.button.callback("✅ Done", `done:${method}`),
    ]);
  } else {
    // For finalized view, show a message instead of available numbers
    keyboard.push([Markup.button.callback("🎉 Entries Finalized!", "finalized_header")]);
  }

  return Markup.inlineKeyboard(keyboard);
}

async function generateRandomNumbers(poolId, quantity) {
  console.log('ggjj')
  const pool = await RafflePool.findByPk(poolId, { attributes: ['max_entries'] });
  if (!pool) return [];
  const maxEntries = pool.max_entries;
  console.log('maxEntries', maxEntries)

  const taken = await Entry.findAll({
    where: { pool_id: poolId, status: "paid" },
    attributes: ["entry_number"],
  });
  const takenSet = new Set(taken.map((t) => t.entry_number));

  const availableNumbers = [];
  for (let i = 2000; i <= maxEntries; i++) {
    if (!takenSet.has(i)) {
      availableNumbers.push(i);
    }
  }

  // Shuffle the entire available pool
  availableNumbers.sort(() => Math.random() - 0.5);

  // Take the first 'quantity' numbers
  return availableNumbers.slice(0, quantity);
}

// New function to build the grid for random numbers
function buildRandomGrid(numbers, finalized = false) {
  // Bold each number individually using HTML
  const boldNumbers = numbers.map(num => `<b>${num}</b>`).join(", ");
  const text = `Your ${finalized ? 'finalized' : 'randomly selected'} numbers: ${boldNumbers}`;

  let keyboard;
  if (finalized) {
    keyboard = Markup.inlineKeyboard([
      [Markup.button.callback("✅ Finalized - Cannot be changed", "no_action_finalized")]
    ]);
  } else {
    keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback("🔄 Refresh", "random_refresh"),
        Markup.button.callback("✅ Confirm", "random_confirm"),
      ],
    ]);
  }

  // Return as a message object with HTML parsing
  return {
    text,
    parse_mode: "HTML",
    reply_markup: keyboard.reply_markup,
    disable_web_page_preview: true
  };
}

async function checkQueryExpiry(ctx, restartOnExpire = false) {
  const now = Date.now();
console.log('working')
  if (ctx.session.keyboardTimestamp && now - ctx.session.keyboardTimestamp > 30000) {
    // await ctx.answerCbQuery("⚠️ This action has expired. Please refresh.");
    await sendError(ctx, "⚠️ This action has expired. Please refresh.");
    if (restartOnExpire) {
      // Re-run your /start flow
        await showStartScreen(ctx);
    }

    return true; // expired
  } else {
    console.log('ese')
  }

  return false; // still valid
}
module.exports = {
  checkQueryExpiry,
  initiatePayment,
  createEntries,
  handleSuccessfulPayment,
  getAvailableNumbers,
  buildNumberGrid,
  buildSelectedNumbersGrid,
  updateSelectionView,
  finalizeEntries,
  buildGrid,
  buildRandomGrid,
  generateRandomNumbers
};
