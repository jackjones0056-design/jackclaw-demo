# JackClaw Security Model

JackClaw treats model output, third-party skills, plugins, downloaded code, and external content as untrusted input. The model may request actions; deterministic code decides whether those actions are permitted.

## Core rule

Never connect an LLM directly to unrestricted shell, filesystem, credentials, network, email, calendar, finance, or production APIs.

The intended runtime path is:

`Model -> Skill -> Action Request -> Policy Engine -> Human Approval (when required) -> Tool Execution -> Audit Log`

The model cannot disable or rewrite the policy engine, erase the audit trail, or export credentials.

## Third-party skills

Third-party skills are blocked by default until their exact staged contents are reviewed and hash-allowlisted.

OpenClaw currently supports `security.installPolicy`, which runs a trusted local command after source material is staged and before installation continues. JackClaw's hook is `openclaw/install-policy.mjs`.

The hook:

1. Validates the OpenClaw policy protocol.
2. Scans the staged skill before activation.
3. Rejects high-risk code patterns and unsafe payloads.
4. Copies blocked or untrusted skills into `~/.jackclaw/quarantine` for inspection.
5. Computes a deterministic SHA-256 over the staged contents.
6. Allows installation only when that exact hash appears in `security/trusted-sources.json`.
7. Fails closed on errors.

A popularity count, publisher name, ClawHub ranking, or previous version does not establish trust. Updates produce new contents and therefore require a new exact hash.

## Enable the OpenClaw gate

After cloning the repo on the OpenClaw host:

```bash
cd /absolute/path/to/jackclaw-demo
chmod 700 openclaw/install-policy.mjs
npm run security:test
```

Merge the settings from `openclaw/openclaw-security.example.json5` into `~/.openclaw/openclaw.json`, replacing every placeholder with the actual absolute path. Keep `trustedDirs` narrow.

Then validate OpenClaw's configuration and policy executable:

```bash
openclaw doctor
openclaw doctor --deep
openclaw security audit --deep
```

If the policy executable is unavailable or malformed, installs should fail closed.

## Reviewing a blocked skill

When an untrusted skill is attempted, JackClaw preserves a copy under `~/.jackclaw/quarantine` and returns its SHA-256 in the block reason.

Run:

```bash
npm run security:audit -- ~/.jackclaw/quarantine/<captured-skill> --external
```

Inspect `SKILL.md`, scripts, package metadata, dependencies, network destinations, credential access, install hooks, and any encoded or binary payloads. Scanner output is evidence, not proof of safety.

If the skill is acceptable, add the exact hash to `security/trusted-sources.json`:

```json
{
  "version": 1,
  "skills": [
    {
      "targetName": "example-skill",
      "version": "1.2.3",
      "originType": "clawhub",
      "sha256": "REPLACE_WITH_64_CHARACTER_HASH"
    }
  ]
}
```

Retry the install. Any content change invalidates the hash and forces another review.

## JackClaw-managed skills

Skills written specifically for JackClaw should include `skill.manifest.json`. Start from `skills/_template/skill.manifest.json` and request the minimum permissions required.

Declared permissions can cover:

- filesystem read/write roots
- allowed network domains and HTTP methods
- allowed shell executables
- named secrets
- explicit external side effects

`security/policy-engine.mjs` evaluates runtime action requests against those declarations. Sensitive writes and external side effects require human approval even when declared.

## Secret handling

The repository is public. Never commit populated `.env` files, API keys, OAuth tokens, cookies, private keys, credentials, OpenClaw state, quarantine contents, or audit logs. `.gitignore` blocks the common paths, but Git cannot protect a secret after someone deliberately commits it.

Use `.env.example` only as a template and store real credentials in the host's protected secret/config mechanism.

## Current limitations

The scanner is intentionally conservative and primarily static. It can detect known risky patterns, permission escalation, install hooks, credential references, obfuscation indicators, persistence behavior, prompt-level bypass instructions, and unknown payloads. It cannot prove arbitrary code is benign.

The strongest controls are therefore architectural: default deny, least privilege, exact-content pinning, quarantine, sandboxing, approval for consequential actions, and an execution boundary outside the model.
