'use strict';
// Additive v22 entrypoint. Original server/server.js is intentionally unchanged.
require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const DeviceBinding = require('./models/v22/DeviceBinding');
const Player = require('./models/Player');
const AdminAuditLog = require('./models/v22/AdminAuditLog');
const QuizSession = require('./models/QuizSession');
const Quiz = require('./models/Quiz');
const { validateAnswers } = require('./services/v22Validation');
const authRoutes = require('./routes/auth');
const quizRoutes = require('./routes/quizzes');
const attemptRoutes = require('./routes/attempts');
const playerAuthRoutes = require('./routes/playerAuth');
const playerRoutes = require('./routes/players');
const liveRoutes = require('./routes/live');
const liveAnalyticsRoutes = require('./routes/liveAnalytics');
const todoRoutes = require('./routes/todos');
const todoAnalyticsRoutes = require('./routes/todoAnalytics');
const enhancedRoutes = require('./routes/v22/enhancements');
const { ensureAdmin } = require('./utils/seedAdmin');
const { rateLimitV22 } = require('./middleware/v22RateLimit');

const app = express();
const PORT = Number(process.env.PORT || 3000);
app.disable('x-powered-by');
app.use(cors());
app.use(express.json({ limit: '2mb' }));
// Serve player HTML with an additive device-binding client without editing original HTML files.
app.use((req, res, next) => {
  const htmlMap = { '/': 'index.html', '/index.html': 'index.html', '/todo.html': 'todo.html' };
  const file = htmlMap[req.path];
  if (!file || req.method !== 'GET') return next();
  fs.readFile(path.join(__dirname, '..', 'client', file), 'utf8', (err, html) => {
    if (err) return next(err);
    const injected = html.replace('</head>', '<script src="/v22/device-binding.js"></script></head>');
    res.type('html').send(injected);
  });
});
app.use(express.static(path.join(__dirname, '..', 'client')));
app.use('/api', rateLimitV22({ max: Number(process.env.API_RATE_LIMIT_PER_MINUTE || 240) }));
app.use('/api/auth/login', rateLimitV22({ max: 10, key: req => `admin-login:${req.ip || 'unknown'}` }));
app.use('/api/player/login', rateLimitV22({ max: 10, key: req => `player-login:${req.ip || 'unknown'}` }));
app.use('/api/player/register', rateLimitV22({ max: 8, key: req => `player-register:${req.ip || 'unknown'}` }));
// Enforce device binding for authenticated player API calls on the v22 server only.
app.use('/api', async (req, res, next) => {
  const protectedPath = req.path.startsWith('/attempts') || req.path.startsWith('/live') || req.path.startsWith('/todos') || req.path.startsWith('/v22/todos');
  if (!protectedPath) return next();
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return next();
  let payload;
  try { payload = jwt.verify(header.slice(7), process.env.JWT_SECRET); } catch { return next(); }
  if (payload.role !== 'player') return next();
  const deviceId = String(req.headers['x-quiz-device'] || '');
  if (!deviceId) return res.status(428).json({ code: 'DEVICE_REQUIRED', message: 'Device verification is required. Refresh the page and sign in again.' });
  try {
    const [binding, player] = await Promise.all([DeviceBinding.findOne({ player: payload.id }).select('deviceHash'), Player.findById(payload.id).select('active')]);
    const hash = crypto.createHash('sha256').update(deviceId).digest('hex');
    if (!player || player.active === false) return res.status(403).json({ code: 'ACCOUNT_SUSPENDED', message: 'This account is inactive. Contact the administrator.' });
    if (!binding) return res.status(428).json({ code: 'DEVICE_NOT_BOUND', message: 'This account has no registered device yet. Refresh the page to register this device.' });
    if (binding.deviceHash !== hash) return res.status(403).json({ code: 'DEVICE_MISMATCH', message: 'This account is registered to another device. Contact the administrator.' });
    next();
  } catch (error) { res.status(503).json({ message: 'Could not verify device. Try again shortly.' }); }
});
// Record successful admin mutations to existing Quiz/LIVE routes without changing their source files.
app.use('/api', (req, res, next) => {
  const mutating = ['POST','PATCH','PUT','DELETE'].includes(req.method);
  const targetPath = req.path;
  const relevant = targetPath.startsWith('/live') || targetPath.startsWith('/quizzes');
  const header = req.headers.authorization || '';
  if (!mutating || !relevant || !header.startsWith('Bearer ')) return next();
  let payload;
  try { payload = jwt.verify(header.slice(7), process.env.JWT_SECRET); } catch { return next(); }
  if (payload.role !== 'admin') return next();
  res.once('finish', () => {
    if (res.statusCode >= 400) return;
    AdminAuditLog.create({ actor: payload.email || 'admin', action: `api.${req.method.toLowerCase()}`, targetType: targetPath.startsWith('/live') ? 'LIVE' : 'Quiz', targetId: req.params?.id || req.params?.quizId || '', details: { path: targetPath, status: res.statusCode }, ip: req.ip || '' }).catch(e => console.error('Admin mutation audit failed:', e.message));
  });
  next();
});

