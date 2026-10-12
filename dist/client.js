"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VERSION = exports.CliError = void 0;
exports.configFromEnv = configFromEnv;
exports.request = request;
const login_1 = require("./login");
const signing_1 = require("./signing");
function configFromEnv(env = process.env) {
    const pick = (k) => env[`MATELOT_${k}`] ?? env[`SECOPS_${k}`];
    const url = (pick('URL') ?? '').replace(/\/$/, '');
    // A personal access token (SECOPS_TOKEN=spt_…) replaces the CI token pair.
    const token = pick('TOKEN') ?? '';
    if (token) {
        if (!url)
            throw new Error('Missing MATELOT_URL (or SECOPS_URL)');
        return { url, keyId: '', secret: '', token };
    }
    const keyId = pick('KEY_ID') ?? '';
    const secret = pick('SECRET') ?? '';
    // No env credentials: use what `matelot login` stored (refreshed lazily by index.ts before the first request)
    if (!keyId && !secret) {
        const stored = (0, login_1.readCredentials)(url || undefined);
        if (stored?.accessToken)
            return { url: url || stored.url, keyId: '', secret: '', token: stored.accessToken, fromLogin: true };
    }
    const missing = [!url && 'MATELOT_URL', !keyId && 'MATELOT_KEY_ID', !secret && 'MATELOT_SECRET'].filter(Boolean);
    if (missing.length)
        throw new Error(`Missing ${missing.join(', ')} (CI: create a CI token in the project's Settings; as yourself: run \`matelot login --url https://…\` or set MATELOT_TOKEN to a personal access token; SECOPS_* names still work)`);
    return { url, keyId, secret };
}
class CliError extends Error {
    status;
    code;
    /** 429 only: seconds the platform asked to wait. */
    retryAfterSeconds;
    constructor(message, status, code) {
        super(message);
        this.status = status;
        this.code = code;
    }
}
exports.CliError = CliError;
/**
 * Over the platform's rate limit (429) the request was refused before anything ran, so it is safe to repeat — also for
 * writes. Waits for Retry-After (at most 60 s, at most 3 times; progress on stderr) and gives up with the API's message.
 */
async function request(config, method, path, body, timeoutMs = 60_000) {
    for (let attempt = 0;; attempt++) {
        try {
            return await requestOnce(config, method, path, body, timeoutMs);
        }
        catch (error) {
            const wait = error instanceof CliError && error.status === 429 ? error.retryAfterSeconds : undefined;
            if (wait === undefined || wait > 60 || attempt >= 3)
                throw error;
            process.stderr.write(`rate limited by the platform; retrying in ${wait} s\n`);
            await new Promise((r) => setTimeout(r, wait * 1000));
        }
    }
}
async function requestOnce(config, method, path, body, timeoutMs = 60_000) {
    const raw = body === undefined ? Buffer.alloc(0) : Buffer.from(JSON.stringify(body));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        let response;
        try {
            response = await fetch(`${config.url}${path}`, {
                method,
                headers: { Authorization: config.token ? `Bearer ${config.token}` : (0, signing_1.signatureHeader)(config.keyId, config.secret, method, path, raw), 'Content-Type': 'application/json', 'User-Agent': `secops-cli/${exports.VERSION}` },
                body: raw.length ? raw : undefined,
                signal: controller.signal,
            });
        }
        catch (error) {
            const cause = error.cause;
            const detail = cause?.code ? `${cause.code}${cause.message ? ` (${cause.message})` : ''}` : error.message;
            throw new CliError(`cannot reach ${config.url}: ${detail}. Is MATELOT_URL correct and the platform running / reachable from this runner?`);
        }
        const text = await response.text();
        let parsed = text;
        try {
            parsed = text ? JSON.parse(text) : null;
        }
        catch {
            /* not JSON */
        }
        if (!response.ok) {
            const message = parsed?.message;
            const err = new CliError(`${response.status} ${Array.isArray(message) ? message.join('; ') : (message ?? text.slice(0, 200))}`, response.status, parsed?.code);
            const retryAfter = Number(response.headers.get('retry-after'));
            if (response.status === 429 && Number.isFinite(retryAfter) && retryAfter >= 0)
                err.retryAfterSeconds = retryAfter;
            throw err;
        }
        return parsed;
    }
    finally {
        clearTimeout(timer);
    }
}
exports.VERSION = '2.20.2';
