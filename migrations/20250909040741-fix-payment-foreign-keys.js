'use strict';

module.exports = {
  async up(queryInterface) {
    // Drop old auto-generated FKs
    await queryInterface.removeConstraint('Payments', 'Payments_ibfk_1');
    await queryInterface.removeConstraint('Payments', 'Payments_ibfk_2');

    // Add new ones with explicit names
    await queryInterface.addConstraint('Payments', {
      fields: ['user_id'],
      type: 'foreign key',
      name: 'fk_payments_user',
      references: { table: 'users', field: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'NO ACTION'
    });

    await queryInterface.addConstraint('Payments', {
      fields: ['pool_id'],
      type: 'foreign key',
      name: 'fk_payments_pool',
      references: { table: 'raffle_pools', field: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'NO ACTION'
    });
  },

  async down(queryInterface) {
    await queryInterface.removeConstraint('Payments', 'fk_payments_user');
    await queryInterface.removeConstraint('Payments', 'fk_payments_pool');
  }
};
