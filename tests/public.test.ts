import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { onRequest } from '../functions/api/public.ts';

test('public articles cannot be overwritten or removed by another account', async () => {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
  sqlite.exec(`INSERT INTO users VALUES ('a','Alice','hash','salt',CURRENT_TIMESTAMP),('b','Bob','hash','salt',CURRENT_TIMESTAMP);
    INSERT INTO sessions VALUES ('alice','a','2099-01-01',CURRENT_TIMESTAMP),('bob','b','2099-01-01',CURRENT_TIMESTAMP),('expired','a','2000-01-01',CURRENT_TIMESTAMP);
    INSERT INTO articles_sync(user_id,data) VALUES ('a','[{"title":"PRIVATE_SENTINEL"}]');`);
  const DB = { prepare(sql: string) {
    const stmt = sqlite.prepare(sql);
    let values: (string | number)[] = [];
    return { bind(...args: (string | number)[]) { values = args; return this; },
      async first() { return stmt.get(...values) ?? null; },
      async all() { return { results: stmt.all(...values) }; },
      async run() { const result = stmt.run(...values); return { meta: { changes: Number(result.changes) } }; } };
  } };
  const call = (method: string, token?: string, body?: unknown, query = '') => onRequest({ request: new Request('https://example.test/api/public' + query, { method, headers: token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined }), env: { DB } } as never);
  const article = { id: 'article-1', username: 'Forged', title: '数学', category: ['１年', '数学１'], content: '素因数分解', images: [] };
  assert.equal((await call('POST', 'alice', article)).status, 200);
  assert.equal((await call('POST', 'bob', { ...article, content: 'changed' })).status, 403);
  assert.equal((await call('DELETE', 'bob', undefined, '?id=article-1')).status, 404);
  const response = await call('GET');
  const feed = await response.json();
  assert.equal(feed.length, 1);
  assert.ok(!JSON.stringify(feed).includes('PRIVATE_SENTINEL'));
  assert.equal(feed[0].content, '素因数分解');
  assert.equal(feed[0].username, 'Alice');
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal((await call('POST', undefined, article)).status, 401);
  assert.equal((await call('POST', 'expired', article)).status, 401);
  assert.equal((await call('POST', 'alice', { ...article, content: '更新した素因数分解' })).status, 200);
  assert.equal((await (await call('GET')).json())[0].content, '更新した素因数分解');
  assert.equal((await call('POST', 'alice', { ...article, category: 'invalid' })).status, 400);
  assert.equal((await call('DELETE', 'alice', undefined, '?id=article-1')).status, 200);
  assert.deepEqual(await (await call('GET')).json(), []);
  sqlite.close();
});
