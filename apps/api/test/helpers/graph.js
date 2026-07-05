// ============================================================
//  Fake Microsoft Graph client for service-layer tests.
//  Installs a stub in place of src/graph BEFORE the service under test is
//  required, so sync/reminders/sharepoint run their real logic + real SQL but
//  never touch the network. Responses are driven by mutable handlers the test
//  sets per-case with setGraphHandlers().
// ============================================================
let handlers = { onGet: () => ({}), onPost: () => ({}) };

function setGraphHandlers(h) { handlers = { onGet: () => ({}), onPost: () => ({}), ...h }; }

// Fluent stub mirroring the Graph SDK surface the services use.
function chainFor(path) {
  const chain = {};
  for (const m of ['select', 'expand', 'top', 'filter', 'orderby', 'header', 'version']) chain[m] = () => chain;
  chain.get = async () => handlers.onGet(path);
  chain.post = async (body) => handlers.onPost(path, body);
  return chain;
}

// Replace the cached src/graph module. Call once, before requiring services.
function installFakeGraph() {
  const graphPath = require.resolve('../../src/graph');
  require.cache[graphPath] = {
    id: graphPath, filename: graphPath, loaded: true, exports: { api: (p) => chainFor(p) },
  };
}

module.exports = { installFakeGraph, setGraphHandlers };
