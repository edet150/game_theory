'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('Payments', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false
      },
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: false
      },
      pool_id: {
        type: Sequelize.INTEGER,
        allowNull: false
      },
      paystack_transaction_id: {
        type: Sequelize.STRING,
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
        type: Sequelize.DATE,
        allowNull: false
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false
      }
    });

    // ✅ Explicitly add FK with custom names
    await queryInterface.addConstraint('Payments', {
      fields: ['user_id'],
      type: 'foreign key',
      name: 'fk_payments_user', // custom unique name
      references: {
        table: 'users',
        field: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'NO ACTION'
    });

    await queryInterface.addConstraint('Payments', {
      fields: ['pool_id'],
      type: 'foreign key',
      name: 'fk_payments_pool', // custom unique name
      references: {
        table: 'raffle_pools',
        field: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'NO ACTION'
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('Payments');
  }
};
