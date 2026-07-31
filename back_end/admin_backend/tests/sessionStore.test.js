const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const tempStorePath = path.join(__dirname, 'tmp-session-store.json');

function clearModuleCache() {
  const modulePath = require.resolve('../../shared/sessionStore');
  delete require.cache[modulePath];
}

test('session store reloads existing sessions from disk', async () => {
  process.env.SESSION_STORE_PATH = tempStorePath;
  fs.rmSync(tempStorePath, { force: true });
  clearModuleCache();

  const firstStore = require('../../shared/sessionStore');
  const session = firstStore.createSession({ id: 'admin-1', role: 'admin', permissions: ['settings.view'] }, { rememberMe: false });

  assert.ok(session.token);
  assert.equal(firstStore.getActiveSession(session.token)?.session.userId, 'admin-1');

  clearModuleCache();
  const secondStore = require('../../shared/sessionStore');
  const reloadedSession = secondStore.getActiveSession(session.token);

  assert.ok(reloadedSession);
  assert.equal(reloadedSession.session.userId, 'admin-1');
  assert.deepEqual(reloadedSession.user.permissions, ['settings.view']);

  fs.rmSync(tempStorePath, { force: true });
  delete process.env.SESSION_STORE_PATH;
});
