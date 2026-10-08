import { useState, type FormEvent } from 'react'
import { Header, Icon } from '../components/ui'
import { api } from '../lib/api'
import { today } from '../lib/dates'
import { buildYearReport, reportToCsv } from '../lib/rules'
import { useData } from '../lib/store'
import type { CostCategory } from '../lib/types'

const COST_LABELS: Record<CostCategory, string> = {
  rent: 'Rent', electricity: 'Electricity', water: 'Water', supplies: 'Supplies', other: 'Other',
}

export function Report() {
  const { data, mutate } = useData()
  const thisYear = Number(today().slice(0, 4))
  const years = [...new Set([thisYear, ...data.costs.map((c) => c.year), ...data.reservations.map((r) => Number(r.start.slice(0, 4)))])]
    .filter((y) => y <= thisYear)
    .sort((a, b) => b - a)
  const [year, setYear] = useState(thisYear)
  const report = buildYearReport(year, data.profiles, data.reservations, data.costs)
  const cur = data.settings.currency
  const money = (n: number) => n.toLocaleString(undefined, { style: 'currency', currency: cur, maximumFractionDigits: 0 })
  const money2 = (n: number) => n.toLocaleString(undefined, { style: 'currency', currency: cur })
  const maxPn = Math.max(1, ...report.rows.map((r) => r.personNights))
  const byFamily = Object.values(
    report.rows.reduce<Record<string, { family: string; members: string[]; personNights: number; owed: number }>>((acc, r) => {
      const family = r.user.family || 'No family chosen'
      acc[family] ??= { family, members: [], personNights: 0, owed: 0 }
      acc[family].members.push(r.user.name)
      acc[family].personNights += r.personNights
      acc[family].owed += r.owed
      return acc
    }, {}),
  ).sort((a, b) => b.owed - a.owed)

  function download() {
    const csv = reportToCsv(report, cur)
    // BOM so Excel opens umlauts correctly
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `feldele-costs-${year}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <>
      <Header title="Costs & usage" back />
      <div className="page">
        <div className="chips">
          {years.map((y) => (
            <button key={y} className={'chip' + (y === year ? ' on' : '')} onClick={() => setYear(y)}>{y}</button>
          ))}
        </div>

        <section className="card">
          <h2>How the split works</h2>
          <p className="small muted">
            Every person staying one night = 1 person-night. Each member pays the share of the year's costs
            matching their person-nights (incl. their guests). Stays cancelled after the free period still count.
            Only nights up to today are counted.
          </p>
        </section>

        <section className="card">
          <div className="row-head">
            <h2>Who pays what – {year}</h2>
            <button className="btn small ghost" onClick={download}><Icon name="download" size={16} /> CSV</button>
          </div>
          {report.rows.map((r) => (
            <div key={r.user.id} className="split-row">
              <div className="row-head">
                <strong>{r.user.name}</strong>
                <strong>{money(r.owed)}</strong>
              </div>
              <div className="bar"><i style={{ width: `${(r.personNights / maxPn) * 100}%` }} /></div>
              <p className="small muted">
                {r.stays} stay{r.stays === 1 ? "" : "s"} · {r.nights} nights · {r.personNights} person-nights · {(r.share * 100).toFixed(1)}%
                {r.hosted > 0 && ` · 🎉 ${r.hosted} hosted`}
                {r.lateCancelPersonNights > 0 && ` · ${r.lateCancelPersonNights} from late cancels`}
              </p>
            </div>
          ))}
          <div className="row-head total">
            <span>Total ({report.totalPersonNights} person-nights)</span>
            <strong>{money(report.totalCosts)}</strong>
          </div>
          {report.totalPersonNights > 0 && (
            <div className="row-head">
              <span className="muted">Cost per person per night</span>
              <strong>{money2(report.totalCosts / report.totalPersonNights)}</strong>
            </div>
          )}
        </section>

        {byFamily.length > 1 && (
          <section className="card">
            <h2>By family – {year}</h2>
            {byFamily.map((f) => (
              <div key={f.family} className="row-head cost-row">
                <span>{f.family} <span className="muted small">· {f.members.join(', ')} · {f.personNights} person-nights</span></span>
                <strong>{money(f.owed)}</strong>
              </div>
            ))}
          </section>
        )}

        <section className="card">
          <h2>Costs {year}</h2>
          {data.costs.filter((c) => c.year === year).map((c) => (
            <div key={c.id} className="row-head cost-row">
              <span>{COST_LABELS[c.category]}{c.note ? <span className="muted small"> – {c.note}</span> : null}</span>
              <span className="row-end">
                {money(c.amount)}
                <button className="icon-btn" aria-label="Delete cost"
                  onClick={() => confirm('Delete this cost entry?') && mutate(() => api.deleteCost(c.id))}>
                  <Icon name="trash" size={16} />
                </button>
              </span>
            </div>
          ))}
          {report.totalCosts === 0 && <p className="muted small">No costs entered for {year}.</p>}
          <AddCost year={year} />
        </section>
      </div>
    </>
  )
}

function AddCost({ year }: { year: number }) {
  const { mutate } = useData()
  const [category, setCategory] = useState<CostCategory>('rent')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    await mutate(() => api.addCost({ year, category, amount: Number(amount), note: note.trim() || undefined }))
    setAmount('')
    setNote('')
  }

  return (
    <form className="form add-cost" onSubmit={submit}>
      <div className="grid2">
        <label>Type
          <select value={category} onChange={(e) => setCategory(e.target.value as CostCategory)}>
            {Object.entries(COST_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label>Amount<input type="number" inputMode="decimal" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required /></label>
      </div>
      <label>Note<input value={note} onChange={(e) => setNote(e.target.value)} placeholder="optional" /></label>
      <button className="btn">Add cost</button>
    </form>
  )
}
