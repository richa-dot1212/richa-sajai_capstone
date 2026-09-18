// Loads the custom Recipe Budget Skill from PR 1 so its guidance can be
// injected as the system instruction for the per-ingredient substitute-vs-
// buy reasoning step. This is what makes the agent "actually use the Skill"
// rather than re-deriving the same guidance ad hoc in a prompt.
const fs = require('fs');
const path = require('path');

const SKILL_PATH = path.join(__dirname, '..', '.claude', 'skills', 'recipe-budget-agent', 'SKILL.md');

let cached = null;

function loadSkill() {
  if (!cached) {
    cached = fs.readFileSync(SKILL_PATH, 'utf8');
  }
  return cached;
}

module.exports = { loadSkill };
