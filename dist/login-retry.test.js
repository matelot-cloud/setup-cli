"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const node_child_process_1 = require("node:child_process");
const node_util_1 = require("node:util");
const node_path_1 = require("node:path");
const node_fs_1 = require("node:fs");
const node_os_1 = require("node:os");
const login_1 = require("./login");
const run = (0, node_util_1.promisify)(node_child_process_1.execFile);
const res = (status, body, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
(0, node_test_1.test)('OAuth calls wait for Retry-After on 429 (≤ 60 s, at most 3 retries)', async () => {
    const waits = [];
    let n = 0;
    const f = (0, login_1.retryingFetch)((async () => (++n <= 2 ? res(429, { message: 'Too Many Requests' }, { 'retry-after': '7' }) : res(200, { access_token: 'a' }))), async (ms) => { waits.push(ms); });
    const r = await f('https://cell/api/v1/oauth/token', { method: 'POST' });
    strict_1.default.equal(r.status, 200);
    strict_1.default.deepEqual(waits, [7000, 7000]);
    let m = 0;
    const always = (0, login_1.retryingFetch)((async () => { m++; return res(429, {}, { 'retry-after': '1' }); }), async () => undefined);
    strict_1.default.equal((await always('x')).status, 429);
    strict_1.default.equal(m, 4); // first try + 3 retries
    let k = 0;
    const tooLong = (0, login_1.retryingFetch)((async () => { k++; return res(429, {}, { 'retry-after': '120' }); }), async () => undefined);
    strict_1.default.equal((await tooLong('x')).status, 429);
    strict_1.default.equal(k, 1); // > 60 s: give up at once
});
(0, node_test_1.test)('token refresh retries a 429 instead of failing the command', async () => {
    const dir = (0, node_fs_1.mkdtempSync)((0, node_path_1.join)((0, node_os_1.tmpdir)(), 'matelot-'));
    const file = (0, node_path_1.join)(dir, 'credentials.json');
    (0, node_fs_1.writeFileSync)(file, JSON.stringify({ 'https://cell.example': { url: 'https://cell.example', accessToken: 'old', refreshToken: 'r1', expiresAt: new Date(Date.now() - 1000).toISOString(), scope: 'write' } }));
    const prev = process.env.MATELOT_CREDENTIALS;
    process.env.MATELOT_CREDENTIALS = file;
    let tokenCalls = 0;
    const f = (async (u) => {
        if (String(u).endsWith('/.well-known/oauth-authorization-server'))
            return res(200, { authorization_endpoint: 'https://cell.example/oauth/authorize', token_endpoint: 'https://cell.example/api/v1/oauth/token' });
        tokenCalls++;
        return tokenCalls === 1 ? res(429, { message: 'Too Many Requests' }, { 'retry-after': '2' }) : res(200, { access_token: 'new', refresh_token: 'r2', expires_in: 3600, scope: 'write' });
    });
    try {
        strict_1.default.equal(await (0, login_1.freshToken)('https://cell.example', f, async () => undefined), 'new');
        strict_1.default.equal(tokenCalls, 2);
    }
    finally {
        if (prev === undefined)
            delete process.env.MATELOT_CREDENTIALS;
        else
            process.env.MATELOT_CREDENTIALS = prev;
    }
});
(0, node_test_1.test)('API unreachable: `matelot usage` reports the connection problem, not "--org is required"', async () => {
    const env = { ...process.env, MATELOT_URL: 'http://127.0.0.1:1', MATELOT_TOKEN: 'spt_test', MATELOT_CREDENTIALS: '/nonexistent' };
    await strict_1.default.rejects(run('node', [(0, node_path_1.join)(__dirname, 'index.js'), 'usage'], { env }), (e) => {
        strict_1.default.match(e.stderr, /cannot reach http:\/\/127\.0\.0\.1:1/);
        strict_1.default.doesNotMatch(e.stderr, /--org is required/);
        return true;
    });
});
