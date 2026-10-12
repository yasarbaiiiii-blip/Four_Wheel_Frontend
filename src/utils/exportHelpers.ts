/**
 * Mission report model and PDF / CSV builders.
 *
 * `buildMissionReportModel` turns the waypoint list, the rover's per-point
 * status and the mission timing into the rows and totals every report format
 * shares. The Excel sheet (`missionReportXlsx.ts`), the PDF below and the CSV
 * fallback all read that one model, so they cannot disagree.
 */

import type { RawGnssSurveySnapshot } from '../services/missionApi';
import type { WaypointUiStatus } from '../types/missionWaypointStatus';
import { isErrorWaypointStatus } from '../types/missionWaypointStatus';
import {
  GNSS_LIMITS_MM,
  GNSS_RATINGS,
  GNSS_RATING_ORDER,
  GNSS_RATING_RANGE,
  gnssRating,
  roundGnssMm,
  type GnssRating,
  type GnssRatingKey,
} from './gnssAccuracyTier';
import { getStatusPresentation } from './missionStatusPresentation';
import {
  NO_TIME,
  formatDateTime,
  formatPointTime,
  formatTotalTime,
  parseReportTime,
} from './reportTimeFormat';

// ── Input types ──────────────────────────────────────────────────────────────

export interface ReportWaypoint {
  sn: number;
  row?: string | number;
  block?: string | number;
  pile?: string | number;
  lat: number;
  lon: number;
}

export interface ReportStatusEntry {
  reached?: boolean;
  marked?: boolean;
  status?: WaypointUiStatus;
  timestamp?: string;
  pile?: string | number;
  rowNo?: string | number;
  /** Frozen raw-GNSS survey snapshot; its radial error is the GNSS accuracy. */
  survey?: RawGnssSurveySnapshot | null;
}

export interface ReportTiming {
  /** ISO text from the rover's report (`mission.started_at`). */
  startedAt?: string | null;
  /** ISO text from the rover's report (`mission.completed_at`). */
  finishedAt?: string | null;
}

// ── Model ────────────────────────────────────────────────────────────────────

export type StatusTone = 'good' | 'warn' | 'bad' | 'neutral';

export interface ExportRow {
  n: number;
  row: string;
  block: string;
  pile: string;
  status: string;
  statusTone: StatusTone;
  /** Friendly time the point was marked, or '—'. */
  markedAt: string;
  /** Raw-GNSS radial error in whole mm, or null when not measured. */
  gnssMm: number | null;
  rating: GnssRating | null;
  latitude: number;
  longitude: number;
}

export interface AttentionItem {
  n: number;
  where: string;
  reason: string;
}

export interface MissionStats {
  totalPoints: number;
  completedPoints: number;
  pendingPoints: number;
  skippedPoints: number;
  errorPoints: number;
  /** Percent of points completed, one decimal, e.g. "83.3". */
  successRate: string;
  mode: string;
  generatedAt: string;
  startedAt: string;
  finishedAt: string;
  totalMissionTime: string;
  ratingCounts: Record<GnssRatingKey, number>;
  ratedPoints: number;
  averageMm: number | null;
  attention: AttentionItem[];
}

export interface MissionReportModel {
  rows: ExportRow[];
  stats: MissionStats;
}

const DASH = '—';

function toneForStatus(status: WaypointUiStatus | undefined, label: string): StatusTone {
  if (status && isErrorWaypointStatus(status)) return 'bad';
  switch (label) {
    case 'Completed':
    case 'Marked':
    case 'Mission End':
      return 'good';
    case 'Skipped':
    case 'Reached':
      return 'warn';
    default:
      return 'neutral';
  }
}

function statusLabel(entry: ReportStatusEntry | undefined): string {
  if (entry?.status) return getStatusPresentation(entry.status).exportLabel;
  if (entry?.marked) return 'Marked';
  if (entry?.reached) return 'Reached';
  return 'Pending';
}

