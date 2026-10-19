"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_crypto_1 = require("node:crypto");
const node_test_1 = require("node:test");
const signing_1 = require("./signing");
(0, node_test_1.test)('signature header matches the platform scheme', () => {
    const body = Buffer.from('{"version":"1.0.0"}');
    const header = (0, signing_1.signatureHeader)('sk_1', 'sec', 'POST', '/api/v1/x', body, 1_700_000_000);
    const m = /^SecOps-HMAC-SHA256 keyId=sk_1,ts=1700000000,nonce=([0-9a-f]{32}),sig=([0-9a-f]{64})$/.exec(header);
    strict_1.default.ok(m);
    const bodyHash = (0, node_crypto_1.createHash)('sha256').update(body).digest('hex');
    const expected = (0, node_crypto_1.createHmac)('sha256', 'sec').update(['v1', '1700000000', m[1], 'POST', '/api/v1/x', bodyHash].join('\n')).digest('hex');
    strict_1.default.equal(m[2], expected);
});
