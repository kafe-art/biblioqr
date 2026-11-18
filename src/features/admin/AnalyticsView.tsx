import { useEffect, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Button, Card, Field, SectionTitle, inputCls } from '../../components/ui/primitives'
import { getWeeklyReport, reportCsv, reportMonday, shiftReportWeek, REPORT_IDLE_LIMIT, type WeeklyKpis, type WeeklyReport } from '../../lib/reports'
import { money, POLICY } from '../../lib/rules'

const DAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const COLORS = ['#6366f1', '#0891b2', '#db2777', '#d97706', '#059669', '#9333ea', '#e11d48']
const pct = (value: number) => `${(value * 100).toFixed(1)} %`
const tooltipStyle = { backgroundColor: 'var(--surface, #ffffff)', color: 'var(--fg, #111827)', border: '1px solid var(--line-strong, #64748b)', borderRadius: 12 }
const chartTick = { fill: 'currentColor', style: { fill: 'var(--muted, currentColor)' }, fontSize: 12 }
const METRICS: { key: keyof WeeklyKpis; label: string; format?: 'money' | 'rate'; lower?: boolean; hint: string }[] = [
  { key: 'loans', label: 'Préstamos', hint: 'Entregas físicas y digitales durante la semana.' },
  { key: 'returns', label: 'Devoluciones', hint: 'Devoluciones registradas durante la semana.' },
  { key: 'overdueRate', label: 'Índice de mora', format: 'rate', lower: true, hint: 'Préstamos vencidos / préstamos abiertos al cierre.' },
  { key: 'finesIssued', label: 'Multas emitidas', format: 'money', lower: true, hint: 'Importe de multas creadas durante la semana.' },
  { key: 'finesCollected', label: 'Multas cobradas', format: 'money', hint: 'Pagos registrados en auditoría durante la semana.' },
  { key: 'reservations', label: 'Reservas creadas', hint: 'Solicitudes creadas durante la semana.' },
  { key: 'noShowRate', label: 'Reservas sin recoger', format: 'rate', lower: true, hint: 'Sin recojo antes de caducar / reservas con plazo vencido; excluye canceladas.' },
  { key: 'activeUsers', label: 'Usuarios con actividad', hint: 'Personas distintas que prestaron, devolvieron o reservaron.' },
  { key: 'newUsers', label: 'Nuevos usuarios', hint: 'Altas individuales registradas en auditoría.' },
]

function DataTable({ caption, headers, rows }: { caption: string; headers: string[]; rows: (string | number)[][] }) {
  return <div className="overflow-x-auto"><table className="w-full text-left text-sm">
    <caption className="sr-only">{caption}</caption>
    <thead><tr>{headers.map(h => <th key={h} scope="col" className="border-b border-line px-3 py-3 font-medium text-muted">{h}</th>)}</tr></thead>
    <tbody>{rows.map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j} className="border-b border-line px-3 py-3 tabular-nums">{cell}</td>)}</tr>)}</tbody>
  </table>{!rows.length && <p className="p-6 text-center text-sm text-muted">Sin registros para este periodo.</p>}</div>
}

function Variation({ current, previous, rate, lower }: { current: number; previous: number; rate: boolean; lower?: boolean }) {
  const delta = current - previous
  const text = rate ? `${delta > 0 ? '+' : ''}${(delta * 100).toFixed(1)} pp` : previous === 0 ? current === 0 ? 'Sin cambio' : 'Nuevo (base 0)' : `${delta > 0 ? '+' : ''}${(delta / previous * 100).toFixed(1)} %`
  return <p className={`mt-2 text-xs font-medium ${delta === 0 ? 'text-muted' : (lower ? delta < 0 : delta > 0) ? 'text-ok' : 'text-bad'}`}>
    {delta === 0 ? '— ' : delta > 0 ? '↑ ' : '↓ '}{text} <span className="font-normal text-muted">vs. semana anterior</span>
  </p>
}

