// src/queue/transactionQueue.js
const { Queue } = require('bullmq');
require('dotenv').config();
const Redis = require('ioredis');

const redisConnection = new Redis(process.env.REDIS_PUBLIC_URL, {
  maxRetriesPerRequest: null
});

const transactionQueue = new Queue('paystack_transactions', {
  connection: redisConnection,
});

module.exports = transactionQueue;