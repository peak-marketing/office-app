// Explicit real-public-image flow. No OpenAI/paid API request; requires isolated B/DB/P variables.
process.env.LIVE_APARTMENT='1';
require('../e2e/apartment.cjs');
