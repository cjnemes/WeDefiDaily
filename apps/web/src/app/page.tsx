import { DashboardClient } from './page-client';

export default function Home() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <DashboardClient />
      <footer className="border-t border-foreground/10 bg-foreground/5 py-8">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-6 text-xs text-foreground/60 sm:flex-row sm:items-center sm:justify-between">
          <p>First milestone: deliver actionable portfolio + governance dashboard.</p>
          <p>Roadmap phases available in docs/roadmap.md.</p>
        </div>
      </footer>
    </div>
  );
}