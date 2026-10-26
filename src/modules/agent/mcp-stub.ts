// Build-time stub for the MCP SDK's OAuth helper on Cloudflare Workers.
// See the alias in vite.config.ts: this app registers no MCP servers, so the
// code path importing it is unreachable — but the bundler still has to resolve
// the specifier, and pkce-challenge ships no workerd export condition.
function unavailable(): never {
  throw new Error(
    'MCP support was stubbed out of the Cloudflare Workers build (its OAuth ' +
      'helper has no workerd build). This app configures no MCP servers; if ' +
      'you need them, run the agent on a Node host instead.'
  );
}

export default unavailable;
export const generateChallenge = unavailable;
export const verifyChallenge = unavailable;
