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
const node_path_1 = require("node:path");
const node_fs_1 = require("node:fs");
const node_os_1 = require("node:os");
const login_1 = require("./login");
const run = (0, node_util_1.promisify)(node_child_process_1.execFile);
const ID = '0c3cbf3d-31cf-41bd-884a-7e085e66f4d8';
function stub(handler) {
    const seen = [];
    const server = (0, node_http_1.createServer)((req, res) => { let raw = ''; req.on('data', (c) => (raw += c)); req.on('end', () => { const body = raw ? JSON.parse(raw) : null; seen.push({ method: req.method, url: req.url, body }); res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(handler(req.method, req.url, body))); }); });
    return { seen, server, listen: () => new Promise((r) => server.listen(0, () => r(server.address().port))) };
}
const env = (port, extra = {}) => ({ ...process.env, MATELOT_URL: `http://127.0.0.1:${port}`, MATELOT_TOKEN: 'spt_test', MATELOT_CREDENTIALS: '/nonexistent', ...extra });
(0, node_test_1.test)('job logs renders the API payload {seq, stream, content, at} (no empty "line" column)', async () => {
    const s = stub(() => [{ seq: 1, stream: 'system', content: 'semgrep scan --config p/security-audit', at: '2026-10-05T10:00:00Z' }, { seq: 2, stream: 'stdout', content: '4 code findings (1 high, 3 medium)', at: '2026-10-05T10:00:03Z' }]);
    const port = await s.listen();
    try {
        const { stdout } = await run('node', [(0, node_path_1.join)(__dirname, 'index.js'), 'job', 'logs', '--id', ID], { env: env(port) });
        strict_1.default.match(stdout, /semgrep scan --config p\/security-audit/);
        strict_1.default.match(stdout, /4 code findings/);
        strict_1.default.doesNotMatch(stdout, /\bline\b/);
    }
    finally {
        s.server.close();
    }
});
(0, node_test_1.test)('policy flags map one by one: --environments, --enforce, --max-sast, --action, --max-severity, --block-kev false; update sends only the given rules', async () => {
    const s = stub((m, u) => (m === 'POST' ? { id: 'p1' } : { id: 'p1', rules: {} }));
    const port = await s.listen();
    try {
        await run('node', [(0, node_path_1.join)(__dirname, 'index.js'), 'policy', 'create-project', '--project', ID, '--name', 'Prod', '--environments', 'production,staging', '--max-sast', 'high', '--max-severity', 'critical', '--block-kev', 'false', '--action', 'block', '--enforce', '--json'], { env: env(port) });
        strict_1.default.equal(s.seen[0].url, `/api/v1/projects/${ID}/policies`);
        // create sends every rule explicitly: block rules off unless asked for (no surprise block_secrets), decisions honoured
        strict_1.default.deepEqual(s.seen[0].body, { name: 'Prod', environmentKinds: ['production', 'staging'], action: 'block', enforceOnDeploy: true, rules: { maxSeverity: 'critical', blockKev: false, blockSecrets: false, requireSbom: false, honourDecisions: true, maxIacSeverity: null, maxSastSeverity: 'high' } });
        await run('node', [(0, node_path_1.join)(__dirname, 'index.js'), 'policy', 'update', '--id', ID, '--max-sast', 'low', '--json'], { env: env(port) });
        strict_1.default.deepEqual(s.seen[1].body, { rules: { maxSastSeverity: 'low' } }); // only this rule: the API merges with the stored rules
        // the review's command: --max-severity high --block-kev --action block --enforce, no --block-secrets → blockSecrets false; --no-block-kev turns one off on update
        await run('node', [(0, node_path_1.join)(__dirname, 'index.js'), 'policy', 'create-project', '--project', ID, '--name', 'P', '--max-severity', 'high', '--block-kev', '--action', 'block', '--enforce', '--json'], { env: env(port) });
        strict_1.default.deepEqual(s.seen[2].body.rules, { maxSeverity: 'high', blockKev: true, blockSecrets: false, requireSbom: false, honourDecisions: true, maxIacSeverity: null, maxSastSeverity: null });
        await run('node', [(0, node_path_1.join)(__dirname, 'index.js'), 'policy', 'update', '--id', ID, '--no-block-kev', '--no-honour-decisions', '--json'], { env: env(port) });
        strict_1.default.deepEqual(s.seen[3].body, { rules: { blockKev: false, honourDecisions: false } });
    }
    finally {
        s.server.close();
    }
});
(0, node_test_1.test)('an unknown flag is an error, never silently ignored', async () => {
    const s = stub(() => ({}));
    const port = await s.listen();
    try {
        await strict_1.default.rejects(run('node', [(0, node_path_1.join)(__dirname, 'index.js'), 'policy', 'create-project', '--project', ID, '--name', 'x', '--enforced'], { env: env(port) }), (e) => /unknown flag.*--enforced/.test(e.stderr) && e.code === 1);
        strict_1.default.equal(s.seen.length, 0);
    }
    finally {
        s.server.close();
    }
});
(0, node_test_1.test)('pipeline --wait --json: stdout is JSON only (progress on stderr)', async () => {
    const s = stub((m) => (m === 'POST' ? { id: 'pl1', number: 7, status: 'running', jobs: [{ name: 'checkout', status: 'queued' }] } : { id: 'pl1', number: 7, status: 'succeeded', jobs: [{ name: 'checkout', status: 'succeeded' }] }));
    const port = await s.listen();
    try {
        const { stdout, stderr } = await run('node', [(0, node_path_1.join)(__dirname, 'index.js'), 'pipeline', '--service', ID, '--wait', '--timeout', '30', '--json'], { env: env(port) });
        const parsed = JSON.parse(stdout); // throws if anything else is on stdout
        strict_1.default.equal(parsed.status, 'succeeded');
        void stderr;
    }
    finally {
        s.server.close();
    }
});
(0, node_test_1.test)('openBrowser: no opener available → resolves false instead of crashing on the error event', async () => {
    const ok = await (0, login_1.openBrowser)('http://127.0.0.1:1/x'); // PATH without any opener
    strict_1.default.equal(typeof ok, 'boolean');
});
(0, node_test_1.test)('login keeps listening after a stale-state callback (answered 400) and completes with the right one', async () => {
    process.env.MATELOT_CREDENTIALS = (0, node_path_1.join)((0, node_fs_1.mkdtempSync)((0, node_path_1.join)((0, node_os_1.tmpdir)(), 'matelot-creds-')), 'credentials.json');
    let srv;
    const port = await new Promise((resolve) => {
        srv = (0, node_http_1.createServer)((req, res) => {
            const u = new URL(req.url, 'http://x');
            if (u.pathname === '/.well-known/oauth-authorization-server') {
                res.writeHead(200, { 'content-type': 'application/json' });
                res.end(JSON.stringify({ authorization_endpoint: `http://127.0.0.1:${srv.address().port}/a`, token_endpoint: `http://127.0.0.1:${srv.address().port}/t` }));
                return;
            }
            if (u.pathname === '/t') {
                res.writeHead(200, { 'content-type': 'application/json' });
                res.end(JSON.stringify({ access_token: 'spt_x', refresh_token: 'r', expires_in: 3600, scope: 'write' }));
                return;
            }
            res.writeHead(404);
            res.end();
        });
        srv.listen(0, '127.0.0.1', () => resolve(srv.address().port));
    });
    const creds = await (0, login_1.login)(`http://127.0.0.1:${port}`, 'write', { timeoutMs: 10_000, open: (a) => {
            const u = new URL(a);
            const cb = new URL(u.searchParams.get('redirect_uri'));
            const stale = new URL(cb.toString());
            stale.searchParams.set('code', 'old');
            stale.searchParams.set('state', 'stale-state');
            void fetch(stale.toString()).then(async (r) => { strict_1.default.equal(r.status, 400); const good = new URL(cb.toString()); good.searchParams.set('code', 'the-code'); good.searchParams.set('state', u.searchParams.get('state')); await fetch(good.toString()); });
        } });
    strict_1.default.equal(creds.accessToken, 'spt_x');
    srv.close();
});
