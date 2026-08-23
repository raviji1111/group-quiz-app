const express = require('express');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const Quiz = require('../models/Quiz');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

function parsePdfQuestions(text) {
  const lines = String(text || '').replace(/\r/g, '').split('\n').map(line => line.replace(/\u00a0/g, ' ').trim()).filter(Boolean);
  const items = [];
  let current = null;
  let option = null;
  const pushOptionText = value => {
    if (!current || !option || !value) return;
    current.options[option] = current.options[option] ? `${current.options[option]} ${value}` : value;
  };
  const finish = () => {
    if (!current) return;
    const ok = current.question.trim() && current.options.every(Boolean);
    if (ok) items.push({ question: current.question.trim(), options: current.options.map(x => x.trim()), answer: 0 });
    current = null; option = null;
  };
  for (const line of lines) {
    const qMatch = line.match(/^(?:Q(?:uestion)?\s*)?(\d+)\s*[.)\-:]\s*(.+)$/i);
    const oMatch = line.match(/^([A-Da-d])\s*[.)\-:]\s*(.*)$/);
    if (qMatch) {
      finish(); current = { question: qMatch[2].trim(), options: ['', '', '', ''] }; option = null; continue;
    }
    if (oMatch) {
      if (!current) continue;
      option = 'ABCD'.indexOf(oMatch[1].toUpperCase());
      if (option >= 0) current.options[option] = oMatch[2].trim();
      continue;
    }
    if (current) {
      if (option !== null) pushOptionText(line);
      else current.question += ` ${line}`;
    }
  }
  finish();
  return items.slice(0, 1000);
}

router.post('/import-pdf', requireAdmin, upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'Please select a PDF file.' });
    if (req.file.mimetype !== 'application/pdf' && !req.file.originalname.toLowerCase().endsWith('.pdf')) return res.status(400).json({ message: 'Only PDF files are supported.' });
    const parsed = await pdfParse(req.file.buffer);
    const questions = parsePdfQuestions(parsed.text);
    if (!questions.length) return res.status(422).json({ message: 'No A/B/C/D questions could be detected. Use a text-based PDF with questions like 1. Question, A. Option, B. Option, C. Option, D. Option.' });
    res.json({ questions, count: questions.length, pages: parsed.numpages || 0 });
  } catch (error) { console.error(error); res.status(400).json({ message: 'Could not read this PDF.' }); }
});


function normalizeQuiz(body, adminId) {
  const title = String(body.title || '').trim();
  const time = Number(body.time);
  const maxViolations = Number(body.maxViolations);
  const examMode = Boolean(body.examMode);
  const parseDate = (value) => value ? new Date(value) : null;
  const joinStartAt = parseDate(body.joinStartAt);
  const joinEndAt = parseDate(body.joinEndAt);
  const scheduledStartAt = parseDate(body.scheduledStartAt);
  if (joinStartAt && Number.isNaN(joinStartAt.getTime())) throw new Error('Invalid join start time.');
  if (joinEndAt && Number.isNaN(joinEndAt.getTime())) throw new Error('Invalid join end time.');
  if (scheduledStartAt && Number.isNaN(scheduledStartAt.getTime())) throw new Error('Invalid quiz start time.');
  if ((joinStartAt && joinEndAt) && joinEndAt <= joinStartAt) throw new Error('Join end must be after join start.');
  if (scheduledStartAt && joinEndAt && scheduledStartAt < joinEndAt) throw new Error('Quiz start must be at or after join end.');
  if ((joinStartAt || joinEndAt) && !scheduledStartAt) throw new Error('Set a Quiz Start time when using a join window.');
  const questions = Array.isArray(body.questions) ? body.questions : [];

  if (!title) throw new Error('Quiz title is required.');
  if (!Number.isInteger(time) || time < 1 || time > 180) throw new Error('Time must be 1-180 minutes.');
  if (!Number.isInteger(maxViolations) || maxViolations < 1 || maxViolations > 20) throw new Error('Violations must be 1-20.');
  if (!questions.length) throw new Error('At least one question is required.');

  const cleaned = questions.map((q, i) => {
    const question = String(q.question || '').trim();
    const options = Array.isArray(q.options) ? q.options.map(x => String(x || '').trim()) : [];
    const answer = Number(q.answer);
    if (!question || options.length !== 4 || options.some(x => !x) || !Number.isInteger(answer) || answer < 0 || answer > 3) {
      throw new Error(`Invalid question ${i + 1}.`);
    }
    return { question, options, answer };
  });

  return { title, time, maxViolations, examMode, questions: cleaned, createdBy: adminId, isPublished: true, joinStartAt, joinEndAt, scheduledStartAt };
}

router.get('/public', async (req, res) => {
  try {
    const quizzes = await Quiz.find({ isPublished: true }).sort({ createdAt: -1 }).select('_id title time maxViolations examMode joinStartAt joinEndAt scheduledStartAt questions.question questions.options');
    res.json({ quizzes });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Could not load quizzes.' });
  }
});

router.get('/', requireAdmin, async (req, res) => {
  try {
    const quizzes = await Quiz.find().sort({ createdAt: -1 }).select('-questions.answer');
    res.json({ quizzes });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Could not load quizzes.' });
  }
});

router.get('/:id/admin', requireAdmin, async (req, res) => {
  try {
    const quiz = await Quiz.findById(req.params.id);
    if (!quiz) return res.status(404).json({ message: 'Quiz not found.' });
    res.json({ quiz });
  } catch {
    res.status(400).json({ message: 'Invalid quiz id.' });
  }
});

router.get('/:id/public', async (req, res) => {
  try {
    const quiz = await Quiz.findOne({ _id: req.params.id, isPublished: true }).select('_id title time maxViolations examMode joinStartAt joinEndAt scheduledStartAt questions.question questions.options');
    if (!quiz) return res.status(404).json({ message: 'Quiz not found.' });
    res.json({ quiz });
  } catch {
    res.status(400).json({ message: 'Invalid quiz id.' });
  }
});

router.post('/', requireAdmin, async (req, res) => {
  try {
    const quiz = await Quiz.create(normalizeQuiz(req.body, req.admin.id));
    res.status(201).json({ quiz });
  } catch (error) {
    console.error(error);
    res.status(400).json({ message: error.message || 'Could not create quiz.' });
  }
});

router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const data = normalizeQuiz(req.body, req.admin.id);
    const quiz = await Quiz.findByIdAndUpdate(req.params.id, data, { new: true, runValidators: true });
    if (!quiz) return res.status(404).json({ message: 'Quiz not found.' });
    res.json({ quiz });
  } catch (error) {
    console.error(error);
    res.status(400).json({ message: error.message || 'Could not update quiz.' });
  }
});

router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const quiz = await Quiz.findByIdAndDelete(req.params.id);
    if (!quiz) return res.status(404).json({ message: 'Quiz not found.' });
    res.json({ message: 'Quiz deleted.' });
  } catch {
    res.status(400).json({ message: 'Invalid quiz id.' });
  }
});

router.patch('/:id/publish', requireAdmin, async (req, res) => {
  try {
    const quiz = await Quiz.findByIdAndUpdate(req.params.id, { isPublished: Boolean(req.body.isPublished) }, { new: true });
    if (!quiz) return res.status(404).json({ message: 'Quiz not found.' });
    res.json({ quiz });
  } catch {
    res.status(400).json({ message: 'Invalid quiz id.' });
  }
});

module.exports = router;
