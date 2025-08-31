// db.js
require('dotenv').config();
const { Sequelize } = require('sequelize');

const sequelize = new Sequelize(
  process.env.DB_NAME,      // Database name
  process.env.DB_USER,      // Database username
  process.env.DB_PASS,      // Database password
  {
    host: process.env.DB_HOST || 'localhost',
    dialect: process.env.DB_DIALECT || 'mysql', // mysql | mariadb | sqlite | mssql
    logging: false,
  }
);

(async () => {
  try {
    await sequelize.authenticate();
    console.log('✅ Database connected');
  } catch (error) {
    console.error('❌ Database connection failed:', error);
  }
})();

module.exports = sequelize;
