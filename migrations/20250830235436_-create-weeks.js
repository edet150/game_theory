"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("weeks", {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER,
      },
      code: {
        type: Sequelize.STRING,
        unique: true,
        allowNull: true,
      },
      full_code: {
        type: Sequelize.STRING,
        unique: true,
        allowNull: true,
      },
      year: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      week_number: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      week_name: {
        type: Sequelize.STRING,
        allowNull: false,
      },
         week_id: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      starts_at: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      ends_at: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE,
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE,
      },
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable("weeks");
  },
};
