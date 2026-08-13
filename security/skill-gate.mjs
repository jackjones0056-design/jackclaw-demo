import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { scanSkill } from './skill-scanner.mjs';
import { loadSecurityConfig, writeAuditEvent } from './policy-engine.mjs';

function safeSkillName(name) {
  if (!/^[a-zA-Z0-9._-]+$/.test(name || '')) throw new Error('Unsafe or missing skill name.');
  return name;
}

export function stageSkill(sourceDir, options = {}) {
  const config = options.config || loadSecurityConfig(options.configPath);
  const quarantineRoot = path.resolve(options.quarantineDir || process.env.JACKCLAW_QUARANTINE_DIR || './quarantine');
  fs.mkdirSync(quarantineRoot, { recursive: true, mode: 0o700 });
  const stagedDir = path.join(quarantineRoot, `skill-${Date.now()}-${crypto.randomUUID()}`);
  fs.cpSync(path.resolve(sourceDir), stagedDir, { recursive: true, dereference: false, errorOnExist: true });

  let report;
  try {
    report = scanSkill(stagedDir, { config });
    writeAuditEvent({ event: 'skill.staged', sourceDir: path.resolve(sourceDir), stagedDir, verdict: report.verdict, score: report.score, sha256: report.sha256 });
    return { stagedDir, report };
  } catch (error) {
    writeAuditEvent({ event: 'skill.stage_failed', sourceDir: path.resolve(sourceDir), stagedDir, error: error.message });
    throw error;
  }
}

export function activateStagedSkill(stagedDir, destinationRoot, options = {}) {
  const config = options.config || loadSecurityConfig(options.configPath);
  const report = scanSkill(stagedDir, { config });
  const manifest = report.manifest;
  if (!manifest) throw new Error('Skill cannot be activated without a valid manifest.');
  if (report.verdict === 'block') throw new Error(`Skill blocked by JackClaw security policy (risk ${report.score}).`);

  const thirdParty = manifest.source?.type !== 'local';
  const approvalRequired = report.verdict === 'review' || (thirdParty && !config.skillInstall.allowUntrusted);
  if (approvalRequired && options.approvedByUser !== true) throw new Error('Explicit human approval is required before this skill can be activated.');

  const name = safeSkillName(manifest.name);
  const root = path.resolve(destinationRoot);
  const destination = path.join(root, name);
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  if (fs.existsSync(destination)) throw new Error(`Refusing to overwrite existing skill: ${name}`);

  fs.cpSync(path.resolve(stagedDir), destination, { recursive: true, dereference: false, errorOnExist: true });
  const installedReport = scanSkill(destination, { config });
  if (installedReport.sha256 !== report.sha256 || installedReport.verdict !== report.verdict) {
    fs.rmSync(destination, { recursive: true, force: true });
    throw new Error('Post-copy verification failed; activated copy did not match staged skill.');
  }

  writeAuditEvent({ event: 'skill.activated', skill: name, destination, verdict: report.verdict, score: report.score, sha256: report.sha256, approvedByUser: options.approvedByUser === true });
  if (options.keepQuarantine !== true) fs.rmSync(stagedDir, { recursive: true, force: true });

  return { destination, report: installedReport };
}
