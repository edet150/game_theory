// migrations/XXXXXX-create-winning.js
'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('winnings', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      week_code: { // Changed from week_id to week_code
        type: Sequelize.STRING,
        allowNull: false
      },
      winning_number: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      winning_amount: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0.00
      },
      is_claimed: {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      },
      claimed_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      created_at: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW
      },
      updated_at: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW
      }
    });

    // Add foreign key constraint to reference the code field in weeks table
    await queryInterface.addConstraint('winnings', {
      fields: ['week_code'],
      type: 'foreign key',
      name: 'fk_winnings_week_code',
      references: {
        table: 'weeks',
        field: 'code' // Reference the 'code' field instead of 'week_id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE'
    });

    await queryInterface.addIndex('winnings', {
      fields: ['week_code'],
      unique: true,
      name: 'winnings_week_code_unique'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeConstraint('winnings', 'fk_winnings_week_code');
    await queryInterface.removeIndex('winnings', 'winnings_week_code_unique');
    await queryInterface.dropTable('winnings');
  }
};