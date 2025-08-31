'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('Payments', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      userId: { // Sequelize uses camelCase for foreign keys by default
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'Users', // The name of your User table
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      poolId: { // Sequelize uses camelCase for foreign keys by default
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'RafflePools', // The name of your RafflePools table
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      paystack_transaction_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        unique: true
      },
      paystack_reference: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true
      },
      amount: {
        type: Sequelize.INTEGER,
        allowNull: false
      },
      status: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: 'success'
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE
      }
    });
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('Payments');
  }
};