const mongoose = require('mongoose');

const dailyLogSchema = new mongoose.Schema({
  date: { type: String, required: true }, // YYYY-MM-DD in the user's local calendar
  progress: { type: Number, min: 0, max: 100, default: 0 },
  note: { type: String, maxlength: 500, default: '' },
  completed: { type: Boolean, default: false },
  updatedAt: { type: Date, default: Date.now }
}, { _id: false });

const todoTaskSchema = new mongoose.Schema({
  player: { type: mongoose.Schema.Types.ObjectId, ref: 'Player', required: true, index: true },
  title: { type: String, required: true, trim: true, maxlength: 120 },
  notes: { type: String, trim: true, maxlength: 500, default: '' },
  priority: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
  category: { type: String, trim: true, maxlength: 40, default: 'Study' },
  durationType: { type: String, enum: ['day', 'week', 'month', 'year', 'custom'], default: 'day' },
  durationDays: { type: Number, min: 1, max: 3650, required: true },
  startDate: { type: String, required: true }, // YYYY-MM-DD
  endDate: { type: String, required: true },   // YYYY-MM-DD
  dailyLogs: { type: [dailyLogSchema], default: [] },
  archived: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { versionKey: false });

todoTaskSchema.index({ player: 1, createdAt: -1 });

todoTaskSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('TodoTask', todoTaskSchema);
