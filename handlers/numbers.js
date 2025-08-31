const { RafflePool, Entry, User, sequelize } = require('../models');
const { QueryTypes } = require('sequelize');
// const {initiatePayment} = require('./payment');
const { updateSelectionView,checkQueryExpiry, buildGrid, buildRandomGrid,generateRandomNumbers, finalizeEntries, getAvailableNumbers,buildNumberGrid,buildSelectedNumbersGrid, handleSuccessfulPayment } = require('./payment');
const { Markup} = require('../bot/botInstance');
const { cleanupSelectionMessages } = require('../startFunction');
/**
 * Registers the number selection handler with the bot.
 * @param {Telegraf} bot - The Telegraf bot instance.
 */
function clearSelectionSession(session) {
  // Clear only selection-related session data, keep user info and finalized entries
  const preservedData = {
    userId: session.userId,
    finalizedEntries: session.finalizedEntries || [],
    // Preserve any other data you want to keep across sessions
  };
  
  // Clear the session and restore preserved data
  Object.keys(session).forEach(key => delete session[key]);
  Object.assign(session, preservedData);
  
  // Alternatively, if you want to be more specific:
  /*
  session.selectedNumbers = null;
  session.availableNumbers = null;
  session.quantityLimit = null;
  session.poolId = null;
  session.poolName = null;
  session.assignmentMethod = null;
  session.quantity = null;
  session.nextAction = null;
  session.selectionMessageId = null;
  */
}
module.exports = (bot) => {
  // bot.js (or wherever your bot actions are defined)
  
bot.action(/^assign_method:(\w+)/, async (ctx) => {
  ctx.answerCbQuery();
  const method = ctx.match[1];

  if (method !== 'choose' && method !== 'sequential' && method !== 'random') {
    return ctx.reply("⚠️ Invalid assignment method. Please try again.");
  }
  
  // Set up the session state for this flow
  ctx.session.assignmentMethod = method;
  const user = await User.findOne({ where: { telegram_id: ctx.from.id } });
  const pool = await RafflePool.findOne({ where: { name: ctx.session.poolName } });
  if (!user || !pool) return ctx.reply("⚠️ An error occurred. Please try again.");
  
  ctx.session.userId = user.id;
  ctx.session.poolId = pool.id;
  ctx.session.quantityLimit = ctx.session.quantity;
  ctx.session.selectedNumbers = [];

  // --- Logic for 'choose' (interactive grid) ---
  if (method === 'choose') {
    const initialAvailableNumbers = await getAvailableNumbers(ctx.session.poolId);
    ctx.session.availableNumbers = initialAvailableNumbers;

    const initialGrid = buildGrid(
      ctx.session.availableNumbers,
      ctx.session.selectedNumbers,
      ctx.session.quantityLimit,
      'choose'
    );
    
    // STORE THE GRID MESSAGE ID
    const gridMessage = await ctx.reply(`Please choose *${ctx.session.quantityLimit}* numbers for the ${pool.name} Pool:`, {
      parse_mode: 'Markdown',
      reply_markup: initialGrid.reply_markup
    });
    
    ctx.session.gridMessageId = gridMessage.message_id;
    console.log( 'grid', ctx.session.gridMessageId)

  // --- Logic for 'random' (interactive card) ---
  } else if (method === 'random') {
    const randomNumbers = await generateRandomNumbers(ctx.session.poolId, ctx.session.quantityLimit);
    ctx.session.selectedNumbers = randomNumbers;

    const { text, reply_markup } = buildRandomGrid(randomNumbers);
    
    // STORE THE RANDOM GRID MESSAGE ID
    const randomGridMessage = await ctx.reply(text, { reply_markup });
    ctx.session.randomGridMessageId = randomGridMessage.message_id;
  }
});
  
// ----------------- Handlers -----------------
bot.action(/^choose_number:(\d+)$/, async (ctx) => {
  ctx.answerCbQuery();
  checkQueryExpiry(ctx,)
    const num = parseInt(ctx.match[1]);
      console.log(num)
    // Check if the user has reached their quantity limit
    if (ctx.session.selectedNumbers.length >= ctx.session.quantityLimit) {
        return ctx.answerCbQuery(
            `⚠️ You can only pick ${ctx.session.quantityLimit} numbers.`,
            true // The 'true' parameter shows this as a pop-up alert
        );
    }
  console.log(num)

    // Move the number from the available list to the selected list
    ctx.session.selectedNumbers.push(num);
    ctx.session.availableNumbers = ctx.session.availableNumbers.filter(
        (n) => n !== num
    );

    // Rebuild and edit the message with the updated grid
    const updatedGrid = buildGrid(
        ctx.session.availableNumbers,
        ctx.session.selectedNumbers,
        ctx.session.quantityLimit,
        ctx.session.assignmentMethod
    );
    await ctx.editMessageReplyMarkup(updatedGrid.reply_markup);
});

// This handler removes a number from the user's selection.
bot.action(/^remove_number:(\d+)$/, async (ctx) => {
    ctx.answerCbQuery();
  const num = parseInt(ctx.match[1]);
  console.log(num)

    // Move the number from the selected list back to the available list
    ctx.session.selectedNumbers = ctx.session.selectedNumbers.filter(
        (n) => n !== num
    );
    ctx.session.availableNumbers.push(num);

    // Sort the available numbers for a consistent, non-random display
    ctx.session.availableNumbers.sort((a, b) => a - b);

    // Rebuild and edit the message with the updated grid
    const updatedGrid = buildGrid(
        ctx.session.availableNumbers,
        ctx.session.selectedNumbers,
        ctx.session.quantityLimit,
        ctx.session.assignmentMethod
    );
    await ctx.editMessageReplyMarkup(updatedGrid.reply_markup);
});
  
  
bot.on('message', async (ctx) => {
  if (ctx.session.nextAction === 'process_numbers' && ctx.message.text) {
    const requestedNumbers = ctx.message.text.split(',').map(n => parseInt(n.trim(), 10));
    const quantity = ctx.session.quantity;
    const poolName = ctx.session.poolName;

    if (requestedNumbers.length !== quantity) {
      ctx.reply(`Error: You requested ${quantity} entries, but you entered ${requestedNumbers.length} numbers. Please enter exactly ${quantity} numbers.`);
      return;
    }

    const pool = await RafflePool.findOne({ where: { name: poolName } });
    if (!pool) {
      return ctx.reply('Something went wrong. Please try again from the start.');
    }

    const maxEntries = pool.max_entries;
    const invalidRange = requestedNumbers.some(n => isNaN(n) || n <= 0 || n > maxEntries);

    if (invalidRange) {
      ctx.reply(`Error: All numbers must be between 1 and ${maxEntries}. Please enter valid numbers.`);
      return;
    }

    const existingEntries = await Entry.findAll({
      where: {
        entry_number: requestedNumbers,
        pool_id: pool.id
      }
    });

    const takenNumbers = existingEntries.map(e => e.entry_number);
    const availableNumbers = requestedNumbers.filter(n => !takenNumbers.includes(n));

    if (takenNumbers.length > 0) {
      ctx.reply(`❌ Sorry, some of your numbers are already taken.\n\n` +
        `**Numbers Taken:** ${takenNumbers.join(', ')}\n` +
        `**Numbers Available:** ${availableNumbers.join(', ')}\n\n` +
        `Would you like to select new numbers for the ones that are taken, or assign all ${quantity} entries automatically?`, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: 'Choose New Numbers', callback_data: 'assign_method:choose' }],
              [{ text: 'Assign All Automatically', callback_data: 'assign_method:random' }]
            ]
          }
        });
    } else {
      ctx.session.chosenNumbers = requestedNumbers;
      ctx.reply('All numbers are available. Proceeding to payment...');
      // You will need to trigger the payment flow here
      // paymentHandler(ctx); // This is a conceptual call
    }
  }
});

