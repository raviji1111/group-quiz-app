const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  actor: { type: String, default: 'admin' }, action: { type: String, required: true, maxlength: 80 },
  targetType: { type: String, default: '', maxlength: 40 }, targetId: { type: String, default: '', maxlength: 100 },
  details: { type: mongoose.Schema.Types.Mixed, default: {} }, ip: { type: String, default: '', maxlength: 80 }
}, { timestamps: true, versionKey: false });
schema.index({ createdAt: -1 });
module.exports = mongoose.model('AdminAuditLogV22', schema);
