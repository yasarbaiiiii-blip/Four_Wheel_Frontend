/**
 * Builds the mission report as a real .xlsx workbook.
 *
 * ExcelJS is kept out of the native bundle on purpose (see loadExcelJS.native),
 * so the workbook is written directly as OOXML parts and zipped with JSZip,
 * which is small and runs the same on Android, iOS and web.
 *
 * Layout: title band, a summary list on the left, the GNSS accuracy tiers on
 * the right, an optional "needs attention" list, then the point table.
 */

// `export =` module: a plain require keeps this working with and without
// esModuleInterop (Metro, tsc and the ts-jest setup differ on that).
// eslint-disable-next-line @typescript-eslint/no-var-requires
const JSZip: typeof import('jszip') = require('jszip');

import {
  GNSS_RATINGS,
  GNSS_RATING_ORDER,
  GNSS_RATING_RANGE,
} from './gnssAccuracyTier';
import {
  REPORT_COLUMNS,
  type ExportRow,
  type MissionReportModel,
  type StatusTone,
} from './exportHelpers';

// ── Style registry ───────────────────────────────────────────────────────────

interface CellStyle {
  bold?: boolean;
  italic?: boolean;
  size?: number;
  /** RRGGBB */
  color?: string;
  /** RRGGBB */
  fill?: string;
  h?: 'left' | 'center' | 'right';
  numFmt?: string;
  wrap?: boolean;
  border?: 'thin' | 'medium';
  /** RRGGBB, used for the bottom border. */
  borderColor?: string;
}

const NAVY = '10244B';
const MUTE = '536D97';
const LINE = 'DDE8F7';
const SOFT = 'F8FAFC';
const ZEBRA = 'FBFCFE';
const BLUE_SOFT = 'EAF3FF';
const BLUE = '1475EE';

const TONE: Record<StatusTone, { fill: string; ink: string }> = {
  good: { fill: 'E6F8F1', ink: '0B7A57' },
  warn: { fill: 'FFF3D6', ink: '8A5A00' },
  bad: { fill: 'FCEAE8', ink: 'A82B24' },
  neutral: { fill: 'EEF1F6', ink: MUTE },
};

const hex = (value: string): string => value.replace('#', '').toUpperCase();

class Styles {
  private readonly fonts: string[] = [];
  private readonly fills: string[] = [];
  private readonly borders: string[] = [];
  private readonly numFmts: string[] = [];
  private readonly xfs: string[] = [];
  private readonly cache = new Map<string, number>();

  constructor() {
    this.fonts.push(this.fontXml({}));
    this.fills.push('<fill><patternFill patternType="none"/></fill>');
    this.fills.push('<fill><patternFill patternType="gray125"/></fill>');
    this.borders.push('<border><left/><right/><top/><bottom/><diagonal/></border>');
    this.xfs.push(
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>',
    );
    this.cache.set('{}', 0);
  }

  private fontXml(style: CellStyle): string {
    return (
      '<font>' +
      (style.bold ? '<b/>' : '') +
      (style.italic ? '<i/>' : '') +
      `<sz val="${style.size ?? 11}"/>` +
      `<color rgb="FF${style.color ?? NAVY}"/>` +
      '<name val="Calibri"/><family val="2"/></font>'
    );
  }

  private index(list: string[], xml: string): number {
    const found = list.indexOf(xml);
    if (found >= 0) return found;
    list.push(xml);
    return list.length - 1;
  }

  /** Style index for a style description (created on first use). */
  get(style: CellStyle): number {
    const key = JSON.stringify(style);
    const cached = this.cache.get(key);
    if (cached !== undefined) return cached;

    const fontId = this.index(this.fonts, this.fontXml(style));
    const fillId = style.fill
      ? this.index(
          this.fills,
          `<fill><patternFill patternType="solid"><fgColor rgb="FF${style.fill}"/><bgColor indexed="64"/></patternFill></fill>`,
        )
      : 0;
    const borderId = style.border
      ? this.index(
          this.borders,
          `<border><left/><right/><top/><bottom style="${style.border}"><color rgb="FF${
            style.borderColor ?? LINE
          }"/></bottom><diagonal/></border>`,
        )
      : 0;
    let numFmtId = 0;
    if (style.numFmt) {
      numFmtId = 164 + this.index(this.numFmts, style.numFmt);
    }
    const alignment =
      `<alignment vertical="center"${style.h ? ` horizontal="${style.h}"` : ''}${
        style.wrap ? ' wrapText="1"' : ''
      }/>`;
    const xf =
      `<xf numFmtId="${numFmtId}" fontId="${fontId}" fillId="${fillId}" borderId="${borderId}" xfId="0"` +
      `${numFmtId ? ' applyNumberFormat="1"' : ''} applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">` +
      `${alignment}</xf>`;
    this.xfs.push(xf);
    const id = this.xfs.length - 1;
    this.cache.set(key, id);
    return id;
  }

