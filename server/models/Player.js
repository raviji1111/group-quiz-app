const mongoose = require('mongoose');

const playerSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 30 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  active: { type: Boolean, default: true },
  activeSessionId: { type: String, default: null }
}, { timestamps: true });

module.exports = mongoose.model('Player', playerSchema);
