import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';

import { buildDigest, renderDigestMarkdown } from '../services/digest';

const prisma = new PrismaClient();
const DEFAULT_OUTPUT_DIR = join(process.cwd(), 'storage', 'digests');

interface DigestCliOptions {
  outputPath: string;
  writeToStdout: boolean;
}

function parseArgs(): DigestCliOptions {
  const argv = process.argv.slice(2);
  let outputPath: string | undefined;
  let writeToStdout = false;

  argv.forEach((arg) => {
    if (arg.startsWith('--output=')) {
      const value = arg.split('=')[1];
      if (value) {
        outputPath = resolve(process.cwd(), value);
      }
    }
    if (arg === '--stdout') {
      writeToStdout = true;
    }
  });

  if (!outputPath) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    outputPath = join(DEFAULT_OUTPUT_DIR, `digest-${timestamp}.md`);
  }

  return { outputPath, writeToStdout };
}

async function main() {
  const options = parseArgs();

  console.info('Collecting daily digest data...');
  const digestData = await buildDigest(prisma);
  const markdown = renderDigestMarkdown(digestData);

  const directory = dirname(options.outputPath);
  await mkdir(directory, { recursive: true });
  await writeFile(options.outputPath, markdown, 'utf8');
  console.info(`Digest saved to ${options.outputPath}`);

  if (options.writeToStdout) {
    console.log('\n--- Digest Preview ---\n');
    console.log(markdown);
    console.log('\n----------------------');
  }
}

main()
  .catch((error) => {
    console.error('Failed to generate digest', error);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
