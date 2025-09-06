require('dotenv').config();
const db = require('./models');

// Handlers
const startHandler = require('./handlers/start');
const poolHandler = require('./handlers/pool');
const numbersHandler = require('./handlers/numbers');
const paymentFunctions = require('./handlers/payment');
const myEntriesHandler = require('./handlers/my_entries');
const cleanupMiddleware = require('./middleware/cleanupMiddleware');
const historyHandler = require('./handlers/history');
const adminHandler = require('./handlers/admin');
const welcomeUser = require('./handlers/welcomeUser');
const referralHandler = require('./handlers/referral');
const callbackHandler = require('./handlers/callback');
require('./cron/paystack_checker');
require('./cron/sundayCron'); 
const { getBotInstance, getRedisClient } = require('./bot/botinstance');
const { getLast4Digits, showStartScreen } = require('./startFunction');

const bot = getBotInstance();
const redis = getRedisClient();
//WINNING
let lst = getLast4Digits('000000000000000000014d7c1dee8492516a87cf61c277f824364932b48ce3f3')
console.log(lst)
// Handle commands first - this should be registered BEFORE your message handler
bot.on('text', async (ctx, next) => {
  // Check if the message starts with a command
  if (ctx.message.text.startsWith('/')) {
    // Let Telegraf handle commands normally
    return next();
  }
  
  // If it's not a command, continue to your custom message handlers
  return next();
});
// Register handlers
startHandler(bot);
adminHandler(bot);
welcomeUser(bot);
callbackHandler(bot);

referralHandler(bot);
poolHandler(bot);
numbersHandler(bot);
myEntriesHandler(bot);
historyHandler(bot);


bot.use(cleanupMiddleware);




bot.action('initiate_payment', async (ctx) => {
  ctx.answerCbQuery();
  const method = ctx.match[1];
  ctx.session.assignmentMethod = method;
  await paymentFunctions.initiatePayment(ctx);
});

bot.catch((err, ctx) => {
    console.error(`Encountered a Telegram Error for ${ctx.from.id}:`, err);
    console.log(err);

    if (err.response && err.response.error_code === 400 && err.response.description.includes('query is too old')) {
        console.log('Detected an old query error. Prompting user to restart.');

        // Clear the user's session state
        ctx.session = null;

        // Inform the user with a button to restart
        ctx.reply(
            `⚠️ It looks like our conversation timed out. Please start again.`,
            {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "🔄 Start Over", callback_data: "start_over" }]
                    ]
                }
            }
        ).catch(e => console.error('Failed to send restart message:', e));
    } else {
        // Use the start_over action instead of direct function call
        // This ensures proper session cleanup
        try {
            // Clear session to prevent state conflicts
            ctx.session = {};
            
            ctx.reply(
                '❌ An unexpected error occurred. Starting over...',
                {
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: "🔄 Start Over", callback_data: "start_over" }]
                        ]
                    }
                }
            );
        } catch (error) {
            // Fallback if even this fails
            console.error('Error in error handler:', error);
            ctx.reply('❌ An error occurred. Please use /start to begin again.');
        }
    }
});

// Handlers
bot.start();
// Graceful shutdown
process.once('SIGINT', () => {
  redis.quit();
  bot.stop('SIGINT');
});
process.once('SIGTERM', () => {
  redis.quit();
  bot.stop('SIGTERM');
});

// Launch bot
(async () => {
  try {
    await db.sequelize.sync();
    console.log("✅ Database synchronized");

    await redis.ping();
    console.log("✅ Redis connected");

    await bot.launch();
    console.log("🚀 Bot is running...");
  } catch (err) {
    console.error("❌ Error starting bot:", err);
    process.exit(1);
  }
})();
