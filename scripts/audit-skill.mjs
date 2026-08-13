#!/usr/bin/env node
import path from 'node:path';
import { scanSkill } from '../security/skill-scanner.mjs';

const args = process.argv.slice(2);
const json = args.includes('--json');
const skillArg = args.find((arg) => !arg.startsWith('--'));

if (!skillArg) {
  console.error('Usage: node scripts/audit-skill.mjs <skill-directory> [--json]');
  process.exit(2);
}

try {
  const report = scanSkill(path.resolve(skillArg));
  if (json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`JACKCLAW SKILL AUDIT // ${report.verdict.toUpperCase()}`);
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
