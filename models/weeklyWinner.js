const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class WeeklyWinner extends Model {}

  WeeklyWinner.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    week_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'weeks',
        key: 'id'
      },
      onDelete: 'CASCADE'
    },
    week_code: {
      type: DataTypes.STRING,
      allowNull: false
    },
    entry_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'entries',
        key: 'id'
      },
      onDelete: 'CASCADE'
    },
    entry_number: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      },
      onDelete: 'CASCADE'
    },
    winning_method: {
      type: DataTypes.STRING,
      allowNull: false
    },
    winning_number: {
      type: DataTypes.STRING,
      allowNull: true
    },
    position: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    won_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    }
  }, {
    sequelize,
    modelName: 'WeeklyWinner',
    tableName: 'weekly_winners',
    timestamps: false
  });

  return WeeklyWinner;
};
