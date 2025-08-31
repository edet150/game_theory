const { Queue } = require('bullmq');
const Redis = require('ioredis')
require('dotenv').config();
// Ensure you have a clean connection for this script
const redisConnection = new Redis(process.env.REDIS_PUBLIC_URL || 'redis://127.0.0.1:6379', {
  maxRetriesPerRequest: null
});

const transactionQueue = new Queue('paystack_transactions', {
  connection: redisConnection,
});

const PAYSTACK_TRANSACTION_KEY = 'processed_paystack_transactions';

async function resetAll() {
  console.log('--- Starting complete reset of the job queue ---');
  
  try {
    // Step 1: Obliterate the BullMQ queue (deletes all jobs)
    console.log('Obliterating the BullMQ queue...');
    await transactionQueue.obliterate({ force: true });
    console.log('Queue has been successfully obliterated.');

    // Step 2: Delete the Redis key that tracks processed transactions
    console.log(`Deleting Redis key: ${PAYSTACK_TRANSACTION_KEY}...`);
    const result = await redisConnection.del(PAYSTACK_TRANSACTION_KEY);
    if (result === 1) {
      console.log(`Key '${PAYSTACK_TRANSACTION_KEY}' was deleted successfully.`);
    } else {
      console.log(`Key '${PAYSTACK_TRANSACTION_KEY}' did not exist, nothing to delete.`);
    }

    console.log('--- Reset complete. The system is ready to go. ---');

  } catch (error) {
    console.error('An error occurred during the reset:', error);
  } finally {
    // Close connections
    await transactionQueue.close();
    await redisConnection.disconnect();
  }
}

// resetAll().catch(console.error);