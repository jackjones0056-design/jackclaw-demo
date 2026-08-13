#!/usr/bin/env node
import path from 'node:path';
import { scanSkill } from '../security/skill-scanner.mjs';
import { loadSecurityConfig } from '../security/policy-engine.mjs';

const args = process.argv.slice(2);
const json = args.includes('--json');
const external = args.includes('--external');
const skillArg = args.find((arg) => !arg.startsWith('--'));

if (!skillArg) {
  console.error('Usage: node scripts/audit-skill.mjs <skill-directory> [--external] [--json]');
  process.exit(2);
}

try {
  const config = loadSecurityConfig();
  if (external) {
    config.skillInstall.requireManifest = false;
    config.skillInstall.requireHashPin = false;
  }
  const report = scanSkill(path.resolve(skillArg), { config });
  if (json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`JACKCLAW SKILL AUDIT // ${report.verdict.toUpperCase()}`);
    console.log(`Mode: ${external ? 'EXTERNAL / PRE-INSTALL' : 'MANAGED SKILL'}`);
    console.log(`Risk score: ${report.score}`);
    console.log(`SHA-256: ${report.sha256}`);
    console.log(`Files: ${report.fileCount} // Bytes: ${report.totalBytes}`);
    if (!report.findings.length) console.log('No scanner findings.');
    for (const finding of report.findings) console.log(`- [${finding.score}] ${finding.rule} // ${finding.file}: ${finding.message}`);
  }
  process.exitCode = report.verdict === 'block' ? 1 : report.verdict === 'review' ? 3 : 0;
} catch (error) {
  console.error(`JACKCLAW SKILL AUDIT // ERROR\n${error.message}`);
  process.exitCode = 2;
}
