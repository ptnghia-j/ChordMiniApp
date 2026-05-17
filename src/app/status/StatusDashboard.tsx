'use client';

import Navigation from '@/components/common/Navigation';
import { Accordion, AccordionItem, Card, CardBody, Chip, Tooltip } from '@heroui/react';
import { FiActivity, FiAlertTriangle, FiCheckCircle, FiMinusCircle, FiXCircle } from 'react-icons/fi';
import type { PublicOverallStatus, PublicStatusIncident, PublicStatusReport, PublicStatusServiceSummary, StatusServiceId } from '@/services/status/statusTypes';

const SERVICE_IDS: StatusServiceId[] = ['beat', 'chord', 'sheetsage', 'yt2mp3go'];
const STATUS_TIMEZONE = 'America/Los_Angeles';
const DATE_PART_FORMATTER = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});
const TIME_PART_FORMATTER = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
  timeZone: STATUS_TIMEZONE,
});

const OVERALL_LABELS: Record<PublicOverallStatus, string> = {
  operational: 'All Systems Operational',
  degraded: 'Degraded Performance',
  partial_outage: 'Partial Outage',
  major_outage: 'Major Outage',
  unknown: 'Awaiting First Probe',
};

function getDayIds(count: number): string[] {
  const today = new Date();
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (count - index - 1));
    return date.toISOString().slice(0, 10);
  });
}

function getOverallColor(status: PublicOverallStatus): 'success' | 'warning' | 'danger' | 'default' {
  if (status === 'operational') return 'success';
  if (status === 'degraded') return 'warning';
  if (status === 'partial_outage' || status === 'major_outage') return 'danger';
  return 'default';
}

function getServiceColor(status: PublicStatusServiceSummary['status']): 'success' | 'warning' | 'danger' | 'default' {
  if (status === 'operational') return 'success';
  if (status === 'degraded') return 'warning';
  if (status === 'outage') return 'danger';
  return 'default';
}

function getServiceStatusLabel(status: PublicStatusServiceSummary['status']): string {
  if (status === 'operational') return 'Operational';
  if (status === 'degraded') return 'Degraded';
  if (status === 'outage') return 'Outage';
  return 'Unknown';
}

function getBarClass(status: PublicStatusServiceSummary['status'] | undefined): string {
  if (status === 'operational') return 'bg-emerald-500 dark:bg-emerald-500';
  if (status === 'degraded') return 'bg-amber-500 dark:bg-amber-500';
  if (status === 'outage') return 'bg-red-600 dark:bg-red-500';
  return 'bg-gray-300/80 dark:bg-gray-600/70';
}

function getServiceBorderClass(index: number, total: number): string {
  const classes = ['border-gray-200', 'dark:border-gray-700'];
  if (index < total - 1) classes.push('border-b');
  if (index >= 2) classes.push('md:border-b-0');
  if (index < 2) classes.push('md:border-b');
  if (index % 2 === 0) classes.push('md:border-r');
  return classes.join(' ');
}

function formatDate(date: string): string {
  const parts = DATE_PART_FORMATTER.formatToParts(new Date(`${date}T12:00:00Z`));
  const month = parts.find((part) => part.type === 'month')?.value || '';
  const day = parts.find((part) => part.type === 'day')?.value || '';
  const year = parts.find((part) => part.type === 'year')?.value || '';
  return `${month} ${day}, ${year}`;
}

function formatTime(value: string | null): string {
  if (!value) return 'Not checked';
  const parts = TIME_PART_FORMATTER.formatToParts(new Date(value));
  const month = parts.find((part) => part.type === 'month')?.value || '';
  const day = parts.find((part) => part.type === 'day')?.value || '';
  const hour = parts.find((part) => part.type === 'hour')?.value || '';
  const minute = parts.find((part) => part.type === 'minute')?.value || '';
  const dayPeriod = parts.find((part) => part.type === 'dayPeriod')?.value || '';
  return `${month} ${day}, ${hour}:${minute} ${dayPeriod}`.trim();
}

function formatIncidentWindow(incident: PublicStatusIncident): string {
  const started = `Detected ${formatTime(incident.startedAt)}`;
  if (incident.endedAt) {
    return `${started} · Recovery confirmed ${formatTime(incident.endedAt)}`;
  }

  return `${started} · Awaiting a successful follow-up probe`;
}

function getDailyIncidentLabel(report: PublicStatusReport, latestDate?: string): string {
  const incidentCount = report.incidents.length;
  if (incidentCount === 0) {
    return report.date === latestDate ? 'No incidents reported today.' : 'No incidents reported.';
  }

  return `${incidentCount} incident${incidentCount === 1 ? '' : 's'} recorded.`;
}

