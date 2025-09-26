// migrations/001-create-giveaway-entries.js
'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('giveaway_entries', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false
      },
      telegram_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        unique: true
      },
      username: {
        type: Sequelize.STRING,
        allowNull: true
      },
      first_name: {
        type: Sequelize.STRING,
        allowNull: true
      },
      last_name: {
        type: Sequelize.STRING,
        allowNull: true
      },
      account_number: {
        type: Sequelize.STRING(10),
        allowNull: false
      },
      bank_name: {
        type: Sequelize.STRING,
        allowNull: false
      },
      account_holder_name: {
        type: Sequelize.STRING,
        allowNull: false
      },
      entry_number: {
        type: Sequelize.INTEGER,
        allowNull: false
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        defaultValue: true,
        allowNull: false
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
      }
    });

    // Add indexes
    await queryInterface.addIndex('giveaway_entries', ['telegram_id'], {
      name: 'giveaway_entries_telegram_id_idx',
      unique: true
    });

    await queryInterface.addIndex('giveaway_entries', ['entry_number'], {
      name: 'giveaway_entries_entry_number_idx'
    });

    await queryInterface.addIndex('giveaway_entries', ['is_active'], {
      name: 'giveaway_entries_is_active_idx'
    });

    await queryInterface.addIndex('giveaway_entries', ['created_at'], {
      name: 'giveaway_entries_created_at_idx'
    });
  },

  down: async (queryInterface, Sequelize) => {
    // Remove indexes first
    await queryInterface.removeIndex('giveaway_entries', 'giveaway_entries_telegram_id_idx');
    await queryInterface.removeIndex('giveaway_entries', 'giveaway_entries_entry_number_idx');
    await queryInterface.removeIndex('giveaway_entries', 'giveaway_entries_is_active_idx');
    await queryInterface.removeIndex('giveaway_entries', 'giveaway_entries_created_at_idx');
    
    // Then drop the table
    await queryInterface.dropTable('giveaway_entries');
  }
};