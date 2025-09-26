import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, parse, relative, resolve } from 'node:path';
import { PrismaClient, Prisma } from '@prisma/client';

import {
  buildDigest,
  persistDigestRun,
  renderDigestMarkdown,
  renderDigestHtml,
  summarizeDigest,
} from '../services/digest';
import { generateIntelligenceAlerts, IntelligenceAlertType } from '../services/intelligence-alerts';

const prisma = new PrismaClient();
const DEFAULT_OUTPUT_DIR = join(process.cwd(), 'storage', 'digests');
const DEFAULT_BALANCE_THRESHOLD = 10;
const DEFAULT_UNLOCK_WINDOW_DAYS = 7;
const DEFAULT_REWARD_WARNING_HOURS = 48;
const DEFAULT_REWARD_LOW_VALUE = 10;
const DEFAULT_GAMMASWAP_DROP = 0.1;

interface DigestCliOptions {
  outputPath: string;
  writeToStdout: boolean;
  format: 'markdown' | 'html' | 'both';
  writeJson: boolean;
  jsonOutputPath?: string;
  balanceDeltaThreshold: number;
  governanceUnlockWindowDays: number;
  rewardWarningHours: number;
  rewardLowValueThreshold: number;
  gammaswapHealthDropThreshold: number;
  alerts: string[];
}

function parseArgs(baseDirectory: string): DigestCliOptions {
  const argv = process.argv.slice(2);
  let outputPath: string | undefined;
  let writeToStdout = false;
  let format: 'markdown' | 'html' | 'both' = 'markdown';
  let writeJson = false;
  let jsonOutputPath: string | undefined;
  let balanceDeltaThreshold = DEFAULT_BALANCE_THRESHOLD;
  let governanceUnlockWindowDays = DEFAULT_UNLOCK_WINDOW_DAYS;
  let rewardWarningHours = DEFAULT_REWARD_WARNING_HOURS;
  let rewardLowValueThreshold = DEFAULT_REWARD_LOW_VALUE;
  let gammaswapHealthDropThreshold = DEFAULT_GAMMASWAP_DROP;
  let alertsConfig = ['balance', 'governance', 'reward', 'gammaswap'];

  if (process.env.DIGEST_BALANCE_THRESHOLD) {
    const envValue = parseFloat(process.env.DIGEST_BALANCE_THRESHOLD);
    if (Number.isFinite(envValue) && envValue > 0) {
      balanceDeltaThreshold = envValue;
    }
  }

  if (process.env.DIGEST_GOVERNANCE_WINDOW_DAYS) {
    const envValue = parseFloat(process.env.DIGEST_GOVERNANCE_WINDOW_DAYS);
    if (Number.isFinite(envValue) && envValue > 0) {
      governanceUnlockWindowDays = envValue;
    }
  }

  if (process.env.DIGEST_REWARD_WARNING_HOURS) {
    const envValue = parseFloat(process.env.DIGEST_REWARD_WARNING_HOURS);
    if (Number.isFinite(envValue) && envValue > 0) {
      rewardWarningHours = envValue;
    }
  }

  if (process.env.DIGEST_REWARD_NET_THRESHOLD) {
    const envValue = parseFloat(process.env.DIGEST_REWARD_NET_THRESHOLD);
    if (Number.isFinite(envValue) && envValue > 0) {
      rewardLowValueThreshold = envValue;
    }
  }

  if (process.env.DIGEST_GAMMASWAP_DROP) {
    const envValue = parseFloat(process.env.DIGEST_GAMMASWAP_DROP);
    if (Number.isFinite(envValue) && envValue > 0) {
      gammaswapHealthDropThreshold = envValue;
    }
  }

  if (process.env.DIGEST_ALERTS) {
    const value = process.env.DIGEST_ALERTS.split(',').map((item) => item.trim().toLowerCase()).filter(Boolean);
    if (value.length === 1 && value[0] === 'none') {
      alertsConfig = [];
    } else if (value.length > 0) {
      alertsConfig = value;
    }
  }

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
    if (arg.startsWith('--balance-threshold=')) {
      const value = parseFloat(arg.split('=')[1]);
      if (Number.isFinite(value) && value > 0) {
        balanceDeltaThreshold = value;
      }
    }
    if (arg.startsWith('--governance-window=')) {
      const value = parseFloat(arg.split('=')[1]);
      if (Number.isFinite(value) && value > 0) {
        governanceUnlockWindowDays = value;
      }
    }
    if (arg.startsWith('--reward-warning=')) {
      const value = parseFloat(arg.split('=')[1]);
      if (Number.isFinite(value) && value > 0) {
        rewardWarningHours = value;
      }
    }
    if (arg.startsWith('--reward-threshold=')) {
      const value = parseFloat(arg.split('=')[1]);
      if (Number.isFinite(value) && value > 0) {
        rewardLowValueThreshold = value;
      }
    }
    if (arg.startsWith('--gammaswap-drop=')) {
      const value = parseFloat(arg.split('=')[1]);
      if (Number.isFinite(value) && value > 0) {
        gammaswapHealthDropThreshold = value;
      }
    }
    if (arg.startsWith('--alerts=')) {
      const value = arg.split('=')[1];
      if (value) {
        const parsed = value
          .split(',')
          .map((item) => item.trim().toLowerCase())
          .filter(Boolean);
        if (parsed.length === 1 && parsed[0] === 'none') {
          alertsConfig = [];
        } else if (parsed.length > 0) {
          alertsConfig = parsed;
        }
      }
    }
  });

  if (!outputPath) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    outputPath = join(baseDirectory, `digest-${timestamp}.md`);
  }

  return {
    outputPath,
    writeToStdout,
    format,
    writeJson,
    jsonOutputPath,
    balanceDeltaThreshold,
    governanceUnlockWindowDays,
    rewardWarningHours,
    rewardLowValueThreshold,
    gammaswapHealthDropThreshold,
    alerts: alertsConfig,
  };
}

