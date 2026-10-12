"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.credentialsPath = exports.CLI_CLIENT_ID = void 0;
exports.readCredentials = readCredentials;
exports.writeCredentials = writeCredentials;
exports.openBrowser = openBrowser;
exports.retryingFetch = retryingFetch;
exports.login = login;
exports.freshToken = freshToken;
exports.logout = logout;
/**
 * `matelot login [--url https://matelot.example]`: OAuth 2.1 authorization-code flow with PKCE against the cell,
 * loopback redirect (RFC 8252), token stored in ~/.config/matelot/credentials.json and refreshed when it expires.
 * Env (MATELOT_TOKEN / MATELOT_KEY_ID+SECRET) still wins when set, so CI is unaffected.
 */
const node_crypto_1 = require("node:crypto");
const node_fs_1 = require("node:fs");
const node_http_1 = require("node:http");
const node_os_1 = require("node:os");
const node_path_1 = require("node:path");
const node_child_process_1 = require("node:child_process");
exports.CLI_CLIENT_ID = 'matelot-cli';
const credentialsPath = () => process.env.MATELOT_CREDENTIALS ?? (0, node_path_1.join)(process.env.XDG_CONFIG_HOME ?? (0, node_path_1.join)((0, node_os_1.homedir)(), '.config'), 'matelot', 'credentials.json');
exports.credentialsPath = credentialsPath;
/** Older files used snake_case; read both. */
function normalise(raw) {
    return { url: String(raw.url ?? ''), accessToken: String(raw.accessToken ?? raw.access_token ?? ''), refreshToken: (raw.refreshToken ?? raw.refresh_token ?? undefined), expiresAt: typeof raw.expiresAt === 'string' ? raw.expiresAt : typeof raw.expires_at === 'number' && Number.isFinite(raw.expires_at) ? new Date(raw.expires_at).toISOString() : null, scope: String(raw.scope ?? ''), user: raw.user };
}
function readCredentials(url) {
    const p = (0, exports.credentialsPath)();
    if (!(0, node_fs_1.existsSync)(p))
        return null;
    try {
        const all = JSON.parse((0, node_fs_1.readFileSync)(p, 'utf8'));
        const key = (url ?? Object.keys(all)[0] ?? '').replace(/\/$/, '');
        return all[key] ? normalise(all[key]) : null;
    }
    catch {
        return null;
    }
}
function writeCredentials(c) {
    const p = (0, exports.credentialsPath)();
    (0, node_fs_1.mkdirSync)((0, node_path_1.join)(p, '..'), { recursive: true });
    let all = {};
    try {
        all = JSON.parse((0, node_fs_1.readFileSync)(p, 'utf8'));
    }
    catch { /* new file */ }
    all[c.url.replace(/\/$/, '')] = c;
    (0, node_fs_1.writeFileSync)(p, JSON.stringify(all, null, 2));
    try {
        (0, node_fs_1.chmodSync)(p, 0o600);
    }
    catch { /* windows */ }
}
/**
 * Open the user's browser: $BROWSER first, then the platform openers (macOS open; Windows start; Linux/WSL xdg-open,
 * wslview, sensible-browser, x-www-browser). A missing opener is NOT fatal — the 'error' event is handled, the next
 * candidate is tried, and the caller prints the URL to copy. Resolves true when some opener started.
 */
function openBrowser(url) {
    const candidates = [];
    if (process.env.BROWSER)
        candidates.push([process.env.BROWSER, [url]]);
    if (process.platform === 'darwin')
        candidates.push(['open', [url]]);
    else if (process.platform === 'win32')
        candidates.push(['cmd', ['/c', 'start', '', url.replace(/&/g, '^&')]]);
    else
        candidates.push(['xdg-open', [url]], ['wslview', [url]], ['sensible-browser', [url]], ['x-www-browser', [url]]);
    return candidates.reduce((prev, [cmd, args]) => prev.then((ok) => ok ? true : new Promise((resolve) => {
        try {
            const child = (0, node_child_process_1.spawn)(cmd, args, { stdio: 'ignore', detached: true });
            child.once('error', () => resolve(false)); // ENOENT etc.: try the next one
            child.once('spawn', () => { child.unref(); resolve(true); });
        }
        catch {
            resolve(false);
        }
    })), Promise.resolve(false));
}
/** Runs the browser flow; `opts.open` lets tests drive the consent step. Returns stored credentials. */
/**
 * fetch that honours 429 + Retry-After (≤ 60 s, at most 3 retries; a note on stderr). The OAuth calls are anonymous, so
 * they share the per-address window with the consent page's own requests; a 429 was refused before anything ran (the
 * authorization code is not consumed), so repeating it is safe.
 */
