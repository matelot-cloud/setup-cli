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
const run = (0, node_util_1.promisify)(node_child_process_1.execFile);
const ORG = '0c3cbf3d-31cf-41bd-884a-7e085e66f4d8';
const cli = (0, node_path_1.join)(__dirname, 'index.js');
function serve(runnersOnline, discovery = 'ok') {
    const server = (0, node_http_1.createServer)((req, res) => {
        const u = req.url;
        const json = (code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
        if (u === '/.well-known/oauth-authorization-server') {
            if (discovery === 'html') {
                res.writeHead(200, { 'content-type': 'text/html' });
                return res.end('<!DOCTYPE html><html></html>');
            }
            const base = discovery === 'wrong-origin' ? 'http://localhost:3000' : `http://${req.headers.host}`;
            return json(200, { issuer: base, authorization_endpoint: `${base}/api/v1/oauth/authorize`, token_endpoint: `${base}/api/v1/oauth/token` });
        }
        if (u === '/api/v1/health/ready')
            return json(200, { status: 'ok' });
        if (u === '/api/v1/version')
            return json(200, { name: 'matelot', version: '0.1.0' });
        if (u === '/api/v1/meta')
            return json(401, { message: 'Unauthorized' });
        if (!req.headers.authorization)
            return json(401, { message: 'Unauthorized' });
        if (u === '/api/v1/api-tokens/whoami')
            return json(200, { kind: 'user', email: 'admin@localhost' });
        if (u === '/api/v1/organizations')
            return json(200, [{ id: ORG, slug: 'main', name: 'My organization' }]);
        if (u === `/api/v1/organizations/${ORG}/runner-pools`)
            return json(200, [{ name: 'Managed', managed: true, runners: [{ name: 'compose-runner-1', status: runnersOnline ? 'online' : 'offline' }] }]);
        if (u === '/api/v1/registry/info')
            return json(200, { available: true, host: 'localhost:5000' });
        json(404, { message: 'not found' });
    });
    return new Promise((done) => server.listen(0, () => done({ port: server.address().port, close: () => server.close() })));
}
(0, node_test_1.test)('matelot doctor: all checks pass, runner offline fails, no credentials skips the authenticated checks', async () => {
    const s = await serve(true);
    try {
        const env = { ...process.env, MATELOT_URL: `http://127.0.0.1:${s.port}`, MATELOT_TOKEN: 'spt_test', MATELOT_CREDENTIALS: '/nonexistent' };
        const { stdout } = await run('node', [cli, 'doctor'], { env });
        strict_1.default.match(stdout, /OK {2}api +http:\/\/127\.0\.0\.1:\d+ ready/);
        strict_1.default.match(stdout, /OK {2}version +API 0\.1\.0 · CLI /);
        strict_1.default.match(stdout, /OK {2}discovery +endpoints on http:\/\/127\.0\.0\.1:\d+ \(matelot login will work\)/);
        strict_1.default.match(stdout, /OK {2}login +user admin@localhost/);
        strict_1.default.match(stdout, /OK {2}organization +main/);
        strict_1.default.match(stdout, /OK {2}runners +1 online \(compose-runner-1\)/);
        strict_1.default.match(stdout, /OK {2}registry +localhost:5000 \(matelot registry login\)/);
        strict_1.default.match(stdout, /all checks passed/);
        const j = JSON.parse((await run('node', [cli, 'doctor', '--json'], { env })).stdout);
        strict_1.default.equal(j.ok, true);
        strict_1.default.equal(j.checks.length, 7);
        // without credentials: the three unauthenticated checks run, the rest is skipped (exit 0)
        const noCreds = { ...process.env, MATELOT_URL: `http://127.0.0.1:${s.port}`, MATELOT_TOKEN: '', MATELOT_KEY_ID: '', MATELOT_SECRET: '', SECOPS_TOKEN: '', MATELOT_CREDENTIALS: '/nonexistent' };
        const r = await run('node', [cli, 'doctor'], { env: noCreds });
        strict_1.default.match(r.stdout, /--  login +skipped:/);
        strict_1.default.doesNotMatch(r.stdout, /registry/);
    }
    finally {
        s.close();
    }
    for (const [mode, re] of [['html', /FAIL {2}discovery +\/\.well-known\/oauth-authorization-server returned HTML \(the web app\)/], ['wrong-origin', /FAIL {2}discovery +the cell advertises http:\/\/localhost:3000 but you connected to http:\/\/127\.0\.0\.1:\d+ — check API_PUBLIC_URL/]]) {
        const d = await serve(true, mode);
        try {
            const env = { ...process.env, MATELOT_URL: `http://127.0.0.1:${d.port}`, MATELOT_TOKEN: 'spt_test', MATELOT_CREDENTIALS: '/nonexistent' };
            await strict_1.default.rejects(run('node', [cli, 'doctor'], { env }), (e) => { strict_1.default.equal(e.code, 1); strict_1.default.match(e.stdout, re); return true; });
        }
        finally {
            d.close();
        }
    }
    const off = await serve(false);
    try {
        const env = { ...process.env, MATELOT_URL: `http://127.0.0.1:${off.port}`, MATELOT_TOKEN: 'spt_test', MATELOT_CREDENTIALS: '/nonexistent' };
        await strict_1.default.rejects(run('node', [cli, 'doctor'], { env }), (e) => { strict_1.default.equal(e.code, 1); strict_1.default.match(e.stdout, /FAIL {2}runners +no runner online/); strict_1.default.match(e.stdout, /1 check\(s\) failed/); return true; });
    }
    finally {
        off.close();
    }
    // unreachable
    await strict_1.default.rejects(run('node', [cli, 'doctor', '--url', 'http://127.0.0.1:1'], { env: { ...process.env, MATELOT_CREDENTIALS: '/nonexistent' } }), (e) => { strict_1.default.equal(e.code, 1); strict_1.default.match(e.stdout, /FAIL {2}api +http:\/\/127\.0\.0\.1:1 unreachable/); return true; });
    // unreachable in a Docker Compose folder: the failing container is named, with its exit code and the logs command
    const { mkdtempSync, writeFileSync, chmodSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const dir = mkdtempSync((0, node_path_1.join)(tmpdir(), 'doctor-compose-'));
    writeFileSync((0, node_path_1.join)(dir, 'compose.yaml'), 'services: {}\n');
    writeFileSync((0, node_path_1.join)(dir, 'docker'), '#!/bin/sh\ncat <<EOF\n{"Service":"api","State":"restarting","Health":"","ExitCode":127}\n{"Service":"postgres","State":"running","Health":"healthy","ExitCode":0}\n{"Service":"init","State":"exited","Health":"","ExitCode":0}\n{"Service":"worker","State":"created","Health":"","ExitCode":0}\nEOF\n');
    chmodSync((0, node_path_1.join)(dir, 'docker'), 0o755);
    await strict_1.default.rejects(run('node', [cli, 'doctor', '--url', 'http://127.0.0.1:1'], { cwd: dir, env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, MATELOT_CREDENTIALS: '/nonexistent' } }), (e) => {
        strict_1.default.match(e.stdout, /FAIL {2}compose\/api +restarting \(exit 127\) — see docker compose logs api/);
        strict_1.default.match(e.stdout, /FAIL {2}compose\/worker +created — see docker compose logs worker/);
        strict_1.default.doesNotMatch(e.stdout, /compose\/postgres|compose\/init/);
        return true;
    });
});
