// 'use strict';
// const { Model } = require('sequelize');

// module.exports = (sequelize, DataTypes) => {
//   class User extends Model {
//     static associate(models) {
//       User.hasMany(models.Entry, { foreignKey: 'user_id' });

//       // self-referencing association for referrals
//       User.belongsTo(models.User, { 
//         as: 'Referrer', 
//         foreignKey: 'referred_by' 
//       });
//       User.hasMany(models.User, { 
//         as: 'Referrals', 
//         foreignKey: 'referred_by' 
//       });
//     }
//   }

// User.init({
//   id: {
//     type: DataTypes.INTEGER,
//     primaryKey: true,
//     autoIncrement: true
//   },
//   telegram_id: {
//     type: DataTypes.BIGINT,
//     allowNull: false,
//     unique: true
//   },
//   telegram_username: {
//     type: DataTypes.STRING,
//     allowNull: true
//   },
//   referral_code: {
//     type: DataTypes.STRING,
//     unique: true,
//     allowNull: false,
//     defaultValue: () => Math.random().toString(36).substring(2, 10).toUpperCase()
//   },
//   referred_by: {
//     type: DataTypes.INTEGER,
//     allowNull: true
//   },
//   bonus_entries: {
//     type: DataTypes.INTEGER,
//     defaultValue: 0,
//     allowNull: false
//   },
//   total_referrals: {
//     type: DataTypes.INTEGER,
//     defaultValue: 0,
//     allowNull: false
//   },
//   active_referrals: {
//     type: DataTypes.INTEGER,
//     defaultValue: 0,
//     allowNull: false
//   },
//   // 🔽 New fields for Paystack Bank Verification
//   bank_account_number: {
//     type: DataTypes.STRING,
//     allowNull: true
//   },
//   bank_name: {
//     type: DataTypes.STRING,
//     allowNull: true
//   },
//   bank_code: {
//     type: DataTypes.STRING,
//     allowNull: true
//   },
//   account_holder_name: {
//     type: DataTypes.STRING,
//     allowNull: true
//   },
//   bank_verified: {
//     type: DataTypes.BOOLEAN,
//     defaultValue: false,
//     allowNull: false
//   },

//   partner: {
//     type: DataTypes.BOOLEAN,
//     defaultValue: false
//   },
//   partner_commission: {
//     type: DataTypes.DECIMAL(10, 2),
//     defaultValue: 0.00
//   },
//   partner_start_date: {
//     type: DataTypes.DATE,
//     allowNull: true
//   }

// }, {
//   sequelize,
//   modelName: 'User',
//   tableName: 'users',
//   timestamps: true
// });

//   return User;
// };
'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class User extends Model {
    static associate(models) {
      // ✅ When a user is deleted, delete all their entries
      User.hasMany(models.Entry, { 
        foreignKey: 'user_id', 
        onDelete: 'CASCADE', 
        hooks: true 
      });

      // ✅ Self-referencing relationship for referrals
      User.belongsTo(models.User, { 
        as: 'Referrer', 
        foreignKey: 'referred_by',
        onDelete: 'SET NULL' // don’t delete referred users if referrer is deleted
      });

      User.hasMany(models.User, { 
        as: 'Referrals', 
        foreignKey: 'referred_by', 
        onDelete: 'CASCADE', 
        hooks: true 
      });

      // ✅ Delete payments & transactions when user is deleted
      User.hasMany(models.Payment, { 
        foreignKey: 'user_id', 
        onDelete: 'CASCADE', 
        hooks: true 
      });
      
      User.hasMany(models.Transaction, { 
        foreignKey: 'user_id', 
        onDelete: 'CASCADE', 
        hooks: true 
      });
    }
  }

  User.init({
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    telegram_id: { type: DataTypes.BIGINT, allowNull: false, unique: true },
    telegram_username: { type: DataTypes.STRING, allowNull: true },
    referral_code: { type: DataTypes.STRING, unique: true, allowNull: false, defaultValue: () => Math.random().toString(36).substring(2, 10).toUpperCase() },
    referred_by: { type: DataTypes.INTEGER, allowNull: true },
    bonus_entries: { type: DataTypes.INTEGER, defaultValue: 0 },
    total_referrals: { type: DataTypes.INTEGER, defaultValue: 0 },
    active_referrals: { type: DataTypes.INTEGER, defaultValue: 0 },
    bank_account_number: { type: DataTypes.STRING, allowNull: true },
    bank_name: { type: DataTypes.STRING, allowNull: true },
    bank_code: { type: DataTypes.STRING, allowNull: true },
    account_holder_name: { type: DataTypes.STRING, allowNull: true },
    bank_verified: { type: DataTypes.BOOLEAN, defaultValue: false },
    partner: { type: DataTypes.BOOLEAN, defaultValue: false },
    partner_commission: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0.00 },
    partner_start_date: { type: DataTypes.DATE, allowNull: true }
  }, {
    sequelize,
    modelName: 'User',
    tableName: 'users',
    timestamps: true
  });

  return User;
};