bot.action("random_refresh", async (ctx) => {
  ctx.answerCbQuery();
  
  const newRandomNumbers = await generateRandomNumbers(ctx.session.poolId, ctx.session.quantityLimit);
  ctx.session.selectedNumbers = newRandomNumbers;

  // Edit the existing message with the new numbers
  const { text, reply_markup } = buildRandomGrid(newRandomNumbers);
  
  try {
    await ctx.editMessageText(text, { reply_markup });
    // Message ID stays the same when editing, so no need to update the stored ID
  } catch (error) {
    console.error('Error refreshing random grid:', error);
    
    // If editing fails (message might be deleted), create a new one
    const newRandomGridMessage = await ctx.reply(text, { reply_markup });
    ctx.session.randomGridMessageId = newRandomGridMessage.message_id;
  }
});

// New handler for confirming the random selection
// New handler for confirming the random selection
bot.action("random_confirm", async (ctx) => {
  ctx.answerCbQuery();

  const finalNumbers = ctx.session.selectedNumbers;
  if (!finalNumbers || finalNumbers.length !== ctx.session.quantityLimit) {
    return ctx.reply("⚠️ An error occurred with your selection. Please start again.");
  }

  // ⏳ Send loading message
  const loadingMsg = await ctx.reply("⏳ Finalizing your random entries, please wait...");

  try {
    // Get pool details for the summary
    const pool = await RafflePool.findByPk(ctx.session.poolId);

    // Use finalizeEntries function
    const result = await finalizeEntries(
      ctx.session.userId,
      ctx.session.poolId,
      finalNumbers
    );

    // Remove loading message
    await ctx.deleteMessage(loadingMsg.message_id);

    if (result.success) {
        await cleanupSelectionMessages(ctx);
      // Create comprehensive summary message (WON'T be deleted)
      const summaryMessage = `
🎯 **ENTRY CONFIRMATION SUMMARY**

🏷️ **Pool:** ${pool.name}
💰 **Price per entry:** ₦${pool.price_per_entry}
📊 **Entries purchased:** ${ctx.session.quantityLimit}
🎲 **Selection method:** Random Assignment
🔢 **Your numbers:** ${finalNumbers.sort((a, b) => a - b).join(', ')}

⏰ **Entry time:** ${new Date().toLocaleString()}
✅ **Status:** Confirmed and paid

💡 *Remember: Draw happens every Saturday at 3:00 PM*
      `;

      // Send the permanent summary message
      await ctx.reply(summaryMessage, { parse_mode: 'Markdown' });

      // Convert the original message to read-only view with Start Over button
      const readOnlyGrid = buildRandomGrid(finalNumbers, true);
      const startOverButton = Markup.inlineKeyboard([
        [Markup.button.callback("🔄 Start Over", "start_over")]
      ]);
      
      // Combine the read-only grid with start over button
      readOnlyGrid.reply_markup.inline_keyboard.push(
        ...startOverButton.reply_markup.inline_keyboard
      );

      await ctx.editMessageText(
        `✅ Finalized! Your random numbers: ${finalNumbers.join(", ")}`,
        { reply_markup: readOnlyGrid.reply_markup }
      );

    } else {
      await ctx.reply(`❌ ${result.message}`);
    }

    // Store finalized numbers for reference
    ctx.session.finalizedEntries = ctx.session.finalizedEntries || [];
    ctx.session.finalizedEntries.push({
      numbers: [...finalNumbers],
      poolId: ctx.session.poolId,
      poolName: pool.name,
      method: 'Random Assignment',
      quantity: ctx.session.quantityLimit,
      timestamp: new Date()
    });

  } catch (err) {
    console.error("Error in random_confirm:", err);
    await ctx.deleteMessage(loadingMsg.message_id);
    await ctx.reply("❌ Something went wrong while finalizing your random entries. Please try again.");
  }

  // Clear the session for this flow
  clearSelectionSession(ctx.session);
});
bot.action(/^done:(choose|random)$/, async (ctx) => {
  ctx.answerCbQuery();
  const method = ctx.match[1];

  if (!ctx.session.selectedNumbers || ctx.session.selectedNumbers.length !== ctx.session.quantityLimit) {
    return ctx.reply(`⚠️ Please select exactly ${ctx.session.quantityLimit} numbers.`);
  }

  // ⏳ Send a loading message
  const loadingMsg = await ctx.reply("⏳ Finalizing your entries, please wait...");

  try {
    // Get pool details for the summary
    const pool = await RafflePool.findByPk(ctx.session.poolId);
    const methodName = method === 'choose' ? 'Manual Selection' : 'Random Assignment';

    // Finalize entries in DB
    const result = await finalizeEntries(
      ctx.session.userId,
      ctx.session.poolId,
      ctx.session.selectedNumbers
    );

    // Remove the loading message
    await ctx.deleteMessage(loadingMsg.message_id);

    if (result.success) {
        await cleanupSelectionMessages(ctx);
      // Create comprehensive summary message (WON'T be deleted)
      const summaryMessage = `
🎯 **ENTRY CONFIRMATION SUMMARY**

🏷️ **Pool:** ${pool.name}
💰 **Price per entry:** ₦${pool.price_per_entry}
📊 **Entries purchased:** ${ctx.session.quantityLimit}
🎲 **Selection method:** ${methodName}
🔢 **Your numbers:** ${ctx.session.selectedNumbers.sort((a, b) => a - b).join(', ')}

⏰ **Entry time:** ${new Date().toLocaleString()}
✅ **Status:** Confirmed and paid

💡 *Remember: Draw happens every Saturday at 3:00 PM*
      `;

      // Send the permanent summary message
      await ctx.reply(summaryMessage, { parse_mode: 'Markdown' });

      // Edit the original grid to show finalized state with Start Over button
      const finalizedGrid = buildGrid(
        ctx.session.availableNumbers,
        ctx.session.selectedNumbers,
        ctx.session.quantityLimit,
        method,
        true
      );
      
      // Add Start Over button at the bottom
      finalizedGrid.reply_markup.inline_keyboard.push([
        Markup.button.callback("🔄 Start Over", "start_over")
      ]);

      await ctx.editMessageReplyMarkup(finalizedGrid.reply_markup);

    } else {
      await ctx.reply(`❌ ${result.message}`);
    }

    // Store finalized numbers for reference
    ctx.session.finalizedEntries = ctx.session.finalizedEntries || [];
    ctx.session.finalizedEntries.push({
      numbers: [...ctx.session.selectedNumbers],
      poolId: ctx.session.poolId,
      poolName: pool.name,
      method: methodName,
      quantity: ctx.session.quantityLimit,
      timestamp: new Date()
    });

  } catch (err) {
    console.error("Finalize error:", err);
    await ctx.deleteMessage(loadingMsg.message_id);
    await ctx.reply("❌ Something went wrong while finalizing your entries. Please try again.");
  }

  // Clear the current selection session
  clearSelectionSession(ctx.session);
  
});
  
