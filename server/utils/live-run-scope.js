/**
 * Helpers for keeping LIVE admin/user data scoped to the currently launched
 * LIVE run. A saved quiz can be launched multiple times; old sessions from
 * earlier launches must not appear in the current LIVE board/export.
 */
function currentLiveRunFilter(quiz) {
  const filter = { quiz: quiz._id };
  if (quiz.liveLaunchAt) filter.joinedAt = { $gte: new Date(quiz.liveLaunchAt) };
  return filter;
}

module.exports = { currentLiveRunFilter };
