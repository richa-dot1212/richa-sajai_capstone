require('../agent/env').loadEnv();
const { runWorkflow } = require('../agent/workflow');

const input = {
  recipeUrl: process.argv[2] || 'https://sallysbakingaddiction.com/chewy-chocolate-chip-cookies/#tasty-recipes-70437',
  missingIngredients: (process.argv[3] || 'baking soda').split(',').map((s) => s.trim()),
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
  emitter.on('stage', (key) => {
    console.log(`\n=== STAGE: ${key} ===`);
  });
  try {
    const result = await promise;
    console.log('\n=== DONE ===');
    console.log('Saved to:', result.savedPath);
    console.log('Summary:', JSON.stringify(result.summary, null, 2));
  } catch (err) {
    console.error('\n=== FAILED ===');
    console.error(err.message);
    process.exitCode = 1;
  }
})();
