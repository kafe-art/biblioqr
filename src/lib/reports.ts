import { api } from './api'
import type { WeeklyKpis, WeeklyReport } from '../../shared/reports'
export type { WeeklyKpis, WeeklyReport } from '../../shared/reports'
export { REPORT_IDLE_LIMIT } from '../../shared/reports'

export const getWeeklyReport = (start?: string) => api<WeeklyReport>(`/admin/reports/weekly${start ? `?start=${encodeURIComponent(start)}` : ''}`)

/** Monday in the library's time zone (America/Lima, UTC-05:00). */
export function reportMonday(date = new Date()): string {
  const local = new Date(date.getTime() - 5 * 3_600_000)
  local.setUTCDate(local.getUTCDate() - (local.getUTCDay() + 6) % 7)
  return local.toISOString().slice(0, 10)
}

export function shiftReportWeek(start: string, weeks: number): string {
  const date = new Date(`${start}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + weeks * 7)
  return date.toISOString().slice(0, 10)
}

/** Quote every cell and neutralize spreadsheet formulas, including leading whitespace. */
export function reportCsv(report: WeeklyReport): string {
  const rows: (string | number | null)[][] = [
    ['Reporte semanal', report.range.start, report.range.end],
    ['Indicador', 'Semana seleccionada', 'Semana anterior'],
    ...Object.entries(report.kpis).map(([key, value]) => [key, value, report.prev[key as keyof WeeklyKpis]]),
    [], ['Fecha', 'Préstamos', 'Devoluciones'],
    ...report.daily.map(d => [d.date, d.loans, d.returns]),
    [], ['ID libro', 'Título más prestado', 'Préstamos'],
    ...report.topBooks.map(b => [b.bookId, b.title, b.loans]),
    [], ['ID libro', 'Título sin préstamos recientes', 'Ejemplares', 'Último préstamo'],
    ...report.idleBooks.map(b => [b.bookId, b.title, b.copies, b.lastLoanAt]),
    [], ['Género', 'Préstamos', 'Utilización (0–1)'],
    ...report.byGenre.map(g => [g.genre, g.loans, g.utilization]),
    [], ['Día (lunes=0)', 'Hora Lima', 'Préstamos'],
    ...report.hourly.map(h => [h.weekday, h.hour, h.loans]),
  ]
  return '\uFEFF' + rows.map(row => row.map(value => {
    const raw = String(value ?? '')
    const safe = /^[\s\uFEFF]*[=+@-]/.test(raw) || /^[\t\r\n]/.test(raw) ? `'${raw}` : raw
    return `"${safe.replace(/"/g, '""')}"`
  }).join(',')).join('\r\n')
}

