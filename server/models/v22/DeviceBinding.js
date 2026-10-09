const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  player: { type: mongoose.Schema.Types.ObjectId, ref: 'Player', required: true, unique: true, index: true },
  deviceHash: { type: String, required: true },
  claimedAt: { type: Date, default: Date.now },
  lastSeenAt: { type: Date, default: Date.now },
  resetBy: { type: String, default: '' }
}, { timestamps: true, versionKey: false });
module.exports = mongoose.model('DeviceBindingV22', schema);
