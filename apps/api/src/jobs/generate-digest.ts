import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, parse, resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';

import { buildDigest, renderDigestMarkdown, renderDigestHtml, summarizeDigest } from '../services/digest';

const prisma = new PrismaClient();
const DEFAULT_OUTPUT_DIR = join(process.cwd(), 'storage', 'digests');

interface DigestCliOptions {
  outputPath: string;
  writeToStdout: boolean;
  format: 'markdown' | 'html' | 'both';
}

function parseArgs(): DigestCliOptions {
  const argv = process.argv.slice(2);
  let outputPath: string | undefined;
  let writeToStdout = false;
  let format: 'markdown' | 'html' | 'both' = 'markdown';

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
    if (arg.startsWith('--format=')) {
      const value = arg.split('=')[1];
      if (value === 'html' || value === 'both' || value === 'markdown') {
        format = value;
      }
    }
  });

  if (!outputPath) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    outputPath = join(DEFAULT_OUTPUT_DIR, `digest-${timestamp}.md`);
  }

  return { outputPath, writeToStdout, format };
}

async function main() {
  const options = parseArgs();

  console.info('Collecting daily digest data...');
  const digestData = await buildDigest(prisma);
  const summary = summarizeDigest(digestData);

  const parsedPath = parse(options.outputPath);
  const basePath = parsedPath.ext ? options.outputPath.slice(0, -parsedPath.ext.length) : options.outputPath;

  const shouldWriteMarkdown = options.format === 'markdown' || options.format === 'both';
  const shouldWriteHtml = options.format === 'html' || options.format === 'both';

  if (shouldWriteMarkdown) {
    const markdownPath = options.format === 'markdown' ? options.outputPath : `${basePath}.md`;
    const markdownDir = dirname(markdownPath);
    await mkdir(markdownDir, { recursive: true });
    const markdown = renderDigestMarkdown(digestData);
    await writeFile(markdownPath, markdown, 'utf8');
    console.info(`Markdown digest saved to ${markdownPath}`);
    if (options.writeToStdout) {
      console.log('\n--- Markdown Digest ---\n');
      console.log(markdown);
      console.log('\n-----------------------');
    }
  }

  if (shouldWriteHtml) {
    const htmlPath = options.format === 'html' ? options.outputPath : `${basePath}.html`;
    const htmlDir = dirname(htmlPath);
    await mkdir(htmlDir, { recursive: true });
    const html = renderDigestHtml(digestData);
    await writeFile(htmlPath, html, 'utf8');
    console.info(`HTML digest saved to ${htmlPath}`);
    if (options.writeToStdout) {
      console.log('\n--- HTML Digest ---\n');
      console.log(html);
      console.log('\n--------------------');
    }
  }

  console.info(summary);
}

main()
  .catch((error) => {
    console.error('Failed to generate digest', error);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
