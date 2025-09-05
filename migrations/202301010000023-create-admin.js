// migrations/XXXXXX-create-admin.js
'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('admins', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      username: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true
      },
      password: {
        type: Sequelize.STRING,
        allowNull: false
      },
      created_at: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW
      }
    });

    await queryInterface.addIndex('admins', {
      fields: ['username'],
      unique: true,
      name: 'admins_username_unique'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeIndex('admins', 'admins_username_unique');
    await queryInterface.dropTable('admins');
  }
};