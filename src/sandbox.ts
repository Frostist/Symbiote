import * as path from 'path';
import * as fs from 'fs';
import { spawn } from 'child_process';

export const SANDBOX_PATH: string = path.resolve(process.cwd(), '..');

export function validatePath(userPath: string): string {
  const resolved = path.resolve(SANDBOX_PATH, userPath);
  const safeSandbox = SANDBOX_PATH.endsWith(path.sep) ? SANDBOX_PATH : SANDBOX_PATH + path.sep;
  if (resolved !== SANDBOX_PATH && !resolved.startsWith(safeSandbox)) {
    throw new Error(`Access denied: "${userPath}" resolves outside the sandbox`);
  }
  return resolved;
}

const COMMAND_DENYLIST: RegExp[] = [
  /\bsudo\b/,
  /rm\s+-rf\s+\//,
  />\s*\/dev\/sd/,
  /\bdd\b.*of=\/dev/,
  /mkfs\b/,
];

export function checkCommand(command: string): void {
  for (const pattern of COMMAND_DENYLIST) {
    if (pattern.test(command)) {
      throw new Error(`Command blocked by safety rules: "${command}"`);
    }
  }
}

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export function sandboxedExec(
  command: string,
  timeoutMs = 300_000,
  stdin: 'pipe' | 'inherit' | 'ignore' = 'pipe'
): Promise<ExecResult> {
  checkCommand(command);

  return new Promise((resolve, reject) => {
    const child = spawn('bash', ['-c', command], {
      cwd: SANDBOX_PATH,
      env: { ...process.env },
      timeout: timeoutMs,
      stdio: [stdin, 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (d: Buffer) => { stdout += d.toString(); });
    child.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });

    child.on('close', (code: number | null) => {
      resolve({ stdout, stderr, exitCode: code ?? 1 });
    });

    child.on('error', reject);
  });
}

export function listDir(dirPath = '.'): string[] {
  const resolved = validatePath(dirPath);
  return fs.readdirSync(resolved);
}

export function statPath(dirPath: string): fs.Stats {
  const resolved = validatePath(dirPath);
  return fs.statSync(resolved);
}

export function readFile(filePath: string): string {
  const resolved = validatePath(filePath);
  return fs.readFileSync(resolved, 'utf-8');
}

export function writeFile(filePath: string, content: string): void {
  const resolved = validatePath(filePath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, content, 'utf-8');
}

export function deleteFile(filePath: string): void {
  const resolved = validatePath(filePath);
  fs.rmSync(resolved, { recursive: true, force: true });
}
