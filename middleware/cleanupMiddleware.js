// middleware/cleanupMiddleware.js
const messageManager = require('../utils/messageManager');

module.exports = async (ctx, next) => {
    try {
        // Store original reply method
        const originalReply = ctx.reply;
        
        // Override reply to automatically track messages
        ctx.reply = function(text, options) {
            return originalReply.call(this, text, options).then(message => {
                messageManager.trackMessage(message.message_id);
                return message;
            });
        };
        
        await next();
        
    } catch (error) {
        console.error('Error in cleanup middleware:', error);
        await next();
    }
};