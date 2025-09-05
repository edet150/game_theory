// models/Week.js
"use strict";
const { Model } = require("sequelize");

module.exports = (sequelize, DataTypes) => {
  class Week extends Model {
    static associate(models) {
      Week.hasMany(models.Entry, { foreignKey: "week_id" });
    }
  }

  Week.init(
    {
      code: {
        type: DataTypes.STRING,
        unique: true,
        allowNull: false,
        },

      year: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      week_number: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      week_name: {
        type: DataTypes.STRING,
        allowNull: false,
          },
      starts_at: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      ends_at: {
        type: DataTypes.DATE,
        allowNull: false,
      },
    },
    {
      sequelize,
      modelName: "Week",
      tableName: "weeks",
    }
  );

  return Week;
};
