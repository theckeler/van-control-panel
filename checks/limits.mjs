// The most each of these may reach before checks/cost.mjs stops a change.
// Raising a limit is Todd's call.
//
// On 2026-11-27: about 178 KB of JavaScript and 5 KB of CSS (both compressed),
// and 11 requests in each 5-second dashboard update.
//
// A limit set to null reports its number but never stops a change.
export const LIMITS = {
  javascriptKb: 200,
  cssKb: 8,
  pollRequests: 11,
};
