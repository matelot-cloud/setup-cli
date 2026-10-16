"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const node_http_1 = require("node:http");
const node_crypto_1 = require("node:crypto");
const node_fs_1 = require("node:fs");
const node_os_1 = require("node:os");
const node_path_1 = require("node:path");
const login_1 = require("./login");
/** Stub authorization server: discovery, authorize (we "approve" by redirecting the loopback ourselves), token with PKCE check. */
function authServer() {
    const seen = [];
    let challenge = '';
    const server = (0, node_http_1.createServer)((req, res) => {
        const u = new URL(req.url, 'http://x');
        const json = (o, code = 200) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
        if (u.pathname === '/.well-known/oauth-authorization-server')
            return json({ authorization_endpoint: `http://127.0.0.1:${server.address().port}/api/v1/oauth/authorize`, token_endpoint: `http://127.0.0.1:${server.address().port}/api/v1/oauth/token` });
        if (u.pathname === '/api/v1/oauth/token') {
            let raw = '';
            req.on('data', (c) => (raw += c));
            req.on('end', () => {
                const b = Object.fromEntries(new URLSearchParams(raw));
                seen.push(b);
                if (b.grant_type === 'authorization_code') {
                    const ok = (0, node_crypto_1.createHash)('sha256').update(b.code_verifier).digest('base64url') === challenge && b.code === 'the-code' && b.client_id === 'matelot-cli';
                    return ok ? json({ access_token: 'spt_from_oauth', refresh_token: 'rt1', expires_in: 3600, scope: 'write' }) : json({ error: 'invalid_grant' }, 400);
                }
                if (b.grant_type === 'refresh_token' && b.refresh_token === 'rt1')
                    return json({ access_token: 'spt_refreshed', refresh_token: 'rt2', expires_in: 3600, scope: 'write' });
                if (b.grant_type === 'refresh_token' && b.refresh_token === 'rt2')
                    return json({ access_token: 'spt_refreshed_2', refresh_token: 'rt3', expires_in: 3600, scope: 'write' });
                return json({ error: 'invalid_grant' }, 400);
            });
            return;
        }
        if (u.pathname === '/api/v1/oauth/revoke') {
            let raw = '';
            req.on('data', (c) => (raw += c));
            req.on('end', () => { seen.push({ revoke: JSON.parse(raw).token }); json({}); });
            return;
        }
        json({ message: 'nope' }, 404);
    });
    return { server, seen, open: (authorizeUrl) => { const a = new URL(authorizeUrl); challenge = a.searchParams.get('code_challenge'); strict_1.default.equal(a.searchParams.get('client_id'), 'matelot-cli'); strict_1.default.equal(a.searchParams.get('code_challenge_method'), 'S256'); const cb = new URL(a.searchParams.get('redirect_uri')); cb.searchParams.set('code', 'the-code'); cb.searchParams.set('state', a.searchParams.get('state')); void fetch(cb.toString()); }, listen: () => new Promise((r) => server.listen(0, '127.0.0.1', () => r(server.address().port))) };
}
(0, node_test_1.test)('matelot login: loopback + PKCE → token stored; expired token refreshes with rotation', async () => {
    process.env.MATELOT_CREDENTIALS = (0, node_path_1.join)((0, node_fs_1.mkdtempSync)((0, node_path_1.join)((0, node_os_1.tmpdir)(), 'matelot-creds-')), 'credentials.json');
    const s = authServer();
    const port = await s.listen();
    try {
        const creds = await (0, login_1.login)(`http://127.0.0.1:${port}`, 'write', { open: s.open, timeoutMs: 10_000 });
        strict_1.default.equal(creds.accessToken, 'spt_from_oauth');
        strict_1.default.equal(creds.scope, 'write');
        const stored = JSON.parse((0, node_fs_1.readFileSync)(process.env.MATELOT_CREDENTIALS, 'utf8'))[`http://127.0.0.1:${port}`];
        strict_1.default.equal(stored.refreshToken, 'rt1'); // refresh token stored
        const ttl = new Date(stored.expiresAt).getTime() - Date.now();
        strict_1.default.ok(ttl > 3500_000 && ttl <= 3600_000, `expiresAt stored as ISO, ~expires_in ahead (${stored.expiresAt})`);
        strict_1.default.equal((0, login_1.readCredentials)(`http://127.0.0.1:${port}`).accessToken, 'spt_from_oauth');
        strict_1.default.equal(await (0, login_1.freshToken)(`http://127.0.0.1:${port}`), 'spt_from_oauth'); // still valid: no refresh
        // expire it → refresh rotates
        const all = JSON.parse((0, node_fs_1.readFileSync)(process.env.MATELOT_CREDENTIALS, 'utf8'));
        all[`http://127.0.0.1:${port}`].expiresAt = new Date(Date.now() - 1).toISOString();
        require('node:fs').writeFileSync(process.env.MATELOT_CREDENTIALS, JSON.stringify(all));
        strict_1.default.equal(await (0, login_1.freshToken)(`http://127.0.0.1:${port}`), 'spt_refreshed');
        strict_1.default.equal((0, login_1.readCredentials)(`http://127.0.0.1:${port}`).refreshToken, 'rt2');
        // logout revokes the refresh token at the server and forgets it locally
        const lo = await (0, login_1.logout)(`http://127.0.0.1:${port}`);
        strict_1.default.deepEqual(lo, { url: `http://127.0.0.1:${port}`, revoked: true });
        strict_1.default.ok(s.seen.some((x) => x.revoke === 'rt2'), 'revoke called with the refresh token');
        strict_1.default.equal((0, login_1.readCredentials)(`http://127.0.0.1:${port}`), null); // the entry is removed (and `current` cleared)
        strict_1.default.equal(s.seen.filter((x) => x.grant_type === 'authorization_code').length, 1);
    }
    finally {
        s.server.close();
    }
});
(0, node_test_1.test)('a non-admin requesting sudo is told the grant was narrowed; --help needs no credentials', async () => {
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const run = promisify(execFile);
    // --help with no credentials at all
    const h = await run('node', [(0, node_path_1.join)(__dirname, 'index.js'), 'membership', 'grant', '--help'], { env: { PATH: process.env.PATH, HOME: process.env.HOME } });
    strict_1.default.match(h.stdout, /matelot membership grant/);
    strict_1.default.match(h.stdout, /ORG_ADMIN/);
    strict_1.default.match(h.stdout, /--role/);
    // narrowed grant: server answers scope write to a sudo request
    process.env.MATELOT_CREDENTIALS = (0, node_path_1.join)((0, node_fs_1.mkdtempSync)((0, node_path_1.join)((0, node_os_1.tmpdir)(), 'matelot-creds-')), 'credentials.json');
    const s = authServer();
    const port = await s.listen();
    try {
        const creds = await (0, login_1.login)(`http://127.0.0.1:${port}`, 'sudo', { open: s.open, timeoutMs: 10_000 });
        strict_1.default.equal(creds.scope, 'write'); // the stub grants write; index.ts prints "granted write, not sudo" (see RANK check)
    }
    finally {
        s.server.close();
    }
});
(0, node_test_1.test)('login: a proxy that serves the SPA for /.well-known gives a readable error', async () => {
    const { createServer } = await import('node:http');
    const server = createServer((_req, res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<!DOCTYPE html><html><body>app</body></html>'); });
    const port = await new Promise((done) => server.listen(0, () => done(server.address().port)));
    try {
        await strict_1.default.rejects((0, login_1.login)(`http://127.0.0.1:${port}`, 'read', { noBrowser: true, timeoutMs: 1000 }), (e) => { strict_1.default.match(e.message, /\.well-known\/oauth-authorization-server returned HTML \(HTTP 200\) — is \/\.well-known routed to the API/); return true; });
    }
    finally {
        server.close();
    }
});
(0, node_test_1.test)('login: discovery that advertises another origin than the one connected to is warned about', async () => {
    strict_1.default.equal((0, login_1.discoveryMismatch)('http://localhost', { authorization_endpoint: 'http://localhost/api/v1/oauth/authorize', token_endpoint: 'http://localhost/api/v1/oauth/token' }), null);
    strict_1.default.match((0, login_1.discoveryMismatch)('http://localhost', { authorization_endpoint: 'http://localhost:3000/api/v1/oauth/authorize', token_endpoint: 'http://localhost:3000/api/v1/oauth/token' }), /advertises http:\/\/localhost:3000 but you connected to http:\/\/localhost — check API_PUBLIC_URL/);
    strict_1.default.match((0, login_1.discoveryMismatch)('https://acme.example.com', { authorization_endpoint: 'http://acme.example.com/api/v1/oauth/authorize' }), /advertises http:\/\/acme\.example\.com but you connected to https:\/\/acme\.example\.com/);
});
