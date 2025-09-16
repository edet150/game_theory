const { RafflePool, Entry } = require('../models');
const messageManager = require('../utils/messageManager');
const { sendError, sendSuccess } = require('../utils/responseUtils');
const { getbotInstance, getRedisClient } = require('../bot/botInstance');
const redis = getRedisClient();
const CLEANUP_CATEGORIES = {
    GRID: ['selectionMessageId', 'gridMessageId', 'randomGridMessageId'],
    QUANTITY: ['quantitySelectionMessageId', 'assignmentMessageId', 'customQuantityMessageId'],
    ALL: ['quantitySelectionMessageId', 'assignmentMessageId', 'customQuantityMessageId', 
          'selectionMessageId', 'gridMessageId', 'randomGridMessageId']
};
async function cleanupSessionMessages(ctx, messageKeys) {
  for (const messageKey of messageKeys) {
    if (ctx.session && ctx.session[messageKey]) {
      console.log(`Trying to delete ${messageKey}: ${ctx.session[messageKey]}`);
      try {
        await ctx.telegram.deleteMessage(ctx.chat.id, ctx.session[messageKey]);
        console.log(`✅ Deleted ${messageKey}`);
      } catch (deleteError) {
        console.log(`❌ Could not delete ${messageKey}:`, deleteError.message);
      }
      delete ctx.session[messageKey];
    } else {
      console.log(`⚠️ No session value for ${messageKey}`);
    }
  }
}
module.exports = (bot) => {
bot.action(/^select_pool:(\w+)/, async (ctx) => {
  const isLocked = await redis.get('entries_locked');
  if (isLocked) {
    await ctx.answerCbQuery();
    return await ctx.reply('🔒 Entries are currently locked. Please try again later.');
  }

  await ctx.answerCbQuery();
  const poolName = ctx.match[1];

  // Store pool choice in session
  ctx.session.poolName = poolName;

  if (!poolName) {
    console.error('Arena name is undefined');
    return ctx.reply('Invalid Arena selection. Please try again.');
  }

  try {
    // Special rules for Beta Arena

    if (poolName === "Beta") {
      const betaMessage = await ctx.reply(
        "🔒 *Beta Arena is currently locked!*\n\n" +
        "It is only available to users who have referred new players and on certain days that will be announced on our channel. 📢",
        {
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [
              [{ text: "🎯 Referral Dashboard", callback_data: "referral_dashboard" }],
              [{ text: "📢 Join Updates Channel", url: `https://t.me/${process.env.CHANNEL_NAME}` }],
              [{ text: "🔄 Start Over", callback_data: "start_over" }]
            ]
          }
        }
      );

      // Store messageId so we can delete later
      ctx.session.betaMessageId = betaMessage.message_id;
      return;
    }

    // Special rules for HighRollers Arena
    // Special rules for HighRollers Arena
  if (poolName === "HighRollers") {
    const highRollersMessage = await ctx.reply(
      "🔒 *HighRollers Arena Access Restricted!*\n\n" +
      "This pool is only available to users who have referred new players. 🎯\n\n" +
      "Invite friends to unlock access in your referral dashboard.",
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [{ text: "🎯 Referral Dashboard", callback_data: "referral_dashboard" }],
            [{ text: "🔄 Start Over", callback_data: "start_over" }]
          ]
        }
      }
    );
        // Store messageId so we can delete later
    ctx.session.highRollersMessageId = highRollersMessage.message_id;
    return;
  }

    // Default flow for Alpha Arena (or others)
    const pool = await RafflePool.findOne({ where: { name: poolName } });
    if (!pool) {
      ctx.reply('Arena not found. Please try again.');
      return;
        }
        
        // 🧹 Cleanup any old Beta/HighRollers lock messages
    if (ctx.session.betaMessageId) {
      try { await ctx.deleteMessage(ctx.session.betaMessageId); } catch (e) {}
      ctx.session.betaMessageId = null;
    }
    if (ctx.session.highRollersMessageId) {
      try { await ctx.deleteMessage(ctx.session.highRollersMessageId); } catch (e) {}
      ctx.session.highRollersMessageId = null;
    }

    // Count number of paid entries
    const currentEntriesCount = await Entry.count({
      where: { pool_id: pool.id, status: 'paid' }
    });

    const options = {
      reply_markup: {
        inline_keyboard: [
          [{ text: '1 Entry', callback_data: `set_quantity:1` }],
          [{ text: '5 Entries', callback_data: `set_quantity:5` }],
          [{ text: '10 Entries', callback_data: `set_quantity:10` }]
        ]
      }
    };

    // Send quantity selection message and store its ID
    const quantityMessage = await ctx.reply(
      `You've selected the ${pool.name} Arena!\n\n` +
      `💰 *Price:* ₦${pool.price_per_entry} per entry\n` +
      `📊 *Max Entries:* ${pool.max_entries}\n` +
      `🎲 *Current Entries:* ${currentEntriesCount}/${pool.max_entries}\n\n` +
      `How many entries would you like to buy?`,
      { parse_mode: 'Markdown', reply_markup: options.reply_markup }
    );

    // ⬅️ FIRST DELETE PREVIOUS QUANTITY MESSAGE IF EXISTS
    if (ctx.session.quantityMessageId) {
      try {
        await ctx.deleteMessage(ctx.session.quantityMessageId);
      } catch (e) {
        console.log("Previous quantity message already gone:", e.message);
      }
    }

    // Send quantity selection prompt
    ctx.session.quantityMessageId = quantityMessage.message_id;

    // ⬅️ FIRST DELETE PREVIOUS CUSTOM PROMPT MESSAGE IF EXISTS
    if (ctx.session.customPromptMessageId) {
      try {
        await ctx.deleteMessage(ctx.session.customPromptMessageId);
      } catch (e) {
        console.log("Previous custom prompt already gone:", e.message);
      }
    }

    // Send custom prompt and store its message ID
    const customPromptMessage = await ctx.reply("Or, type a custom number of entries.");
    ctx.session.customPromptMessageId = customPromptMessage.message_id;


    ctx.session.nextAction = 'prompt_quantity';

  } catch (error) {
    console.error('Error selecting pool:', error);
    ctx.reply('Could not retrieve Arena information. Please try again.');
  }
});

