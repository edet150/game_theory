// models/index.js
const fs = require("fs");
const path = require("path");
const { Sequelize } = require("sequelize");
const sequelize = require("../db"); // centralized db connection

const db = {};
const basename = path.basename(__filename);

// Dynamically read all model files (except index.js)
fs.readdirSync(__dirname)
  .filter(
    (file) =>
      file.indexOf(".") !== 0 && file !== basename && file.slice(-3) === ".js"
  )
  .forEach((file) => {
    const model = require(path.join(__dirname, file))(sequelize, Sequelize.DataTypes);
    db[model.name] = model;
  });

// Setup associations if any (e.g., User.hasMany(Transaction))
Object.keys(db).forEach((modelName) => {
  if (db[modelName].associate) {
    db[modelName].associate(db);
  }
});

db.sequelize = sequelize;
db.Sequelize = Sequelize;

module.exports = db;