bot.action('view_entry', async (ctx) => {
  ctx.answerCbQuery();
  
  if (!ctx.session.finalizedEntries || ctx.session.finalizedEntries.length === 0) {
    return ctx.reply('No finalized entries in this session.');
  }

  let message = '📋 Your Finalized Entries:\n\n';
  
  ctx.session.finalizedEntries.forEach((entry, index) => {
    message += `Session ${index + 1}:\n`;
    message += `Numbers: ${entry.numbers.join(', ')}\n`;
    message += `Time: ${entry.timestamp.toLocaleString()}\n`;
    message += '─'.repeat(20) + '\n';
  });

  ctx.reply(message);
});
  
// bot.action(/^done:(choose|random)$/, async (ctx) => {
//   ctx.answerCbQuery();
//   const method = ctx.match[1];

//   if (
//     !ctx.session.selectedNumbers ||
//     ctx.session.selectedNumbers.length !== ctx.session.quantityLimit
//   ) {
//     return ctx.reply(`⚠️ Please select exactly ${ctx.session.quantityLimit} numbers.`);
//   }

//   // ⏳ Send a loading message
//   const loadingMsg = await ctx.reply("⏳ Finalizing your entries, please wait...");

//   try {
//     // Finalize entries in DB
//     const result = await finalizeEntries(
//       ctx.session.userId,
//       ctx.session.poolId,
//       ctx.session.selectedNumbers
//     );

