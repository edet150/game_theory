// models/giveaway.js

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const GiveawayEntry = sequelize.define('GiveawayEntry', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    telegram_id: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
    username: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    first_name: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    last_name: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    account_number: {
      type: DataTypes.STRING(20), // 10 digits, but leave room for formatting
      allowNull: false,
    },
    bank_name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    account_holder_name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    entry_number: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    announced: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  }, {
    tableName: 'giveaway_entries',
    underscored: true, // keep column names snake_case
    timestamps: true,  // auto-manage created_at & updated_at
    indexes: [
      {
        fields: ['entry_number'],
      },
      {
        fields: ['is_active'],
      },
      {
        fields: ['created_at'],
      },
    ],
  });

  return GiveawayEntry;
};
