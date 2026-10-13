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
const PROJECT = '9026a879-3675-42ff-9590-654662e5e63b';
const env = (port) => ({ ...process.env, MATELOT_URL: `http://127.0.0.1:${port}`, MATELOT_TOKEN: 'spt_test', MATELOT_CREDENTIALS: '/nonexistent' });
const ok = (id, detail) => ({ id, title: id, state: 'ok', detail, href: null, cli: null });
const api = { serviceName: 'api', projectName: 'Payments', covered: true, gaps: [], checks: [ok('repository', '1 repository'), ok('pipeline', 'last finished 2 days ago'), ok('sbom', '1 SBOM'), ok('policy', '1 policy applies (1 inherited)'), ok('deployment', '1 deployment')] };
const worker = { serviceName: 'worker', projectName: 'Payments', covered: false, gaps: ['repository', 'pipeline'], checks: [
        { id: 'repository', title: 'Repository attached', state: 'missing', detail: 'no repository attached', href: '/x', cli: 'matelot repository attach --service S2 --repository-id <id>' },
        { id: 'pipeline', title: 'Security pipeline', state: 'stale', detail: 'last finished 40 days ago (older than 30 days)', href: '/x', cli: 'matelot pipeline --service S2 --template security --wait' },
        ok('sbom', '1 SBOM'), ok('policy', '1 policy applies'), ok('deployment', '1 deployment')
    ] };
const summary = { services: 2, covered: 1, checks: { repository: { ok: 1, stale: 0, missing: 1 }, pipeline: { ok: 1, stale: 1, missing: 0 }, sbom: { ok: 2, stale: 0, missing: 0 }, policy: { ok: 2, stale: 0, missing: 0 }, deployment: { ok: 2, stale: 0, missing: 0 } } };
(0, node_test_1.test)('matelot coverage: organization summary, project table, --uncovered with the fix commands', async () => {
    const seen = [];
    const server = (0, node_http_1.createServer)((req, res) => {
        seen.push(`${req.method} ${req.url}`);
        const body = req.url.startsWith(`/api/v1/projects/${PROJECT}/coverage`) ? { projectId: PROJECT, days: 30, summary, services: req.url.includes('uncovered=true') ? [worker] : [api, worker] } : { organizationId: ORG, days: 30, gap: null, summary, uncoveredTotal: 1, uncovered: [worker] };
        req.resume();
        req.on('end', () => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); });
    });
    const port = await new Promise((done) => server.listen(0, () => done(server.address().port)));
    const cli = (0, node_path_1.join)(__dirname, 'index.js');
    const out = async (...args) => (await run('node', [cli, 'coverage', ...args], { env: env(port) })).stdout;
    try {
        const org = await out('--org', ORG);
        strict_1.default.match(org, /^coverage: 1 of 2 services fully covered \(security pipeline window: 30 days\)\n/);
        strict_1.default.match(org, /repository {2}1\/2 with a repository +1 missing/);
        strict_1.default.match(org, /pipeline {4}1\/2 scanned in the last 30 days +1 stale/);
        strict_1.default.match(org, /Payments \/ worker +GAP +stale +ok +ok +ok/);
        strict_1.default.match(org, /fix with `matelot coverage --uncovered`/);
        const proj = await out('--project', PROJECT, '--days', '60');
        strict_1.default.match(proj, /\napi +ok +ok +ok +ok +ok\n/);
        strict_1.default.match(proj, /\nworker +GAP +stale/);
        const fixes = await out('--project', PROJECT, '--uncovered');
        strict_1.default.equal(fixes, 'worker — 2 gaps\n  # repository: no repository attached\n  matelot repository attach --service S2 --repository-id <id>\n  # pipeline: last finished 40 days ago (older than 30 days)\n  matelot pipeline --service S2 --template security --wait\n');
        const gap = await out('--org', ORG, '--gap', 'pipeline');
        strict_1.default.match(gap, /Payments \/ worker/);
        const json = JSON.parse(await out('--org', ORG, '--json'));
        strict_1.default.equal(json.summary.services, 2);
        strict_1.default.deepEqual(seen, [
            `GET /api/v1/organizations/${ORG}/coverage`,
            `GET /api/v1/projects/${PROJECT}/coverage?days=60`,
            `GET /api/v1/projects/${PROJECT}/coverage?uncovered=true`,
            `GET /api/v1/organizations/${ORG}/coverage?gap=pipeline`,
            `GET /api/v1/organizations/${ORG}/coverage`,
        ]);
    }
    finally {
        server.close();
    }
});
(0, node_test_1.test)('matelot coverage --days 1 says "1 day", not "1 days"', async () => {
    const server = (0, node_http_1.createServer)((req, res) => { req.resume(); req.on('end', () => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ organizationId: ORG, days: 1, gap: null, summary, uncoveredTotal: 0, uncovered: [] })); }); });
    const port = await new Promise((done) => server.listen(0, () => done(server.address().port)));
    try {
        const out = (await run('node', [(0, node_path_1.join)(__dirname, 'index.js'), 'coverage', '--org', ORG, '--days', '1'], { env: env(port) })).stdout;
        strict_1.default.match(out, /security pipeline window: 1 day\)/);
        strict_1.default.match(out, /scanned in the last day /);
        strict_1.default.doesNotMatch(out, /1 days/);
    }
    finally {
        server.close();
    }
});
