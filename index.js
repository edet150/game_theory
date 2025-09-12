require('dotenv').config();
const db = require('./models');
const express = require("express");
const axios = require("axios");

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
const { getbotInstance, getRedisClient } = require('./bot/botInstance.js');
const { getLast4Digits, showStartScreen } = require('./startFunction');
const { checkPaystackTransactions } = require('./cron/paystack_checker');

const bot = getbotInstance();
const redis = getRedisClient();
//WINNING

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


bot.use((ctx, next) => {
  console.log('sippiose')
  console.log(ctx)
  console.log("Update type:", ctx.updateType, ctx.update);
  return next();
});

bot.action('initiate_payment', async (ctx) => {
  await ctx.answerCbQuery();
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

// ---- Express app ----
const app = express();
const PORT = process.env.PORT || 3000;

// Payment redirect route
app.get("/paymentredirect", (req, res) => {
  checkPaystackTransactions()
  return res.send(`
        <html>
      <head><title>Redirecting to Telegram...</title></head>
      <body style="font-family: Arial; text-align: center; padding: 50px;">
        <h2>✅ Payment Complete</h2>
        <p>Kindly close the browser session to return to your bot</p>

        <a href="https://t.me/${process.env.BOT_NAME}" 
           style="padding: 10px 20px; background: #0088cc; color: white; 
                  text-decoration: none; border-radius: 5px; display:inline-block; margin-top:20px;">
          🚀 Open Telegram Bot
        </a>

        <script>
          setTimeout(() => {
            window.location.href = "https://t.me/${process.env.BOT_NAME}";
          }, 4000);
        </script>
      </body>
    </html>
  `);
});



// Start express server
app.listen(PORT, () => {
  console.log(`🌍 Web server running at http://localhost:${PORT}`);
});


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
