// Bound the detailed idle-book list; chart data and KPIs cover the entire period.
export const REPORT_IDLE_LIMIT = 200

export interface WeeklyKpis {
  loans: number
  returns: number
  overdueRate: number
  finesIssued: number
  finesCollected: number
  reservations: number
  noShowRate: number
  activeUsers: number
  newUsers: number
}

export interface WeeklyReport {
  range: { start: string; end: string }
  kpis: WeeklyKpis
  prev: WeeklyKpis
  daily: { date: string; loans: number; returns: number }[]
  topBooks: { bookId: string; title: string; loans: number }[]
  idleBooks: { bookId: string; title: string; copies: number; lastLoanAt: string | null }[]
  byGenre: { genre: string; loans: number; utilization: number }[]
  hourly: { weekday: number; hour: number; loans: number }[]
}


