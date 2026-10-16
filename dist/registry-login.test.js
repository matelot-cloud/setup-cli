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
const node_fs_1 = require("node:fs");
const node_os_1 = require("node:os");
const run = (0, node_util_1.promisify)(node_child_process_1.execFile);
/** A fake `docker` on PATH that records its arguments and stdin. */
function fakeDocker() {
    const dir = (0, node_fs_1.mkdtempSync)((0, node_path_1.join)((0, node_os_1.tmpdir)(), 'fake-docker-'));
    const log = (0, node_path_1.join)(dir, 'calls.log');
    (0, node_fs_1.writeFileSync)((0, node_path_1.join)(dir, 'docker'), `#!/bin/sh\nread -r pw\necho "$@ pw=$pw" >> "${log}"\n`);
    (0, node_fs_1.chmodSync)((0, node_path_1.join)(dir, 'docker'), 0o755);
    return { dir, log };
}
function stub() {
    const server = (0, node_http_1.createServer)((_req, res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ available: true, host: 'localhost:5000' })); });
    return { server, listen: () => new Promise((r) => server.listen(0, () => r(server.address().port))) };
}
(0, node_test_1.test)('registry login with a CI token: docker login -u <keyId> with the secret', async () => {
    const s = stub();
    const port = await s.listen();
    const d = fakeDocker();
    try {
        await run('node', [(0, node_path_1.join)(__dirname, 'index.js'), 'registry', 'login'], { env: { ...process.env, PATH: `${d.dir}:${process.env.PATH}`, MATELOT_URL: `http://127.0.0.1:${port}`, MATELOT_KEY_ID: 'sk_abc', MATELOT_SECRET: 'sec_xyz', MATELOT_TOKEN: '' } });
        strict_1.default.match(require('node:fs').readFileSync(d.log, 'utf8'), /login localhost:5000 -u sk_abc --password-stdin pw=sec_xyz/);
    }
    finally {
        s.server.close();
    }
});
(0, node_test_1.test)('registry login with a personal token: docker login -u token with the spt_ secret (was "username is empty")', async () => {
    const s = stub();
    const port = await s.listen();
    const d = fakeDocker();
    try {
        await run('node', [(0, node_path_1.join)(__dirname, 'index.js'), 'registry', 'login'], { env: { ...process.env, PATH: `${d.dir}:${process.env.PATH}`, MATELOT_URL: `http://127.0.0.1:${port}`, MATELOT_TOKEN: 'spt_personal123', MATELOT_KEY_ID: '', MATELOT_SECRET: '' } });
        strict_1.default.match(require('node:fs').readFileSync(d.log, 'utf8'), /login localhost:5000 -u token --password-stdin pw=spt_personal123/);
    }
    finally {
        s.server.close();
    }
});