function getDailyIncidentColor(report: PublicStatusReport): 'success' | 'warning' | 'danger' | 'default' {
  if (report.incidents.some((incident) => incident.severity === 'major' || incident.severity === 'critical')) {
    return 'danger';
  }

  if (report.incidents.length > 0) {
    return 'warning';
  }

  return 'success';
}

function StatusIcon({ status }: { status: PublicOverallStatus }) {
  if (status === 'operational') return <FiCheckCircle className="h-5 w-5" />;
  if (status === 'degraded') return <FiAlertTriangle className="h-5 w-5" />;
  if (status === 'partial_outage' || status === 'major_outage') return <FiXCircle className="h-5 w-5" />;
  return <FiMinusCircle className="h-5 w-5" />;
}

function UptimeRow({
  service,
  reports,
  className = '',
}: {
  service: PublicStatusServiceSummary;
  reports: PublicStatusReport[];
  className?: string;
}) {
  const reportByDate = new Map(reports.map((report) => [report.date, report]));
  const days = getDayIds(90);
  const knownDays = days
    .map((day) => reportByDate.get(day)?.services?.[service.id])
    .filter((entry): entry is PublicStatusServiceSummary => Boolean(entry));
  const uptime = knownDays.length > 0
    ? knownDays.reduce((total, entry) => total + entry.uptimePct, 0) / knownDays.length
    : service.uptimePct;

  return (
    <div className={`min-w-0 px-5 py-6 sm:px-6 ${className}`}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold leading-tight text-gray-900 dark:text-gray-100">{service.label}</h2>
        <Tooltip
          showArrow
          delay={0}
          classNames={{
            content: 'rounded-md border border-gray-200 bg-white px-4 py-3 text-left text-gray-800 shadow-lg dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100',
          }}
          content={
            <div className="space-y-1 text-sm">
              <div className="font-semibold">{service.label}</div>
              <div>Status: {getServiceStatusLabel(service.status)}</div>
              <div>Last checked: {formatTime(service.lastCheckedAt)}</div>
              {service.latencyMs !== null && <div>Latency: {service.latencyMs} ms</div>}
            </div>
          }
        >
          <Chip color={getServiceColor(service.status)} variant="flat" size="sm" className="cursor-help font-medium">
            {getServiceStatusLabel(service.status)}
          </Chip>
        </Tooltip>
      </div>
      <div className="flex h-12 items-stretch gap-px sm:gap-0.5 lg:gap-[3px]">
        {days.map((day) => {
          const dayService = reportByDate.get(day)?.services?.[service.id];
          const dayStatus = getServiceStatusLabel(dayService?.status || 'unknown');
          return (
            <Tooltip
              key={`${service.id}-${day}`}
              showArrow
              delay={0}
              closeDelay={0}
              classNames={{
                content: 'rounded-md border border-gray-200 bg-white px-4 py-3 text-left text-gray-800 shadow-lg dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100',
              }}
              content={
                <div className="space-y-1 text-sm">
                  <div className="font-semibold">{formatDate(day)}</div>
                  <div>{service.label}: {dayStatus}</div>
                  {dayService?.lastCheckedAt && <div>Last checked: {formatTime(dayService.lastCheckedAt)}</div>}
                  {dayService?.latencyMs !== null && dayService?.latencyMs !== undefined && (
                    <div>Latency: {dayService.latencyMs} ms</div>
                  )}
                </div>
              }
            >
              <button
                type="button"
                className={`min-w-0 flex-1 cursor-help rounded-[2px] border-0 p-0 transition duration-150 hover:-translate-y-0.5 hover:scale-y-110 hover:brightness-125 hover:ring-2 hover:ring-gray-900/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:hover:ring-white/40 ${getBarClass(dayService?.status)}`}
                aria-label={`${service.label} on ${formatDate(day)}: ${dayStatus}`}
              />
            </Tooltip>
          );
        })}
      </div>
      <div className="mt-3 grid grid-cols-[auto_1fr_auto_1fr_auto] items-center gap-3 text-sm font-medium text-gray-500 dark:text-gray-400 sm:gap-4">
        <span>90 days ago</span>
        <div className="h-px bg-gray-300 dark:bg-gray-700" />
        <span className="font-semibold">{uptime.toFixed(2)}% uptime</span>
        <div className="h-px bg-gray-300 dark:bg-gray-700" />
        <span>Today</span>
      </div>
    </div>
  );
}

