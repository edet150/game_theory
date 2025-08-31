'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.bulkInsert('raffle_pools', [
      { name: 'Alpha', price_per_entry: 100, max_entries: 10000 },
      { name: 'Beta', price_per_entry: 200, max_entries: 2500 },
      { name: 'High Rollers', price_per_entry: 500, max_entries: 500 }
    ]);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('raffle_pools', null, {});
  }
};
