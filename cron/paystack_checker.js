// src/cron/paystack_checker.js
const cron = require('node-cron');
const { getBotInstance } = require('../bot/botInstance');
require('dotenv').config();
const axios = require('axios');
const Redis = require('ioredis');
const transactionQueue = require('../queue/transactionQueue');
const { handleSuccessfulPayment } = require('../handlers/payment');
console.log(process.env.REDIS_PUBLIC_URL)

// Configure Redis connection for this file
const redisClient = new Redis(process.env.REDIS_PUBLIC_URL || 'redis://127.0.0.1:6379', {
    maxRetriesPerRequest: null
});
async function clearRedis(all = false) {
  try {
    if (all) {
      await redisClient.flushall();
      console.log("✅ All Redis databases cleared!");
    } else {
      await redisClient.flushdb();
      console.log("✅ Current Redis database cleared!");
    }
  } catch (error) {
    console.error("❌ Error clearing Redis:", error);
  }
}
// Example usage:
// clearRedis();      // Clears only current DB
// clearRedis(true); 

const PAYSTACK_TRANSACTION_KEY = 'processed_paystack_transactions';
let lastCheckTimestamp = Date.now(); // Initialize the timestamp
const bot = getBotInstance();
async function checkPaystackTransactions() {
    console.log(`[Cron] Checking for new Paystack transactions...`);
    
    const now = Date.now();
    const oneMinuteAgo = now - 3600000; // Changed from 3600000 (1 hour) to 60000 (1 minute)

    try {
        // Get bot instance
        
        
        // Correctly format the dates to ISO 8601 format
        const fromDateISO = new Date(oneMinuteAgo).toISOString();
        const toDateISO = new Date(now).toISOString();

        const response = await axios.get('https://api.paystack.co/transaction', {
            headers: {
                Authorization: `Bearer ${process.env.PAYSTACK_SEC_TEST}`,
            },
            params: {
                from: fromDateISO,
                to: toDateISO,
                status: 'success',
            },
        });

        const transactions = response.data.data;
        console.log(`[Cron] Found ${transactions.length} transactions in the last minute.`);

        for (const transaction of transactions) {
            const isProcessed = await redisClient.sismember(PAYSTACK_TRANSACTION_KEY, transaction.id);
            
            if (!isProcessed) {
                console.log(`[Cron] Processing new transaction: ${transaction.id}`);
                
                // Process the successful payment
                await handleSuccessfulPayment(bot, transaction);
                
                // Mark as processed in Redis
                await redisClient.sadd(PAYSTACK_TRANSACTION_KEY, transaction.id);
            } else {
                console.log(`[Cron] Transaction ${transaction.id} already processed, skipping.`);
            }
        }
    } catch (error) {
        console.error('[Cron] Error fetching transactions from Paystack:', error.response?.data || error.message);
    }
}
// Schedule the function to run every 5 seconds
// cron.schedule('*/10 * * * * *', checkPaystackTransactions);
module.exports = {
    checkPaystackTransactions
};