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
const env = (port) => ({ ...process.env, MATELOT_URL: `http://127.0.0.1:${port}`, MATELOT_TOKEN: 'spt_test', MATELOT_CREDENTIALS: '/nonexistent' });
const metrics = (active, mins) => ({ seats: { active, members: 9 }, projects: 3, services: 7, environments: 12, pipelines: 41, jobs: 236, runnerMinutes: mins, runnerMinutesByType: { sbom: 120.5, sast: 33 }, sboms: 58 });
function serve(handler) {
    const seen = [];
    const server = (0, node_http_1.createServer)((req, res) => {
        seen.push(req.url);
        const r = handler(req.url, seen.length);
        res.writeHead(r.status ?? 200, { 'content-type': typeof r.body === 'string' ? 'text/csv' : 'application/json', ...(r.headers ?? {}) });
        res.end(typeof r.body === 'string' ? r.body : JSON.stringify(r.body));
    });
    return { seen, server, listen: () => new Promise((ok) => server.listen(0, () => ok(server.address().port))) };
}
(0, node_test_1.test)('matelot usage prints the month and its history; --month, --format csv and --json', async () => {
    const s = serve((url) => url.includes('format=csv')
        ? { body: 'month,seats_active\n2026-09,5\n' }
        : { body: { organizationId: ORG, month: url.includes('2026-09') ? '2026-09' : '2026-10', live: !url.includes('2026-09'), computedAt: '2026-10-07T12:00:00Z', metrics: metrics(6, 153.5), history: [{ month: '2026-10', final: false, metrics: metrics(6, 153.5) }, { month: '2026-09', final: true, metrics: metrics(5, 412) }] } });
    const port = await s.listen();
    const cli = (0, node_path_1.join)(__dirname, 'index.js');
    try {
        const out = (await run('node', [cli, 'usage', '--org', ORG], { env: env(port) })).stdout;
        strict_1.default.match(out, /^usage 2026-10 \(live, UTC calendar month\)/);
        strict_1.default.match(out, /active seats\s+6 of 9 members/);
        strict_1.default.match(out, /runner minutes\s+153\.5 {2}\(sbom 120\.5, sast 33\)/);
        strict_1.default.match(out, /2026-09\s+5\s+412\s+41/);
        strict_1.default.equal(s.seen[0], `/api/v1/organizations/${ORG}/usage`);
        await run('node', [cli, 'usage', '--org', ORG, '--month', '2026-09'], { env: env(port) });
        strict_1.default.equal(s.seen[1], `/api/v1/organizations/${ORG}/usage?month=2026-09`);
        const csv = (await run('node', [cli, 'usage', 'show', '--org', ORG, '--format', 'csv'], { env: env(port) })).stdout;
        strict_1.default.equal(csv, 'month,seats_active\n2026-09,5\n');
        const json = JSON.parse((await run('node', [cli, 'usage', '--org', ORG, '--json'], { env: env(port) })).stdout);
        strict_1.default.equal(json.metrics.seats.active, 6);
    }
    finally {
        s.server.close();
    }
});
(0, node_test_1.test)('429: waits for Retry-After and repeats the request (also a write); gives up after 3 retries', async () => {
    const s = serve((url, n) => (url.startsWith('/api/v1/integrations/') && n <= 2
        ? { status: 429, headers: { 'retry-after': '1' }, body: { statusCode: 429, message: 'Rate limit exceeded: 300 write requests per minute for this user. Retry in 1 s.' } }
        : url.startsWith('/api/v1/integrations/') ? { body: { id: 'x', name: 'c', status: 'disconnected' } } : { status: 429, headers: { 'retry-after': '0' }, body: { statusCode: 429, message: 'Rate limit exceeded: 1200 read requests per minute for this user. Retry in 1 s.' } }));
    const port = await s.listen();
    const cli = (0, node_path_1.join)(__dirname, 'index.js');
    try {
        const ok = await run('node', [cli, 'connection', 'disconnect', '--id', '9b7e2f8a-1c2d-4e5f-8a9b-0c1d2e3f4a5b'], { env: env(port) });
        strict_1.default.equal(ok.stdout.trim(), 'disconnected c');
        strict_1.default.equal((ok.stderr.match(/rate limited by the platform; retrying in 1 s/g) ?? []).length, 2);
        const before = s.seen.length;
        await strict_1.default.rejects(run('node', [cli, 'usage', '--org', ORG], { env: env(port) }), (e) => { strict_1.default.match(e.stderr, /429 Rate limit exceeded: 1200 read requests per minute/); return true; });
        strict_1.default.equal(s.seen.length - before, 4); // first try + 3 retries
    }
    finally {
        s.server.close();
    }
});
