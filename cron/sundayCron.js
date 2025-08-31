// cron/createWeek.js
const cron = require("node-cron");
const moment = require("moment-timezone");
const axios = require("axios");
const { Entry, User, Week} = require("../models");

// 🔑 Crypto APIs key
const API_KEY = process.env.CRYPTO_API_KEY;
cron.schedule("0 12 * * 0", async () => {
  console.log("⏳ Checking/creating week...");
  try {
    const now = moment().tz("Australia/Perth"); // WST (GMT+8)
    const year = now.year();
    const weekNumber = now.isoWeek();

    const code = `${year}-W${weekNumber}`;
    const fullCode = `POOL-${code}`;
    const weekName = `Week ${weekNumber}, ${year}`;
    const startsAt = now.startOf("isoWeek").toDate();
    const endsAt = now.endOf("isoWeek").toDate();

    const [week, created] = await Week.findOrCreate({
      where: { code }, // 👈 unique constraint check
      defaults: {
        code,
        // full_code: fullCode,
        year,
        week_number: weekNumber,
        week_name: weekName,
        week_id: `${year}${weekNumber}`, // keep your schema
        starts_at: startsAt,
        ends_at: endsAt,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    if (created) {
      console.log(`✅ Created new week: ${weekName}`);
    } else {
      console.log(`ℹ️ Week already exists: ${weekName}`);
    }
  } catch (error) {
    console.error("❌ Error creating week:", error);
  }
});



// Schedule job: every Saturday at 1:00 PM WST
// cron.schedule("0 13 * * 6", async () => {

