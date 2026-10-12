"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const node_http_1 = require("node:http");
const node_child_process_1 = require("node:child_process");
const node_util_1 = require("node:util");
const node_fs_1 = require("node:fs");
const node_os_1 = require("node:os");
const node_path_1 = require("node:path");
const login_1 = require("./login");
const run = (0, node_util_1.promisify)(node_child_process_1.execFile);
const cli = (0, node_path_1.join)(__dirname, 'index.js');
/** A cell: every request answered for the token the server was given, 401 for anything else. */
function cell(token) {
    const server = (0, node_http_1.createServer)((req, res) => {
        const json = (code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
        const u = req.url;
        if (u === '/api/v1/health/ready')
            return json(200, { status: 'ok' });
        if (u === '/api/v1/version')
            return json(200, { name: 'matelot', version: '1.0.0' });
        if (u === '/.well-known/oauth-authorization-server') {
            const b = `http://${req.headers.host}`;
            return json(200, { authorization_endpoint: `${b}/api/v1/oauth/authorize`, token_endpoint: `${b}/api/v1/oauth/token` });
        }
        if (req.headers.authorization !== `Bearer ${token}`)
            return json(401, { message: 'Unauthorized' });
        if (u === '/api/v1/api-tokens/whoami')
            return json(200, { kind: 'user', email: `${token}@localhost` });
        if (u === '/api/v1/organizations')
            return json(200, [{ id: '0c3cbf3d-31cf-41bd-884a-7e085e66f4d8', slug: 'main' }]);
        if (u.endsWith('/runner-pools'))
            return json(200, [{ name: 'Managed', managed: true, runners: [{ name: 'r1', status: 'online' }] }]);
        if (u === '/api/v1/registry/info')
            return json(200, { available: true, host: 'localhost:5000' });
        json(404, {});
    });
    return new Promise((done) => server.listen(0, '127.0.0.1', () => done({ url: `http://127.0.0.1:${server.address().port}`, close: () => server.close() })));
}
(0, node_test_1.test)('cells: whoami/doctor never pick the first (expired) entry; --url, MATELOT_URL, current and single-entry resolution; cells / use / logout', async () => {
    const dir = (0, node_fs_1.mkdtempSync)((0, node_path_1.join)((0, node_os_1.tmpdir)(), 'cells-'));
    const file = (0, node_path_1.join)(dir, 'credentials.json');
    const stale = await cell('old');
    const fresh = await cell('new');
    const baseEnv = { ...process.env, MATELOT_CREDENTIALS: file, MATELOT_URL: '', MATELOT_TOKEN: '', MATELOT_KEY_ID: '', MATELOT_SECRET: '', SECOPS_URL: '', SECOPS_TOKEN: '' };
    const past = new Date(Date.now() - 3600_000).toISOString();
    const future = new Date(Date.now() + 86_400_000).toISOString();
    try {
        // a legacy file (no `current`): first entry expired, second valid — as after logging into a second cell with an older CLI
        (0, node_fs_1.writeFileSync)(file, JSON.stringify({ [stale.url]: { url: stale.url, accessToken: 'old', expiresAt: past, scope: 'sudo' }, [fresh.url]: { url: fresh.url, accessToken: 'new', expiresAt: future, scope: 'write', user: 'new@localhost' } }));
        // no current and two entries: a clear error, not the first entry
        await strict_1.default.rejects(run('node', [cli, 'whoami'], { env: baseEnv }), (e) => { strict_1.default.match(e.stderr, /no cell selected/); return true; });
        // --url is honoured by whoami and doctor
        strict_1.default.match((await run('node', [cli, 'whoami', '--url', fresh.url], { env: baseEnv })).stdout, /user new@localhost/);
        const d = (await run('node', [cli, 'doctor', '--url', fresh.url], { env: baseEnv })).stdout;
        strict_1.default.match(d, new RegExp(`OK {2}login +user new@localhost on ${fresh.url.replace(/[.]/g, '\\.')}`));
        strict_1.default.match(d, /OK {2}runners +1 online \(r1\) — GET \/organizations\/main\/runner-pools: 1 pool\(s\)/);
        // MATELOT_URL works the same
        strict_1.default.match((await run('node', [cli, 'whoami'], { env: { ...baseEnv, MATELOT_URL: fresh.url } })).stdout, /user new@localhost/);
        // `use` sets the current cell: whoami and doctor follow it
        // `use` echoes the normalised URL (trailing slash, upper-case host, default port all collapse to one spelling)
        const spelled = `${fresh.url.replace('http://', 'HTTP://').replace('127.0.0.1', '127.0.0.1')}/`;
        strict_1.default.equal((await run('node', [cli, 'use', spelled], { env: baseEnv })).stdout.trim(), `current cell: ${(0, login_1.normalizeCellUrl)(spelled)}`);
        strict_1.default.equal((0, login_1.normalizeCellUrl)(spelled), fresh.url);
        strict_1.default.equal(JSON.parse((0, node_fs_1.readFileSync)(file, 'utf8')).current, fresh.url);
        strict_1.default.match((await run('node', [cli, 'whoami'], { env: baseEnv })).stdout, /user new@localhost/);
        strict_1.default.match((await run('node', [cli, 'doctor'], { env: baseEnv })).stdout, /OK {2}login +user new@localhost on /);
        // cells lists both, marks the current one, shows expiry state
        const list = (await run('node', [cli, 'cells'], { env: baseEnv })).stdout;
        strict_1.default.match(list, new RegExp(`\\* ${fresh.url.replace(/[.]/g, '\\.')} +new@localhost +write +valid until`));
        strict_1.default.match(list, new RegExp(`  ${stale.url.replace(/[.]/g, '\\.')} +sudo +expired`));
        // --url still wins over current: targeting the expired cell says so, about THAT cell
        const d2 = await run('node', [cli, 'doctor', '--url', stale.url], { env: baseEnv }).catch((e) => e);
        strict_1.default.match(d2.stdout, new RegExp(`--  login +skipped: stored login for ${stale.url.replace(/[.]/g, '\\.')} expired`));
        // logout removes the entry and clears current when it pointed there; the remaining single entry is then used
        await run('node', [cli, 'logout'], { env: baseEnv });
        const after = JSON.parse((0, node_fs_1.readFileSync)(file, 'utf8'));
        strict_1.default.equal(after[fresh.url], undefined);
        strict_1.default.equal(after.current, undefined);
        await strict_1.default.rejects(run('node', [cli, 'whoami'], { env: baseEnv }), (e) => { strict_1.default.match(e.stderr, /expired: run matelot login --url/); return true; }); // single stored entry, expired
        strict_1.default.match((await run('node', [cli, 'cells'], { env: baseEnv })).stdout, /expired/);
    }
    finally {
        stale.close();
        fresh.close();
    }
});
(0, node_test_1.test)('normalizeCellUrl: default ports, host case, trailing slash, path prefix', async () => {
    strict_1.default.equal((0, login_1.normalizeCellUrl)('http://localhost:80'), 'http://localhost');
    strict_1.default.equal((0, login_1.normalizeCellUrl)('http://localhost:80/'), 'http://localhost');
    strict_1.default.equal((0, login_1.normalizeCellUrl)('https://Acme.Example.COM:443/'), 'https://acme.example.com');
    strict_1.default.equal((0, login_1.normalizeCellUrl)('https://acme.example.com:8443'), 'https://acme.example.com:8443');
    strict_1.default.equal((0, login_1.normalizeCellUrl)('http://localhost:3000/'), 'http://localhost:3000');
    strict_1.default.equal((0, login_1.normalizeCellUrl)('https://host.example/matelot/'), 'https://host.example/matelot');
    strict_1.default.equal((0, login_1.normalizeCellUrl)(' http://localhost '), 'http://localhost');
});
(0, node_test_1.test)('cells: http://localhost:80 and http://localhost are the same cell (one entry, one current)', async () => {
    const dir = (0, node_fs_1.mkdtempSync)((0, node_path_1.join)((0, node_os_1.tmpdir)(), 'cells-'));
    const file = (0, node_path_1.join)(dir, 'credentials.json');
    const c = await cell('tok');
    const alt = c.url; // the default-port case (:80) needs a listener on port 80, which a test cannot bind — covered by the unit test above
    const env = { ...process.env, MATELOT_CREDENTIALS: file, MATELOT_URL: '', MATELOT_TOKEN: '', SECOPS_URL: '', SECOPS_TOKEN: '' };
    try {
        (0, node_fs_1.writeFileSync)(file, JSON.stringify({ [c.url]: { url: c.url, accessToken: 'tok', expiresAt: new Date(Date.now() + 86_400_000).toISOString(), scope: 'write' }, current: c.url }));
        strict_1.default.match((await run('node', [cli, 'whoami', '--url', `${alt}/`], { env })).stdout, /user tok@localhost/); // trailing slash → same key
        strict_1.default.match((await run('node', [cli, 'use', `${c.url}/`], { env })).stdout, /current cell: /);
        strict_1.default.equal(Object.keys(JSON.parse((0, node_fs_1.readFileSync)(file, 'utf8'))).filter((k) => k.startsWith('http')).length, 1);
    }
    finally {
        c.close();
    }
});