  xml(): string {
    const numFmts = this.numFmts.length
      ? `<numFmts count="${this.numFmts.length}">${this.numFmts
          .map(
            (code, i) =>
              `<numFmt numFmtId="${164 + i}" formatCode="${xmlEscape(code)}"/>`,
          )
          .join('')}</numFmts>`
      : '';
    return (
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      numFmts +
      `<fonts count="${this.fonts.length}">${this.fonts.join('')}</fonts>` +
      `<fills count="${this.fills.length}">${this.fills.join('')}</fills>` +
      `<borders count="${this.borders.length}">${this.borders.join('')}</borders>` +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      `<cellXfs count="${this.xfs.length}">${this.xfs.join('')}</cellXfs>` +
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
      '</styleSheet>'
    );
  }
}

// ── XML helpers ──────────────────────────────────────────────────────────────

function xmlEscape(value: string): string {
  return (
    value
      // Characters XML 1.0 cannot carry at all.
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  );
}

const COLS = 'ABCDEFGHIJ';
const LAST_COL = COLS.length; // 10

const colLetter = (col: number): string => COLS[col - 1];

interface Cell {
  col: number;
  value: string | number | null;
  style: number;
}

class Sheet {
  readonly rows = new Map<number, { cells: Cell[]; height?: number }>();
  readonly merges: string[] = [];

  private row(r: number) {
    let entry = this.rows.get(r);
    if (!entry) {
      entry = { cells: [] };
      this.rows.set(r, entry);
    }
    return entry;
  }

  height(r: number, height: number) {
    this.row(r).height = height;
  }

  put(r: number, col: number, value: string | number | null, style: number) {
    this.row(r).cells.push({ col, value, style });
  }

  /** Value in the first cell, style on every cell so fills and borders span. */
  span(
    r: number,
    from: number,
    to: number,
    value: string | number | null,
    style: number,
  ) {
    this.put(r, from, value, style);
    for (let c = from + 1; c <= to; c += 1) this.put(r, c, null, style);
    if (to > from) {
      this.merges.push(`${colLetter(from)}${r}:${colLetter(to)}${r}`);
    }
  }

  xml(opts: {
    widths: number[];
    filterRef: string | null;
    lastRow: number;
  }): string {
    const rowsXml = [...this.rows.keys()]
      .sort((a, b) => a - b)
      .map((r) => {
        const entry = this.rows.get(r)!;
        const cells = entry.cells
          .slice()
          .sort((a, b) => a.col - b.col)
          .map((cell) => {
            const ref = `${colLetter(cell.col)}${r}`;
            if (
              cell.value === null ||
              cell.value === '' ||
              (typeof cell.value === 'number' && !Number.isFinite(cell.value))
            ) {
              return `<c r="${ref}" s="${cell.style}"/>`;
            }
            if (typeof cell.value === 'number') {
              return `<c r="${ref}" s="${cell.style}"><v>${cell.value}</v></c>`;
            }
            return `<c r="${ref}" s="${cell.style}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(
              cell.value,
            )}</t></is></c>`;
          })
          .join('');
        const height = entry.height
          ? ` ht="${entry.height}" customHeight="1"`
          : '';
        return `<row r="${r}"${height}>${cells}</row>`;
      })
      .join('');

    const cols = opts.widths
      .map(
        (w, i) =>
          `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`,
      )
      .join('');

    return (
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>' +
      `<dimension ref="A1:${colLetter(LAST_COL)}${opts.lastRow}"/>` +
      '<sheetViews><sheetView showGridLines="0" workbookViewId="0"/></sheetViews>' +
      '<sheetFormatPr defaultRowHeight="18"/>' +
      `<cols>${cols}</cols>` +
      `<sheetData>${rowsXml}</sheetData>` +
      (opts.filterRef ? `<autoFilter ref="${opts.filterRef}"/>` : '') +
      (this.merges.length
        ? `<mergeCells count="${this.merges.length}">${this.merges
            .map((m) => `<mergeCell ref="${m}"/>`)
            .join('')}</mergeCells>`
        : '') +
      '<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/>' +
      '<pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/>' +
      '</worksheet>'
    );
  }
}

