'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class User extends Model {
    static associate(models) {
      User.hasMany(models.Entry, { foreignKey: 'user_id' });
    }
  }
  User.init({
    telegram_id: {
      type: DataTypes.BIGINT,
      allowNull: false,
      unique: true
    },
    telegram_username: {
      type: DataTypes.STRING,
      allowNull: true
    }
  }, {
    sequelize,
    modelName: 'User',
    tableName: 'users',
    timestamps: true
  });
  return User;
};