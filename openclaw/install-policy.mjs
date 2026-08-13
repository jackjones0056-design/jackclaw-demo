#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanSkill } from '../security/skill-scanner.mjs';
import { loadSecurityConfig } from '../security/policy-engine.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const trustFile = process.env.JACKCLAW_TRUSTED_SOURCES || path.join(repoRoot, 'security', 'trusted-sources.json');
const quarantineRoot = process.env.JACKCLAW_QUARANTINE_DIR || path.join(os.homedir(), '.jackclaw', 'quarantine');

function respond(decision, reason) {
  const output = { protocolVersion: 1, decision };
  if (reason) output.reason = reason;
  process.stdout.write(JSON.stringify(output));
}

function safeName(value) {
  return String(value || 'unknown').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100);
}

function loadTrust() {
  try {
    const data = JSON.parse(fs.readFileSync(trustFile, 'utf8'));
    return Array.isArray(data.skills) ? data.skills : [];
  } catch {
    return [];
  }
}

function isTrusted(request, sha256) {
  const version = request.origin?.version || request.source?.version || null;
  return loadTrust().some((entry) => {
    if (entry.targetName !== request.targetName) return false;
    if (String(entry.sha256 || '').toLowerCase() !== sha256.toLowerCase()) return false;
    if (entry.version && entry.version !== version) return false;
    if (entry.originType && entry.originType !== request.origin?.type) return false;
    return true;
  });
}

function quarantine(request, report) {
  fs.mkdirSync(quarantineRoot, { recursive: true, mode: 0o700 });
  const label = `${safeName(request.targetName)}-${Date.now()}-${report.sha256.slice(0, 12)}`;
  const destination = path.join(quarantineRoot, label);
  fs.cpSync(request.sourcePath, destination, { recursive: true, dereference: false, errorOnExist: true });
  fs.writeFileSync(path.join(destination, '.jackclaw-audit.json'), JSON.stringify({
    capturedAt: new Date().toISOString(),
    targetName: request.targetName,
    origin: request.origin || null,
    source: request.source || null,
    sha256: report.sha256,
    score: report.score,
    verdict: report.verdict,
    findings: report.findings
  }, null, 2), { mode: 0o600 });
  return destination;
}

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  raw += chunk;
  if (raw.length > 2_000_000) process.exit(2);
});

process.stdin.on('end', () => {
  try {
    const request = JSON.parse(raw);
    if (request.protocolVersion !== 1) return respond('block', 'Unsupported install-policy protocol version.');
    if (request.targetType !== 'skill') return respond('block', 'JackClaw install policy is configured for skills only.');
    if (request.sourcePathKind !== 'directory' || !request.sourcePath || !fs.statSync(request.sourcePath).isDirectory()) return respond('block', 'Skill source is not a readable staged directory.');

    const config = loadSecurityConfig();
    config.skillInstall.requireManifest = false;
    config.skillInstall.requireHashPin = false;
    const report = scanSkill(request.sourcePath, { config });

    if (report.verdict === 'block') {
      const captured = quarantine(request, report);
      return respond('block', `JackClaw scanner blocked this skill (risk ${report.score}, sha256 ${report.sha256}). Quarantined at ${captured}`);
    }

    if (!isTrusted(request, report.sha256)) {
      const captured = quarantine(request, report);
      return respond('block', `Skill is not hash-allowlisted (sha256 ${report.sha256}). Review ${captured}, then add the exact hash to security/trusted-sources.json before retrying.`);
    }

    return respond('allow');
  } catch (error) {
    return respond('block', `JackClaw install policy failed closed: ${error.message}`);
  }
});