// ── Workbook ─────────────────────────────────────────────────────────────────

const WIDTHS = [6, 9, 9, 9, 14, 24, 19, 13, 14, 14];

export interface BuiltWorkbook {
  /** Base64 text of the .xlsx file, ready for FileSystem (Base64 encoding). */
  base64: string;
  /** Row number of the table header, for tests and filters. */
  tableHeaderRow: number;
}

export async function buildMissionReportXlsx(
  model: MissionReportModel,
): Promise<BuiltWorkbook> {
  const { rows, stats } = model;
  const styles = new Styles();
  const sheet = new Sheet();
  let r = 1;

  // Title band
  const titleStyle = styles.get({ bold: true, size: 18, color: 'FFFFFF', fill: NAVY, h: 'left' });
  sheet.span(r, 1, LAST_COL, 'Way To Mark — Mission Report', titleStyle);
  sheet.height(r, 34);
  r += 1;
  const subStyle = styles.get({ size: 10, color: 'D5E0F3', fill: NAVY, h: 'left' });
  sheet.span(r, 1, LAST_COL, `Generated ${stats.generatedAt} · Mode: ${stats.mode}`, subStyle);
  sheet.height(r, 20);
  r += 2;

  // Section captions
  const capStyle = styles.get({ bold: true, size: 9, color: MUTE });
  sheet.span(r, 1, 6, 'MISSION SUMMARY', capStyle);
  sheet.span(r, 7, LAST_COL, 'GNSS ACCURACY', capStyle);
  sheet.height(r, 18);
  r += 1;

  // Summary list (left) and accuracy tiers (right)
  const labelStyle = styles.get({ size: 10, color: MUTE, fill: SOFT, border: 'thin', borderColor: LINE });
  const valueStyle = styles.get({ bold: true, size: 11, fill: SOFT, border: 'thin', borderColor: LINE });
  const hiLabel = styles.get({ bold: true, size: 10, color: BLUE, fill: BLUE_SOFT, border: 'thin', borderColor: LINE });
  const hiValue = styles.get({ bold: true, size: 13, color: BLUE, fill: BLUE_SOFT, border: 'thin', borderColor: LINE });

  const summary: Array<{ label: string; value: string | number; hi?: boolean }> = [
    { label: 'Started', value: stats.startedAt },
    { label: 'Finished', value: stats.finishedAt },
    { label: 'Total mission time', value: stats.totalMissionTime, hi: true },
    { label: 'Points', value: stats.totalPoints },
    { label: 'Completed', value: stats.completedPoints },
    { label: 'Skipped', value: stats.skippedPoints },
    { label: 'Errors', value: stats.errorPoints },
    { label: 'Pending', value: stats.pendingPoints },
    { label: 'Success rate', value: `${stats.successRate}%` },
  ];

  const tiers: Array<{ label: string; value: string; fill: string; ink: string }> =
    GNSS_RATING_ORDER.map((key) => ({
      label: `${GNSS_RATINGS[key].label} · ${GNSS_RATING_RANGE[key]}`,
      value: `${stats.ratingCounts[key]} point${stats.ratingCounts[key] === 1 ? '' : 's'}`,
      fill: hex(GNSS_RATINGS[key].background),
      ink: hex(GNSS_RATINGS[key].ink),
    }));
  tiers.push({
    label: 'Average GNSS accuracy',
    value: stats.averageMm === null ? '—' : `${stats.averageMm} mm`,
    fill: SOFT,
    ink: NAVY,
  });
  tiers.push({
    label: 'Points with a measurement',
    value: `${stats.ratedPoints}`,
    fill: SOFT,
    ink: NAVY,
  });

  const count = Math.max(summary.length, tiers.length);
  for (let i = 0; i < count; i += 1) {
    const left = summary[i];
    if (left) {
      sheet.span(r, 1, 3, left.label, left.hi ? hiLabel : labelStyle);
      sheet.span(r, 4, 6, left.value, left.hi ? hiValue : valueStyle);
    }
    const right = tiers[i];
    if (right) {
      sheet.span(
        r,
        7,
        8,
        right.label,
        styles.get({ size: 10, color: right.ink, fill: right.fill, border: 'thin', borderColor: 'FFFFFF' }),
      );
      sheet.span(
        r,
        9,
        LAST_COL,
        right.value,
        styles.get({ bold: true, size: 11, color: right.ink, fill: right.fill, border: 'thin', borderColor: 'FFFFFF' }),
      );
    }
    sheet.height(r, 22);
    r += 1;
  }
  r += 1;

  // Needs attention
  if (stats.attention.length > 0) {
    sheet.span(
      r,
      1,
      LAST_COL,
      `Needs attention · ${stats.attention.length} point${stats.attention.length === 1 ? '' : 's'}`,
      styles.get({ bold: true, size: 10, color: 'A82B24', fill: 'FEF7F6' }),
    );
    r += 1;
    const attnStyle = styles.get({ size: 10, color: '4A5878', fill: 'FEF7F6' });
    for (const item of stats.attention) {
      sheet.span(r, 1, LAST_COL, `Point ${item.n} · ${item.where} · ${item.reason}`, attnStyle);
      r += 1;
    }
    r += 1;
  }

  // Point table
  const tableHeaderRow = r;
  const headStyle = (h: 'left' | 'right') =>
    styles.get({ bold: true, size: 9, color: MUTE, fill: SOFT, h, border: 'medium', borderColor: NAVY });
  const rightCols = new Set([1, 7, 9, 10]);
  REPORT_COLUMNS.forEach((name, i) => {
    sheet.put(r, i + 1, name.toUpperCase(), headStyle(rightCols.has(i + 1) ? 'right' : 'left'));
  });
  sheet.height(r, 24);
  r += 1;

  const firstDataRow = r;
  rows.forEach((row: ExportRow, idx) => {
    const zebra = idx % 2 === 1 ? ZEBRA : undefined;
    const base = { size: 10, fill: zebra, border: 'thin' as const, borderColor: LINE };
    const tone = TONE[row.statusTone];
    const ratingStyle = row.rating
      ? styles.get({ ...base, bold: true, color: hex(row.rating.ink), fill: hex(row.rating.background) })
      : styles.get({ ...base, color: '9BAABD' });
    sheet.put(r, 1, row.n, styles.get({ ...base, h: 'right', color: MUTE }));
    sheet.put(r, 2, row.row, styles.get({ ...base }));
    sheet.put(r, 3, row.block, styles.get({ ...base }));
    sheet.put(r, 4, row.pile, styles.get({ ...base }));
    sheet.put(r, 5, row.status, styles.get({ ...base, bold: true, color: tone.ink, fill: tone.fill }));
    sheet.put(r, 6, row.markedAt, styles.get({ ...base }));
    sheet.put(
      r,
      7,
      row.gnssMm === null ? '—' : row.gnssMm,
      row.gnssMm === null
        ? styles.get({ ...base, h: 'right', color: '9BAABD' })
        : styles.get({ ...base, h: 'right', numFmt: '0" mm"' }),
    );
    sheet.put(r, 8, row.rating ? row.rating.label : '—', ratingStyle);
    sheet.put(r, 9, row.latitude, styles.get({ ...base, h: 'right', numFmt: '0.0000000' }));
    sheet.put(r, 10, row.longitude, styles.get({ ...base, h: 'right', numFmt: '0.0000000' }));
    sheet.height(r, 20);
    r += 1;
  });
  const lastDataRow = Math.max(r - 1, firstDataRow);
  r += 1;

  sheet.span(
    r,
    1,
    LAST_COL,
    'Way To Mark · DYX Agent',
    styles.get({ size: 9, color: '7A8BA8', italic: true }),
  );

  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      '</Types>',
  );
  zip.file(
    '_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      '</Relationships>',
  );
  zip.file(
    'xl/workbook.xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<sheets><sheet name="Mission Report" sheetId="1" r:id="rId1"/></sheets>' +
      `<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">'Mission Report'!$A$${tableHeaderRow}:$${colLetter(LAST_COL)}$${lastDataRow}</definedName></definedNames>` +
      '</workbook>',
  );
  zip.file(
    'xl/_rels/workbook.xml.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
      '</Relationships>',
  );
  zip.file('xl/styles.xml', styles.xml());
  zip.file(
    'xl/worksheets/sheet1.xml',
    sheet.xml({
      widths: WIDTHS,
      filterRef: rows.length
        ? `A${tableHeaderRow}:${colLetter(LAST_COL)}${lastDataRow}`
        : null,
      lastRow: r,
    }),
  );

  const base64 = await zip.generateAsync({
    type: 'base64',
    compression: 'DEFLATE',
  });
  return { base64, tableHeaderRow };
}
