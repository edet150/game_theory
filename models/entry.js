// 'use strict';
// const { Model } = require('sequelize');
// module.exports = (sequelize, DataTypes) => {
//   class Entry extends Model {
//     static associate(models) {
//       Entry.belongsTo(models.User, { foreignKey: 'user_id' });
//       Entry.belongsTo(models.RafflePool, { foreignKey: 'pool_id' });

//       // Each entry belongs to a weekly cycle
//       Entry.belongsTo(models.Week, { foreignKey: 'week_id' });
//     }
//   }
//   Entry.init({
//     user_id: {
//       type: DataTypes.INTEGER,
//       allowNull: false,
//       references: { model: 'users', key: 'id' }
//     },
//     pool_id: {
//       type: DataTypes.INTEGER,
//       allowNull: false,
//       references: { model: 'raffle_pools', key: 'id' }
//     },
//     entry_number: {
//       type: DataTypes.INTEGER,
//       allowNull: false
//     },
//     status: {
//       type: DataTypes.ENUM('pending', 'paid', 'winning', 'expired'),
//       defaultValue: 'pending'
//     },
//     week_id: {
//       type: DataTypes.INTEGER,
//       allowNull: false,
//       references: { model: 'weeks', key: 'id' }
//     },
//     week_name: {
//       type: DataTypes.STRING,
//       allowNull: false
//     },
//     week_code: {
//       type: DataTypes.STRING,
//       allowNull: false
//     },
//     transaction_id: {
//       type: DataTypes.STRING,
//       allowNull: false
//     }
//   }, {
//     sequelize,
//     modelName: 'Entry',
//     tableName: 'entries',
//     timestamps: true,
//     uniqueKeys: {
//       unique_entry: {
//         fields: ['pool_id', 'entry_number', 'week_id']
//       }
//     }
//   });
//   return Entry;
// };

'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Entry extends Model {
    static associate(models) {
      Entry.belongsTo(models.User, { 
        foreignKey: 'user_id', 
        onDelete: 'CASCADE' 
      });

      Entry.belongsTo(models.RafflePool, { 
        foreignKey: 'pool_id', 
        onDelete: 'CASCADE' 
      });

      Entry.belongsTo(models.Week, { 
        foreignKey: 'week_id', 
        onDelete: 'CASCADE' 
      });
    }
  }

  Entry.init({
    user_id: { type: DataTypes.INTEGER, allowNull: false },
    pool_id: { type: DataTypes.INTEGER, allowNull: false },
    entry_number: { type: DataTypes.INTEGER, allowNull: false },
    status: { type: DataTypes.ENUM('pending', 'paid', 'winning', 'expired'), defaultValue: 'pending' },
    week_id: { type: DataTypes.INTEGER, allowNull: false },
    week_name: { type: DataTypes.STRING, allowNull: false },
    week_code: { type: DataTypes.STRING, allowNull: false },
    transaction_id: { type: DataTypes.STRING, allowNull: false }
  }, {
    sequelize,
    modelName: 'Entry',
    tableName: 'entries',
    timestamps: true,
    uniqueKeys: {
      unique_entry: { fields: ['pool_id', 'entry_number', 'week_id'] }
    }
  });

  return Entry;
};
