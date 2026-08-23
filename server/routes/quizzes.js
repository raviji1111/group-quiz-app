const express = require('express');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const Quiz = require('../models/Quiz');
const { requireAdmin } = require('../middleware/auth');
const { optionalPlayer, requirePlayer } = require('../middleware/playerAuth');

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

// Keep bilingual questions in the same visual order as the source PDF:
// English question first, Hindi question immediately below it.  pdf-parse can
// sometimes return both languages on one physical line, so split at the first
// Devanagari character instead of storing the two languages as one sentence.
function splitBilingualLine(line) {
  const value = String(line || '').trim();
  const match = value.match(/[\u0900-\u097F]/);
  if (!match) return [value];
  const at = match.index;
  if (at <= 0) return [value];
  const english = value.slice(0, at).trim();
  const hindi = value.slice(at).trim();
  return english && hindi ? [english, hindi] : [value];
}

function appendQuestionLine(existing, line) {
  const parts = splitBilingualLine(line);
  const nonEmpty = parts.filter(Boolean);
  if (!nonEmpty.length) return existing;
  const incomingHasHindi = nonEmpty.some(part => /[\u0900-\u097F]/.test(part));
  const existingHasHindi = /[\u0900-\u097F]/.test(existing);
  // A language switch means the next language belongs on the next line.
  const separator = existing && incomingHasHindi !== existingHasHindi ? '\n' : ' ';
  return existing ? `${existing}${separator}${nonEmpty.join(' ')}`.trim() : nonEmpty.join(' ').trim();
}

function parsePdfQuestions(text, suppliedAnswerKey = '', selection = {}) {
  const raw = String(text || '').replace(/\r/g, '').replace(/\u00a0/g, ' ');
  const lines = raw.split('\n').map(line => line.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const answerKey = parseAnswerKey(suppliedAnswerKey || raw);
  const items = [];
  let current = null;
  let option = null;

  const finish = () => {
    if (!current) return;
    const questionText = current.question.trim();
    const ok = questionText && current.options.every(Boolean);
    if (ok) {
      const answer = Number.isInteger(answerKey[current.number]) ? answerKey[current.number] : 0;
      items.push({
        number: current.number,
        question: questionText,
        options: current.options.map(x => x.trim()),
        answer
      });
    }
    current = null;
    option = null;
  };

  // A PDF often puts A/B on the same line (and C/D on the next line).
  // Split every option marker instead of assuming one option per line.
  const optionParts = (line) => {
    const re = /(?:^|\s)(?:\[\s*([A-Da-d])\s*\]|([A-Da-d])\s*[.)\-:])\s*/g;
    const matches = [];
    let m;
    while ((m = re.exec(line))) {
      matches.push({ index: m.index, end: re.lastIndex, letter: (m[1] || m[2]).toUpperCase() });
    }
    if (!matches.length) return null;
    return matches.map((m, i) => ({
      letter: m.letter,
      text: line.slice(m.end, i + 1 < matches.length ? matches[i + 1].index : line.length).trim()
    }));
  };

  for (const originalLine of lines) {
    const line = originalLine.replace(/^\*+|\*+$/g, '').trim();

    if (/^(?:answer\s*key|answers?|उत्तर\s*कुंजी|उत्तर\s*तालिका)\b/i.test(line)) {
      finish();
      continue;
    }
    if (/^BY\s+Gagan\s+Pratap$/i.test(line)) continue;

    // Accept both `7. Question` and a question number on its own line.
    const qMatch = line.match(/^(?:Q(?:uestion)?\s*)?(\d{1,3})\s*[.)\-:]\s+(?:\*\*\d{1,3}\.?\*\*\s*)?(.*)$/i);
    if (qMatch) {
      finish();
      current = {
        number: Number(qMatch[1]),
        question: splitBilingualLine(qMatch[2].trim()).join('\n'),
        options: ['', '', '', '']
      };
      option = null;
      continue;
    }

    if (!current) continue;

    const parts = optionParts(line);
    if (parts) {
      for (const part of parts) {
        const idx = 'ABCD'.indexOf(part.letter);
        if (idx < 0) continue;
        option = idx;
        if (part.text) current.options[idx] = `${current.options[idx]} ${part.text}`.trim();
      }
      continue;
    }

    // Preserve both English and Hindi lines. If we are inside an option, append
    // to that option; otherwise append to the question text.
    if (option !== null) current.options[option] = `${current.options[option]} ${line}`.trim();
    else current.question = appendQuestionLine(current.question, line);
  }
  finish();

  const normalizedSelection = selection || {};
  const mode = String(normalizedSelection.mode || 'all');
  let selected = items;
  if (mode === 'first') {
    const count = Math.max(1, Math.min(items.length, Number(normalizedSelection.count) || items.length));
    selected = items.slice(0, count);
  } else if (mode === 'range') {
    const start = Math.max(1, Number(normalizedSelection.start) || 1);
    const end = Math.max(start, Number(normalizedSelection.end) || items.length);
    selected = items.filter(q => q.number >= start && q.number <= end);
  }

  const answerKeyMatched = selected.reduce((n, q) => n + (Number.isInteger(answerKey[q.number]) ? 1 : 0), 0);
  return { items: selected.slice(0, 1000), totalDetected: items.length, answerKeyMatched };
}

router.post('/import-pdf', requireAdmin, upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'Please select a PDF file.' });
    if (req.file.mimetype !== 'application/pdf' && !req.file.originalname.toLowerCase().endsWith('.pdf')) return res.status(400).json({ message: 'Only PDF files are supported.' });

    const parsed = await pdfParse(req.file.buffer);
    const result = parsePdfQuestions(parsed.text, req.body?.answerKey || '', {
      mode: req.body?.importMode || 'all',
      count: req.body?.questionCount,
      start: req.body?.startQuestion,
      end: req.body?.endQuestion
    });
    const questions = result.items;

    if (!questions.length) {
      return res.status(422).json({
        message: 'No A/B/C/D questions could be detected. This PDF may be image-only, or its options are not in a readable A/B/C/D text format.'
      });
    }

    res.json({
      questions,
      count: questions.length,
      totalDetected: result.totalDetected,
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

router.get('/public', optionalPlayer, async (req, res) => {
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