function text(value: string | number | undefined | null, fallback = DASH): string {
  if (value === undefined || value === null) return fallback;
  const out = String(value).trim();
  return out === '' || out === '-' ? fallback : out;
}

export function buildMissionReportModel(input: {
  waypoints: ReportWaypoint[];
  statusMap: Record<number, ReportStatusEntry>;
  missionMode?: string | null;
  timing?: ReportTiming | null;
  now?: Date;
}): MissionReportModel {
  const { waypoints, statusMap } = input;
  const now = input.now ?? new Date();

  // Mission start / finish: the rover's own times, else the first and last
  // point time we hold. Never invented.
  const pointTimes = waypoints
    .map((wp) => parseReportTime(statusMap[wp.sn]?.timestamp))
    .filter((d): d is Date => d !== null)
    .sort((a, b) => a.getTime() - b.getTime());
  const started =
    parseReportTime(input.timing?.startedAt) ?? pointTimes[0] ?? null;
  const finished =
    parseReportTime(input.timing?.finishedAt) ??
    pointTimes[pointTimes.length - 1] ??
    null;

  const rows: ExportRow[] = waypoints.map((wp, idx) => {
    const entry = statusMap[wp.sn];
    const label = statusLabel(entry);
    const survey = entry?.survey;
    const mm =
      survey && survey.available === true
        ? roundGnssMm(survey.radial_error_mm)
        : null;
    const stamp = parseReportTime(entry?.timestamp);
    const markedAt = stamp
      ? formatPointTime(stamp, started)
      : text(entry?.timestamp);
    return {
      n: idx + 1,
      row: text(wp.row ?? entry?.rowNo),
      block: text(wp.block),
      pile: text(wp.pile ?? entry?.pile),
      status: label,
      statusTone: toneForStatus(entry?.status, label),
      markedAt,
      gnssMm: mm,
      rating: gnssRating(mm),
      latitude: wp.lat,
      longitude: wp.lon,
    };
  });

  const statuses = waypoints.map((wp) => statusMap[wp.sn]?.status);
  const completedPoints = statuses.filter((s) => s === 'completed').length;
  const skippedPoints = statuses.filter((s) => s === 'skipped').length;
  const errorPoints = statuses.filter((s) => isErrorWaypointStatus(s)).length;
  const pendingPoints = waypoints.filter((wp) => {
    const s = statusMap[wp.sn]?.status;
    return !s || s === 'pending';
  }).length;
  const totalPoints = waypoints.length;

  const ratingCounts: Record<GnssRatingKey, number> = {
    excellent: 0,
    good: 0,
    poor: 0,
    failed: 0,
  };
  let mmSum = 0;
  let rated = 0;
  for (const row of rows) {
    if (row.rating && row.gnssMm !== null) {
      ratingCounts[row.rating.key] += 1;
      mmSum += row.gnssMm;
      rated += 1;
    }
  }

  const attention: AttentionItem[] = [];
  for (const row of rows) {
    const where = `Row ${row.row}, Block ${row.block}, Pile ${row.pile}`;
    if (row.statusTone === 'bad') {
      attention.push({ n: row.n, where, reason: row.status });
    } else if (row.status === 'Skipped') {
      attention.push({ n: row.n, where, reason: 'Skipped' });
    } else if (row.rating?.key === 'failed' && row.gnssMm !== null) {
      attention.push({
        n: row.n,
        where,
        reason: `Failed accuracy, ${row.gnssMm} mm`,
      });
    }
  }

  const stats: MissionStats = {
    totalPoints,
    completedPoints,
    pendingPoints,
    skippedPoints,
    errorPoints,
    successRate:
      totalPoints > 0 ? ((completedPoints / totalPoints) * 100).toFixed(1) : '0.0',
    mode: text(input.missionMode, 'Unknown'),
    generatedAt: formatDateTime(now),
    startedAt: started ? formatDateTime(started) : NO_TIME,
    finishedAt: finished ? formatDateTime(finished) : NO_TIME,
    totalMissionTime:
      started && finished
        ? formatTotalTime(finished.getTime() - started.getTime())
        : NO_TIME,
    ratingCounts,
    ratedPoints: rated,
    averageMm: rated > 0 ? Math.round(mmSum / rated) : null,
    attention,
  };

  return { rows, stats };
}

