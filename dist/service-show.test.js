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
const run = (0, node_util_1.promisify)(node_child_process_1.execFile);
const cli = `${__dirname}/index.js`;
const SVC = '6e6a3c53-7b9a-4e1e-9b0e-2c1f7c0a0002';
const summary = {
    id: SVC, slug: 'checkout', name: 'Checkout service', kind: 'api', criticality: 'HIGH', projectId: 'p1',
    latestPipeline: { id: 'pl1', number: 12, status: 'failed', ref: 'main', commitSha: 'abcdef1234567', createdAt: '2026-10-16T17:00:00.000Z', finishedAt: '2026-10-16T17:04:30.000Z', jobs: [{ name: 'checkout', status: 'succeeded' }, { name: 'sbom', status: 'succeeded' }, { name: 'secrets', status: 'failed', error: 'trivy failed (1): no output' }, { name: 'evaluate', status: 'skipped' }] },
    findings: { open: { critical: 1, high: 4, medium: 9, low: 2, unknown: 0, total: 16 }, kev: 1 },
    codeFindings: { open: { secret: 1, iac: 3, sast: 0 } },
    latestSbom: { id: 's1', target: 'source', targetRef: 'main', componentCount: 212, createdAt: '2026-10-16T17:02:00.000Z' },
};
(0, node_test_1.test)('matelot service show: one call (GET /services/:id/summary), latest pipeline + open findings as text, the object with --json', async () => {
    const urls = [];
    const server = (0, node_http_1.createServer)((req, res) => { urls.push(req.url); res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(summary)); });
    await new Promise((d) => server.listen(0, '127.0.0.1', () => d()));
    const env = { ...process.env, MATELOT_URL: `http://127.0.0.1:${server.address().port}`, MATELOT_TOKEN: 'spt_x', MATELOT_KEY_ID: '', MATELOT_SECRET: '', MATELOT_CREDENTIALS: '/nonexistent' };
    try {
        const { stdout } = await run('node', [cli, 'service', 'show', '--service', SVC], { env });
        strict_1.default.deepEqual(urls, [`/api/v1/services/${SVC}/summary`]);
        strict_1.default.equal(stdout, [
            `Checkout service (checkout, api, HIGH criticality)  id ${SVC}`,
            'pipeline #12: failed on main @ abcdef1 (2026-10-16 17:04) — checkout succeeded, sbom succeeded, secrets failed, evaluate skipped',
            '  secrets: trivy failed (1): no output',
            'open findings: 16 (1 critical, 4 high, 9 medium, 2 low) · 1 known-exploited',
            'open code findings: 1 secrets, 3 infrastructure, 0 code',
            'latest SBOM: source main — 212 components (2026-10-16)',
            '',
        ].join('\n'));
        const j = JSON.parse((await run('node', [cli, 'service', 'show', '--service', SVC, '--json'], { env })).stdout);
        strict_1.default.equal(j.findings.open.total, 16);
        strict_1.default.equal(j.latestPipeline.number, 12);
    }
    finally {
        server.close();
    }
});
