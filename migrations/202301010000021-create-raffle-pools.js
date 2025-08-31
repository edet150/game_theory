'use strict';
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('raffle_pools', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      name: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true
      },
      price_per_entry: {
        type: Sequelize.INTEGER,
        allowNull: false
      },
      max_entries: {
        type: Sequelize.INTEGER,
        allowNull: false
      }
    });
    // Seed initial data for the pools
    await queryInterface.bulkInsert('raffle_pools', [
      { name: 'Alpha', price_per_entry: 100, max_entries: 10000 },
      { name: 'Beta', price_per_entry: 200, max_entries: 2500 },
      { name: 'High Rollers', price_per_entry: 500, max_entries: 500 }
    ], {});
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('raffle_pools');
  }
};