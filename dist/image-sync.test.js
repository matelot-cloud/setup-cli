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
const SVC = '790ef01f-de6e-4a55-ae80-4b901416a609';
const IMG = '11111111-1111-4111-8111-111111111111';
(0, node_test_1.test)('matelot image sync --service --id calls the service-scoped route (was /images/:id/sync → 404)', async () => {
    const seen = [];
    const server = (0, node_http_1.createServer)((req, res) => { seen.push(`${req.method} ${req.url}`); res.writeHead(201, { 'content-type': 'application/json' }); res.end(JSON.stringify({ tags: 2 })); });
    const port = await new Promise((r) => server.listen(0, () => r(server.address().port)));
    try {
        const { stdout } = await run('node', [(0, node_path_1.join)(__dirname, 'index.js'), 'image', 'sync', '--service', SVC, '--id', IMG], { env: { ...process.env, MATELOT_URL: `http://127.0.0.1:${port}`, MATELOT_TOKEN: 'spt_test' } });
        strict_1.default.deepEqual(seen, [`POST /api/v1/services/${SVC}/images/${IMG}/sync`]);
        strict_1.default.match(stdout, /tags/);
    }
    finally {
        server.close();
    }
});
