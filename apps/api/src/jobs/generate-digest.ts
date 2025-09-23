import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, parse, relative, resolve } from 'node:path';
import { PrismaClient, Prisma } from '@prisma/client';

import { buildDigest, renderDigestMarkdown, renderDigestHtml, summarizeDigest } from '../services/digest';

const prisma = new PrismaClient();
const DEFAULT_OUTPUT_DIR = join(process.cwd(), 'storage', 'digests');

interface DigestCliOptions {
  outputPath: string;
  writeToStdout: boolean;
  format: 'markdown' | 'html' | 'both';
  writeJson: boolean;
  jsonOutputPath?: string;
}

function parseArgs(baseDirectory: string): DigestCliOptions {
  const argv = process.argv.slice(2);
  let outputPath: string | undefined;
  let writeToStdout = false;
  let format: 'markdown' | 'html' | 'both' = 'markdown';
  let writeJson = false;
  let jsonOutputPath: string | undefined;

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
    if (arg === '--json') {
      writeJson = true;
    }
    if (arg.startsWith('--json=')) {
      const value = arg.split('=')[1];
      if (value) {
        writeJson = true;
        jsonOutputPath = resolve(process.cwd(), value);
      }
    }
  });

  if (!outputPath) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    outputPath = join(baseDirectory, `digest-${timestamp}.md`);
  }

  return { outputPath, writeToStdout, format, writeJson, jsonOutputPath };
}

async function main() {
  const baseDirectory = process.env.DIGEST_OUTPUT_DIR
    ? resolve(process.cwd(), process.env.DIGEST_OUTPUT_DIR)
    : DEFAULT_OUTPUT_DIR;
  const options = parseArgs(baseDirectory);
  await mkdir(baseDirectory, { recursive: true });
  await mkdir(dirname(options.outputPath), { recursive: true });

  console.info('Collecting daily digest data...');
  const digestData = await buildDigest(prisma);
  const summary = summarizeDigest(digestData);

  const parsedPath = parse(options.outputPath);
  const basePath = parsedPath.ext ? options.outputPath.slice(0, -parsedPath.ext.length) : options.outputPath;

  const shouldWriteMarkdown = options.format === 'markdown' || options.format === 'both';
  const shouldWriteHtml = options.format === 'html' || options.format === 'both';
  const shouldWriteJson = options.writeJson;

  let markdownPath: string | undefined;
  if (shouldWriteMarkdown) {
    markdownPath = options.format === 'markdown' ? options.outputPath : `${basePath}.md`;
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

  let htmlPath: string | undefined;
  if (shouldWriteHtml) {
    htmlPath = options.format === 'html' ? options.outputPath : `${basePath}.html`;
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

  let jsonPath: string | undefined;
  if (shouldWriteJson) {
    jsonPath = options.jsonOutputPath ?? `${basePath}.json`;
    const jsonDir = dirname(jsonPath);
    await mkdir(jsonDir, { recursive: true });
    await writeFile(jsonPath, JSON.stringify(digestData, null, 2), 'utf8');
    console.info(`JSON digest saved to ${jsonPath}`);
    if (options.writeToStdout) {
      console.log('\n--- JSON Digest ---\n');
      console.log(JSON.stringify(digestData, null, 2));
      console.log('\n--------------------');
    }
  }

  const toRelativePath = (filePath?: string) => (filePath ? relative(process.cwd(), filePath) : null);

  try {
    const digestRecord = await prisma.digestRun.create({
      data: {
        generatedAt: new Date(digestData.meta.generatedAt),
        markdownPath: toRelativePath(markdownPath),
        htmlPath: toRelativePath(htmlPath),
        jsonPath: toRelativePath(jsonPath),
        portfolioTotal: digestData.meta.portfolioTotal,
        walletsTracked: digestData.meta.walletsTracked,
        actionableRewards: digestData.meta.actionableRewards,
        criticalAlerts: digestData.meta.criticalAlerts,
        warningAlerts: digestData.meta.warningAlerts,
        summary,
        metadata: {
          format: options.format,
          includesJson: shouldWriteJson,
          topHoldings: digestData.portfolio.topHoldings.length,
          upcomingEpochs: digestData.governance.upcomingEpochs.length,
        },
      },
    });
    console.info(summary);
    console.info(`Digest run recorded (id=${digestRecord.id})`);
  } catch (error) {
    console.info(summary);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2021') {
      console.warn('DigestRun table not found. Run `npm run prisma:db:push --workspace @wedefidaily/api` to create it.');
    } else {
      throw error;
    }
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
