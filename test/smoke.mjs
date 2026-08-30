/**
 * Smoke tests for @boostgpt/router 1.1.0.
 *
 * Covers the three faults that made 1.0.0 unusable: adapters that could not be
 * constructed the documented way, a default message path that looped forever,
 * and a retry branch calling an undefined `sleep`.
 */
import assert from 'node:assert/strict';
import { Router, BaseAdapter, TelegramAdapter, WhatsAppAdapter } from '../src/index.js';

let failures = 0;
const test = async (name, fn) => {
  try {
    await fn();
    console.log(`  ok   ${name}`);
  } catch (err) {
    failures++;
    console.log(`  FAIL ${name}\n       ${err.message}`);
  }
};

// A BoostGPT stand-in that counts calls, so a runaway loop is measurable.
const stubClient = ({ replies = [], failTimes = 0 } = {}) => {
  const client = {
    calls: 0,
    payloads: [],
    project_id: 'proj-1',
    async chat(payload) {
      client.calls++;
      client.payloads.push(payload);
      if (client.calls <= failTimes) throw new Error('upstream boom');
      return { err: null, response: { chat: { reply: replies.shift() ?? 'pong' } } };
    }
  };
  return client;
};

const withTimeout = (promise, ms, label) =>
  Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} did not settle in ${ms}ms`)), ms))
  ]);

console.log('\n@boostgpt/router smoke tests\n');

// The exact README shape. In 1.0.0 this threw 'BoostGPT instance is required'.
await test('adapters construct without boostgpt (README shape)', async () => {
  const adapter = new TelegramAdapter({ telegramToken: 'tok' });
  assert.equal(adapter.channelName, 'telegram');
  assert.equal(adapter.boostgpt, null);
});

await test('Router injects boostgpt and defaultBotId into adapters', async () => {
  const router = new Router({
    apiKey: 'k', projectId: 'p', defaultBotId: 'bot-1',
    adapters: [new TelegramAdapter({ telegramToken: 'tok' })],
    enableLogging: false
  });
  const adapter = router.getAdapter('telegram');
  assert.ok(adapter.boostgpt, 'boostgpt was not injected');
  assert.equal(adapter.botId, 'bot-1');
});

await test('start() names what a misconfigured adapter is missing', async () => {
  const router = new Router({
    apiKey: 'k', projectId: 'p',            // no defaultBotId
    adapters: [new TelegramAdapter({ telegramToken: 'tok' })],
    enableLogging: false
  });
  await assert.rejects(() => router.start(), /telegram adapter is missing: botId/);
});

// 1.0.0 called chat() forever: no break on success, attempts never incremented.
await test('one message produces exactly one chat() call', async () => {
  const adapter = new BaseAdapter({ boostgpt: stubClient(), botId: 'b', channelName: 'test', enableLogging: false });
  const reply = await withTimeout(adapter.processMessage('hi', 'chat-1'), 2000, 'processMessage');
  assert.equal(reply, 'pong');
  assert.equal(adapter.boostgpt.calls, 1, `chat() ran ${adapter.boostgpt.calls} times`);
});

// 1.0.0 hit `ReferenceError: sleep is not defined` on the first failure.
await test('retries a failing call, then succeeds', async () => {
  const client = stubClient({ failTimes: 2 });
  const adapter = new BaseAdapter({ boostgpt: client, botId: 'b', channelName: 'test', enableLogging: false });
  const reply = await withTimeout(adapter.processMessage('hi', 'chat-1'), 8000, 'retry');
  assert.equal(reply, 'pong');
  assert.equal(client.calls, 3);
});

await test('propagates the original error after exhausting retries', async () => {
  const client = stubClient({ failTimes: 99 });
  const adapter = new BaseAdapter({ boostgpt: client, botId: 'b', channelName: 'test', enableLogging: false });
  await assert.rejects(() => adapter.processMessage('hi', 'chat-1'), /upstream boom/);
  assert.equal(client.calls, 3);
});

await test('payload drops vector/channel and forwards reasoning_mode', async () => {
  const client = stubClient();
  const adapter = new BaseAdapter({
    boostgpt: client, botId: 'b', channelName: 'test',
    reasoningMode: 'agent', memory: false, enableLogging: false
  });
  await adapter.processMessage('hi', 'chat-1');
  const [payload] = client.payloads;
  assert.equal(payload.vector, undefined, 'stale vector key still sent');
  assert.equal(payload.channel, undefined, 'stale channel key still sent');
  assert.equal(payload.reasoning_mode, 'agent');
  assert.equal(payload.memory, false);
  assert.equal(payload.chat_id, 'chat-1');
});

// 1.0.0 gave late-added adapters the unwrapped handler, losing router context.
await test('addAdapter wraps the handler like onMessage does', async () => {
  const router = new Router({
    apiKey: 'k', projectId: 'p', defaultBotId: 'bot-1', adapters: [], enableLogging: false
  });
  let seen = null;
  router.onMessage(async (message, context) => { seen = context; return 'ok'; });
  router.addAdapter(new TelegramAdapter({ telegramToken: 'tok' }));

  const adapter = router.getAdapter('telegram');
  await adapter.handleMessage({ content: 'hi', userId: 'u1' }, {});
  assert.ok(seen, 'handler never ran');
  assert.ok(seen.router, 'router missing from context');
  assert.ok(seen.boostgpt, 'boostgpt missing from context');
});

await test('getStatus reads project_id from the 7.x client shape', async () => {
  const router = new Router({ apiKey: 'k', projectId: 'proj-1', adapters: [], enableLogging: false });
  assert.equal(router.getStatus().projectId, 'proj-1');
});

// Optional peers: importing the package must not require every channel SDK.
await test('package imports without every channel SDK installed', async () => {
  assert.ok(WhatsAppAdapter, 'WhatsAppAdapter export missing');
  const adapter = new WhatsAppAdapter({ botId: 'b', boostgpt: stubClient() });
  assert.equal(adapter.client, null, 'client should not exist before start()');
});

// Both shipped examples document "return null and BoostGPT handles it". 1.0.0
// returned the null straight through, so the adapter sent an empty message.
await test('a handler returning null falls through to BoostGPT', async () => {
  const client = stubClient({ replies: ['from boostgpt'] });
  const adapter = new BaseAdapter({ boostgpt: client, botId: 'b', channelName: 'test', enableLogging: false });
  adapter.setMessageHandler(async () => null);

  const reply = await adapter.handleMessage({ content: 'hi', userId: 'u1' }, {});
  assert.equal(reply, 'from boostgpt');
  assert.equal(client.calls, 1);
});

await test('a handler returning a string short-circuits BoostGPT', async () => {
  const client = stubClient();
  const adapter = new BaseAdapter({ boostgpt: client, botId: 'b', channelName: 'test', enableLogging: false });
  adapter.setMessageHandler(async () => 'handled locally');

  const reply = await adapter.handleMessage({ content: '/ping', userId: 'u1' }, {});
  assert.equal(reply, 'handled locally');
  assert.equal(client.calls, 0, 'BoostGPT should not have been called');
});

// Each adapter destructures specific names out of a CommonJS SDK. Node exposes
// some as real named exports and leaves others only on `default`, so this
// asserts the loader's flattening covers exactly what the adapters take. A
// regression here would only show up at start(), in production.
await test('channel SDK interop: every name an adapter destructures resolves', async () => {
  const probe = new BaseAdapter({ channelName: 'probe', enableLogging: false });
  const required = {
    '@slack/bolt': ['App'],
    'discord.js': ['Client', 'GatewayIntentBits', 'Partials'],
    'whatsapp-web.js': ['Client', 'LocalAuth'],
    'node-telegram-bot-api': ['default'],
    'crisp-api': ['default'],
    'qrcode-terminal': ['default']
  };

  for (const [specifier, names] of Object.entries(required)) {
    let mod;
    try {
      mod = await probe.loadChannelModule(specifier);
    } catch {
      continue; // optional peer not installed here; nothing to check
    }
    const missing = names.filter((n) => mod[n] === undefined);
    assert.deepEqual(missing, [], `${specifier} is missing ${missing.join(', ')}`);
  }
});

await test('a missing channel SDK names the install command', async () => {
  const probe = new BaseAdapter({ channelName: 'probe', enableLogging: false });
  await assert.rejects(
    () => probe.loadChannelModule('not-a-real-package-xyz'),
    /npm install not-a-real-package-xyz/
  );
});

console.log(failures ? `\n${failures} failing\n` : '\nall passing\n');
process.exit(failures ? 1 : 0);
