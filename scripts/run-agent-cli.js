require('../agent/env').loadEnv();
const { runWorkflow } = require('../agent/workflow');

const input = {
  recipeUrl: process.argv[2] || 'https://sallysbakingaddiction.com/chewy-chocolate-chip-cookies/#tasty-recipes-70437',
  ownedIngredients: (process.argv[3] || 'flour,sugar,eggs,vanilla extract').split(',').map((s) => s.trim()),
  servingSize: Number(process.argv[4]) || 24,
  requestedChanges: process.argv[5] || '',
  budget: Number(process.argv[6]) || 150,
};

console.log('Input:', input);

(async () => {
  const { emitter, promise } = runWorkflow(input);
  emitter.on('progress', (e) => {
    console.log(`[${e.phase.toUpperCase()}] ${e.message}`);
  });
  try {
    const result = await promise;
    console.log('\n=== DONE ===');
    console.log('Saved to:', result.savedPath);
  } catch (err) {
    console.error('\n=== FAILED ===');
    console.error(err);
    process.exitCode = 1;
  }
})();
