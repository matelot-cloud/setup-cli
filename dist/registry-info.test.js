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
const registry_info_1 = require("./registry-info");
const run = (0, node_util_1.promisify)(node_child_process_1.execFile);
const cli = `${__dirname}/index.js`;
(0, node_test_1.test)('registry info: human-readable host, login, path pattern and the refusal rule; --json stays raw', async () => {
    const text = (0, registry_info_1.registryInfoText)({ available: true, host: 'localhost:5000', pathCommand: 'matelot registry path --service <serviceId> [--env <environmentId>]' });
    strict_1.default.match(text, /^built-in registry: localhost:5000$/m);
    strict_1.default.match(text, /localhost:5000\/<workspace>\/<team>\/<project>\/<service>:<tag>/);
    strict_1.default.match(text, /matelot registry path --service <serviceId>/);
    strict_1.default.match(text, /insufficient_scope: authorization failed/);
    strict_1.default.equal((0, registry_info_1.registryInfoText)({ available: false, host: null }), 'built-in registry: not configured on this cell (REGISTRY_HOST)');
    const server = (0, node_http_1.createServer)((req, res) => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(req.url === '/api/v1/registry/info' ? { available: true, host: 'localhost:5000', pathCommand: 'x' } : {}));
    });
    await new Promise((d) => server.listen(0, '127.0.0.1', () => d()));
    const url = `http://127.0.0.1:${server.address().port}`;
    try {
        const env = { ...process.env, MATELOT_URL: url, MATELOT_TOKEN: 'spt_x', MATELOT_KEY_ID: '', MATELOT_SECRET: '', MATELOT_CREDENTIALS: '/nonexistent' };
        strict_1.default.match((await run('node', [cli, 'registry', 'info'], { env })).stdout, /built-in registry: localhost:5000\nlogin:/);
        strict_1.default.equal(JSON.parse((await run('node', [cli, 'registry', 'info', '--json'], { env })).stdout).host, 'localhost:5000');
    }
    finally {
        server.close();
    }
});
