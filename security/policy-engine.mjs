import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_CONFIG_PATH = path.join(__dirname, 'security.config.json');

const HIGH_RISK_COMMAND_PATTERNS = [
  /\bcurl\b[^\n|]*\|\s*(?:sh|bash|zsh)\b/i,
  /\bwget\b[^\n|]*\|\s*(?:sh|bash|zsh)\b/i,
  /\brm\s+-rf\s+(?:\/|~|\$HOME)\b/i,
  /\b(?:sudo|su)\b/i,
  /\bchmod\s+(?:777|[ugoa]*\+s)\b/i,
  /\b(?:security|defaults)\s+.*(?:keychain|login)/i,
  /\b(?:nc|netcat|socat)\b/i,
  /\b(?:ssh|scp|sftp)\b/i
];

const SECRET_NAME = /(TOKEN|SECRET|PASSWORD|PASSWD|API_KEY|PRIVATE_KEY|CREDENTIAL|COOKIE|SESSION)/i;

function expandHome(p) {
  if (typeof p !== 'string') return p;
  return p === '~' ? os.homedir() : p.startsWith('~/') ? path.join(os.homedir(), p.slice(2)) : p;
}

function normalized(p) {
  return path.resolve(expandHome(p));
}

function pathInside(candidate, root) {
  const c = normalized(candidate);
  const r = normalized(root);
  return c === r || c.startsWith(r + path.sep);
}

function domainMatches(hostname, rule) {
  const host = hostname.toLowerCase();
  const r = String(rule).toLowerCase();
  if (r.startsWith('*.')) return host === r.slice(2) || host.endsWith('.' + r.slice(2));
  return host === r;
}

export function loadSecurityConfig(configPath = DEFAULT_CONFIG_PATH) {
  return JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

export function hashObject(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function evaluateAction(request, manifest, config = loadSecurityConfig()) {
  const reasons = [];
  const action = request?.action;
  if (!action || typeof action !== 'string') {
    return { decision: 'deny', reasons: ['Missing action identifier.'], approvalRequired: false };
  }

  if (config.execution.alwaysBlock.includes(action)) {
    return { decision: 'deny', reasons: [`Action ${action} is unconditionally blocked.`], approvalRequired: false };
  }

  if (!manifest || !manifest.permissions) {
    return { decision: 'deny', reasons: ['No validated skill manifest supplied.'], approvalRequired: false };
  }

  const permissions = manifest.permissions;

  if (action === 'shell.execute') {
    const command = String(request.command || '').trim();
    const executable = command.split(/\s+/)[0];
    const allowed = permissions.shell?.commands || [];
    if (!command || !allowed.includes(executable)) reasons.push(`Shell executable is not allowlisted: ${executable || '(missing)'}.`);
    if (HIGH_RISK_COMMAND_PATTERNS.some((rx) => rx.test(command))) reasons.push('Command matches a high-risk shell pattern.');
  }

  if (action.startsWith('filesystem.')) {
    const target = request.path;
    if (!target) reasons.push('Filesystem action is missing a target path.');
    if (target && config.filesystem.denyPaths.some((p) => pathInside(target, p))) reasons.push('Target is inside a globally denied filesystem path.');
    if (target) {
      const roots = action === 'filesystem.read' ? permissions.filesystem?.read || [] : permissions.filesystem?.write || [];
      if (!roots.some((root) => pathInside(target, root))) reasons.push(`Target path is outside the skill's ${action.endsWith('read') ? 'read' : 'write'} allowlist.`);
    }
  }

  if (action.startsWith('network.')) {
    let url;
    try { url = new URL(request.url); } catch { reasons.push('Network action has an invalid or missing URL.'); }
    if (url) {
      const scheme = url.protocol.replace(':', '');
      if (config.network.blockedSchemes.includes(scheme)) reasons.push(`Blocked URL scheme: ${scheme}.`);
      const domains = permissions.network?.domains || [];
      if (!domains.some((rule) => domainMatches(url.hostname, rule))) reasons.push(`Domain is not allowlisted: ${url.hostname}.`);
      const method = String(request.method || (action === 'network.get' ? 'GET' : 'POST')).toUpperCase();
      if (!(permissions.network?.methods || []).includes(method)) reasons.push(`HTTP method is not allowlisted: ${method}.`);
    }
  }

  if (action === 'secrets.read') {
    const name = String(request.name || '');
    if (!name || !(permissions.secrets?.names || []).includes(name)) reasons.push(`Secret is not explicitly allowlisted: ${name || '(missing)'}.`);
  }

  if (['email.send', 'calendar.write', 'github.write', 'finance.write', 'system.modify'].includes(action)) {
    if (!(permissions.sideEffects || []).includes(action)) reasons.push(`Side effect is not declared by the skill: ${action}.`);
  }

  if (request?.environment && typeof request.environment === 'object') {
    for (const key of Object.keys(request.environment)) {
      if (SECRET_NAME.test(key) && !(permissions.secrets?.names || []).includes(key)) reasons.push(`Undeclared sensitive environment variable requested: ${key}.`);
    }
  }

  if (reasons.length) return { decision: 'deny', reasons, approvalRequired: false };

  const approvalRequired = config.execution.requireApprovalFor.includes(action);
  return {
    decision: approvalRequired ? 'require_approval' : 'allow',
    reasons: approvalRequired ? [`Action ${action} passed policy but requires human approval.`] : [`Action ${action} is within declared permissions.`],
    approvalRequired
  };
}

export function redactAuditValue(value) {
  if (Array.isArray(value)) return value.map(redactAuditValue);
  if (!value || typeof value !== 'object') return value;
  const out = {};
  for (const [key, val] of Object.entries(value)) out[key] = SECRET_NAME.test(key) ? '[REDACTED]' : redactAuditValue(val);
  return out;
}

export function writeAuditEvent(event, auditDir = process.env.JACKCLAW_AUDIT_DIR || './audit-logs') {
  fs.mkdirSync(auditDir, { recursive: true, mode: 0o700 });
  const record = {
    timestamp: new Date().toISOString(),
    id: crypto.randomUUID(),
    ...redactAuditValue(event)
  };
  const day = record.timestamp.slice(0, 10);
  fs.appendFileSync(path.join(auditDir, `${day}.jsonl`), JSON.stringify(record) + '\n', { encoding: 'utf8', mode: 0o600 });
  return record.id;
}
