const mongoose = require('mongoose');

const attemptSchema = new mongoose.Schema({
  quiz: { type: mongoose.Schema.Types.ObjectId, ref: 'Quiz', required: true },
  player: { type: mongoose.Schema.Types.ObjectId, ref: 'Player', default: null },
  playerName: { type: String, required: true, trim: true, maxlength: 30 },
  mode: { type: String, enum: ['published', 'live'], default: 'published', index: true },
  roundKey: { type: String, default: null, index: true },
  deviceId: { type: String, default: null },
  answers: { type: [Number], default: [] },
  score: { type: Number, required: true, min: 0 },
  total: { type: Number, required: true, min: 1 },
  percentage: { type: Number, required: true, min: 0, max: 100 },
  violations: { type: Number, default: 0, min: 0 },
  violationReasons: { type: [String], default: [] },
  status: { type: String, enum: ['completed', 'auto-submitted'], default: 'completed' }
}, { timestamps: true });

module.exports = mongoose.model('Attempt', attemptSchema);
