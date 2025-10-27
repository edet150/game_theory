// cron/createWeek.js
const cron = require("node-cron");
const moment = require("moment-timezone");
const axios = require("axios");
const { Entry, Winning, Week} = require("../models");

// 🔑 Crypto APIs key
const API_KEY = process.env.CRYPTO_API_KEY;
console.log(API_KEY)

// cron.schedule("0 0 0 * * 0", async () => { // Run every Sunday at midnight
cron.schedule("*/60 * * * * *", async () => {
    console.log("⏳ Checking/creating week and winning entry...");
    try {
        // Use Lagos time (Africa/Lagos) - WAT (GMT+1)
        const now = moment().tz("Africa/Lagos");
        const year = now.year();
        const weekNumber = now.isoWeek();

        const code = `${year}-W${weekNumber}`;
        const fullCode = `POOL-${code}`;
        const weekName = `Week ${weekNumber}, ${year}`;
        const startsAt = now.startOf("isoWeek").toDate();
        // const endsAt = now.endOf("isoWeek").toDate();
        const endsAt = now.add(1, 'weeks').endOf('isoWeek').toDate();
        console.log('startsAt', startsAt)
        console.log('endsAt', endsAt)
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
                where: { week_code: code },
                defaults: {
                    week_code: code,
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



// Schedule job: every sunday at 1:00 PM WST
// cron.schedule("0 13 * * 6", async () => {

