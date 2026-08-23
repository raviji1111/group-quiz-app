const express = require('express');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const Quiz = require('../models/Quiz');
const { requireAdmin } = require('../middleware/auth');
const { requirePlayer } = require('../middleware/playerAuth');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

function parseAnswerKey(text) {
  const source = String(text || '');
  const marker = source.match(/(?:answer\s*key|answers?|उत्तर\s*कुंजी|उत्तर\s*तालिका)/i);
  const region = marker ? source.slice(marker.index) : source;
  const key = {};
  const patterns = [
    /(?:^|[\s,;|])(?:Q\s*)?(\d{1,3})\s*[\.\):\-]?\s*\(?([ABCD])\)?/gi,
    /(?:^|[\s,;|])(\d{1,3})\s*[-:]\s*([ABCD])/gi
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(region))) {
      const n = Number(m[1]);
      if (n >= 1 && n <= 1000) key[n] = 'ABCD'.indexOf(m[2].toUpperCase());
    }
  }
  return key;
}

function parsePdfQuestions(text, suppliedAnswerKey = '') {
  const raw = String(text || '').replace(/\r/g, '').replace(/\u00a0/g, ' ');
  const lines = raw.split('\n').map(line => line.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const answerKey = parseAnswerKey(suppliedAnswerKey || raw);
  const items = [];
  let current = null;
  let option = null;

  const finish = () => {
    if (!current) return;
    const ok = current.question.trim() && current.options.every(Boolean);
    if (ok) {
      const answer = Number.isInteger(answerKey[current.number]) ? answerKey[current.number] : 0;
      items.push({
        question: current.question.trim(),
        options: current.options.map(x => x.trim()),
        answer
      });
    }
    current = null;
    option = null;
  };

  for (const originalLine of lines) {
    const line = originalLine.replace(/^\*+|\*+$/g, '').trim();

    // Do not accidentally append the answer-key section to the last option.
    if (/^(?:answer\s*key|answers?|उत्तर\s*कुंजी|उत्तर\s*तालिका)\b/i.test(line)) {
      finish();
      continue;
    }

    const qMatch = line.match(/^(?:Q(?:uestion)?\s*)?(\d{1,3})\s*[.)\-:]\s*(?:\*\*\d{1,3}\.?\*\*\s*)?(.+)$/i);
    const oMatch = line.match(/^(?:\[\s*([A-Da-d])\s*\]|([A-Da-d]))\s*[.)\-:]?\s*(.*)$/);

    if (qMatch) {
      finish();
      current = {
        number: Number(qMatch[1]),
        question: qMatch[2].trim(),
        options: ['', '', '', '']
      };
      option = null;
      continue;
    }

    if (oMatch) {
      if (!current) continue;
      option = 'ABCD'.indexOf((oMatch[1] || oMatch[2]).toUpperCase());
      if (option >= 0) current.options[option] = oMatch[3].trim();
      continue;
    }

    if (current) {
      if (option !== null) current.options[option] = `${current.options[option]} ${line}`.trim();
      else current.question = `${current.question} ${line}`.trim();
    }
  }
  finish();

  // Keep the answer-key matching count useful for the admin UI.
  const answerKeyMatched = items.reduce((n, q) => {
    const idx = items.indexOf(q) + 1;
    return n + (Number.isInteger(answerKey[q.number]) ? 1 : 0);
  }, 0);

  return { items: items.slice(0, 1000), answerKeyMatched };
}

router.post('/import-pdf', requireAdmin, upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'Please select a PDF file.' });
    if (req.file.mimetype !== 'application/pdf' && !req.file.originalname.toLowerCase().endsWith('.pdf')) return res.status(400).json({ message: 'Only PDF files are supported.' });

    const parsed = await pdfParse(req.file.buffer);
    const result = parsePdfQuestions(parsed.text, req.body?.answerKey || '');
    const questions = result.items;

    if (!questions.length) {
      return res.status(422).json({
        message: 'No A/B/C/D questions could be detected. This PDF may be image-only, or its options are not in a readable A/B/C/D text format.'
      });
    }

    res.json({
      questions,
      count: questions.length,
      pages: parsed.numpages || 0,
      answerKeyMatched: result.answerKeyMatched
    });
  } catch (error) {
    console.error(error);
    res.status(400).json({ message: 'Could not read this PDF.' });
  }
});


function normalizeQuiz(body, adminId) {
  const title = String(body.title || '').trim();
  const subject = String(body.subject || 'General').trim().slice(0, 80) || 'General';
  const topic = String(body.topic || 'General').trim().slice(0, 120) || 'General';
  const time = Number(body.time);
  const liveDuration = Number(body.liveDuration || 30);
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
  if (!Number.isInteger(liveDuration) || liveDuration < 1 || liveDuration > 180) throw new Error('Live duration must be 1-180 minutes.');
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

  return { title, subject, topic, time, liveDuration, maxViolations, examMode, questions: cleaned, createdBy: adminId, isPublished: true, joinStartAt, joinEndAt, scheduledStartAt, showLiveScore: body.showLiveScore !== false, showLeaderboard: body.showLeaderboard !== false };
}

router.get('/public', requirePlayer, async (req, res) => {
  try {
    const quizzes = await Quiz.find({ isPublished: true }).sort({ createdAt: -1 }).select('_id title subject topic time maxViolations examMode joinStartAt joinEndAt scheduledStartAt liveStatus liveStartedAt liveEndsAt showLiveScore showLeaderboard questions.question questions.options');
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

router.get('/:id/public', requirePlayer, async (req, res) => {
  try {
    const quiz = await Quiz.findOne({ _id: req.params.id, isPublished: true }).select('_id title subject topic time maxViolations examMode joinStartAt joinEndAt scheduledStartAt liveStatus liveStartedAt liveEndsAt showLiveScore showLeaderboard questions.question questions.options');
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

router.patch('/:id/questions/:index', requireAdmin, async (req, res) => {
  try {
    const index = Number(req.params.index);
    if (!Number.isInteger(index) || index < 0) return res.status(400).json({ message: 'Invalid question number.' });

    const question = String(req.body.question || '').trim();
    const options = Array.isArray(req.body.options) ? req.body.options.map(x => String(x || '').trim()) : [];
    const answer = Number(req.body.answer);
    if (!question || options.length !== 4 || options.some(x => !x) || !Number.isInteger(answer) || answer < 0 || answer > 3) {
      return res.status(400).json({ message: 'Invalid question data.' });
    }

    const quiz = await Quiz.findById(req.params.id);
    if (!quiz) return res.status(404).json({ message: 'Quiz not found.' });
    if (index >= quiz.questions.length) return res.status(404).json({ message: 'Question not found.' });

    quiz.questions[index] = { question, options, answer };
    await quiz.save();
    res.json({ question: quiz.questions[index] });
  } catch (error) {
    console.error(error);
    res.status(400).json({ message: error.message || 'Could not update question.' });
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
