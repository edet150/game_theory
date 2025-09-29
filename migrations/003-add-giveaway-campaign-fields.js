// migrations/003-add-giveaway-campaign-fields.js
'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Add new columns to giveaway_campaigns table
    await queryInterface.addColumn('giveaway_campaigns', 'referral_requirement', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0
    });

    await queryInterface.addColumn('giveaway_campaigns', 'referral_link', {
      type: Sequelize.STRING,
      allowNull: true
    });

    await queryInterface.addColumn('giveaway_campaigns', 'status', {
      type: Sequelize.ENUM('active', 'inactive', 'closed', 'completed'),
      defaultValue: 'inactive'
    });

    await queryInterface.addColumn('giveaway_campaigns', 'winner_telegram_id', {
      type: Sequelize.BIGINT,
      allowNull: true
    });

    // Update existing campaigns to have 'inactive' status
    await queryInterface.sequelize.query(
      "UPDATE giveaway_campaigns SET status = CASE WHEN is_active = true THEN 'active' ELSE 'inactive' END"
    );

    // Remove the old is_active column
    await queryInterface.removeColumn('giveaway_campaigns', 'is_active');
  },

  down: async (queryInterface, Sequelize) => {
    // Add back is_active column
    await queryInterface.addColumn('giveaway_campaigns', 'is_active', {
      type: Sequelize.BOOLEAN,
      defaultValue: false
    });

    // Update is_active based on status
    await queryInterface.sequelize.query(
      "UPDATE giveaway_campaigns SET is_active = CASE WHEN status = 'active' THEN true ELSE false END"
    );

    // Remove new columns
    await queryInterface.removeColumn('giveaway_campaigns', 'referral_requirement');
    await queryInterface.removeColumn('giveaway_campaigns', 'referral_link');
    await queryInterface.removeColumn('giveaway_campaigns', 'status');
    await queryInterface.removeColumn('giveaway_campaigns', 'winner_telegram_id');
  }
};