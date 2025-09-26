// migrations/002-create-giveaway-campaigns.js
'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Create giveaway_campaigns table
    await queryInterface.createTable('giveaway_campaigns', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      name: {
        type: Sequelize.STRING,
        allowNull: false
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      entry_fee: {
        type: Sequelize.DECIMAL(10, 2),
        defaultValue: 0.00
      },
      prize_amount: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false
      },
      max_entries: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      },
      start_date: {
        type: Sequelize.DATE,
        allowNull: true
      },
      end_date: {
        type: Sequelize.DATE,
        allowNull: true
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

           // Insert default campaigns
await queryInterface.bulkInsert('giveaway_campaigns', [
  {
    name: '🎁 N2000 Weekly Giveaway',
    description: 'Weekly N2000 cash giveaway for active participants',
    entry_fee: 0.00, // Free entry for now, can change later
    prize_amount: 2000.00,
    max_entries: null, // No limit
    is_active: true,
    start_date: new Date(),
    end_date: null, // No end date
    created_at: new Date(),
    updated_at: new Date()
  },
  {
    name: '🎁 N5000 Weekly Giveaway',
    description: 'Weekly N5000 cash giveaway for premium participants',
    entry_fee: 0.00, // Free entry for now, can change later
    prize_amount: 5000.00,
    max_entries: null, // No limit
    is_active: false, // keep inactive until enabled
    start_date: new Date(),
    end_date: null,
    created_at: new Date(),
    updated_at: new Date()
  }
]);
    // Modify giveaway_entries table to include campaign_id
    await queryInterface.addColumn('giveaway_entries', 'campaign_id', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 1, // Default to campaign 1
      references: {
        model: 'giveaway_campaigns',
        key: 'id'
      }
    });

    await queryInterface.addColumn('giveaway_entries', 'paid', {
      type: Sequelize.BOOLEAN,
      defaultValue: false
    });

    await queryInterface.addColumn('giveaway_entries', 'payment_reference', {
      type: Sequelize.STRING,
      allowNull: true
    });

    // Add indexes
    await queryInterface.addIndex('giveaway_entries', ['campaign_id', 'entry_number'], {
      name: 'giveaway_entries_campaign_entry_idx',
      unique: true
    });

    await queryInterface.addIndex('giveaway_entries', ['campaign_id', 'telegram_id'], {
      name: 'giveaway_entries_campaign_user_idx',
      unique: true
    });


  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeIndex('giveaway_entries', 'giveaway_entries_campaign_entry_idx');
    await queryInterface.removeIndex('giveaway_entries', 'giveaway_entries_campaign_user_idx');
    await queryInterface.removeColumn('giveaway_entries', 'payment_reference');
    await queryInterface.removeColumn('giveaway_entries', 'paid');
    await queryInterface.removeColumn('giveaway_entries', 'campaign_id');
    await queryInterface.dropTable('giveaway_campaigns');
  }
};