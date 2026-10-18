"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.serviceText = serviceText;
function serviceText(s) {
    const lines = [`${s.name} (${s.slug}${s.kind ? `, ${s.kind}` : ''}${s.criticality ? `, ${s.criticality} criticality` : ''})  id ${s.id}`];
    const p = s.latestPipeline;
    if (p) {
        const when = p.finishedAt ?? p.createdAt;
        const bad = p.jobs.filter((j) => ['failed', 'timed_out'].includes(j.status));
        lines.push(`pipeline #${p.number}: ${p.status}${p.ref ? ` on ${p.ref}` : ''}${p.commitSha ? ` @ ${p.commitSha.slice(0, 7)}` : ''} (${when.slice(0, 16).replace('T', ' ')}) — ${p.jobs.map((j) => `${j.name} ${j.status}`).join(', ')}${bad.length ? `\n  ${bad.map((j) => `${j.name}: ${j.error ?? 'failed'}`).join('\n  ')}` : ''}`);
    }
    else
        lines.push('pipeline: none yet');
    const o = s.findings.open;
    lines.push(`open findings: ${o.total} (${o.critical} critical, ${o.high} high, ${o.medium} medium, ${o.low} low${o.unknown ? `, ${o.unknown} unknown` : ''})${s.findings.kev ? ` · ${s.findings.kev} known-exploited` : ''}`);
    const c = s.codeFindings.open;
    lines.push(`open code findings: ${c.secret} secrets, ${c.iac} infrastructure, ${c.sast} code`);
    lines.push(s.latestSbom ? `latest SBOM: ${s.latestSbom.target} ${s.latestSbom.targetRef} — ${s.latestSbom.componentCount} components (${s.latestSbom.createdAt.slice(0, 10)})` : 'latest SBOM: none');
    return lines.join('\n');
}