export default function StatusDashboard({
  reports,
  unavailable,
}: {
  reports: PublicStatusReport[];
  unavailable: boolean;
}) {
  const latest = reports[0] || null;
  const latestServices = latest ? SERVICE_IDS.map((id) => latest.services[id]) : [];
  const overallStatus = latest?.overallStatus || 'unknown';
  const hasNoReportsYet = !unavailable && reports.length === 0;

  return (
    <div className="min-h-screen bg-background text-foreground [font-family:-apple-system,BlinkMacSystemFont,'Segoe_UI',Roboto,Helvetica,Arial,sans-serif] dark:bg-dark-bg">
      <Navigation />

      <main className="mx-auto w-full max-w-7xl px-4 pb-20 pt-28 sm:px-6 lg:px-8">
        <section className="mb-10">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 text-gray-800 dark:text-gray-100">
                <FiActivity className="h-7 w-7" />
                <h1 className="text-3xl font-semibold">ChordMini Status</h1>
              </div>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                Public service health from sanitized server-side probes.
              </p>
            </div>
            <Chip
              color={getOverallColor(overallStatus)}
              variant="flat"
              size="lg"
              startContent={<StatusIcon status={overallStatus} />}
            >
              {OVERALL_LABELS[overallStatus]}
            </Chip>
          </div>

          {unavailable && (
            <Card radius="sm" shadow="none" className="border border-gray-200 bg-white/70 dark:border-gray-700 dark:bg-content-bg">
              <CardBody className="text-sm text-gray-700 dark:text-gray-300">
                Status history is unavailable in this environment. No private endpoints are probed from local read mode.
              </CardBody>
            </Card>
          )}

          {hasNoReportsYet && (
            <Card radius="sm" shadow="none" className="border border-gray-200 bg-white/70 dark:border-gray-700 dark:bg-content-bg">
              <CardBody className="text-sm text-gray-700 dark:text-gray-300">
                Status storage is reachable, but no public reports have been written yet. The dashboard will populate after the first authorized server-side probe runs.
              </CardBody>
            </Card>
          )}
        </section>

        {latest && (
          <section className="mb-14">
            <div className="mb-4 flex justify-end text-base font-medium text-gray-500 dark:text-gray-400">
              Uptime over the past 90 days.
            </div>
            <Card radius="sm" shadow="none" className="border border-gray-200 bg-white dark:border-gray-700 dark:bg-content-bg">
              <CardBody className="grid p-0 md:grid-cols-2">
                {latestServices.map((service, index) => (
                  <UptimeRow
                    key={service.id}
                    service={service}
                    reports={reports}
                    className={getServiceBorderClass(index, latestServices.length)}
                  />
                ))}
              </CardBody>
            </Card>
          </section>
        )}

        <section>
          <h2 className="mb-8 text-3xl font-semibold text-gray-900 dark:text-gray-100">Past Incidents</h2>
          {reports.length === 0 && (
            <p className="text-gray-600 dark:text-gray-400">
              {hasNoReportsYet
                ? 'No status reports have been written yet.'
                : 'No public status history is available.'}
            </p>
          )}

          {reports.length > 0 && (
            <Accordion
              variant="light"
              selectionMode="multiple"
              defaultExpandedKeys={latest ? [latest.date] : []}
              className="border-t border-gray-200 px-0 dark:border-gray-700"
              itemClasses={{
                base: 'border-b border-gray-200 px-0 dark:border-gray-700',
                title: 'text-xl font-semibold text-gray-900 dark:text-gray-100',
                trigger: 'px-0 py-5 data-[hover=true]:bg-transparent',
                content: 'px-0 pb-6 pt-0',
              }}
            >
              {reports.slice(0, 14).map((report) => {
                const dayIncidents = report.incidents;
                return (
                  <AccordionItem
                    key={report.date}
                    aria-label={`${formatDate(report.date)} status incidents`}
                    title={formatDate(report.date)}
                    subtitle={
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        {getDailyIncidentLabel(report, latest?.date)}
                      </span>
                    }
                    startContent={
                      <Chip color={getDailyIncidentColor(report)} variant="flat" size="sm">
                        {dayIncidents.length === 0 ? 'Clear' : dayIncidents.some((incident) => incident.status !== 'resolved') ? 'Investigating' : 'Recovery confirmed'}
                      </Chip>
                    }
                  >
                    {dayIncidents.length === 0 ? (
                      <p className="text-lg text-gray-600 dark:text-gray-400">
                        {report.date === latest?.date ? 'No incidents reported today.' : 'No incidents reported.'}
                      </p>
                    ) : (
                      <div className="space-y-4">
                        {dayIncidents.map((incident) => (
                          <div key={incident.id}>
                            <div className={incident.severity === 'major' || incident.severity === 'critical' ? 'text-lg font-semibold text-red-600' : 'text-lg font-semibold text-amber-500'}>
                              {incident.title}
                            </div>
                            <p className="mt-2 text-gray-700 dark:text-gray-300">{incident.summary}</p>
                            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{formatIncidentWindow(incident)}</p>
                          </div>
                        ))}
                        {report.analysis.summary && (
                          <p className="text-sm text-gray-500 dark:text-gray-400">{report.analysis.summary}</p>
                        )}
                      </div>
                    )}
                  </AccordionItem>
                );
              })}
            </Accordion>
          )}
        </section>
      </main>
    </div>
  );
}
