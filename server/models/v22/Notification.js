const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 120 },
  message: { type: String, required: true, trim: true, maxlength: 1000 },
  audience: { type: String, enum: ['all', 'players'], default: 'all' },
  createdBy: { type: String, default: 'admin' },
  expiresAt: { type: Date, default: null }
}, { timestamps: true, versionKey: false });
schema.index({ createdAt: -1 });
module.exports = mongoose.model('NotificationV22', schema);
