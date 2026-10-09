import { useState, type FormEvent } from 'react'
import { Header, Icon } from '../components/ui'
import { api } from '../lib/api'
import { LOCALE, today } from '../lib/dates'
import { COST_LABELS, downloadYearExcel } from '../lib/excel'
import { buildYearReport, familyLabel } from '../lib/rules'
import { useData } from '../lib/store'
import type { CostCategory } from '../lib/types'

export function Report() {
  const { data, mutate } = useData()
  const thisYear = Number(today().slice(0, 4))
  const years = [...new Set([thisYear, ...data.costs.map((c) => c.year), ...data.reservations.map((r) => Number(r.start.slice(0, 4)))])]
    .filter((y) => y <= thisYear)
    .sort((a, b) => b - a)
  const [year, setYear] = useState(thisYear)
  const [exporting, setExporting] = useState(false)
  const report = buildYearReport(year, data.profiles, data.families, data.clans, data.reservations, data.costs)
  const cur = data.settings.currency
  const money = (n: number) => n.toLocaleString(LOCALE, { style: 'currency', currency: cur, maximumFractionDigits: 0 })
  const money2 = (n: number) => n.toLocaleString(LOCALE, { style: 'currency', currency: cur })
  const maxPn = Math.max(1, ...report.payers.map((p) => p.personNights))

  async function download() {
    setExporting(true)
    try {
      await downloadYearExcel(report, data.costs, cur, data.settings.lodgeName)
    } catch (e) {
      alert('Excel-Datei konnte nicht erstellt werden: ' + (e as Error).message)
    } finally {
      setExporting(false)
    }
  }

  return (
    <>
      <Header title="Kosten & Nutzung" back />
      <div className="page">
        <div className="chips">
          {years.map((y) => (
            <button key={y} className={'chip' + (y === year ? ' on' : '')} onClick={() => setYear(y)}>{y}</button>
          ))}
        </div>

        <section className="card">
          <h2>So wird abgerechnet</h2>
          <p className="small muted">
            Jede Person pro Nacht = 1 Personennacht (inklusive Gäste). Ein Clan bezahlt für alle seine Familien zusammen;
            eine Familie ohne Clan bezahlt selbst. Jeder bezahlt den Anteil an den Jahreskosten, der seinen Personennächten
            entspricht. Spät stornierte Aufenthalte zählen mit. Gezählt werden nur Nächte bis heute.
          </p>
        </section>

        <section className="card">
          <div className="row-head">
            <h2>Wer bezahlt was – {year}</h2>
            <button className="btn small ghost" onClick={download} disabled={exporting}>
              <Icon name="download" size={16} /> {exporting ? '…' : 'Excel'}
            </button>
          </div>
          {report.payers.map((p) => (
            <div key={p.key} className="split-row">
              <div className="row-head">
                <strong>{p.clan ? '🏰' : '👨‍👩‍👧'} {p.name}</strong>
                <strong>{money(p.owed)}</strong>
              </div>
              <div className="bar"><i style={{ width: `${(p.personNights / maxPn) * 100}%` }} /></div>
              <p className="small muted">{p.nights} Nächte · {p.personNights} Personennächte · {(p.share * 100).toFixed(1)} %</p>
              {p.families.map((f) => (
                <div key={f.family?.id ?? 'none'} className="family-block">
                  {p.clan && (
                    <p className="small member-line">
                      <strong>Familie {familyLabel(f.family)}</strong>
                      <span className="muted">{f.personNights} PN · {money(f.owed)}</span>
                    </p>
                  )}
                  {f.members.map((r) => (
                    <p key={r.user.id} className={'small member-line' + (p.clan ? ' indent' : '')}>
                      <span>{r.user.name}</span>
                      <span className="muted">
                        {r.stays} {r.stays === 1 ? 'Aufenthalt' : 'Aufenthalte'} · {r.personNights} PN
                        {r.hosted > 0 && ` · 🎉 ${r.hosted}`}
                        {r.lateCancelPersonNights > 0 && ` · ${r.lateCancelPersonNights} spät storniert`}
                        {' · '}{money(r.owed)}
                      </span>
                    </p>
                  ))}
                </div>
              ))}
            </div>
          ))}
          <div className="row-head total">
            <span>Total ({report.totalPersonNights} Personennächte)</span>
            <strong>{money(report.totalCosts)}</strong>
          </div>
          {report.totalPersonNights > 0 && (
            <div className="row-head">
              <span className="muted">Kosten pro Person und Nacht</span>
              <strong>{money2(report.totalCosts / report.totalPersonNights)}</strong>
            </div>
          )}
          <p className="small muted">PN = Personennächte</p>
        </section>

        <section className="card">
          <h2>Kosten {year}</h2>
          {data.costs.filter((c) => c.year === year).map((c) => (
            <div key={c.id} className="row-head cost-row">
              <span>{COST_LABELS[c.category]}{c.note ? <span className="muted small"> – {c.note}</span> : null}</span>
              <span className="row-end">
                {money(c.amount)}
                <button className="icon-btn" aria-label="Kosten löschen"
                  onClick={() => confirm('Diesen Kosteneintrag löschen?') && mutate(() => api.deleteCost(c.id))}>
                  <Icon name="trash" size={16} />
                </button>
              </span>
            </div>
          ))}
          {report.totalCosts === 0 && <p className="muted small">Für {year} sind noch keine Kosten erfasst.</p>}
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
        <label>Art
          <select value={category} onChange={(e) => setCategory(e.target.value as CostCategory)}>
            {Object.entries(COST_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label>Betrag<input type="number" inputMode="decimal" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required /></label>
      </div>
      <label>Notiz<input value={note} onChange={(e) => setNote(e.target.value)} placeholder="freiwillig" /></label>
      <button className="btn">Kosten hinzufügen</button>
    </form>
  )
}
