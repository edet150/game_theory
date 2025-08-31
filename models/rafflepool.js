'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class RafflePool extends Model {
    static associate(models) {
        RafflePool.hasMany(models.Entry, { foreignKey: 'pool_id' });
         // Add the new association: A RafflePool can have many Payments
        RafflePool.hasMany(models.Payment, { foreignKey: 'pool_id' });
    }
  }
  RafflePool.init({
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },
    price_per_entry: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    max_entries: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    // prize_details: {
    //   type: DataTypes.TEXT,
    //   allowNull: true
    // }
  }, {
    sequelize,
    modelName: 'RafflePool',
    tableName: 'raffle_pools',
    timestamps: false
  });
  return RafflePool;
};