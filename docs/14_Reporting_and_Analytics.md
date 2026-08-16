# Operational Reporting & Vendor Analytics

Implementation: `src/lib/executiveMetrics.ts` (pure metrics) + `src/pages/ExecutiveDashboardPage.tsx` (Reports/Risk tabs) + PDF export (`src/lib/pdfGenerator.ts`, jspdf loaded on demand).

## Live KPIs
- Operational Integrity Index (health score: FCR, RFT, SLA adherence, CSAT blend)
- SLA adherence rate; breach counts; at-risk exposure
- MTTR (from RCA `resolvedAt` deltas)
- FCR / RFT rates on closed tickets; CSAT average
- 14-day volume trend; active vs closed caseload

## Vendor (partner) scorecards
Per partner: total/active cases, SLA adherence %, MTTR, average satisfaction — rendered as tables in-app and in the PDF report.

## Financial exposure
Exposure totals by partner / business unit / category (bar breakdowns), at-risk exposure (escalated or deadline < 24h), and a top-12 risk register (risk-score ranked, amount-weighted).

## Compliance & audit health
Audit entries, hash-chained (verified) count, unique actors, action breakdown.

## Exports
`downloadExecutivePdfReport` produces a 3-page A4 PDF (performance, exposure/risk, compliance) — jspdf/html2canvas are dynamically imported so the ~600KB cost is paid only on export.

## Data flow
Metrics are computed client-side from the (scoped) ticket/audit domain in context — partners' dashboards reflect only their scoped slice automatically.
