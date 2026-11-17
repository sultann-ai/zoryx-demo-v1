import { Suspense, lazy, useEffect, useState } from "react";
import type { AnalyticsQuery } from "../api/analytics";
import { getApiErrorMessage } from "../api/errors";
import { Button, EmptyState, PageHeader } from "../components/ui";
import { cn } from "../components/ui/cn";
import { useAuth } from "../context/AuthContext";
import { useAnalytics } from "../hooks/useAnalytics";
import { Insights } from "./dashboard/Insights";
import { KpiCards, KpiSkeleton } from "./dashboard/KpiCards";
import { PeriodSelector, loadPeriodChoice, rangeProblem, savePeriodChoice } from "./dashboard/PeriodSelector";
import type { PeriodChoice } from "./dashboard/PeriodSelector";
import { SectionHeading, Skeleton } from "./dashboard/parts";
import { DailyTable, WeeklyTable } from "./dashboard/Tables";
import { formatRange } from "./dashboard/format";

// Recharts is the heaviest part of the page, so it loads on its own after the KPI row is up.
const DashboardCharts = lazy(() => import("./dashboard/DashboardCharts"));

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function ChartsSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-6" aria-hidden="true">
      <Skeleton className="h-80 lg:col-span-6" />
      <Skeleton className="h-80 lg:col-span-3" />
      <Skeleton className="h-80 lg:col-span-3" />
    </div>
  );
}

// "Updated just now" / "Updated 3 min ago", re-evaluated every 15 seconds.
function useUpdatedLabel(updatedAt: number): string {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);
  if (!updatedAt) return "";
  const seconds = Math.max(0, Math.round((now - updatedAt) / 1000));
  if (seconds < 45) return "Updated just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `Updated ${minutes} min ago`;
  return `Updated ${new Date(updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

export function DashboardPage() {
  const { staff } = useAuth();
  const [choice, setChoice] = useState<PeriodChoice>(loadPeriodChoice);

  const customProblem = choice.period === "custom" ? rangeProblem(choice.from, choice.to) : null;
  const query: AnalyticsQuery = choice.period === "custom" ? { period: "custom", from: choice.from, to: choice.to } : { period: choice.period };
  const { data, error, isError, isLoading, isFetching, isPlaceholderData, dataUpdatedAt, refetch } = useAnalytics(query, customProblem === null);
  const updatedLabel = useUpdatedLabel(dataUpdatedAt);

  function handleChange(next: PeriodChoice) {
    setChoice(next);
    savePeriodChoice(next);
  }

  const isEmpty = data !== undefined && data.totals.orders === 0 && data.totals.cancelledCount === 0;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`${getGreeting()}, ${staff?.name ?? "there"}`}
        description={
          data ? (
            <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="inline-flex items-center gap-1.5">
                <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", data.activeBusinessDay ? "bg-status-success" : "bg-status-neutral")} aria-hidden="true" />
                {data.activeBusinessDay ? (
                  <>
                    Business day <span className="font-medium text-ink">{data.activeBusinessDay.label}</span> is active
                  </>
                ) : (
                  "No active business day"
                )}
              </span>
              <span aria-live="polite">{updatedLabel}</span>
            </span>
          ) : undefined
        }
        actions={
          <Button variant="secondary" onClick={() => void refetch()} disabled={isFetching}>
            {isFetching ? "Refreshing…" : "Refresh"}
          </Button>
        }
      />

      <PeriodSelector choice={choice} onChange={handleChange} />

      {data && !customProblem && (
        <p className="-mt-3 text-meta text-ink-muted">
          <span className="font-medium text-ink">{formatRange(data.range.from, data.range.to)}</span> compared with{" "}
          {formatRange(data.range.previousFrom, data.range.previousTo)}
          {isPlaceholderData && " · loading…"}
        </p>
      )}

      {isError && !data && (
        <div role="alert" className="flex flex-col items-start gap-3 rounded-card border border-status-danger bg-status-danger-bg p-4">
          <p className="text-body text-status-danger-text">{getApiErrorMessage(error, "Could not load the dashboard.")}</p>
          <Button variant="secondary" onClick={() => void refetch()}>
            Try again
          </Button>
        </div>
      )}

      {isLoading && !customProblem && (
        <>
          <KpiSkeleton />
          <ChartsSkeleton />
        </>
      )}

      {data && (
        <div className={cn("flex flex-col gap-6 transition-opacity", isPlaceholderData && "opacity-60")}>
          {isError && (
            <div role="alert" className="flex flex-wrap items-center gap-3 rounded-card border border-status-danger bg-status-danger-bg px-4 py-2">
              <p className="text-body text-status-danger-text">{getApiErrorMessage(error, "Could not refresh the dashboard.")} Showing the last figures loaded.</p>
              <Button variant="secondary" onClick={() => void refetch()}>
                Try again
              </Button>
            </div>
          )}

          <KpiCards analytics={data} />

          {isEmpty ? (
            <>
              <EmptyState title="No sales in this period" description="Nothing was ordered or cancelled on these dates. Pick another period to compare." />
              <Suspense fallback={<ChartsSkeleton />}>
                <DashboardCharts analytics={data} weeklyOnly />
              </Suspense>
            </>
          ) : (
            <>
              <section className="flex flex-col gap-3">
                <SectionHeading>Highlights</SectionHeading>
                <Insights analytics={data} />
              </section>

              <section className="flex flex-col gap-3">
                <SectionHeading>Charts</SectionHeading>
                <Suspense fallback={<ChartsSkeleton />}>
                  <DashboardCharts analytics={data} />
                </Suspense>
              </section>

              <section className="flex flex-col gap-3">
                <SectionHeading hint="Click a date to open that business day's orders">Daily breakdown</SectionHeading>
                <DailyTable analytics={data} />
              </section>
            </>
          )}

          <section className="flex flex-col gap-3">
            <SectionHeading hint="Always the last 8 weeks, whatever period is selected">Weekly breakdown</SectionHeading>
            <WeeklyTable analytics={data} />
          </section>
        </div>
      )}
    </div>
  );
}
