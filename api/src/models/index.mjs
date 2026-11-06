import { DataTypes } from 'sequelize';
import { sequelize } from '../db/connection.mjs';
export const Event = sequelize.define('Event', {
  title: { type: DataTypes.STRING(120), allowNull: false },
  description: { type: DataTypes.TEXT, allowNull: true },
  location: { type: DataTypes.STRING(120), allowNull: false },
  startsAt: { type: DataTypes.DATE, allowNull: false },
  capacity: { type: DataTypes.INTEGER, allowNull: false, validate: { min: 1 } }
});

export const Registration = sequelize.define('Registration', {
  name: { type: DataTypes.STRING(100), allowNull: false },
  email: { type: DataTypes.STRING(254), allowNull: false }
}, { indexes: [{ unique: true, fields: ['eventId', 'email'] }] });

Event.hasMany(Registration, { foreignKey: { name: 'eventId', allowNull: false }, onDelete: 'CASCADE' });
Registration.belongsTo(Event, { foreignKey: 'eventId' });


// Independent of registration/event deletion: committed mail remains deliverable.
export const MailJob = sequelize.define('MailJob', {
  payload: { type: DataTypes.JSON, allowNull: false },
  attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  nextAttemptAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  sentAt: { type: DataTypes.DATE, allowNull: true }
});
