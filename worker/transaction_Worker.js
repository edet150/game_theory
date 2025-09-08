// src/worker/transactionWorker.js
const { Worker } = require('bullmq');
require('dotenv').config();
const { RafflePool, Entry, User,Payment } = require('../models');
const db= require('../models');
const Redis = require('ioredis');

// We now pass the bot instance to this worker
let botInstance;
let sequelizeInstance = db.sequelize

const redisConnection = new Redis(process.env.REDIS_PUBLIC_URL || 'redis://127.0.0.1:6379', {
    maxRetriesPerRequest: null
});

const transactionWorker = new Worker('paystack_transactions', async (job) => {
    const { transaction } = job.data;
    const { id, status, metadata } = transaction;

    if (status === 'success' && metadata) {
        console.log(`Processing transaction ID: ${id}`);
        
        try {
            if (!botInstance) {
                console.error('Bot instance is not set for the worker.');
                return;
            }
            await handleSuccessfulPayment(botInstance, transaction);
            console.log(`Successfully processed transaction ${id} for user ${metadata.telegram_id}.`);
        } catch (error) {
            console.error(`Error processing transaction ${id}:`, error);
            throw error; // Throwing the error will trigger BullMQ's retry mechanism
        }
    }
}, { connection: redisConnection });
console.log('calling')
// This function will be called from your index.js file to set the bot instance.
function setbotInstance(bot) {
    console.log('instance set')
    botInstance = bot;
    console.log(botInstance)
}
// Add a function to set the sequelize instance

  async function createEntries(bot, userId, poolId, quantity, method, chosenNumbers) {
    const pool = await RafflePool.findByPk(poolId);
    if (!pool) return;

    const entries = [];
    let assignedNumbers = [];

    try {
      if (method === 'choose' && chosenNumbers) {
        assignedNumbers = chosenNumbers;
      } else {
        // Sequential or random assignment
        const latestEntry = await Entry.findOne({
          where: { pool_id: poolId },
          order: [['entry_number', 'DESC']],
          attributes: ['entry_number']
        });
        let startNumber = (latestEntry ? latestEntry.entry_number : 0) + 1;
        for (let i = 0; i < quantity; i++) {
          assignedNumbers.push(startNumber + i);
        }
        if (method === 'random') {
          assignedNumbers.sort(() => Math.random() - 0.5);
        }
      }

      for (const number of assignedNumbers) {
        entries.push({
          user_id: userId,
          pool_id: poolId,
          entry_number: number,
          status: 'paid'
        });
      }

      await Entry.bulkCreate(entries);
      bot.telegram.sendMessage(userId, `✅ Payment Confirmed! Your entry numbers are: ${assignedNumbers.join(', ')}.`);

    } catch (error) {
      console.error('Error creating entries:', error);
      bot.telegram.sendMessage(userId, '❌ An error occurred while assigning your entries. Please contact support.');
    }
  }

async function handleSuccessfulPayment(bot, paystackTransaction) {
    // Use the sequelize instance passed to the worker
    if (!sequelizeInstance) {
        console.error('Sequelize instance is not set for the worker.');
        return;
    }
    
    const t = await sequelizeInstance.transaction(); // Start a database transaction

    try {
        const { id, reference, amount, metadata, status } = paystackTransaction;

        // --- THE CHANGE IS HERE ---
        // 1. Get the user and pool details from the metadata FIRST
        const { telegram_id, pool: poolName, quantity, assignmentMethod, chosenNumbers } = metadata;
        const user = await User.findOne({ where: { telegram_id: telegram_id } });
        const pool = await RafflePool.findOne({ where: { name: poolName } });

        if (!user || !pool) {
            // If the user or pool is not found, we can't continue.
            throw new Error('User or Pool not found for payment. Rolling back.');
        }

        // 2. Now, check if this payment has already been processed using the correct user_id
        const [paymentRecord, created] = await Payment.findOrCreate({
            where: { paystack_transaction_id: id },
            defaults: {
                user_id: user.id, // Set the correct user ID from the beginning
                pool_id: pool.id, // Set the correct pool ID from the beginning
                paystack_reference: reference,
                amount: amount / 100, // Convert back from kobo
                status: status
            },
            transaction: t
        });

        if (!created) {
            // This payment has already been processed. Log it and exit.
            console.log(`Payment with transaction ID ${id} already processed. Skipping.`);
            await t.commit(); // Commit the check
            return;
        }

        // Now create the entries using your existing function
        await createEntries(bot, user.id, pool.id, quantity, assignmentMethod, chosenNumbers);

        await t.commit(); // All operations succeeded, commit the transaction
        console.log(`Successfully processed transaction ${id} and created entries.`);

    } catch (error) {
        await t.rollback(); // Something went wrong, revert all changes
        console.error('Error handling successful payment:', error);
        const telegramId = paystackTransaction.metadata?.telegram_id;
        if (telegramId) {
            bot.telegram.sendMessage(telegramId, '❌ An error occurred while processing your payment. Please contact support.');
        }
    }
}
module.exports = { transactionWorker, setbotInstance };