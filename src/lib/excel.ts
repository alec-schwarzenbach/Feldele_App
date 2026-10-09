import type { Borders, Fill, Font, Worksheet } from 'exceljs'
import type { YearReport } from './rules'
import type { CostCategory, CostEntry } from './types'

export const COST_LABELS: Record<CostCategory, string> = {
  rent: 'Miete', electricity: 'Strom', water: 'Wasser', supplies: 'Material', other: 'Anderes',
}

const GREEN = 'FF1F3D2F'
const LIGHT = 'FFE3ECE6'
const SAND = 'FFF5F2EA'
const fill = (argb: string): Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } })
const thin: Partial<Borders> = { bottom: { style: 'thin', color: { argb: 'FFD9D4C7' } } }
const headerFont: Partial<Font> = { bold: true, color: { argb: 'FFFFFFFF' } }

/**
 * Builds the yearly bill as a formatted Excel file and downloads it:
 *  - "Übersicht": what each clan (or family without a clan) pays
 *  - "Details": clan → family → person, with nights and amounts
 *  - "Kosten": the cost entries of the year
 */
export async function downloadYearExcel(report: YearReport, costs: CostEntry[], currency: string, houseName: string) {
  const { default: ExcelJS } = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  wb.creator = houseName
  const money = `#,##0.00 "${currency}"`

  const title = (ws: Worksheet, text: string, cols: number) => {
    ws.mergeCells(1, 1, 1, cols)
    const c = ws.getCell(1, 1)
    c.value = text
    c.font = { bold: true, size: 16, color: { argb: GREEN } }
    ws.getRow(1).height = 26
  }
  const header = (ws: Worksheet, row: number, labels: string[]) => {
    const r = ws.getRow(row)
    labels.forEach((l, i) => {
      const c = r.getCell(i + 1)
      c.value = l
      c.font = headerFont
      c.fill = fill(GREEN)
      c.alignment = { vertical: 'middle', wrapText: true }
    })
    r.height = 30
  }

  // ── Übersicht ──
  const ov = wb.addWorksheet('Übersicht', { views: [{ state: 'frozen', ySplit: 6 }] })
  ov.columns = [{ width: 26 }, { width: 38 }, { width: 10 }, { width: 16 }, { width: 10 }, { width: 16 }]
  title(ov, `${houseName} – Kostenabrechnung ${report.year}`, 6)
  ov.getCell('A3').value = 'Gesamtkosten'
  ov.getCell('B3').value = report.totalCosts
  ov.getCell('B3').numFmt = money
  ov.getCell('A4').value = 'Kosten pro Person und Nacht'
  ov.getCell('B4').value = report.totalPersonNights ? report.totalCosts / report.totalPersonNights : 0
  ov.getCell('B4').numFmt = money
  for (const a of ['A3', 'A4']) ov.getCell(a).font = { bold: true }
  for (const a of ['B3', 'B4']) ov.getCell(a).alignment = { horizontal: 'left' }
  header(ov, 6, ['Zahler (Clan / Familie)', 'Familien', 'Nächte', 'Personennächte', 'Anteil', 'Betrag'])
  let r = 7
  for (const p of report.payers) {
    const row = ov.getRow(r++)
    row.values = [p.name, p.families.map((f) => f.family?.name ?? 'Ohne Familie').join(', '), p.nights, p.personNights, p.share, p.owed]
    row.getCell(5).numFmt = '0.0%'
    row.getCell(6).numFmt = money
    row.getCell(1).font = { bold: true }
    row.eachCell((c) => (c.border = thin))
  }
  const total = ov.getRow(r)
  total.values = ['Total', '', report.payers.reduce((s, p) => s + p.nights, 0), report.totalPersonNights, 1, report.totalCosts]
  total.getCell(5).numFmt = '0.0%'
  total.getCell(6).numFmt = money
  total.eachCell((c) => {
    c.font = { bold: true }
    c.fill = fill(LIGHT)
  })

  // ── Details ──
  const dt = wb.addWorksheet('Details', { views: [{ state: 'frozen', ySplit: 3 }] })
  dt.columns = [{ width: 22 }, { width: 20 }, { width: 20 }, { width: 12 }, { width: 9 }, { width: 15 }, { width: 14 }, { width: 8 }, { width: 9 }, { width: 15 }]
  title(dt, `Details ${report.year}`, 10)
  header(dt, 3, ['Clan / Zahler', 'Familie', 'Person', 'Aufenthalte', 'Nächte', 'Personennächte', 'davon späte Stornos', 'Feste', 'Anteil', 'Betrag'])
  r = 4
  for (const p of report.payers) {
    const pr = dt.getRow(r++)
    pr.values = [p.name, '', '', '', p.nights, p.personNights, '', '', p.share, p.owed]
    pr.eachCell((c) => {
      c.font = { bold: true, color: { argb: 'FFFFFFFF' } }
      c.fill = fill('FF2F5D47')
    })
    for (const f of p.families) {
      const fr = dt.getRow(r++)
      fr.values = ['', f.family?.name ?? 'Ohne Familie', '', '', f.nights, f.personNights, '', '', f.share, f.owed]
      fr.eachCell((c) => {
        c.font = { bold: true }
        c.fill = fill(LIGHT)
      })
      for (const m of f.members) {
        const mr = dt.getRow(r++)
        mr.values = ['', '', m.user.name, m.stays, m.nights, m.personNights, m.lateCancelPersonNights || '', m.hosted || '', m.share, m.owed]
        mr.eachCell((c) => (c.border = thin))
      }
    }
  }
  for (let i = 4; i < r; i++) {
    dt.getRow(i).getCell(9).numFmt = '0.0%'
    dt.getRow(i).getCell(10).numFmt = money
  }

  // ── Kosten ──
  const ct = wb.addWorksheet('Kosten')
  ct.columns = [{ width: 18 }, { width: 40 }, { width: 16 }]
  title(ct, `Kosten ${report.year}`, 3)
  header(ct, 3, ['Kategorie', 'Notiz', 'Betrag'])
  r = 4
  for (const c of costs.filter((x) => x.year === report.year)) {
    const row = ct.getRow(r++)
    row.values = [COST_LABELS[c.category], c.note ?? '', c.amount]
    row.getCell(3).numFmt = money
    row.eachCell((cell) => (cell.border = thin))
  }
  const ctTotal = ct.getRow(r)
  ctTotal.values = ['Total', '', report.totalCosts]
  ctTotal.getCell(3).numFmt = money
  ctTotal.eachCell((c) => {
    c.font = { bold: true }
    c.fill = fill(LIGHT)
  })

  for (const ws of [ov, dt, ct]) ws.properties.tabColor = { argb: GREEN }
  ov.getCell('A1').fill = fill(SAND)

  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${houseName}-Abrechnung-${report.year}.xlsx`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}