async function main() {
  const baseDirectory = process.env.DIGEST_OUTPUT_DIR
    ? resolve(process.cwd(), process.env.DIGEST_OUTPUT_DIR)
    : DEFAULT_OUTPUT_DIR;
  const options = parseArgs(baseDirectory);
  await mkdir(baseDirectory, { recursive: true });
  await mkdir(dirname(options.outputPath), { recursive: true });

  console.info('Collecting daily digest data...');
  const digestData = await buildDigest(prisma, {
    balanceDeltaThreshold: options.balanceDeltaThreshold,
    governanceUnlockWindowDays: options.governanceUnlockWindowDays,
    rewardWarningHours: options.rewardWarningHours,
    rewardLowValueThreshold: options.rewardLowValueThreshold,
    gammaswapHealthDropThreshold: options.gammaswapHealthDropThreshold,
  });
  const summary = summarizeDigest(digestData);

  if (digestData.intelligence.governanceUnlocks.length > 0) {
    console.warn('Governance locks approaching expiry:');
    digestData.intelligence.governanceUnlocks.forEach((note) => {
      const label = note.walletLabel ?? `${note.walletAddress.slice(0, 6)}…${note.walletAddress.slice(-4)}`;
      const hoursRounded = Math.max(1, Math.round(note.hoursUntilUnlock));
      const days = Math.floor(hoursRounded / 24);
      const remainingHours = hoursRounded % 24;
      const timeframe =
        days > 0 ? `${days}d${remainingHours > 0 ? ` ${remainingHours}h` : ''}` : `${hoursRounded}h`;
      const unlockTimestamp = new Date(note.unlockAt).toLocaleString();
      console.warn(
        `- ${label} (${note.chainName}/${note.protocolName}) unlocks in ${timeframe} on ${unlockTimestamp}`,
      );
    });
  }

  if (digestData.intelligence.rewardDecay.length > 0) {
    console.warn('Reward opportunities approaching deadline or low net value:');
    digestData.intelligence.rewardDecay.forEach((note) => {
      const label = note.walletLabel ?? `${note.walletAddress.slice(0, 6)}…${note.walletAddress.slice(-4)}`;
      const deadline = note.hoursUntilDeadline !== null ? `${Math.max(0, Math.round(note.hoursUntilDeadline))}h` : 'no deadline';
      console.warn(
        `- ${label} · ${note.protocolName} ${note.tokenSymbol}: net ${note.netUsd} (prev ${note.previousNetUsd ?? 'n/a'}), deadline ${deadline}`,
      );
    });
  }

  if (digestData.intelligence.gammaswapTrends.length > 0) {
    console.warn('Gammaswap positions with deteriorating health:');
    digestData.intelligence.gammaswapTrends.forEach((note) => {
      const label = note.walletLabel ?? `${note.walletAddress.slice(0, 6)}…${note.walletAddress.slice(-4)}`;
      console.warn(
        `- ${label} · ${note.protocolName} ${note.poolLabel}: health ${parseFloat(note.previousHealthRatio).toFixed(2)} → ${parseFloat(note.healthRatio).toFixed(2)} (Δ ${parseFloat(note.healthDelta).toFixed(2)})`,
      );
    });
  }

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
    const {
      digestRun,
      walletSnapshotCount,
      governanceSnapshotCount,
      rewardSnapshotCount,
      gammaswapSnapshotCount,
    } = await persistDigestRun(prisma, digestData, {
      markdownPath: toRelativePath(markdownPath),
      htmlPath: toRelativePath(htmlPath),
      jsonPath: toRelativePath(jsonPath),
      metadata: {
        format: options.format,
        includesJson: shouldWriteJson,
        balanceDeltaThreshold: options.balanceDeltaThreshold,
        governanceUnlockWindowDays: options.governanceUnlockWindowDays,
        rewardWarningHours: options.rewardWarningHours,
        rewardLowValueThreshold: options.rewardLowValueThreshold,
        gammaswapHealthDropThreshold: options.gammaswapHealthDropThreshold,
        trigger: 'cli',
      },
    });
    console.info(summary);
    console.info(`Digest run recorded (id=${digestRun.id})`);
    if (walletSnapshotCount > 0) {
      console.info(`Stored ${walletSnapshotCount} wallet balance snapshots.`);
    }
    if (governanceSnapshotCount > 0) {
      console.info(`Stored ${governanceSnapshotCount} governance lock snapshots.`);
    }
    if (rewardSnapshotCount > 0) {
      console.info(`Stored ${rewardSnapshotCount} reward opportunity snapshots.`);
    }
    if (gammaswapSnapshotCount > 0) {
      console.info(`Stored ${gammaswapSnapshotCount} Gammaswap position snapshots.`);
    }

    const enabledAlerts = new Set<IntelligenceAlertType>(
      options.alerts
        .map((item) => item.trim().toLowerCase())
        .filter((item): item is IntelligenceAlertType =>
          item === 'balance' || item === 'governance' || item === 'reward' || item === 'gammaswap',
        ),
    );

    if (enabledAlerts.size > 0) {
      const alertSummary = await generateIntelligenceAlerts(prisma, digestData, {
        digestRunId: digestRun.id,
        generatedAt: new Date(digestData.meta.generatedAt),
        enabledAlerts,
        balanceWarningPercent: options.balanceDeltaThreshold,
        balanceCriticalPercent: Math.max(options.balanceDeltaThreshold * 2, options.balanceDeltaThreshold + 5),
        governanceWarningHours: options.governanceUnlockWindowDays * 24,
        governanceCriticalHours: Math.max(6, options.governanceUnlockWindowDays * 12),
        rewardWarningHours: options.rewardWarningHours,
        rewardCriticalHours: Math.min(options.rewardWarningHours, 12),
        gammaswapWarningDrop: options.gammaswapHealthDropThreshold,
        gammaswapCriticalDrop: Math.max(options.gammaswapHealthDropThreshold * 2, options.gammaswapHealthDropThreshold + 0.05),
      });

      console.info(
        `Intelligence alerts queued: total=${alertSummary.total} (balance=${alertSummary.byType.balance}, governance=${alertSummary.byType.governance}, reward=${alertSummary.byType.reward}, gammaswap=${alertSummary.byType.gammaswap})`,
      );
    } else {
      console.info('Intelligence alerts disabled for this run.');
    }
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