bot.action(/^set_quantity:(\d+)/, async (ctx) => {
    await ctx.answerCbQuery();
    const quantity = parseInt(ctx.match[1], 10);

    // Store quantity in session
    ctx.session.quantity = quantity;
    
    // Only clean up quantity-related messages, not pool-related ones
    await cleanupSessionMessages(ctx, [
            
        'gridMessageId',          // Add grid messages
        'randomGridMessageId' ,
        'assignmentMessageId'
        // Don't include customPromptMessageId here!
    ]);

    // Store the new quantity selection message ID
    ctx.session.quantitySelectionMessageId = ctx.callbackQuery.message.message_id;

    const assignmentMessage = await ctx.reply(
       `Great! You've chosen to buy *${quantity} entries*.\n\nHow would you like them assigned?`
,
      {
             parse_mode: 'Markdown', 
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🎲 Random Pick', callback_data: 'assign_method:random' }],
                    [{ text: 'I\'ll Choose My Numbers', callback_data: 'assign_method:choose' }]
                ]
            }
        }
    );
    
    // Store new assignment message ID
  ctx.session.assignmentMessageId = assignmentMessage.message_id;
  // Remove nextPrompt
  ctx.session.nextAction = ''
});
  
//   bot.on('message', async (ctx) => {
  
//     if (ctx.session.nextAction === 'prompt_quantity' && ctx.message.text) {
//         const quantity = parseInt(ctx.message.text, 10);
//         if (isNaN(quantity) || quantity <= 0 || quantity > 100) {
//             ctx.reply('❌ Please enter a valid number between 1 and 100.');
//             return;
//         }


//         ctx.session.quantity = quantity;
//         ctx.session.nextAction = null; // Clear the next action
        
//         // Store the custom quantity message ID for deletion
//         ctx.session.customQuantityMessageId = ctx.message.message_id;
// const assignmentMessage = await ctx.reply(
//     `Great! You've chosen to buy *${quantity} entries*.\n\nHow would you like them assigned?`,
//     {
//         parse_mode: 'Markdown', // Add this line
//         reply_markup: {
//             inline_keyboard: [
//                 [{ text: '🎲 Random Pick', callback_data: 'assign_method:random' }],
//                 [{ text: 'I\'ll Choose My Numbers', callback_data: 'assign_method:choose' }]
//             ]
//         }
//     }
// );
//         // Store assignment message ID for deletion
//         ctx.session.assignmentMessageId = assignmentMessage.message_id;
//     } else {
//         // If there's a previous prompt, delete it
//   if (ctx.session?.startPromptMessageId) {
//     try {
//       await ctx.deleteMessage(ctx.session.startPromptMessageId);
//     } catch (e) {
//       console.log("Message already deleted or can't delete");
//     }
//   }

//   // Send new prompt
//   const startPromptMessage = await ctx.reply(
//   "Please use /start to enter the game:",
//   {
//     reply_markup: {
//       inline_keyboard: [
//         [{ text: "🚀 Enter Game", callback_data: "start_over" }],
//       ],
//     },
//   }
// );


//   // Save message ID in session
//   if (!ctx.session) ctx.session = {};
//   ctx.session.startPromptMessageId = startPromptMessage.message_id;
//     }
// });
};
