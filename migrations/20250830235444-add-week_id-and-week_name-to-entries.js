"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    // Add week_id column
    await queryInterface.addColumn("Entries", "week_id", {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: "Weeks", // references Weeks table
        key: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "SET NULL",
    });

    // Add week_name column (denormalized for quick display)
    await queryInterface.addColumn("Entries", "week_name", {
      type: Sequelize.STRING,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("Entries", "week_id");
    await queryInterface.removeColumn("Entries", "week_name");
  },
};
