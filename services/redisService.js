// services/redisService.js
const { getRedisClient } = require('../bot/botinstance');

class RedisService {
    constructor() {
        this.redis = getRedisClient();
    }

    // Store finalized entries for a user
    async addFinalizedEntry(telegramId, entryData) {
        const key = `user:${telegramId}:entries`;
        const entry = {
            ...entryData,
            id: Date.now(), // Unique ID for each entry
            timestamp: new Date().toISOString()
        };
        
        await this.redis.rpush(key, JSON.stringify(entry));
        // Set expiration (e.g., 30 days)
        await this.redis.expire(key, 30 * 24 * 60 * 60);
    }

    // Get all finalized entries for a user
    async getFinalizedEntries(telegramId) {
        const key = `user:${telegramId}:entries`;
        const entries = await this.redis.lrange(key, 0, -1);
        return entries.map(entry => JSON.parse(entry));
    }

    // Clear all entries for a user
    async clearFinalizedEntries(telegramId) {
        const key = `user:${telegramId}:entries`;
        await this.redis.del(key);
    }

    // Get specific entry
    async getEntry(telegramId, entryId) {
        const entries = await this.getFinalizedEntries(telegramId);
        return entries.find(entry => entry.id === entryId);
    }
}

module.exports = new RedisService();