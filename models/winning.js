// models/Winning.js
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const Winning = sequelize.define('Winning', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        week_code: { // Changed from week_id to week_code
            type: DataTypes.STRING,
            allowNull: false,
            references: {
                model: 'weeks',
                key: 'code' // Reference the 'code' field
            }
        },
        winning_number: {
            type: DataTypes.INTEGER,
            allowNull: true,
            validate: {
                min: 1,
                max: 10000000
            }
        },
        winning_amount: {
            type: DataTypes.DECIMAL(15, 2),
            allowNull: false,
            defaultValue: 0.00
        },
        is_claimed: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
        },
        claimed_at: {
            type: DataTypes.DATE,
            allowNull: true
        }
    }, {
        tableName: 'winnings',
        timestamps: true,
        indexes: [
            {
                unique: true,
                fields: ['week_code'] // Changed from week_id to week_code
            }
        ]
    });

    // Associations
    Winning.associate = (models) => {
        Winning.belongsTo(models.Week, {
            foreignKey: 'week_code', // Changed from week_id to week_code
            targetKey: 'code', // Reference the 'code' field
            as: 'week'
        });
    };

    return Winning;
};