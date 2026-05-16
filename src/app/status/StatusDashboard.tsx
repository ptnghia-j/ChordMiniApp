'use client';

import Navigation from '@/components/common/Navigation';
import { Card, CardBody, Chip, Divider } from '@heroui/react';
import { FiActivity, FiAlertTriangle, FiCheckCircle, FiMinusCircle, FiXCircle } from 'react-icons/fi';
import type { PublicOverallStatus, PublicStatusReport, PublicStatusServiceSummary, StatusServiceId } from '@/services/status/statusTypes';

const SERVICE_IDS: StatusServiceId[] = ['beat', 'chord', 'sheetsage', 'yt2mp3go'];

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

function getBarClass(status: PublicStatusServiceSummary['status'] | undefined): string {
  if (status === 'operational') return 'bg-emerald-600';
  if (status === 'degraded') return 'bg-amber-500';
  if (status === 'outage') return 'bg-red-600';
  return 'bg-gray-300 dark:bg-gray-700';
}

function formatDate(date: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(`${date}T12:00:00Z`));
}

function formatTime(value: string | null): string {
  if (!value) return 'Not checked';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
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
}: {
  service: PublicStatusServiceSummary;
  reports: PublicStatusReport[];
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
    <div className="px-6 py-7">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{service.label}</h2>
        <Chip color={getServiceColor(service.status)} variant="flat" size="sm">
          {service.status === 'operational' ? 'Operational' : service.status === 'degraded' ? 'Degraded' : service.status === 'outage' ? 'Outage' : 'Unknown'}
        </Chip>
      </div>
      <div className="flex h-12 items-stretch gap-1">
        {days.map((day) => {
          const dayService = reportByDate.get(day)?.services?.[service.id];
          return (
            <div
              key={`${service.id}-${day}`}
              className={`min-w-1 flex-1 rounded-sm ${getBarClass(dayService?.status)}`}
              title={`${day}: ${dayService?.status || 'unknown'}`}
            />
          );
        })}
      </div>
      <div className="mt-3 grid grid-cols-[auto_1fr_auto_1fr_auto] items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
        <span>90 days ago</span>
        <div className="h-px bg-gray-300 dark:bg-gray-700" />
        <span className="font-medium">{uptime.toFixed(2)}% uptime</span>
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
    <div className="min-h-screen bg-background text-foreground dark:bg-dark-bg">
      <Navigation />

      <main className="mx-auto w-full max-w-7xl px-4 pb-20 pt-28 sm:px-6 lg:px-8">
        <section className="mb-10">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 text-gray-800 dark:text-gray-100">
                <FiActivity className="h-7 w-7" />
                <h1 className="text-3xl font-bold">ChordMini Status</h1>
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
            <div className="mb-4 flex justify-end text-sm font-medium text-gray-600 dark:text-gray-400">
              Uptime over the past 90 days.
            </div>
            <Card radius="sm" shadow="none" className="border border-gray-200 bg-white dark:border-gray-700 dark:bg-content-bg">
              <CardBody className="divide-y divide-gray-200 p-0 dark:divide-gray-700">
                {latestServices.map((service) => (
                  <UptimeRow key={service.id} service={service} reports={reports} />
                ))}
              </CardBody>
            </Card>
          </section>
        )}

        {latest && (
          <section className="mb-14">
            <h2 className="mb-5 text-2xl font-bold text-gray-900 dark:text-gray-100">Current Components</h2>
            <div className="grid gap-3 md:grid-cols-2">
              {latestServices.map((service) => (
                <Card key={service.id} radius="sm" shadow="none" className="border border-gray-200 bg-white dark:border-gray-700 dark:bg-content-bg">
                  <CardBody className="flex flex-row items-center justify-between gap-4">
                    <div>
                      <div className="font-semibold text-gray-900 dark:text-gray-100">{service.label}</div>
                      <div className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                        Last checked {formatTime(service.lastCheckedAt)}
                        {service.latencyMs !== null ? `, ${service.latencyMs} ms` : ''}
                      </div>
                    </div>
                    <Chip color={getServiceColor(service.status)} variant="flat" size="sm">
                      {service.status}
                    </Chip>
                  </CardBody>
                </Card>
              ))}
            </div>
          </section>
        )}

        <section>
          <h2 className="mb-8 text-4xl font-bold text-gray-900 dark:text-gray-100">Past Incidents</h2>
          {reports.length === 0 && (
            <p className="text-gray-600 dark:text-gray-400">
              {hasNoReportsYet
                ? 'No status reports have been written yet.'
                : 'No public status history is available.'}
            </p>
          )}

          {reports.slice(0, 14).map((report) => {
            const dayIncidents = report.incidents;
            return (
              <div key={report.date} className="mb-10">
                <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{formatDate(report.date)}</h3>
                <Divider className="my-4" />
                {dayIncidents.length === 0 ? (
                  <p className="text-lg text-gray-600 dark:text-gray-400">
                    {report.date === latest?.date ? 'No incidents reported today.' : 'No incidents reported.'}
                  </p>
                ) : (
                  <div className="space-y-4">
                    {dayIncidents.map((incident) => (
                      <div key={incident.id}>
                        <div className={incident.severity === 'major' || incident.severity === 'critical' ? 'text-xl font-bold text-red-600' : 'text-xl font-bold text-amber-500'}>
                          {incident.title}
                        </div>
                        <p className="mt-2 text-gray-700 dark:text-gray-300">{incident.summary}</p>
                      </div>
                    ))}
                    {report.analysis.summary && (
                      <p className="text-sm text-gray-500 dark:text-gray-400">{report.analysis.summary}</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </section>
      </main>
    </div>
  );
}
