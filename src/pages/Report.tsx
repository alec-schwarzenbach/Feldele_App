import { useState, type FormEvent } from 'react'
import { Header, Icon } from '../components/ui'
import { api } from '../lib/api'
import { today } from '../lib/dates'
import { buildYearReport, familyLabel, reportToCsv } from '../lib/rules'
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
  const report = buildYearReport(year, data.profiles, data.families, data.reservations, data.costs)
  const cur = data.settings.currency
  const money = (n: number) => n.toLocaleString(undefined, { style: 'currency', currency: cur, maximumFractionDigits: 0 })
  const money2 = (n: number) => n.toLocaleString(undefined, { style: 'currency', currency: cur })
  const maxPn = Math.max(1, ...report.families.map((f) => f.personNights))

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
            Every person staying one night = 1 person-night. Each family pays the share of the year's costs
            matching its members' person-nights (incl. their guests). Stays cancelled when it already cost something
            still count. Only nights up to today are counted.
          </p>
        </section>

        <section className="card">
          <div className="row-head">
            <h2>Who pays what – {year}</h2>
            <button className="btn small ghost" onClick={download}><Icon name="download" size={16} /> CSV</button>
          </div>
          {report.families.map((f) => (
            <div key={f.family?.id ?? 'none'} className="split-row">
              <div className="row-head">
                <strong>👨‍👩‍👧 {familyLabel(f.family)}</strong>
                <strong>{money(f.owed)}</strong>
              </div>
              <div className="bar"><i style={{ width: `${(f.personNights / maxPn) * 100}%` }} /></div>
              <p className="small muted">{f.nights} nights · {f.personNights} person-nights · {(f.share * 100).toFixed(1)}%</p>
              {f.members.map((r) => (
                <p key={r.user.id} className="small member-line">
                  <span>{r.user.name}</span>
                  <span className="muted">
                    {r.stays} stay{r.stays === 1 ? '' : 's'} · {r.personNights} p-n
                    {r.hosted > 0 && ` · 🎉 ${r.hosted}`}
                    {r.lateCancelPersonNights > 0 && ` · ${r.lateCancelPersonNights} late cancel`}
                    {' · '}{money(r.owed)}
                  </span>
                </p>
              ))}
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
