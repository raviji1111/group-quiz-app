const mongoose = require('mongoose');

const blockedGuestSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true, trim: true, maxlength: 30 },
  normalizedName: { type: String, required: true, unique: true, lowercase: true, trim: true },
  reason: { type: String, default: 'Blocked by administrator', maxlength: 200 }
}, { timestamps: true });

module.exports = mongoose.model('BlockedGuest', blockedGuestSchema);
