import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { loadSecurityConfig } from './policy-engine.mjs';

const RULES = [
  { id: 'PIPE_TO_SHELL', score: 45, rx: /\b(?:curl|wget)\b[^\n|]*\|\s*(?:sh|bash|zsh)\b/i, message: 'Downloads content and pipes it directly into a shell.' },
  { id: 'SHELL_EXEC', score: 18, rx: /\b(?:child_process|execSync|spawnSync|execFileSync|os\.system|subprocess\.(?:run|Popen|call))\b/i, message: 'Executes operating-system commands.' },
  { id: 'DYNAMIC_CODE', score: 25, rx: /\b(?:eval\s*\(|new\s+Function\s*\(|vm\.runIn)/i, message: 'Uses dynamic code execution.' },
  { id: 'CREDENTIAL_PATH', score: 35, rx: /(?:\.ssh|\.gnupg|\.aws\/credentials|Keychains|Login Data|Cookies|credentials\.json)/i, message: 'References common credential or key stores.' },
  { id: 'SECRET_ENV', score: 14, rx: /(?:process\.env|os\.environ|getenv\()[^\n]{0,120}(?:TOKEN|SECRET|PASSWORD|API_KEY|PRIVATE_KEY|COOKIE|SESSION)/i, message: 'Reads sensitive environment variables.' },
  { id: 'NETWORK_POST', score: 12, rx: /\b(?:fetch|axios\.(?:post|put|patch)|requests\.(?:post|put|patch)|http\.request|https\.request)\b/i, message: 'Can transmit data over the network.' },
  { id: 'ENCODED_BLOB', score: 15, rx: /(?:[A-Za-z0-9+/]{180,}={0,2}|\\x[0-9a-fA-F]{2}(?:\\x[0-9a-fA-F]{2}){20,})/, message: 'Contains a large encoded or obfuscated blob.' },
  { id: 'PERSISTENCE', score: 32, rx: /(?:LaunchAgents|LaunchDaemons|crontab|systemctl\s+enable|schtasks|StartupItems)/i, message: 'Contains persistence-related behavior.' },
  { id: 'PERMISSION_CHANGE', score: 18, rx: /\b(?:chmod|chown|setfacl)\b/i, message: 'Changes filesystem permissions or ownership.' },
  { id: 'REMOTE_SHELL', score: 40, rx: /\b(?:nc|netcat|socat)\b[^\n]{0,120}(?:-e|exec|bash|sh)/i, message: 'Contains a potential remote-shell pattern.' },
  { id: 'PROMPT_BYPASS', score: 22, rx: /(?:ignore (?:all|any|the) previous instructions|bypass (?:security|policy)|disable (?:security|guardrails|logging)|do not tell the user)/i, message: 'Contains instructions attempting to bypass policy or conceal behavior.' }
];

const TEXT_EXTENSIONS = new Set(['.md', '.txt', '.json', '.yaml', '.yml', '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.py', '.sh', '.bash', '.zsh', '.ps1', '.toml', '.ini', '.cfg', '.conf', '.html']);
const ALWAYS_TEXT = new Set(['SKILL.md', 'package.json', 'package-lock.json', 'requirements.txt', 'pyproject.toml', 'Dockerfile', 'Makefile']);

function isTextCandidate(file) {
  return ALWAYS_TEXT.has(path.basename(file)) || TEXT_EXTENSIONS.has(path.extname(file).toLowerCase());
}

function walk(root, config) {
  const rootReal = fs.realpathSync(root);
  const files = [];
  let totalBytes = 0;
  const stack = [rootReal];

  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      const stat = fs.lstatSync(full);
      if (stat.isSymbolicLink()) {
        if (!config.skillInstall.allowSymlinks) throw new Error(`Symlink rejected: ${path.relative(rootReal, full)}`);
        const real = fs.realpathSync(full);
        if (!(real === rootReal || real.startsWith(rootReal + path.sep))) throw new Error(`Symlink escapes skill root: ${path.relative(rootReal, full)}`);
      }
      if (stat.isDirectory()) stack.push(full);
      else if (stat.isFile()) {
        totalBytes += stat.size;
        if (totalBytes > config.skillInstall.maxSkillBytes) throw new Error(`Skill exceeds ${config.skillInstall.maxSkillBytes} byte limit.`);
        files.push({ full, relative: path.relative(rootReal, full), size: stat.size });
      }
    }
  }
  return { rootReal, files, totalBytes };
}

function hashDirectory(files) {
  const hash = crypto.createHash('sha256');
  for (const file of [...files].sort((a, b) => a.relative.localeCompare(b.relative))) {
    hash.update(file.relative.replaceAll(path.sep, '/'));
    hash.update('\0');
    hash.update(fs.readFileSync(file.full));
    hash.update('\0');
  }
  return hash.digest('hex');
}

function inspectPackageJson(text, file) {
  const findings = [];
  try {
    const pkg = JSON.parse(text);
    const scripts = pkg.scripts || {};
    for (const hook of ['preinstall', 'install', 'postinstall', 'prepare']) {
      if (scripts[hook]) findings.push({ rule: 'INSTALL_HOOK', score: 28, file, message: `package.json defines ${hook}: ${scripts[hook]}` });
    }
  } catch {
    findings.push({ rule: 'INVALID_PACKAGE_JSON', score: 10, file, message: 'package.json could not be parsed.' });
  }
  return findings;
}

export function scanSkill(skillDir, options = {}) {
  const config = options.config || loadSecurityConfig(options.configPath);
  const { rootReal, files, totalBytes } = walk(skillDir, config);
  const findings = [];
  let manifest = null;

  const manifestFile = files.find((f) => f.relative === 'skill.manifest.json');
  if (!manifestFile && config.skillInstall.requireManifest) findings.push({ rule: 'MISSING_MANIFEST', score: 40, file: 'skill.manifest.json', message: 'Required JackClaw permission manifest is missing.' });
  if (manifestFile) {
    try { manifest = JSON.parse(fs.readFileSync(manifestFile.full, 'utf8')); }
    catch { findings.push({ rule: 'INVALID_MANIFEST', score: 40, file: manifestFile.relative, message: 'Permission manifest is not valid JSON.' }); }
  }

  for (const file of files) {
    if (!isTextCandidate(file.relative)) continue;
    if (file.size > config.skillInstall.maxFileBytes) {
      findings.push({ rule: 'OVERSIZED_FILE', score: 18, file: file.relative, message: `Text file exceeds ${config.skillInstall.maxFileBytes} bytes and was not content-scanned.` });
      continue;
    }
    const text = fs.readFileSync(file.full, 'utf8');
    for (const rule of RULES) {
      if (rule.rx.test(text)) findings.push({ rule: rule.id, score: rule.score, file: file.relative, message: rule.message });
    }
    if (path.basename(file.relative) === 'package.json') findings.push(...inspectPackageJson(text, file.relative));
  }

  const sha256 = hashDirectory(files);
  if (config.skillInstall.requireHashPin && manifest?.source?.type !== 'local') {
    if (!manifest?.source?.sha256) findings.push({ rule: 'UNPINNED_SOURCE', score: 25, file: 'skill.manifest.json', message: 'Third-party skill is not pinned to an expected SHA-256.' });
    else if (manifest.source.sha256.toLowerCase() !== sha256.toLowerCase()) findings.push({ rule: 'HASH_MISMATCH', score: 50, file: 'skill.manifest.json', message: 'Skill content does not match the pinned SHA-256.' });
  }

  const score = findings.reduce((sum, f) => sum + f.score, 0);
  const verdict = score >= config.riskThresholds.blockMin ? 'block' : score <= config.riskThresholds.allowMax ? 'allow' : 'review';

  return {
    skillDir: rootReal,
    sha256,
    totalBytes,
    fileCount: files.length,
    score,
    verdict,
    manifest,
    findings
  };
}
