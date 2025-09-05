// cron/createWeek.js
const cron = require("node-cron");
const moment = require("moment-timezone");
const axios = require("axios");
const { Entry, Winning, Week} = require("../models");

// 🔑 Crypto APIs key
const API_KEY = process.env.CRYPTO_API_KEY;

// cron.schedule("0 12 * * 0", async () => {
cron.schedule("*/30 * * * * *", async () => { // Run every Sunday at midnight
    console.log("⏳ Checking/creating week and winning entry...");
    try {
        const now = moment().tz("Australia/Perth"); // WST (GMT+8)
        const year = now.year();
        const weekNumber = now.isoWeek();

        const code = `${year}-W${weekNumber}`;
        const fullCode = `POOL-${code}`;
        const weekName = `Week ${weekNumber}, ${year}`;
        const startsAt = now.startOf("isoWeek").toDate();
        const endsAt = now.endOf("isoWeek").toDate();

        // Create or find week
        const [week, weekCreated] = await Week.findOrCreate({
            where: { code },
            defaults: {
                code,
                year,
                week_number: weekNumber,
                week_name: weekName,
                week_id: `${year}${weekNumber}`,
                starts_at: startsAt,
                ends_at: endsAt,
                createdAt: new Date(),
                updatedAt: new Date(),
            },
        });

        if (weekCreated) {
            console.log(`✅ Created new week: ${weekName}`);
            
            // Create winning entry for this week
            const winningEntry = await Winning.findOrCreate({
            where: { week_code:code },
              defaults: {
                code,
                week_id: week.week_id,
                winning_number: null, // To be set later
                winning_amount: 1000000.00, // Default amount
                is_claimed: false,
                createdAt: new Date(),
                updatedAt: new Date()
              },
            });
            
            console.log(`✅ Created winning entry for week: ${weekName}`);
        } else {
            console.log(`ℹ️ Week already exists: ${weekName}`);
        }
    } catch (error) {
        console.error("❌ Error creating week/winning entry:", error);
    }
});



// Schedule job: every Saturday at 1:00 PM WST
// cron.schedule("0 13 * * 6", async () => {

