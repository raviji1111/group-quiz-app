const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema({
  question: { type: String, required: true, trim: true },
  options: {
    type: [String],
    validate: v => Array.isArray(v) && v.length === 4
  },
  answer: { type: Number, required: true, min: 0, max: 3 }
}, { _id: true });

const quizSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  subject: { type: String, default: 'General', trim: true, maxlength: 80 },
  topic: { type: String, default: 'General', trim: true, maxlength: 120 },
  time: { type: Number, required: true, min: 1, max: 180 },
  liveDuration: { type: Number, default: 30, min: 1, max: 180 },
  liveJoinOpenAfter: { type: Number, default: 0, min: 0, max: 180 },
  liveJoinCloseAfter: { type: Number, default: 0, min: 0, max: 180 },
  liveStartAfter: { type: Number, default: 0, min: 0, max: 180 },
  liveCloseAfter: { type: Number, default: 0, min: 1, max: 360 },
  liveLaunchAt: { type: Date, default: null },
  liveJoinOpenAt: { type: Date, default: null },
  liveJoinCloseAt: { type: Date, default: null },
  maxViolations: { type: Number, required: true, min: 1, max: 20 },
  examMode: { type: Boolean, default: true },
  isPublished: { type: Boolean, default: true },
  joinStartAt: { type: Date, default: null },
  joinEndAt: { type: Date, default: null },
  scheduledStartAt: { type: Date, default: null },
  liveStatus: { type: String, enum: ['idle', 'live', 'ended'], default: 'idle' },
  liveStartedAt: { type: Date, default: null },
  liveEndsAt: { type: Date, default: null },
  showLiveScore: { type: Boolean, default: true },
  showLeaderboard: { type: Boolean, default: true },
  livePaused: { type: Boolean, default: false },
  livePausedAt: { type: Date, default: null },
  liveTotalPausedMs: { type: Number, default: 0, min: 0 },
  liveAnnouncement: { type: String, default: '', maxlength: 200 },
  questions: { type: [questionSchema], required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true }
}, { timestamps: true });

module.exports = mongoose.model('Quiz', quizSchema);

