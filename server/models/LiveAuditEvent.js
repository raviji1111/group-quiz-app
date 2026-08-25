const mongoose = require('mongoose');

// Append-only audit trail for security-sensitive LIVE actions.
const liveAuditEventSchema = new mongoose.Schema({
  quiz: { type: mongoose.Schema.Types.ObjectId, ref: 'Quiz', required: true, index: true },
  session: { type: mongoose.Schema.Types.ObjectId, ref: 'QuizSession', default: null },
  actorType: { type: String, enum: ['admin', 'player', 'system'], required: true },
  actorId: { type: String, default: '' },
  action: { type: String, required: true, maxlength: 80 },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  ipHash: { type: String, default: '' }
}, { timestamps: true, versionKey: false });

liveAuditEventSchema.index({ quiz: 1, createdAt: -1 });
module.exports = mongoose.model('LiveAuditEvent', liveAuditEventSchema);

