# Design System — منظومة الرقابة الداخلية

Original municipal Internal Audit / Internal Control platform.
References (ControlVista, SmartSuite, Onspring, DGA, GOV.SA) informed **principles only**.
Branding, layout, and visual language are original.

## 1. Color tokens

| Token | Hex | Role |
|---|---|---|
| primary | #176B63 | buttons, active nav, links, progress |
| primary-dark | #0F4F49 | hover / stronger accent |
| primary-light | #E7F3F0 | selected rows, soft panels |
| secondary | #718355 | supporting charts / municipal accent |
| navy | #183B4E | sidebar, authority headings |
| navy-hover | #214F4A | active nav background |
| bg | #F6F8F7 | page |
| surface | #FFFFFF | cards |
| subtle | #F1F4F2 | nested surfaces |
| line | #DDE4E1 | borders |
| ink | #17211F | text |
| ink-soft | #64716D | secondary text |
| muted | #8A9691 | captions |
| success | #21845A | closed / complete |
| warning | #C98A1A | pending verification / due soon |
| danger | #C94B4B | overdue / returned |
| info | #3578A8 | in review / in progress |
| ai | #7357A6 | advisory intelligence only |

Balance target: ~75% neutrals, ~15% navy/text, ~8% teal, small semantic + AI accents.

**Risk** and **workflow status** use separate palettes. Status and risk always combine color + text (+ icon/dot).

Warning/danger **text** uses darker companions (`warning-dark` #8A5E10, `danger-dark` #9A3535) so normal-size text meets WCAG AA.

## 2. Typography

- Headings: **Noto Kufi Arabic** 600 / 700
- Body, tables, forms, cards: **IBM Plex Sans Arabic** 400 / 500 / 600
- IDs and dates: **IBM Plex Mono**
- `letter-spacing: 0` globally (Arabic ligatures)
- Body line-height 1.75; headings 1.35
- Logical CSS (`ps`/`pe`/`start`/`end`) — RTL-native, not a flipped English UI

## 3. Components

**Shell:** `DashboardShell` (grouped right-side nav, topbar with global search and grouped notifications), `PageHeader`.

**Primitives** (`components/ui/Base.tsx`): Card, Button, Field/TextInput/TextArea/Select, Callout, DataField, ProseBlock, ProgressBar, Tabs, ChoiceCards, ErrorBanner, ToggleSwitch. Badges: `StampBadge`/`StatusBadge`, `RiskBadge`, `OverdueBadge`. States: `EmptyState`, `TableSkeleton`, `DashboardSkeleton`, `CardSkeleton`.

**Dashboards:** `CommandHeader`, `KpiRow`, `Portfolio`, `ActionCenter`, `QueueStrip`.

**Register:** `RecommendationRegister` (filters, chips, CSV export, detailed/compact views), `RecommendationTable`, `Ledger`.

**Case workspace:** `CaseHeader`, `WorkflowRail`, `FindingSection`, `ResponsePanel`, `ReviewPanels`, `ActionPlanBuilder`, `ActionPlanTimeline`, `EvidenceRegister`, `VerificationPanel`, `AuditTrail`.

**Reports:** `ReportPipeline` (report lifecycle rail), `FollowUpList`.

**AI:** every advisory surface renders inside `AIPanel` — purple frame plus a permanent "تحليل استشاري — القرار النهائي بشري" footer. Nothing AI-generated appears outside it.

Cards: 12px radius, border-first, shadow `0 1px 3px rgba(15,79,73,0.06)`.
Buttons: 8px radius. Primary teal, secondary outline, danger dark red.

## 4. Workflow visualization

`WorkflowRail` renders nine stages that are a **view** of backend statuses, not a second state machine:

التوصية → رد الإدارة → مراجعة الرقابة → التصديق → خطة التنفيذ → التنفيذ → الأدلة → التحقق → الإغلاق

Each case header shows current stage, responsible actor, and required action from `lib/workflow.ts`, where `can()` / `availableActions()` mirror the backend's allowed transitions per role and status.

Reports have their own five-stage rail (`ReportPipeline`) driven by `AuditReport.status`, because ratification and submission to departments happen at report level, not per recommendation.

## 5. Role experiences (one design system)

- **Audit:** Action Center, reviews, risk, overdue, verification, recurrence, analytics, AI
- **Department:** responses, action plans, team progress, deadlines, evidence
- **Employee:** my tasks, steps, evidence — denser actions, fewer analytics
- **Council:** pending ratification, closure decisions, high-risk KPIs, history

Navigation and dashboard priorities change; visual language does not.

## 6. AI

Purple `#7357A6`, always inside `AIPanel`. Advisory only: AI never approves, ratifies, verifies, closes, changes status, or assigns official responsibility.

## 7. Accessibility

WCAG AA contrast on text-bearing pairs; focus rings; status text not color-only; labels above fields; skeleton loading; Arabic error copy with retry; keyboard-operable nav and filters.

## 8. Responsive

Desktop: navy sidebar (collapsible) + light topbar.
Tablet/mobile: overlay drawer, stacked Action Center, tables scroll with min-width + sticky header, recommendation workspace stacks stepper then tabs.
