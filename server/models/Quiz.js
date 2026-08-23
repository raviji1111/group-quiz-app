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
  time: { type: Number, required: true, min: 1, max: 180 },
  maxViolations: { type: Number, required: true, min: 1, max: 20 },
  examMode: { type: Boolean, default: true },
  isPublished: { type: Boolean, default: true },
  joinStartAt: { type: Date, default: null },
  joinEndAt: { type: Date, default: null },
  scheduledStartAt: { type: Date, default: null },
  questions: { type: [questionSchema], required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true }
}, { timestamps: true });

module.exports = mongoose.model('Quiz', quizSchema);
