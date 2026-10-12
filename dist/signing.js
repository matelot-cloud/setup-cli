"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.signatureHeader = signatureHeader;
const node_crypto_1 = require("node:crypto");
/** SecOps-HMAC-SHA256 v1 — identical to apps/api/src/tokens/signing.ts. */
function signatureHeader(keyId, secret, method, path, body, now = Math.floor(Date.now() / 1000)) {
    const nonce = (0, node_crypto_1.randomBytes)(16).toString('hex');
    const bodyHash = (0, node_crypto_1.createHash)('sha256').update(body).digest('hex');
    const sig = (0, node_crypto_1.createHmac)('sha256', secret).update(['v1', String(now), nonce, method.toUpperCase(), path, bodyHash].join('\n')).digest('hex');
    return `SecOps-HMAC-SHA256 keyId=${keyId},ts=${now},nonce=${nonce},sig=${sig}`;
}
