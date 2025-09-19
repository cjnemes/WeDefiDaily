const sections = [
  {
    title: "Portfolio Pulse",
    description:
      "Unified overview of liquid holdings, vote-escrowed locks, and liquidity positions across Base, BSC, and Ethereum-aligned ecosystems.",
    items: [
      "Chain-aware balance aggregation",
      "USD valuation with live pricing",
      "24h and 7d performance deltas",
    ],
  },
  {
    title: "Governance & Incentives",
    description:
      "Track veAERO and veTHE positions, upcoming epochs, and bribe ROI so every vote is intentional and revenue-positive.",
    items: [
      "Epoch countdowns and unlock timelines",
      "Gauge bribe marketplace snapshots",
      "Suggested vote allocation playbooks",
    ],
  },
  {
    title: "Yield & Risk Ops",
    description:
      "Surface pending claims, Gammaswap utilization metrics, and volatility signals before they surprise you.",
    items: [
      "Claim reminders with gas estimates",
      "LP health monitoring",
      "Configurable risk alerts",
    ],
  },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-6 pb-16 pt-14">
        <p className="text-sm uppercase tracking-[0.35em] text-foreground/60">
          WeDefiDaily
        </p>
        <h1 className="text-balance text-4xl font-semibold md:text-5xl">
          Your command center for Base-native DeFi, governance incentives, and
          cross-chain alpha.
        </h1>
        <p className="max-w-3xl text-lg text-foreground/70">
          Stay ahead of re-locks, bribes, yield shifts, and trading opportunities with
          a workflow built for a solo operator managing multi-chain cash flows.
        </p>
        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          <span className="rounded-full border border-foreground/15 px-4 py-2 text-foreground/75">
            Next.js + Fastify stack
          </span>
          <span className="rounded-full border border-foreground/15 px-4 py-2 text-foreground/75">
            Alchemy · CoinMarketCap · Etherscan integrations
          </span>
          <span className="rounded-full border border-foreground/15 px-4 py-2 text-foreground/75">
            Dockerized Postgres cache
          </span>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-6xl gap-8 px-6 pb-20 md:grid-cols-3">
        {sections.map((section) => (
          <article
            key={section.title}
            className="flex flex-col gap-5 rounded-2xl border border-foreground/10 bg-foreground/5 p-6 backdrop-blur"
          >
            <div>
              <h2 className="text-xl font-semibold text-foreground">
                {section.title}
              </h2>
              <p className="mt-2 text-sm text-foreground/70">
                {section.description}
              </p>
            </div>
            <ul className="mt-auto flex flex-col gap-2 text-sm text-foreground/80">
              {section.items.map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="mt-1 inline-block h-2 w-2 rounded-full bg-foreground/40" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </main>

      <footer className="border-t border-foreground/10 bg-foreground/5 py-8">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-6 text-xs text-foreground/60 sm:flex-row sm:items-center sm:justify-between">
          <p>First milestone: deliver actionable portfolio + governance dashboard.</p>
          <p>Roadmap phases available in docs/roadmap.md.</p>
        </div>
      </footer>
    </div>
  );
}
