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
const client_1 = require("./client");
const run = (0, node_util_1.promisify)(node_child_process_1.execFile);
const ID = '0c3cbf3d-31cf-41bd-884a-7e085e66f4d8';
(0, node_test_1.test)('unsampledTraceparent: W3C format with the sampled flag off', () => {
    for (let i = 0; i < 20; i++)
        strict_1.default.match((0, client_1.unsampledTraceparent)(), /^00-[0-9a-f]{32}-[0-9a-f]{16}-00$/);
    strict_1.default.notEqual((0, client_1.unsampledTraceparent)(), (0, client_1.unsampledTraceparent)());
});
(0, node_test_1.test)('pipeline --wait: the polls carry an unsampled traceparent (no trace at the cell); the run request carries none', async () => {
    const seen = [];
    let polls = 0;
    const server = (0, node_http_1.createServer)((req, res) => {
        let raw = '';
        req.on('data', (c) => (raw += c));
        req.on('end', () => {
            seen.push({ url: req.url, traceparent: req.headers.traceparent });
            res.writeHead(200, { 'content-type': 'application/json' });
            if (req.method === 'POST')
                res.end(JSON.stringify({ id: ID, number: 7, status: 'running', jobs: [{ name: 'checkout', status: 'queued' }] }));
            else {
                polls++;
                res.end(JSON.stringify({ id: ID, number: 7, status: polls >= 2 ? 'succeeded' : 'running', jobs: [{ name: 'checkout', status: polls >= 2 ? 'succeeded' : 'running' }] }));
            }
        });
    });
    const port = await new Promise((r) => server.listen(0, () => r(server.address().port)));
    try {
        const { stdout } = await run('node', [(0, node_path_1.join)(__dirname, 'index.js'), 'pipeline', '--service', ID, '--wait'], { env: { ...process.env, MATELOT_URL: `http://127.0.0.1:${port}`, MATELOT_TOKEN: 'spt_test', MATELOT_CREDENTIALS: '/nonexistent' }, timeout: 30000 });
        strict_1.default.match(stdout, /pipeline #7: succeeded/);
        strict_1.default.equal(seen[0].url, `/api/v1/services/${ID}/pipelines`);
        strict_1.default.equal(seen[0].traceparent, undefined); // the run itself may be traced by the cell
        const pollRequests = seen.filter((s) => s.url === `/api/v1/pipelines/${ID}`);
        strict_1.default.equal(pollRequests.length, 2);
        for (const p of pollRequests)
            strict_1.default.match(p.traceparent ?? '', /^00-[0-9a-f]{32}-[0-9a-f]{16}-00$/);
    }
    finally {
        server.close();
    }
});
