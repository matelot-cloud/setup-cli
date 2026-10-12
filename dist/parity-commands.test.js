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
const resources_1 = require("./resources");
const run = (0, node_util_1.promisify)(node_child_process_1.execFile);
const WS = '22222222-2222-4222-8222-222222222222';
const PROJ = '33333333-3333-4333-8333-333333333333';
function stub() {
    const seen = [];
    const server = (0, node_http_1.createServer)((req, res) => { let raw = ''; req.on('data', (c) => (raw += c)); req.on('end', () => { seen.push({ method: req.method, url: req.url, body: raw ? JSON.parse(raw) : null }); res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: true })); }); });
    return { seen, server, listen: () => new Promise((r) => server.listen(0, () => r(server.address().port))) };
}
const env = (port) => ({ ...process.env, MATELOT_URL: `http://127.0.0.1:${port}`, MATELOT_TOKEN: 'spt_test' });
(0, node_test_1.test)('generated parity commands: path params from --workspace/--team/--project, fields from flags, --body merged', async () => {
    const s = stub();
    const port = await s.listen();
    try {
        await run('node', [(0, node_path_1.join)(__dirname, 'index.js'), 'team', 'create', '--workspace', WS, '--slug', 'payments', '--name', 'Payments', '--json'], { env: env(port) });
        await run('node', [(0, node_path_1.join)(__dirname, 'index.js'), 'env', 'settings', '--env', PROJ, '--protected', 'true', '--kubernetes-namespace', 'payments-prod', '--json'], { env: env(port) });
        await run('node', [(0, node_path_1.join)(__dirname, 'index.js'), 'connection', 'create', '--org', WS, '--body', '{"provider":"jira","scopeType":"PROJECT","scopeId":"' + PROJ + '","name":"Jira","baseUrl":"https://acme.atlassian.net","auth":{"type":"basic","username":"u","password":"p"}}', '--json'], { env: env(port) });
        strict_1.default.deepEqual(s.seen.map((x) => `${x.method} ${x.url}`), [`POST /api/v1/workspaces/${WS}/teams`, `PATCH /api/v1/environments/${PROJ}/settings`, `POST /api/v1/organizations/${WS}/integrations`]);
        strict_1.default.deepEqual(s.seen[0].body, { slug: 'payments', name: 'Payments' });
        strict_1.default.deepEqual(s.seen[1].body, { protected: true, kubernetesNamespace: 'payments-prod' }); // booleans parsed, flags mapped
        strict_1.default.equal(s.seen[2].body.auth.type, 'basic'); // nested body intact
    }
    finally {
        s.server.close();
    }
});
(0, node_test_1.test)('every command is listed in --help (resources + custom)', async () => {
    const { stdout } = await run('node', [(0, node_path_1.join)(__dirname, 'index.js')], { env: env(1) }).catch((e) => e);
    for (const r of resources_1.RESOURCES)
        strict_1.default.ok(stdout.includes(`matelot ${r.resource}`) || stdout.includes(` ${r.resource} `) || stdout.includes(`${r.resource} <`), `help lists ${r.resource}`);
    for (const c of resources_1.CUSTOM_COMMANDS)
        strict_1.default.ok(stdout.includes(c.cmd.split(' ')[1]), `help lists ${c.cmd}`);
});