function retryingFetch(f, sleep = (ms) => new Promise((r) => setTimeout(r, ms))) {
    return (async (input, init) => {
        for (let attempt = 0;; attempt++) {
            const res = await f(input, init);
            const wait = Number(res.headers.get('retry-after'));
            if (res.status !== 429 || !Number.isFinite(wait) || wait < 0 || wait > 60 || attempt >= 3)
                return res;
            process.stderr.write(`rate limited by the platform; retrying in ${wait} s\n`);
            await sleep(wait * 1000);
        }
    });
}
async function login(url, scope, opts = {}) {
    const base = url.replace(/\/$/, '');
    const f = retryingFetch(opts.fetchImpl ?? fetch, opts.sleep);
    const meta = (await (await f(`${base}/.well-known/oauth-authorization-server`)).json());
    const verifier = (0, node_crypto_1.randomBytes)(32).toString('base64url');
    const challenge = (0, node_crypto_1.createHash)('sha256').update(verifier).digest('base64url');
    const state = (0, node_crypto_1.randomBytes)(16).toString('base64url');
    const code = await new Promise((resolve, reject) => {
        const server = (0, node_http_1.createServer)((req, res) => {
            const u = new URL(req.url ?? '/', 'http://127.0.0.1');
            if (u.pathname !== '/callback') {
                res.writeHead(404);
                res.end();
                return;
            }
            const err = u.searchParams.get('error');
            // a stale tab (another login's state) must not end THIS login: answer it and keep listening for the right callback
            if (u.searchParams.get('state') !== state) {
                res.writeHead(400, { 'content-type': 'text/html' });
                res.end('<p>This sign-in window is no longer valid (state mismatch). Go back to the terminal and use the current link.</p>');
                return;
            }
            res.writeHead(200, { 'content-type': 'text/html' });
            res.end(err ? `<p>Login refused (${err}). You can close this tab.</p>` : '<p>matelot is logged in. You can close this tab.</p>');
            server.close();
            if (err)
                reject(new Error(`authorization refused: ${err}`));
            else
                resolve(u.searchParams.get('code') ?? '');
        });
        server.listen(0, '127.0.0.1', () => {
            const port = server.address().port;
            const authorize = `${meta.authorization_endpoint}?${new URLSearchParams({ response_type: 'code', client_id: exports.CLI_CLIENT_ID, redirect_uri: `http://127.0.0.1:${port}/callback`, scope, state, code_challenge: challenge, code_challenge_method: 'S256' })}`;
            (opts.open ?? ((a) => {
                if (opts.noBrowser) {
                    console.error(`Sign in by opening this link in a browser:\n  ${a}\n(waiting for the callback)`);
                    return;
                }
                void openBrowser(a).then((ok) => console.error(ok ? `Opening your browser to sign in… If it does not open, visit:\n  ${a}` : `No browser opener found (set $BROWSER, or use --no-browser). Open this link:\n  ${a}\n(waiting for the callback)`));
            }))(authorize);
            server.redirectUri = `http://127.0.0.1:${port}/callback`;
            setTimeout(() => { server.close(); reject(new Error('login timed out (no browser callback)')); }, opts.timeoutMs ?? 300_000).unref();
        });
        server.onPort = undefined;
    }).then(async (c) => c);
    const redirectUri = code.redirectUri;
    void redirectUri;
    const tokenRes = await f(meta.token_endpoint, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', code, client_id: exports.CLI_CLIENT_ID, code_verifier: verifier }) });
    const tok = (await tokenRes.json());
    if (!tokenRes.ok || !tok.access_token)
        throw new Error(`token exchange failed: ${tok.error ?? tokenRes.status} ${tok.error_description ?? tok.message ?? ''}`.trim());
    const expiresIn = Number.isFinite(Number(tok.expires_in)) && Number(tok.expires_in) > 0 ? Number(tok.expires_in) : 86400;
    if (!tok.refresh_token)
        console.error('warning: the server issued no refresh token; you will have to run `matelot login` again when this one expires');
    const creds = { url: base, accessToken: tok.access_token, refreshToken: tok.refresh_token, expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(), scope: tok.scope ?? scope };
    writeCredentials(creds);
    return creds;
}
/** Refresh when the stored access token is (nearly) expired; returns the usable access token or null. */
async function freshToken(url, fetchImplRaw = fetch, sleep) {
    const fetchImpl = retryingFetch(fetchImplRaw, sleep);
    const c = readCredentials(url);
    if (!c || !c.accessToken)
        return null;
    if (c.expiresAt && new Date(c.expiresAt).getTime() - Date.now() > 60_000)
        return c.accessToken;
    if (!c.refreshToken)
        return c.expiresAt ? null : c.accessToken; // unknown expiry, no refresh: try it
    try {
        const meta = (await (await fetchImpl(`${c.url}/.well-known/oauth-authorization-server`)).json());
        const r = await fetchImpl(meta.token_endpoint, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: c.refreshToken, client_id: exports.CLI_CLIENT_ID }) });
        const tok = (await r.json());
        if (!r.ok || !tok.access_token)
            return null;
        writeCredentials({ ...c, accessToken: tok.access_token, refreshToken: tok.refresh_token ?? c.refreshToken, expiresAt: new Date(Date.now() + (tok.expires_in ?? 86400) * 1000).toISOString(), scope: tok.scope ?? c.scope });
        return tok.access_token;
    }
    catch {
        return null;
    }
}
/** Revoke the stored refresh token (and with it the access token) at the server, then forget it locally. */
async function logout(url, fetchImpl = fetch) {
    const c = readCredentials(url);
    if (!c)
        return null;
    let revoked = false;
    try {
        const r = await fetchImpl(`${c.url}/api/v1/oauth/revoke`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: c.refreshToken ?? c.accessToken }) });
        revoked = r.ok;
    }
    catch {
        revoked = false;
    }
    writeCredentials({ url: c.url, accessToken: '', refreshToken: undefined, expiresAt: null, scope: c.scope });
    return { url: c.url, revoked };
}
