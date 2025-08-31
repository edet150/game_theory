'use strict';
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('entries', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      pool_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'raffle_pools',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      entry_number: {
        type: Sequelize.INTEGER,
        allowNull: false
      },
      status: {
        type: Sequelize.ENUM('pending', 'paid', 'winning'),
        defaultValue: 'pending'
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
    // Add a unique constraint to ensure no duplicate entry numbers per pool
    await queryInterface.addConstraint('entries', {
      fields: ['pool_id', 'entry_number'],
      type: 'unique',
      name: 'unique_entry_per_pool_constraint'
    });
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('entries');
  }
};