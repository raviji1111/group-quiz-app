require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const authRoutes = require('./routes/auth');
const quizRoutes = require('./routes/quizzes');
const attemptRoutes = require('./routes/attempts');
const publishedRoutes = require('./routes/published');
const playerAuthRoutes = require('./routes/playerAuth');
const playerRoutes = require('./routes/players');
const liveRoutes = require('./routes/live');
const { ensureAdmin } = require('./utils/seedAdmin');

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, '..', 'client')));

app.get('/api/health', (req, res) => res.json({ ok: true, service: 'group-quiz-api' }));
app.use('/api/auth', authRoutes);
app.use('/api/quizzes', quizRoutes);
app.use('/api/attempts', attemptRoutes);
app.use('/api/published', publishedRoutes);
app.use('/api/player', playerAuthRoutes);
app.use('/api/players', playerRoutes);
app.use('/api/live', liveRoutes);

app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, '..', 'client', 'admin.html')));
app.get('*splat', (req, res) => res.sendFile(path.join(__dirname, '..', 'client', 'index.html')));

async function start() {
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is missing. Create a .env file from .env.example.');
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is missing.');

  await mongoose.connect(process.env.MONGO_URI);
  await ensureAdmin();
  app.listen(PORT, () => console.log(`Group Quiz running at http://localhost:${PORT}`));
}

start().catch(error => {
  console.error('Startup failed:', error.message);
  process.exit(1);
});
