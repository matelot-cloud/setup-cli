# matelot-cli

Command-line client for [Matelot](https://matelot-cloud.github.io/website/). Install (Node ≥ 18, no dependencies, no build): `npm install -g https://github.com/matelot-cloud/setup-cli/releases/latest/download/matelot-cli.tgz` — pinned: `releases/download/vX.Y.Z/matelot-cli-X.Y.Z.tgz` — or the GitHub Action below. Not `github:…#tag`: npm 10 leaves that install as a dangling symlink. Authenticates with **signed CI tokens** (HMAC over
timestamp, nonce, method, path and body — the secret never travels), created in a project's
*Settings → CI tokens*.

```bash
export MATELOT_URL=https://acme.secops.example.com MATELOT_KEY_ID=sk_… MATELOT_SECRET=sec_…
npx matelot-cli whoami
npx matelot-cli deploy --env <environmentId> --version 1.2.0 --image ghcr.io/acme/app@sha256:…
npx matelot-cli pipeline --service <serviceId> --ref $GITHUB_SHA --wait
npx matelot-cli sbom --service <serviceId> --file bom.cdx.json --target image --image ghcr.io/acme/app:1.2.0
```

GitHub Actions:

```yaml
- uses: matelot-cloud/setup-cli@v2             # installs the CLI at that tag, exports MATELOT_* from inputs
  with: { url: ${{ vars.MATELOT_URL }}, key-id: ${{ secrets.MATELOT_KEY_ID }}, secret: ${{ secrets.MATELOT_SECRET }} }
- run: matelot deploy --env ${{ vars.MATELOT_ENV_PRODUCTION }} --version ${{ github.ref_name }}
```

Exit codes: 0 ok · 1 error · 3 authentication failed. `--json` prints raw responses; `pipeline --wait` exits 1 when the pipeline does not succeed (use it as a gate).

## This repository

`matelot-cloud/setup-cli` is the published copy of the CLI (Apache-2.0): the source, the **compiled `dist/`** (so a git
install needs nothing but Node — no build step, no devDependencies), the `examples/` for GitHub Actions, GitLab CI and
Bitbucket Pipelines, and `action.yml` — so the same repository is both the npm-installable package
(every release attaches `matelot-cli-X.Y.Z.tgz` and `matelot-cli.tgz`; `npm install -g <asset URL>`) and the GitHub
Action (`uses: matelot-cloud/setup-cli@<tag>`, which installs the tag's source archive).
Tags: `v<major>` follows the latest release of that major (`v2`), `v2.22.0` pins one. It is written by the platform's
release pipeline on every CLI release; pull requests cannot be merged here — report problems in
[matelot-cloud/matelot](https://github.com/matelot-cloud/matelot/issues). Full command reference:
https://matelot-cloud.github.io/website/docs/latest/cli-reference.html
