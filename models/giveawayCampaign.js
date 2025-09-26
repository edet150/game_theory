// models/giveawayCampaign.js
module.exports = (sequelize, DataTypes) => {
  const GiveawayCampaign = sequelize.define('GiveawayCampaign', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    entry_fee: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0.00
    },
    prize_amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false
    },
    max_entries: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    start_date: {
      type: DataTypes.DATE,
      allowNull: true
    },
    end_date: {
        type: DataTypes.DATE,
        allowNull: true
        }
  }, {
    tableName: 'giveaway_campaigns',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });

  GiveawayCampaign.associate = function(models) {
    GiveawayCampaign.hasMany(models.GiveawayEntry, {
      foreignKey: 'campaign_id',
      as: 'entries'
    });
  };

  return GiveawayCampaign;
};