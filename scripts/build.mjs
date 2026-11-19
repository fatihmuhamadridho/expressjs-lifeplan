import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import process from 'node:process';
import { build } from 'esbuild';

await mkdir('dist', { recursive: true });
await build({
  entryPoints: ['src/index.ts'],
  outfile: 'dist/index.cjs',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  packages: 'external',
  target: 'node22',
});

if (process.env.VERCEL) {
  const output = '.vercel/output';
  const functionDir = `${output}/functions/api.func`;
  const packageJson = JSON.parse(await readFile('package.json', 'utf8'));

  await mkdir(functionDir, { recursive: true });
  await writeFile(`${functionDir}/index.cjs`, await readFile('dist/index.cjs'));
  await writeFile(
    `${functionDir}/package.json`,
    JSON.stringify({ private: true, dependencies: packageJson.dependencies }, null, 2)
  );
  const installArgs = ['install', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'];
  const command = process.platform === 'win32' ? process.env.ComSpec : 'npm';
  const args = process.platform === 'win32' ? ['/d', '/s', '/c', 'npm.cmd', ...installArgs] : installArgs;
  execFileSync(command, args, { cwd: functionDir, stdio: 'inherit' });
  await writeFile(
    `${functionDir}/.vc-config.json`,
    JSON.stringify({ runtime: 'nodejs22.x', handler: 'index.cjs', launcherType: 'Nodejs' }, null, 2)
  );
  await writeFile(
    `${output}/config.json`,
    JSON.stringify({ version: 3, routes: [{ src: '/(.*)', dest: '/api' }] }, null, 2)
  );
}
