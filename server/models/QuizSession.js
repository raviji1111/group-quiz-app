const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema({
  quiz: { type: mongoose.Schema.Types.ObjectId, ref: 'Quiz', required: true },
  player: { type: mongoose.Schema.Types.ObjectId, ref: 'Player', default: null },
  playerName: { type: String, required: true, trim: true, maxlength: 30 },
  startedAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true },
  submitted: { type: Boolean, default: false },
  currentQuestion: { type: Number, default: 0, min: 0 },
  answers: { type: [Number], default: [] },
  violations: { type: Number, default: 0, min: 0 },
  violationReasons: { type: [String], default: [] },
  joinedAt: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model('QuizSession', sessionSchema);