// Validate submitted answer indexes and prevent concurrent duplicate submissions per session in this process.
const activeSubmissions = new Set();
app.use('/api/attempts', async (req, res, next) => {
  const isSubmit = req.method === 'POST' && req.path === '/';
  const isProgress = req.method === 'PATCH' && /^\/session\/[^/]+\/progress$/.test(req.path);
  if (!isSubmit && !isProgress) return next();
  try {
    const sessionId = isSubmit ? String(req.body.sessionId || '') : req.path.split('/')[2];
    if (!mongoose.isValidObjectId(sessionId)) return next();
    const session = await QuizSession.findById(sessionId).select('quiz submitted');
    if (!session) return next();
    const quiz = await Quiz.findById(session.quiz).select('questions');
    if (!quiz) return next();
    if (Array.isArray(req.body.answers) && !validateAnswers(req.body.answers, quiz.questions.length)) {
      return res.status(400).json({ message: 'Answers contain invalid option indexes or exceed the question count.' });
    }
    if (isProgress && Number.isInteger(Number(req.body.currentQuestion)) && (Number(req.body.currentQuestion) < 0 || Number(req.body.currentQuestion) >= quiz.questions.length)) {
      return res.status(400).json({ message: 'Current question index is outside this quiz.' });
    }
    if (isSubmit) {
      if (session.submitted) return res.status(409).json({ message: 'This quiz session has already been submitted.' });
      if (activeSubmissions.has(sessionId)) return res.status(409).json({ message: 'A submission for this session is already being processed.' });
      activeSubmissions.add(sessionId);
      const release = () => activeSubmissions.delete(sessionId);
      res.once('finish', release); res.once('close', release);
    }
    next();
  } catch (error) { console.error('v22 answer validation failed:', error.message); res.status(503).json({ message: 'Could not validate quiz submission. Please retry.' }); }
});

app.get('/api/health', (req, res) => res.json({ ok: true, service: 'group-quiz-api-v22', database: mongoose.connection.readyState === 1 }));
app.use('/api/auth', authRoutes);
app.use('/api/quizzes', quizRoutes);
app.use('/api/attempts', attemptRoutes);
app.use('/api/player', playerAuthRoutes);
app.use('/api/players', playerRoutes);
app.use('/api/live', liveRoutes);
app.use('/api/live-analytics', liveAnalyticsRoutes);
app.use('/api/todos/analytics', todoAnalyticsRoutes);
app.use('/api/todos', todoRoutes);
app.use('/api/v22', enhancedRoutes);
app.use('/api', (req, res) => res.status(404).json({ message: 'API route not found.' }));
app.use((error, req, res, next) => {
  console.error('Unhandled request error:', error.message);
  if (res.headersSent) return next(error);
  res.status(error.status || 500).json({ message: error.status ? error.message : 'Unexpected server error.' });
});
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, '..', 'client', 'admin.html')));
app.get('/admin-v22', (req, res) => res.sendFile(path.join(__dirname, '..', 'client', 'v22', 'admin-v22.html')));
app.get('*splat', (req, res) => res.sendFile(path.join(__dirname, '..', 'client', 'index.html')));
async function start() {
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is missing. Create a .env file from .env.example.');
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is missing.');
  await mongoose.connect(process.env.MONGO_URI);
  await ensureAdmin();
  app.listen(PORT, () => console.log(`Group Quiz v22 additive server running at http://localhost:${PORT}`));
}
if (require.main === module) start().catch(error => { console.error('Startup failed:', error.message); process.exit(1); });
module.exports = { app, start };
