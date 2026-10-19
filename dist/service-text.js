"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.serviceText = serviceText;
const format_1 = require("./format");
function serviceText(s) {
    const lines = [`${s.name} (${s.slug}${s.kind ? `, ${s.kind}` : ''}${s.criticality ? `, ${s.criticality} criticality` : ''})  id ${s.id}`];
    const p = s.latestPipeline;
    if (p) {
        const bad = p.jobs.filter((j) => ['failed', 'timed_out'].includes(j.status));
        lines.push(`pipeline #${p.number}: ${p.status}${p.ref ? ` on ${p.ref}` : ''}${p.commitSha ? ` @ ${p.commitSha.slice(0, 7)}` : ''} (${(0, format_1.when)(p.finishedAt ?? p.createdAt)}) — ${p.jobs.map((j) => `${j.name} ${j.status}`).join(', ')}${bad.length ? `\n  ${bad.map((j) => `${j.name}: ${j.error ?? 'failed'}`).join('\n  ')}` : ''}`);
    }
    else
        lines.push('pipeline: none yet');
    const o = s.findings.open;
    lines.push(`open findings: ${o.total} (${o.critical} critical, ${o.high} high, ${o.medium} medium, ${o.low} low${o.unknown ? `, ${o.unknown} unknown` : ''})${s.findings.kev ? ` · ${s.findings.kev} known-exploited` : ''}`);
    const c = s.codeFindings.open;
    const byKind = (kind) => (s.codeFindings.rules ?? []).filter((r) => r.kind === kind).map((r) => `${r.ruleId.split('.').pop()}${r.n > 1 ? ` ×${r.n}` : ''}`);
    const detail = (kind) => { const r = byKind(kind); return r.length ? ` (${r.slice(0, 4).join(', ')}${r.length > 4 ? ', …' : ''})` : ''; };
    lines.push(`open code findings: ${c.secret} secrets${detail('secret')}, ${c.iac} infrastructure${detail('iac')}, ${c.sast} code${detail('sast')}`);
    lines.push(s.latestSbom ? `latest SBOM: ${s.latestSbom.target} ${s.latestSbom.targetRef} — ${s.latestSbom.componentCount} components (${(0, format_1.when)(s.latestSbom.createdAt)})` : 'latest SBOM: none');
    return lines.join('\n');
}
