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
    referral_requirement: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      allowNull: false
    },
    referral_link: {
      type: DataTypes.STRING,
      allowNull: true
    },
    status: {
      type: DataTypes.ENUM('active', 'inactive', 'closed', 'completed'),
      defaultValue: 'inactive'
    },
    start_date: {
      type: DataTypes.DATE,
      allowNull: true
    },
    end_date: {
      type: DataTypes.DATE,
      allowNull: true
    },
    winner_telegram_id: {
      type: DataTypes.BIGINT,
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

  // Instance method to check if campaign is active
  GiveawayCampaign.prototype.isActive = function() {
    return this.status === 'active';
  };

  // Instance method to check if campaign is closed
  GiveawayCampaign.prototype.isClosed = function() {
    return this.status === 'closed' || this.status === 'completed';
  };

  // Instance method to format end date
  GiveawayCampaign.prototype.getFormattedEndDate = function() {
    if (!this.end_date) return 'No end date set';
    
    const now = new Date();
    const endDate = new Date(this.end_date);
    const diffTime = endDate - now;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) return 'Ended';
    if (diffDays === 0) return 'Ends today';
    if (diffDays === 1) return 'Ends tomorrow';
    if (diffDays < 7) return `Ends in ${diffDays} days`;
    if (diffDays < 30) return `Ends in ${Math.ceil(diffDays/7)} weeks`;
    return `Ends on ${endDate.toLocaleDateString()}`;
  };

  return GiveawayCampaign;
};