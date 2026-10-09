'use strict';
function validIsoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}
function validateAnswers(answers, questionCount) {
  if (!Array.isArray(answers) || !Number.isInteger(questionCount) || questionCount < 1 || answers.length > questionCount) return false;
  return answers.every(a => Number.isInteger(a) && (a === -1 || (a >= 0 && a <= 3)));
}
function safeRegex(value = '') { return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
module.exports = { validIsoDate, validateAnswers, safeRegex };