/** Row group heading, e.g. "Row 01 · Block A". */
export function rowGroupTitle(row: ExportRow): string {
  return `Row ${row.row} · Block ${row.block}`;
}

// ── CSV (fallback when the .xlsx cannot be built) ────────────────────────────

export const REPORT_COLUMNS = [
  '#',
  'Row',
  'Block',
  'Pile',
  'Status',
  'Marked at',
  'GNSS accuracy (mm)',
  'Rating',
  'Latitude',
  'Longitude',
] as const;

function csvCell(value: string | number): string {
  const out = String(value);
  return /[",\n\r]/.test(out) ? `"${out.replace(/"/g, '""')}"` : out;
}

/** Same ten columns as the Excel sheet, plain text, UTF-8 with BOM for Excel. */
export function generateReportCsv(rows: ExportRow[]): string {
  const lines = [REPORT_COLUMNS.map(csvCell).join(',')];
  for (const r of rows) {
    lines.push(
      [
        r.n,
        r.row,
        r.block,
        r.pile,
        r.status,
        r.markedAt,
        r.gnssMm === null ? '' : r.gnssMm,
        r.rating ? r.rating.label : '',
        r.latitude,
        r.longitude,
      ]
        .map(csvCell)
        .join(','),
    );
  }
  return `﻿${lines.join('\n')}\n`;
}

// ── PDF ──────────────────────────────────────────────────────────────────────

const esc = (value: string | number): string =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const GAUGE_MAX_MM = 80;

const STATUS_PILL: Record<StatusTone, { bg: string; ink: string }> = {
  good: { bg: '#E6F8F1', ink: '#0B7A57' },
  warn: { bg: '#FFF3D6', ink: '#8A5A00' },
  bad: { bg: '#FCEAE8', ink: '#A82B24' },
  neutral: { bg: '#EEF1F6', ink: '#536D97' },
};

function gaugeHtml(row: ExportRow): string {
  if (row.gnssMm === null || !row.rating) {
    return `<div class="gv"><div class="gauge"></div><b class="none">${DASH}</b></div>`;
  }
  const width = Math.min(row.gnssMm / GAUGE_MAX_MM, 1) * 100;
  const tick = (mm: number) => `<u style="left:${(mm / GAUGE_MAX_MM) * 100}%"></u>`;
  return `<div class="gv"><div class="gauge">${tick(GNSS_LIMITS_MM.excellent)}${tick(
    GNSS_LIMITS_MM.good,
  )}${tick(GNSS_LIMITS_MM.poor)}<i style="width:${width.toFixed(1)}%;background:${
    row.rating.color
  }"></i></div><b>${row.gnssMm} mm</b></div>`;
}

function groupsHtml(rows: ExportRow[]): string {
  const groups = new Map<string, ExportRow[]>();
  for (const row of rows) {
    const key = rowGroupTitle(row);
    const list = groups.get(key);
    if (list) list.push(row);
    else groups.set(key, [row]);
  }
  const parts: string[] = [];
  groups.forEach((list, title) => {
    const done = list.filter((r) => r.status === 'Completed').length;
    const mms = list
      .map((r) => r.gnssMm)
      .filter((v): v is number => v !== null);
    const avg = mms.length
      ? ` · average ${Math.round(mms.reduce((a, b) => a + b, 0) / mms.length)} mm`
      : '';
    const lines = list
      .map((r) => {
        const pill = STATUS_PILL[r.statusTone];
        const rating = r.rating
          ? `<span class="rt" style="color:${r.rating.color}">${esc(r.rating.label)}</span>`
          : `<span class="rt none">${DASH}</span>`;
        return `<div class="pt"><span class="n">${r.n}</span><span class="id"><b>Pile ${esc(
          r.pile,
        )}</b><small>Point ${r.n}</small></span><span class="when">${esc(
          r.markedAt,
        )}</span><span><span class="st" style="background:${pill.bg};color:${pill.ink}">${esc(
          r.status,
        )}</span></span>${gaugeHtml(r)}${rating}</div>`;
      })
      .join('');
    parts.push(
      `<div class="grp"><div class="grp-h"><b>${esc(title)}</b><span>${done} of ${
        list.length
      } completed${avg}</span></div>${lines}</div>`,
    );
  });
  return parts.join('');
}

export const generatePDFHTML = (model: MissionReportModel): string => {
  const { rows, stats } = model;
  const total = Math.max(stats.ratedPoints, 1);

  const bar = GNSS_RATING_ORDER.map((key) => {
    const pct = (stats.ratingCounts[key] / total) * 100;
    return pct > 0
      ? `<i style="width:${pct.toFixed(2)}%;background:${GNSS_RATINGS[key].color}"></i>`
      : '';
  }).join('');

  const legend = GNSS_RATING_ORDER.map(
    (key) =>
      `<span><em style="background:${GNSS_RATINGS[key].color}"></em><b>${
        stats.ratingCounts[key]
      }</b> ${GNSS_RATINGS[key].label} · ${GNSS_RATING_RANGE[key]}</span>`,
  ).join('');

  const accuracyTitle =
    stats.averageMm === null
      ? 'GNSS accuracy · no measurements'
      : `GNSS accuracy · average ${stats.averageMm} mm`;

  const attention = stats.attention.length
    ? `<div class="attn"><b>Needs attention · ${stats.attention.length} point${
        stats.attention.length === 1 ? '' : 's'
      }</b>${stats.attention
        .map(
          (a) =>
            `<span>Point ${a.n} · ${esc(a.where)} · ${esc(a.reason)}</span>`,
        )
        .join('')}</div>`
    : '';

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Mission Report - ${esc(stats.generatedAt)}</title>
<style>
  @page { margin: 14mm 12mm; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { margin: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #10244B; font-size: 11px; }
  .head { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 3px solid #10244B; padding-bottom: 12px; }
  .head h1 { margin: 0; font-size: 22px; letter-spacing: -0.01em; }
  .head small { display: block; color: #536D97; font-size: 11px; margin-top: 3px; }
  .when-h { text-align: right; color: #536D97; font-size: 11px; }
  .when-h b { display: block; color: #10244B; font-size: 12px; }
  .kpis { display: flex; gap: 8px; margin: 16px 0; }
  .kpi { flex: 1; border: 1px solid #DDE8F7; border-radius: 6px; padding: 9px 11px; }
  .kpi.big { flex: 1.6; background: #10244B; border-color: #10244B; color: #fff; }
  .kpi small { display: block; font-size: 8.5px; text-transform: uppercase; letter-spacing: 0.06em; color: #536D97; font-weight: 600; }
  .kpi.big small { color: #B9C9E6; }
  .kpi strong { font-size: 18px; }
  .kpi.big strong { font-size: 21px; }
  .kpi .sub { display: block; font-size: 9px; color: #536D97; margin-top: 1px; }
  .kpi.big .sub { color: #B9C9E6; }
  h2 { margin: 0 0 6px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: #536D97; }
  .bar { display: flex; height: 12px; border-radius: 99px; overflow: hidden; background: #EEF1F6; }
  .bar i { display: block; height: 100%; }
  .legend { display: flex; flex-wrap: wrap; gap: 6px 16px; margin-top: 8px; font-size: 10px; color: #536D97; }
  .legend em { display: inline-block; width: 9px; height: 9px; border-radius: 50%; margin-right: 5px; }
  .legend b { color: #10244B; }
  .block { margin-bottom: 16px; }
  .attn { border: 1px solid #F3C9C5; background: #FEF7F6; border-radius: 6px; padding: 8px 12px; font-size: 10.5px; color: #4A5878; margin-bottom: 16px; }
  .attn b { display: block; color: #A82B24; font-size: 11px; margin-bottom: 3px; }
  .attn span { display: block; padding: 1px 0; }
  .grp { border: 1px solid #DDE8F7; border-radius: 6px; overflow: hidden; margin-bottom: 8px; page-break-inside: avoid; }
  .grp-h { display: flex; justify-content: space-between; background: #F3F6FB; padding: 6px 10px; font-size: 10px; border-bottom: 1px solid #DDE8F7; }
  .grp-h b { font-size: 11px; }
  .grp-h span { color: #536D97; }
  .pt { display: flex; align-items: center; gap: 8px; padding: 6px 10px; font-size: 10px; border-bottom: 1px solid #EEF2F8; page-break-inside: avoid; }
  .pt:last-child { border-bottom: 0; }
  .pt .n { width: 22px; color: #7A8BA8; font-weight: 600; }
  .pt .id { width: 62px; }
  .pt .id b { display: block; font-size: 10.5px; }
  .pt .id small { color: #7A8BA8; font-size: 9px; }
  .pt .when { width: 104px; color: #536D97; }
  .st { display: inline-block; min-width: 62px; text-align: center; padding: 1px 7px; border-radius: 99px; font-size: 9px; font-weight: 600; }
  .gv { flex: 1; display: flex; align-items: center; gap: 8px; }
  .gauge { position: relative; flex: 1; height: 8px; border-radius: 99px; background: #EEF1F6; }
  .gauge i { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 99px; }
  .gauge u { position: absolute; top: -2px; bottom: -2px; width: 1px; background: #B8C5DA; }
  .gv b { width: 44px; text-align: right; font-size: 10.5px; }
  .none { color: #9BAABD; }
  .rt { width: 58px; font-size: 9.5px; font-weight: 700; }
  .scale { text-align: right; font-size: 8.5px; color: #7A8BA8; margin-top: 4px; }
  .foot { margin-top: 18px; padding-top: 8px; border-top: 1px solid #E6ECF5; display: flex; justify-content: space-between; font-size: 9px; color: #7A8BA8; }
</style>
</head>
<body>
  <div class="head">
    <div><h1>Way To Mark — Mission Report</h1><small>DYX 4WD Rover · Mode: ${esc(
      stats.mode,
    )}</small></div>
    <div class="when-h"><b>Generated</b>${esc(stats.generatedAt)}</div>
  </div>

  <div class="kpis">
    <div class="kpi big"><small>Total mission time</small><strong>${esc(
      stats.totalMissionTime,
    )}</strong><span class="sub">${esc(stats.startedAt)} to ${esc(
      stats.finishedAt,
    )}</span></div>
    <div class="kpi"><small>Points</small><strong>${stats.totalPoints}</strong></div>
    <div class="kpi"><small>Completed</small><strong style="color:#0B7A57">${
      stats.completedPoints
    }</strong></div>
    <div class="kpi"><small>Skipped</small><strong style="color:#8A5A00">${
      stats.skippedPoints
    }</strong></div>
    <div class="kpi"><small>Success rate</small><strong>${stats.successRate}%</strong></div>
  </div>

  <div class="block">
    <h2>${esc(accuracyTitle)}</h2>
    <div class="bar">${bar}</div>
    <div class="legend">${legend}</div>
  </div>

  ${attention}

  <h2>All points · by row</h2>
  ${groupsHtml(rows)}
  <div class="scale">Gauge: 0 to ${GAUGE_MAX_MM} mm · ticks at ${GNSS_LIMITS_MM.excellent}, ${
    GNSS_LIMITS_MM.good
  }, ${GNSS_LIMITS_MM.poor} mm</div>

  <div class="foot"><span>Way To Mark · DYX Agent</span><span>${stats.totalPoints} points · ${
    stats.completedPoints
  } completed · ${stats.successRate}% success</span></div>
</body>
</html>`;
};
