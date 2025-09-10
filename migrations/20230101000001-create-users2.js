'use strict';
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('users', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      telegram_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        unique: true
      },
      telegram_username: {
        type: Sequelize.STRING,
        allowNull: true
      },
      referral_code: {
        type: Sequelize.STRING,
        unique: true,
        allowNull: false
      },
      referred_by: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      bonus_entries: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      total_referrals: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      active_referrals: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.fn('NOW')
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.fn('NOW')
      }
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('users');
  }
};
