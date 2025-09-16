'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class User extends Model {
    static associate(models) {
      User.hasMany(models.Entry, { foreignKey: 'user_id' });

      // self-referencing association for referrals
      User.belongsTo(models.User, { 
        as: 'Referrer', 
        foreignKey: 'referred_by' 
      });
      User.hasMany(models.User, { 
        as: 'Referrals', 
        foreignKey: 'referred_by' 
      });
    }
  }

User.init({
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  telegram_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
    unique: true
  },
  telegram_username: {
    type: DataTypes.STRING,
    allowNull: true
  },
  referral_code: {
    type: DataTypes.STRING,
    unique: true,
    allowNull: false,
    defaultValue: () => Math.random().toString(36).substring(2, 10).toUpperCase()
  },
  referred_by: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  bonus_entries: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    allowNull: false
  },
  total_referrals: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    allowNull: false
  },
  active_referrals: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    allowNull: false
  },
  // 🔽 New fields for Paystack Bank Verification
  bank_account_number: {
    type: DataTypes.STRING,
    allowNull: true
  },
  bank_name: {
    type: DataTypes.STRING,
    allowNull: true
  },
  bank_code: {
    type: DataTypes.STRING,
    allowNull: true
  },
  account_holder_name: {
    type: DataTypes.STRING,
    allowNull: true
  },
  bank_verified: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    allowNull: false
  }

}, {
  sequelize,
  modelName: 'User',
  tableName: 'users',
  timestamps: true
});

  return User;
};