export function AnalyticsView() {
  const [week, setWeek] = useState(reportMonday)
  const [report, setReport] = useState<WeeklyReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    let closed: HTMLDetailsElement[] = []
    const beforePrint = () => {
      closed = Array.from(document.querySelectorAll<HTMLDetailsElement>('.weekly-report details:not([open])'))
      closed.forEach(element => { element.open = true })
    }
    const afterPrint = () => { closed.forEach(element => { element.open = false }); closed = [] }
    window.addEventListener('beforeprint', beforePrint)
    window.addEventListener('afterprint', afterPrint)
    return () => {
      window.removeEventListener('beforeprint', beforePrint)
      window.removeEventListener('afterprint', afterPrint)
    }
  }, [])
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    setReport(null)
    getWeeklyReport(week).then(data => {
      if (!cancelled) setReport(data)
    }).catch((reason: unknown) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : 'No se pudo cargar el reporte.')
    }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [week, retry])

  const exportCsv = () => {
    if (!report) return
    const url = URL.createObjectURL(new Blob([reportCsv(report)], { type: 'text/csv;charset=utf-8;' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `biblioteca-${report.range.start}.csv`
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  const maxHourly = Math.max(1, ...(report?.hourly.map(h => h.loans) ?? []))
  const total = report?.kpis.loans ?? 0
  const loanGenres = (report?.byGenre ?? []).filter(g => g.loans > 0).map(g => ({ genre: g.genre, loans: g.loans }))
  // Keep every slice identifiable: six named genres + a single Others slice.
  // The table below always retains the complete genre breakdown.
  const pieGenres = loanGenres.length > COLORS.length
    ? [...loanGenres.slice(0, 6), { genre: `Otros (${loanGenres.length - 6} géneros)`, loans: loanGenres.slice(6).reduce((sum, g) => sum + g.loans, 0) }]
    : loanGenres

  return <div className="weekly-report space-y-6" aria-busy={loading}>
    <style>{`.weekly-report .report-chart-grid line { stroke: var(--line-strong, currentColor); }
@media print {
      @page { size: A4 landscape; margin: 12mm; }
      html, body, #root { height: auto !important; overflow: visible !important; }
      body * { visibility: hidden; }
      body:has(.weekly-report) * { overflow: visible !important; }
      body:has(.weekly-report) .weekly-report, .weekly-report * { visibility: visible; }
      .weekly-report { position: absolute !important; left: 0; top: 0; width: 100% !important; color: #111 !important; background: white !important; }
      .weekly-report * { color: #111 !important; box-shadow: none !important; }
      .weekly-report .report-controls { display: none !important; }
      .weekly-report .report-card { break-inside: avoid; background: white !important; }
      .weekly-report .report-chart { display: none !important; }
      .weekly-report .report-data > * { display: block !important; }
      .weekly-report .report-data summary { display: none !important; }
      .weekly-report .report-grid { display: block !important; }
      .weekly-report .report-grid > * { margin-bottom: 6mm; }
      .weekly-report table { font-size: 10px; }
      .weekly-report tr { break-inside: avoid; }
      .weekly-report .report-heatmap td { background: #fff !important; color: #111 !important; border: 1px solid #bbb; }
    }`}</style>
    <SectionTitle title="Reporte semanal" hint="Decisiones claras a partir de la circulación real de tu biblioteca." />
    <Card className="report-controls flex flex-wrap items-end gap-3 p-4">
      <div className="min-w-44"><Field label="Semana (elige cualquier día)">{id => <input id={id} type="date" min="1900-01-01" max={reportMonday()} value={week} onChange={e => { if (e.target.value && e.target.validity.valid) setWeek(reportMonday(new Date(`${e.target.value}T12:00:00-05:00`))) }} className={inputCls} />}</Field></div>
      <Button variant="secondary" onClick={() => setWeek(shiftReportWeek(week, -1))} disabled={week <= '1900-01-01'}>← Anterior</Button>
      <Button variant="secondary" onClick={() => setWeek(shiftReportWeek(week, 1))} disabled={week >= reportMonday()}>Siguiente →</Button>
      <Button variant="ghost" onClick={() => setWeek(reportMonday())}>Semana actual</Button>
      <div className="ml-auto flex gap-2"><Button variant="secondary" disabled={!report || loading} onClick={exportCsv}>Exportar CSV</Button><Button disabled={!report || loading} onClick={() => window.print()}>Imprimir</Button></div>
    </Card>
    {loading && <Card className="p-8 text-muted" role="status">Cargando los datos de la semana…</Card>}
    {error && <Card className="space-y-3 p-6"><p role="alert" className="text-bad">{error}</p><Button variant="secondary" onClick={() => setRetry(n => n + 1)}>Reintentar</Button></Card>}
    {report && <>
      <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-medium">{report.range.start} — {report.range.end} · Lima (UTC−05:00)</p><span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-accent">{report.range.start === reportMonday() ? 'Semana en curso · datos parciales' : 'Semana completa'}</span></div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{METRICS.map(metric => <Card key={metric.key} className="report-card p-5">
        <p className="text-sm text-muted">{metric.label}</p>
        <p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums">{metric.format === 'money' ? money(report.kpis[metric.key]) : metric.format === 'rate' ? pct(report.kpis[metric.key]) : report.kpis[metric.key].toLocaleString('es-PE')}</p>
        <Variation current={report.kpis[metric.key]} previous={report.prev[metric.key]} rate={metric.format === 'rate'} lower={metric.lower} />
        <p className="mt-2 text-xs text-muted">{metric.hint}</p>
      </Card>)}</div>
      <div className="report-grid grid gap-6 lg:grid-cols-2">
        <Card className="report-card p-5">
          <SectionTitle title="Circulación por día" hint="Préstamos y devoluciones, de lunes a domingo." />
          <div className="mb-3 flex gap-4 text-xs"><span>● Préstamos (índigo)</span><span>● Devoluciones (turquesa)</span></div>
          <div className="report-chart h-72" role="img" aria-label={`Circulación diaria: ${report.daily.map((d, i) => `${DAYS[i]}: ${d.loans} préstamos, ${d.returns} devoluciones`).join('; ')}`}>
            <ResponsiveContainer width="100%" height="100%"><BarChart data={report.daily} margin={{ left: -20, right: 8 }} accessibilityLayer>
              <CartesianGrid stroke="currentColor" className="report-chart-grid" vertical={false} /><XAxis dataKey="date" tickFormatter={(date: string) => DAYS[report.daily.findIndex(d => d.date === date)] ?? date} tick={chartTick} /><YAxis allowDecimals={false} tick={chartTick} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: '#e2e8f0', style: { fill: 'var(--surface-2, #e2e8f0)' } }} /><Bar dataKey="loans" name="Préstamos" fill="#6366f1" radius={[4, 4, 0, 0]} isAnimationActive={false} /><Bar dataKey="returns" name="Devoluciones" fill="#0891b2" radius={[4, 4, 0, 0]} isAnimationActive={false} />
            </BarChart></ResponsiveContainer>
          </div>
          <details className="report-data mt-3"><summary className="cursor-pointer text-sm text-accent">Ver datos por día</summary><DataTable caption="Circulación diaria" headers={['Fecha', 'Préstamos', 'Devoluciones']} rows={report.daily.map(d => [d.date, d.loans, d.returns])} /></details>
        </Card>
        <Card className="report-card p-5">
          <SectionTitle title="Distribución por género" hint="Préstamos de la semana. Utilización: ejemplares físicos prestables distintos prestados / ejemplares físicos prestables del género." />
          {total > 0 ? <div className="report-chart relative h-72" role="img" aria-label={`Préstamos por género: ${report.byGenre.map(g => `${g.genre}: ${g.loans}`).join('; ')}`}>
            <ResponsiveContainer width="100%" height="100%"><PieChart accessibilityLayer><Pie data={pieGenres} dataKey="loans" nameKey="genre" innerRadius="55%" outerRadius="85%" paddingAngle={3} isAnimationActive={false}>{pieGenres.map((g, i) => <Cell key={g.genre} fill={COLORS[i]} />)}</Pie><Tooltip contentStyle={tooltipStyle} /></PieChart></ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"><strong className="text-3xl tabular-nums">{total}</strong><span className="text-xs text-muted">préstamos</span></div>
          </div> : <p className="py-12 text-center text-muted">Sin préstamos esta semana.</p>}
          {pieGenres.length > 0 && <ul className="mt-3 space-y-2 text-sm" aria-label="Leyenda de préstamos por género">{pieGenres.map((g, i) => <li key={g.genre} className="flex items-center gap-2">
            <span aria-hidden className="h-3 w-3 shrink-0 rounded" style={{ backgroundColor: COLORS[i] }} />
            <span className="min-w-0 flex-1">{g.genre}</span><span className="tabular-nums">{g.loans} · {pct(total ? g.loans / total : 0)}</span>
          </li>)}</ul>}
          {loanGenres.length > COLORS.length && <p className="mt-2 text-xs text-muted">Otros reúne los géneros restantes. Consulta todos los valores en la tabla.</p>}
          <details className="report-data mt-3" open><summary className="cursor-pointer text-sm text-accent">Ver distribución y utilización</summary><DataTable caption="Préstamos y utilización por género" headers={['Género', 'Préstamos', 'Utilización']} rows={report.byGenre.map(g => [g.genre, g.loans, pct(g.utilization)])} /></details>
        </Card>
      </div>
      <Card className="report-card p-5">
        <SectionTitle title="Top 10 de libros" hint="Títulos con más préstamos en la semana seleccionada." />
        {report.topBooks.length > 0 ? <div className="report-chart" style={{ height: Math.max(160, report.topBooks.length * 45) }} role="img" aria-label={`Libros más prestados: ${report.topBooks.map(b => `${b.title}: ${b.loans}`).join('; ')}`}>
          <ResponsiveContainer width="100%" height="100%"><BarChart data={report.topBooks} layout="vertical" margin={{ left: 8, right: 24 }} accessibilityLayer><CartesianGrid stroke="currentColor" className="report-chart-grid" horizontal={false} /><XAxis type="number" allowDecimals={false} tick={chartTick} /><YAxis type="category" dataKey="title" width={150} tick={{ ...chartTick, fontSize: 11 }} tickFormatter={(title: string) => title.length > 23 ? `${title.slice(0, 23)}…` : title} /><Tooltip contentStyle={tooltipStyle} cursor={{ fill: '#e2e8f0', style: { fill: 'var(--surface-2, #e2e8f0)' } }} /><Bar dataKey="loans" name="Préstamos" fill="#6366f1" radius={[0, 4, 4, 0]} isAnimationActive={false} /></BarChart></ResponsiveContainer>
        </div> : <p className="py-8 text-center text-muted">Todavía no hay préstamos en esta semana.</p>}
        <details className="report-data mt-3"><summary className="cursor-pointer text-sm text-accent">Ver clasificación completa</summary><DataTable caption="Top 10 de libros prestados" headers={['Posición', 'Título', 'Préstamos']} rows={report.topBooks.map((b, i) => [i + 1, b.title, b.loans])} /></details>
      </Card>
      <Card className="report-card p-5">
        <SectionTitle title="Horas de mayor movimiento" hint="Número de préstamos por día y hora de Lima. Cada celda muestra el valor exacto." />
        <div className="overflow-x-auto"><table className="report-heatmap w-full min-w-[820px] border-separate border-spacing-1 text-center text-xs">
          <caption className="sr-only">Mapa de calor de préstamos por día y hora (UTC−05:00)</caption>
          <thead><tr><th scope="col">Día / hora</th>{Array.from({ length: 24 }, (_, h) => <th key={h} scope="col" className="font-normal text-muted">{h}</th>)}</tr></thead>
          <tbody>{DAYS.map((day, weekday) => <tr key={day}><th scope="row" className="pr-2 text-left font-medium">{day}</th>{report.hourly.filter(h => h.weekday === weekday).map(h => <td key={h.hour} className="h-8 rounded font-medium tabular-nums" style={{ backgroundColor: h.loans ? `hsl(245 65% ${48 - h.loans / maxHourly * 20}%)` : 'var(--surface-2)', color: h.loans ? '#ffffff' : 'var(--muted)' }} title={`${day} ${h.hour}:00 — ${h.loans} préstamos`}>{h.loans}</td>)}</tr>)}</tbody>
        </table></div><p className="mt-3 text-xs text-muted">Más intensidad = más préstamos · máximo: {maxHourly === 1 && !total ? 0 : maxHourly} en una franja.</p>
      </Card>
      <Card className="report-card p-5">
        <SectionTitle title="Libros sin préstamos recientes" hint={`Sin préstamos durante ${POLICY.idleDays} días al cierre del periodo (o hasta hoy para la semana actual). Los títulos nunca prestados aparecen tras ${POLICY.idleDays} días en catálogo.`} />
        <p className="mb-3 text-sm text-muted">{report.idleBooks.length} títulos mostrados (máximo {REPORT_IDLE_LIMIT}, ordenados por título). Considera difusión, exhibiciones temáticas o renovación de la colección.</p>
        <DataTable caption={`Libros sin préstamos en ${POLICY.idleDays} días`} headers={['Título', 'Ejemplares', 'Último préstamo']} rows={report.idleBooks.map(b => [b.title, b.copies, b.lastLoanAt ? new Date(b.lastLoanAt).toLocaleDateString('es-PE', { timeZone: 'America/Lima' }) : 'Nunca prestado'])} />
      </Card>
      <p className="text-xs leading-relaxed text-muted">Las tasas se expresan en porcentaje; su variación, en puntos porcentuales (pp). La mora se calcula al cierre de cada periodo; las renovaciones posteriores pueden afectar su reconstrucción. Nuevos usuarios y cobros dependen de los eventos de auditoría disponibles; las cuentas iniciales e importadas sin evento de alta no se cuentan. La utilización usa los ejemplares físicos actualmente prestables (condición excelente o regular). Una semana en curso se compara con la semana anterior completa.</p>
    </>}
  </div>
}




