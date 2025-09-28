import { exec } from 'child_process';
import { promisify } from 'util';

export const execAsync = promisify(exec);

export interface ExecResult {
  stdout: string;
  stderr: string;
}

export interface ExecOptions {
  cwd?: string;
  timeout?: number;
  env?: Record<string, string>;
}

/**
 * Execute a command with better error handling and type safety
 */
export async function executeCommand(
  command: string,
  options: ExecOptions = {}
): Promise<ExecResult> {
  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd: options.cwd || process.cwd(),
      timeout: options.timeout || 60000,
      env: { ...process.env, ...options.env },
    });

    return { stdout, stderr };
  } catch (error: any) {
    // Enhance error with command context
    throw new Error(`Command failed: ${command}\nError: ${error.message}\nStdout: ${error.stdout || ''}\nStderr: ${error.stderr || ''}`);
  }
}