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
const ID = '9b7e2f8a-1c2d-4e5f-8a9b-0c1d2e3f4a5b';
const env = (port) => ({ ...process.env, MATELOT_URL: `http://127.0.0.1:${port}`, MATELOT_TOKEN: 'spt_test', MATELOT_CREDENTIALS: '/nonexistent' });
/** A cell whose cloud trust is configured only after the connection exists (as in reality). */
function cell() {
    let trusted = false;
    const seen = [];
    const server = (0, node_http_1.createServer)((req, res) => {
        let raw = '';
        req.on('data', (c) => (raw += c));
        req.on('end', () => {
            const body = raw ? JSON.parse(raw) : null;
            seen.push({ method: req.method, url: req.url, body });
            const send = (status, payload) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(payload)); };
            if (req.method === 'POST' && req.url === `/api/v1/organizations/${ORG}/integrations`)
                return send(201, { id: ID, provider: 'registry', authType: 'aws_wif', status: 'pending', keyless: true, verified: false, identity: { issuer: 'https://matelot.example', subject: `integration:${ID}`, warning: null } });
            if (req.method === 'POST' && req.url === `/api/v1/integrations/${ID}/verify`) {
                if (!trusted)
                    return send(400, { statusCode: 400, message: 'Connection check failed: STS AssumeRoleWithWebIdentity failed: 403 AccessDenied' });
                return send(200, { id: ID, verified: true, account: '123456789012.dkr.ecr.eu-central-1.amazonaws.com (keyless · arn:aws:iam::123456789012:role/matelot-ecr)' });
            }
            send(404, { statusCode: 404, message: `no route ${req.url}` });
        });
    });
    return { seen, server, trust: () => { trusted = true; }, listen: () => new Promise((r) => server.listen(0, () => r(server.address().port))) };
}
(0, node_test_1.test)('keyless create prints the subject to trust and the verify command; verify fails until the trust exists, then succeeds', async () => {
    const c = cell();
    const port = await c.listen();
    const cli = (0, node_path_1.join)(__dirname, 'index.js');
    try {
        const created = await run('node', [cli, 'connection', 'create', '--org', ORG, '--json', '--body', JSON.stringify({ provider: 'registry', name: 'ECR keyless', baseUrl: '123456789012.dkr.ecr.eu-central-1.amazonaws.com', auth: { type: 'aws_wif', roleArn: 'arn:aws:iam::123456789012:role/matelot-ecr', region: 'eu-central-1' } })], { env: env(port) });
        strict_1.default.equal(JSON.parse(created.stdout).id, ID); // --json stays pure: the hint goes to stderr
        strict_1.default.match(created.stderr, new RegExp(`exact subject integration:${ID}`));
        strict_1.default.match(created.stderr, new RegExp(`matelot connection verify --id ${ID}`));
        strict_1.default.doesNotMatch(created.stdout + created.stderr, /integration:pending/);
        await strict_1.default.rejects(run('node', [cli, 'connection', 'verify', '--id', ID], { env: env(port) }), (e) => { strict_1.default.notEqual(e.code, 0); strict_1.default.match(e.stderr, /AccessDenied/); return true; });
        c.trust();
        const ok = await run('node', [cli, 'connection', 'verify', '--id', ID], { env: env(port) });
        strict_1.default.equal(ok.stdout.trim(), 'verified: 123456789012.dkr.ecr.eu-central-1.amazonaws.com (keyless · arn:aws:iam::123456789012:role/matelot-ecr)'); // the summary only, no JSON
        const json = await run('node', [cli, 'connection', 'verify', '--id', ID, '--json'], { env: env(port) });
        strict_1.default.equal(JSON.parse(json.stdout).verified, true); // JSON only with --json
        strict_1.default.doesNotMatch(json.stdout, /^verified:/m);
        strict_1.default.equal(c.seen.filter((s) => s.url === `/api/v1/integrations/${ID}/verify`).length, 3);
    }
    finally {
        c.server.close();
    }
});
(0, node_test_1.test)('connection delete is a real delete (409 lists images; --force detaches) and disconnect is its own verb', async () => {
    const seen = [];
    const server = (0, node_http_1.createServer)((req, res) => {
        seen.push({ method: req.method, url: req.url });
        req.resume();
        req.on('end', () => {
            const send = (status, payload) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(payload)); };
            if (req.method === 'DELETE' && req.url === `/api/v1/integrations/${ID}`)
                return send(409, { statusCode: 409, message: '1 container image(s) pull through "ACR keyless": matelottest.azurecr.io/demo. Delete with force to detach them …', images: ['matelottest.azurecr.io/demo'] });
            if (req.method === 'DELETE' && req.url === `/api/v1/integrations/${ID}?force=true`)
                return send(200, { deleted: true, id: ID, name: 'ACR keyless', repositories: 0, imagesDetached: ['matelottest.azurecr.io/demo'] });
            if (req.method === 'POST' && req.url === `/api/v1/integrations/${ID}/disconnect`)
                return send(201, { id: ID, name: 'ACR keyless', status: 'disconnected' });
            send(404, { statusCode: 404, message: 'no route' });
        });
    });
    const port = await new Promise((r) => server.listen(0, () => r(server.address().port)));
    const cli = (0, node_path_1.join)(__dirname, 'index.js');
    try {
        await strict_1.default.rejects(run('node', [cli, 'connection', 'delete', '--id', ID], { env: env(port) }), (e) => { strict_1.default.match(e.stderr, /matelottest\.azurecr\.io\/demo/); return true; });
        const forced = await run('node', [cli, 'connection', 'delete', '--id', ID, '--force'], { env: env(port) });
        strict_1.default.equal(forced.stdout.trim(), 'deleted ACR keyless (0 repositories removed; images detached: matelottest.azurecr.io/demo)');
        const disc = await run('node', [cli, 'connection', 'disconnect', '--id', ID], { env: env(port) });
        strict_1.default.equal(disc.stdout.trim(), 'disconnected ACR keyless');
        strict_1.default.deepEqual(seen.map((s) => `${s.method} ${s.url}`), [`DELETE /api/v1/integrations/${ID}`, `DELETE /api/v1/integrations/${ID}?force=true`, `POST /api/v1/integrations/${ID}/disconnect`]);
    }
    finally {
        server.close();
    }
});
