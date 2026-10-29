import { spawnSync } from 'node:child_process';

const result = spawnSync(process.execPath, ['--test', 'tests/browser.test.js'], { encoding: 'utf8', env: process.env, maxBuffer: 8 * 1024 * 1024 });
const stdout = result.stdout || '';
const stderr = result.stderr || '';
if (stdout) process.stdout.write(stdout);
if (stderr) process.stderr.write(stderr);
if (result.status !== 0) {
  if (process.env.GITHUB_ACTIONS) {
    const output = `${stdout}\n${stderr}`;
    const start = output.lastIndexOf('not ok ');
    const end = output.indexOf('\n1..', start);
    const details = (start >= 0 ? output.slice(start, end >= 0 ? end : undefined) : output).slice(-5000);
    const commandData = JSON.stringify(details).replace(/%/g, '%25');
    process.stdout.write(`::error file=tests/browser.test.js,title=Browser workflow failed::${commandData}\n`);
  }
  process.exit(result.status || 1);
}