//     // Remove the loading message
//     await ctx.deleteMessage(loadingMsg.message_id);

//     if (result.success) {
//       await ctx.reply(`🎉 ${result.message}`);
//     } else {
//       await ctx.reply(`❌ ${result.message}`);
//     }

//     // 🔒 Rebuild grid but without Refresh/Done buttons
//     const finalizedGrid = buildGrid(
//       ctx.session.availableNumbers,
//       ctx.session.selectedNumbers,
//       ctx.session.quantityLimit,
//       method
//     );

//     // Remove action buttons
//     finalizedGrid.reply_markup.inline_keyboard.pop();

//     await ctx.editMessageReplyMarkup(finalizedGrid.reply_markup);

//     if (ctx.session.selectionMessageId) {
//       await ctx.telegram.editMessageReplyMarkup(
//         ctx.chat.id,
//         ctx.session.selectionMessageId,
//         null,
//         finalizedGrid.reply_markup
//       );
//     }
//   } catch (err) {
//     console.error("Finalize error:", err);
//     await ctx.deleteMessage(loadingMsg.message_id);
//     await ctx.reply("❌ Something went wrong while finalizing your entries. Please try again.");
//   }

//   // Clean up session for this flow
//   ctx.session.assignmentMethod = null;
// });

bot.action(/^refresh:(choose|random)$/, async (ctx) => {
  ctx.answerCbQuery();
  const method = ctx.match[1];

  // Fetch updated available numbers
  const available = await getAvailableNumbers(
    ctx.session.poolId,
    ctx.session.selectedNumbers
  );
  ctx.session.availableNumbers = available;

  // Rebuild the grid with current selections & method
  const updatedGrid = buildGrid(
    ctx.session.availableNumbers,
    ctx.session.selectedNumbers,
    ctx.session.quantityLimit,
    method
  );

  // Edit the message and update the stored grid message ID
  try {
    await ctx.editMessageReplyMarkup(updatedGrid.reply_markup);
    // The message ID remains the same when editing, so no need to update
  } catch (error) {
    console.log('Error refreshing grid:', error.message);
  }
});
bot.action('no_action', (ctx) => {
  ctx.answerCbQuery('This entry has been finalized', true);
});
};




