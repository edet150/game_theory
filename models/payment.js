'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class Payment extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // A Payment belongs to a User
      Payment.belongsTo(models.User, { foreignKey: 'user_id' });

      // A Payment belongs to a RafflePool
      Payment.belongsTo(models.RafflePool, { foreignKey: 'pool_id' });
    }
  }
  Payment.init({
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    pool_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    paystack_transaction_id: {
      type: DataTypes.STRING ,
      allowNull: false,
      unique: true // Ensures no two payments can have the same Paystack transaction ID
    },
    paystack_reference: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true // Ensures no two payments can have the same Paystack reference
    },
    amount: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'success'
    }
  }, {
    sequelize,
    modelName: 'Payment',
    tableName: 'Payments', // Conventionally, table names are plural
    timestamps: true // Payments should have timestamps for auditing
  });
  return Payment;
};