/**
 * Hoja de estilos del panel de administración.
 *
 * Vivía dentro de `AdminApp.tsx` (más de 2 200 líneas de CSS en una plantilla),
 * que la inyecta con `<style>{styles}</style>`. Se saca tal cual, sin tocar ni
 * una regla, para que el componente no quede enterrado bajo el CSS.
 */
export const estilosAdminParte1 = `
* {
  box-sizing: border-box;
}

.admin-root {
  min-height: 100vh;
  padding: 14px;
  color: #e5eefc;
  background:
    radial-gradient(circle at 0% 0%, rgba(56,189,248,0.18), transparent 28%),
    radial-gradient(circle at 100% 0%, rgba(34,197,94,0.12), transparent 30%),
    #020617;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

.admin-login-layout,
.admin-console-layout {
  min-height: calc(100vh - 28px);
  display: grid;
  grid-template-columns: 360px minmax(0, 1fr);
  gap: 14px;
}

.admin-login-card,
.admin-sidebar {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px;
  border-radius: 28px;
  border: 1px solid rgba(148,163,184,0.24);
  background: rgba(15,23,42,0.76);
  box-shadow: 0 24px 80px rgba(0,0,0,0.34);
  backdrop-filter: blur(20px);
}

.admin-sidebar {
  overflow: auto;
}

.admin-brand {
  width: fit-content;
  padding: 7px 10px;
  border-radius: 999px;
  background: rgba(56,189,248,0.10);
  border: 1px solid rgba(56,189,248,0.22);
  color: #7dd3fc;
  font-size: 10px;
  font-weight: 950;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.admin-login-card h1,
.admin-sidebar h1 {
  margin: 0;
  font-size: 42px;
  line-height: 0.95;
  letter-spacing: -0.07em;
}

.admin-sidebar h1 {
  font-size: 28px;
}

.admin-login-card p,
.admin-sidebar p {
  margin: 8px 0 0;
  color: #94a3b8;
  line-height: 1.45;
}

.admin-login-form {
  display: grid;
  gap: 9px;
}

.admin-login-form label,
.admin-detail-block > span,
.admin-kicker {
  color: #7dd3fc;
  font-size: 10px;
  font-weight: 950;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.admin-login-form input {
  height: 44px;
  border: 1px solid rgba(148,163,184,0.25);
  border-radius: 16px;
  background: rgba(2,6,23,0.62);
  color: #e5eefc;
  padding: 0 13px;
  outline: none;
}

.admin-login-form button,
.admin-sidebar-actions button,
.admin-drawer-head button {
  min-height: 42px;
  border: 0;
  border-radius: 999px;
  background: linear-gradient(135deg, #38bdf8, #818cf8);
  color: #020617;
  font-weight: 950;
  cursor: pointer;
}

.admin-link-row,
.admin-sidebar-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.admin-link-row {
  margin-top: auto;
}

.admin-link-row a,
.admin-sidebar-actions a {
  min-height: 38px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid rgba(148,163,184,0.24);
  color: #dbeafe;
  background: rgba(15,23,42,0.54);
  text-decoration: none;
  font-weight: 850;
  font-size: 12px;
}

.admin-locked-workspace,
.admin-workspace {
  min-width: 0;
  display: grid;
  gap: 14px;
}

.admin-locked-workspace {
  grid-template-rows: auto minmax(360px, 1fr) auto auto;
  padding: 18px;
  border-radius: 30px;
  border: 1px solid rgba(148,163,184,0.22);
  background: rgba(15,23,42,0.48);
  box-shadow: 0 24px 80px rgba(0,0,0,0.26);
  backdrop-filter: blur(18px);
}

.admin-workspace {
  grid-template-rows: auto minmax(0, 1fr) auto;
}

.admin-workspace-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px;
  border-radius: 24px;
  border: 1px solid rgba(148,163,184,0.18);
  background: rgba(15,23,42,0.62);
  backdrop-filter: blur(18px);
}

.admin-workspace-bar h2 {
  margin: 0;
  font-size: 26px;
  letter-spacing: -0.05em;
}

.admin-locked-map {
  position: relative;
  min-height: 420px;
  border-radius: 30px;
  overflow: hidden;
  border: 1px solid rgba(148,163,184,0.18);
  background:
    linear-gradient(135deg, rgba(15,23,42,0.92), rgba(2,6,23,0.92)),
    radial-gradient(circle at 50% 50%, rgba(56,189,248,0.30), transparent 28%);
}

.admin-grid-bg {
  position: absolute;
  inset: 0;
  opacity: 0.24;
  background-image:
    linear-gradient(rgba(125,211,252,.18) 1px, transparent 1px),
    linear-gradient(90deg, rgba(125,211,252,.18) 1px, transparent 1px);
  background-size: 44px 44px;
}

.admin-locked-message {
  position: absolute;
  left: 50%;
  top: 50%;
  width: min(420px, calc(100% - 40px));
  transform: translate(-50%, -50%);
  display: grid;
  gap: 8px;
  padding: 20px;
  border-radius: 24px;
  border: 1px solid rgba(255,255,255,0.16);
  background: rgba(2,6,23,0.76);
  backdrop-filter: blur(20px);
  text-align: center;
  color: #cbd5e1;
}

.admin-stat-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 10px;
}

.admin-sidebar-stats {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.admin-stat {
  padding: 13px;
  border-radius: 18px;
  border: 1px solid rgba(148,163,184,0.16);
  background: rgba(2,6,23,0.42);
}

.admin-stat.compact {
  padding: 11px;
}

.admin-stat span {
  color: #8aa0bd;
  font-size: 9px;
  font-weight: 900;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.admin-stat strong {
  display: block;
  margin-top: 5px;
  font-size: 20px;
  font-weight: 950;
  letter-spacing: -0.05em;
  word-break: break-word;
}

.admin-stat small {
  display: block;
  margin-top: 3px;
  color: #94a3b8;
  font-size: 11px;
}

.admin-family-compact-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.admin-family-compact,
.admin-family-row,
.admin-profile-card,
.admin-node-card,
.admin-muted,
.admin-detail-item,
.admin-detail-block {
  border: 1px solid rgba(148,163,184,0.16);
  background: rgba(2,6,23,0.35);
  border-radius: 18px;
}

.admin-family-compact {
  display: flex;
  gap: 10px;
  padding: 13px;
  color: #cbd5e1;
}

.admin-family-compact > span,
.admin-family-row > span {
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  border-radius: 13px;
  background: rgba(56,189,248,0.12);
  flex: 0 0 auto;
}

.admin-family-compact small,
.admin-family-row small,
.admin-profile-card small,
.admin-node-card small {
  display: block;
  margin-top: 3px;
  color: #94a3b8;
}

.admin-map-area {
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 340px;
  gap: 14px;
}

.admin-node-rail {
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 14px;
  border-radius: 28px;
  border: 1px solid rgba(148,163,184,0.18);
  background: rgba(15,23,42,0.60);
  backdrop-filter: blur(18px);
}

.admin-node-rail-head,
.admin-section-head,
.admin-profile-card > div:first-child {
  display: flex;
  justify-content: space-between;
  gap: 10px;
}

.admin-node-rail-head h3,
.admin-section-head h2 {
  margin: 0;
  font-size: 18px;
  letter-spacing: -0.04em;
}

.admin-node-list,
.admin-profile-list,
.admin-family-count-list {
  display: grid;
  gap: 9px;
}

.admin-node-list {
  overflow: auto;
  padding-right: 2px;
}

.admin-node-card {
  width: 100%;
  color: inherit;
  text-align: left;
  padding: 12px;
  cursor: pointer;
  font: inherit;
}

.admin-node-card.selected {
  border-color: rgba(56,189,248,0.52);
  background: rgba(8,47,73,0.44);
  box-shadow: 0 0 0 1px rgba(56,189,248,0.16) inset;
}

.admin-node-top {
  display: flex;
  align-items: center;
  gap: 10px;
}

.admin-node-top > span {
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  border-radius: 12px;
  background: rgba(129,140,248,0.18);
  font-weight: 950;
}

.admin-node-meta {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
  margin-top: 10px;
  color: #94a3b8;
  font-size: 11px;
}

.admin-profile-card,
.admin-muted {
  padding: 12px;
}

.admin-badge-row,
.admin-topbar-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}

.admin-family-row {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr) auto;
  align-items: center;
  gap: 9px;
  padding: 10px;
}

.pill {
  display: inline-flex;
  align-items: center;
  width: fit-content;
  padding: 5px 8px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 900;
}

.pill.ok {
  border: 1px solid rgba(34,197,94,0.26);
  background: rgba(34,197,94,0.14);
  color: #bbf7d0;
}

.pill.warn {
  border: 1px solid rgba(251,191,36,0.26);
  background: rgba(251,191,36,0.12);
  color: #fde68a;
}

.pill.neutral {
  border: 1px solid rgba(148,163,184,0.20);
  background: rgba(148,163,184,0.10);
  color: #cbd5e1;
}

.admin-error {
  display: grid;
  gap: 4px;
  padding: 12px;
  border-radius: 16px;
  border: 1px solid rgba(248,113,113,0.28);
  background: rgba(127,29,29,0.22);
  color: #fecaca;
  font-size: 12px;
}

.admin-operator-strip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 13px;
  border-radius: 20px;
  border: 1px solid rgba(148,163,184,0.18);
  background: rgba(15,23,42,0.58);
  color: #cbd5e1;
}

.admin-operator-strip span {
  display: block;
  margin-top: 3px;
  color: #94a3b8;
  font-size: 12px;
}

.admin-drawer-overlay {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  justify-content: flex-end;
  background: rgba(2,6,23,0.58);
  backdrop-filter: blur(8px);
}

.admin-drawer {
  width: min(560px, 100%);
  height: 100%;
  overflow: auto;
  border-left: 1px solid rgba(148,163,184,0.22);
  background: rgba(15,23,42,0.94);
  box-shadow: -24px 0 80px rgba(0,0,0,0.40);
}

.admin-drawer-head {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 20px;
  border-bottom: 1px solid rgba(148,163,184,0.18);
  background: rgba(15,23,42,0.92);
  backdrop-filter: blur(18px);
}

.admin-drawer-head h2 {
  margin: 6px 0 0;
  font-size: 26px;
  line-height: 1.05;
  letter-spacing: -0.05em;
}

.admin-drawer-body {
  display: grid;
  gap: 14px;
  padding: 20px;
}

.admin-detail-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.admin-detail-item {
  display: grid;
  gap: 4px;
  padding: 12px;
}

.admin-detail-item span {
  color: #8aa0bd;
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.admin-detail-block {
  display: grid;
  gap: 8px;
  padding: 14px;
}

.admin-detail-block p {
  margin: 0;
  color: #dbeafe;
  line-height: 1.55;
}

.admin-chip-wrap {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
}

.admin-chip-wrap code {
  padding: 5px 8px;
  border-radius: 999px;
  color: #bae6fd;
  background: rgba(14,165,233,0.12);
  border: 1px solid rgba(14,165,233,0.20);
  font-size: 11px;
}

@media (max-width: 1100px) {
  .admin-login-layout,
  .admin-console-layout {
    grid-template-columns: 1fr;
  }

  .admin-map-area {
    grid-template-columns: 1fr;
  }

  .admin-stat-grid,
  .admin-family-compact-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 700px) {
  .admin-root {
    padding: 8px;
  }

  .admin-stat-grid,
  .admin-family-compact-grid,
  .admin-sidebar-stats,
  .admin-detail-grid {
    grid-template-columns: 1fr;
  }

  .admin-login-card h1 {
    font-size: 34px;
  }
}

/* Minimal protected login pass */
.admin-root-login-only {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 18px;
  background:
    radial-gradient(circle at 22% 18%, rgba(125,211,252,0.22), transparent 30%),
    radial-gradient(circle at 78% 12%, rgba(129,140,248,0.18), transparent 30%),
    radial-gradient(circle at 50% 95%, rgba(34,197,94,0.12), transparent 34%),
    linear-gradient(180deg, #eef6ff 0%, #dbeafe 38%, #b9c9dc 100%);
}

.admin-login-minimal {
  position: relative;
  width: min(430px, 100%);
  /* Centrada: en escritorio quedaba pegada arriba a la izquierda. */
  margin: max(8vh, 24px) auto 0;
}

.admin-login-card-minimal {
  position: relative;
  z-index: 2;
  min-height: auto;
  padding: 24px;
  border-radius: 34px;
  border: 1px solid rgba(255,255,255,0.62);
  background:
    linear-gradient(180deg, rgba(255,255,255,0.72), rgba(255,255,255,0.42)),
    rgba(255,255,255,0.36);
  box-shadow:
    0 30px 90px rgba(15,23,42,0.22),
    inset 0 1px 0 rgba(255,255,255,0.74);
  backdrop-filter: blur(28px) saturate(160%);
  -webkit-backdrop-filter: blur(28px) saturate(160%);
  color: #0f172a;
}

.admin-login-card-minimal .admin-brand {
  background: rgba(14,165,233,0.12);
  border-color: rgba(14,165,233,0.18);
  color: #0369a1;
}

.admin-login-copy {
  display: grid;
  gap: 8px;
  margin: 20px 0 18px;
}

.admin-login-card-minimal h1 {
  margin: 0;
  color: #0f172a;
  font-size: 42px;
  line-height: 0.92;
  letter-spacing: -0.08em;
}

.admin-login-card-minimal p {
  margin: 0;
  color: #475569;
  font-size: 14px;
}

.admin-login-card-minimal .admin-login-form label {
  color: #0369a1;
}

.admin-login-card-minimal .admin-login-form input {
  height: 48px;
  border-color: rgba(15,23,42,0.12);
  background: rgba(255,255,255,0.62);
  color: #0f172a;
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.70);
}

.admin-login-card-minimal .admin-login-form input::placeholder {
  color: #64748b;
}

.admin-login-card-minimal .admin-login-form input:focus {
  border-color: rgba(14,165,233,0.52);
  box-shadow:
    0 0 0 4px rgba(14,165,233,0.12),
    inset 0 1px 0 rgba(255,255,255,0.70);
}

.admin-login-card-minimal .admin-login-form button {
  height: 48px;
  box-shadow: 0 14px 30px rgba(59,130,246,0.28);
}

.admin-login-card-minimal .admin-error {
  border-color: rgba(239,68,68,0.25);
  background: rgba(254,226,226,0.72);
  color: #7f1d1d;
}

.admin-login-foot {
  display: grid;
  gap: 12px;
  margin-top: 20px;
  color: #64748b;
  font-size: 12px;
}

.admin-login-foot > div {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.admin-login-foot a {
  min-height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 11px;
  border-radius: 999px;
  border: 1px solid rgba(15,23,42,0.10);
  background: rgba(255,255,255,0.38);
  color: #334155;
  text-decoration: none;
  font-weight: 850;
}

.admin-login-orb {
  position: absolute;
  z-index: 1;
  border-radius: 999px;
  filter: blur(2px);
  opacity: 0.72;
  pointer-events: none;
}

.admin-login-orb-a {
  width: 180px;
  height: 180px;
  left: -64px;
  top: -62px;
  background: radial-gradient(circle, rgba(56,189,248,0.60), transparent 68%);
}

.admin-login-orb-b {
  width: 220px;
  height: 220px;
  right: -86px;
  bottom: -82px;
  background: radial-gradient(circle, rgba(129,140,248,0.45), transparent 70%);
}

@media (max-width: 700px) {
  .admin-root-login-only {
    padding: 12px;
  }

  .admin-login-card-minimal {
    border-radius: 28px;
    padding: 20px;
  }

  .admin-login-card-minimal h1 {
    font-size: 36px;
  }
}


/* Unlocked workspace glass pass */
.admin-root:not(.admin-root-login-only) {
  height: 100vh;
  overflow: hidden;
  padding: 10px;
  color: #102033;
  background:
    radial-gradient(circle at 12% 8%, rgba(56,189,248,0.22), transparent 30%),
    radial-gradient(circle at 88% 6%, rgba(129,140,248,0.18), transparent 32%),
    radial-gradient(circle at 55% 96%, rgba(34,197,94,0.10), transparent 34%),
    linear-gradient(180deg, #eef6ff 0%, #dbeafe 42%, #c4d5e8 100%);
}

.admin-root:not(.admin-root-login-only) .admin-console-layout {
  height: calc(100vh - 20px);
  min-height: 0;
  grid-template-columns: 320px minmax(0, 1fr);
  gap: 10px;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar,
.admin-root:not(.admin-root-login-only) .admin-workspace-bar,
.admin-root:not(.admin-root-login-only) .admin-node-rail,
.admin-root:not(.admin-root-login-only) .admin-operator-strip,
.admin-root:not(.admin-root-login-only) .admin-stat,
.admin-root:not(.admin-root-login-only) .admin-profile-card,
.admin-root:not(.admin-root-login-only) .admin-family-row,
.admin-root:not(.admin-root-login-only) .admin-node-card,
.admin-root:not(.admin-root-login-only) .admin-muted {
  border-color: rgba(255,255,255,0.56);
  background:
    linear-gradient(180deg, rgba(255,255,255,0.62), rgba(255,255,255,0.34)),
    rgba(255,255,255,0.30);
  box-shadow:
    0 18px 42px rgba(15,23,42,0.10),
    inset 0 1px 0 rgba(255,255,255,0.58);
  backdrop-filter: blur(22px) saturate(150%);
  -webkit-backdrop-filter: blur(22px) saturate(150%);
}

.admin-root:not(.admin-root-login-only) .admin-sidebar {
  padding: 14px;
  border-radius: 30px;
  gap: 12px;
  color: #102033;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar h1 {
  font-size: 23px;
  color: #0f172a;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar p,
.admin-root:not(.admin-root-login-only) .admin-stat small,
.admin-root:not(.admin-root-login-only) .admin-profile-card small,
.admin-root:not(.admin-root-login-only) .admin-node-card small,
.admin-root:not(.admin-root-login-only) .admin-family-row small,
.admin-root:not(.admin-root-login-only) .admin-operator-strip span {
  color: #516276;
}

.admin-root:not(.admin-root-login-only) .admin-brand {
  background: rgba(14,165,233,0.12);
  border-color: rgba(14,165,233,0.20);
  color: #0369a1;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar-actions button,
.admin-root:not(.admin-root-login-only) .admin-sidebar-actions a,
.admin-root:not(.admin-root-login-only) .admin-drawer-head button {
  min-height: 38px;
  border-radius: 999px;
  border: 1px solid rgba(15,23,42,0.08);
}

.admin-root:not(.admin-root-login-only) .admin-sidebar-actions button {
  background: linear-gradient(135deg, #38bdf8, #818cf8);
  color: #07111f;
  box-shadow: 0 12px 28px rgba(59,130,246,0.22);
}

.admin-root:not(.admin-root-login-only) .admin-sidebar-actions a {
  color: #334155;
  background: rgba(255,255,255,0.45);
}

.admin-root:not(.admin-root-login-only) .admin-sidebar-stats {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.admin-root:not(.admin-root-login-only) .admin-stat {
  padding: 10px;
  border-radius: 18px;
}

.admin-root:not(.admin-root-login-only) .admin-stat strong {
  color: #0f172a;
  font-size: 18px;
}

.admin-root:not(.admin-root-login-only) .admin-stat span,
.admin-root:not(.admin-root-login-only) .admin-kicker,
.admin-root:not(.admin-root-login-only) .admin-detail-block > span {
  color: #0369a1;
}

.admin-root:not(.admin-root-login-only) .admin-workspace {
  min-height: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  gap: 10px;
}

.admin-root:not(.admin-root-login-only) .admin-workspace-bar {
  min-height: 74px;
  padding: 14px 16px;
  border-radius: 28px;
  color: #0f172a;
}

.admin-root:not(.admin-root-login-only) .admin-workspace-bar h2 {
  font-size: 24px;
  color: #0f172a;
}

.admin-root:not(.admin-root-login-only) .admin-map-area {
  min-height: 0;
  height: 100%;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 300px;
  gap: 10px;
}

.admin-root:not(.admin-root-login-only) .admin-map-area > section {
  min-height: 0 !important;
  height: 100% !important;
  border-radius: 32px !important;
  border-color: rgba(255,255,255,0.58) !important;
  box-shadow:
    0 26px 80px rgba(15,23,42,0.18),
    inset 0 1px 0 rgba(255,255,255,0.55) !important;
}

.admin-root:not(.admin-root-login-only) .admin-node-rail {
  min-height: 0;
  overflow: hidden;
  padding: 12px;
  border-radius: 28px;
}

.admin-root:not(.admin-root-login-only) .admin-node-list {
  max-height: calc(100vh - 220px);
  overflow: auto;
  padding-right: 2px;
}

.admin-root:not(.admin-root-login-only) .admin-node-card {
  color: #102033;
  border-radius: 18px;
}

.admin-root:not(.admin-root-login-only) .admin-node-card.selected {
  border-color: rgba(14,165,233,0.46);
  background:
    linear-gradient(180deg, rgba(224,242,254,0.80), rgba(255,255,255,0.44)),
    rgba(186,230,253,0.40);
  box-shadow:
    0 16px 36px rgba(14,165,233,0.14),
    inset 0 1px 0 rgba(255,255,255,0.74);
}

.admin-root:not(.admin-root-login-only) .admin-node-top > span {
  background: rgba(14,165,233,0.14);
  color: #0369a1;
}

.admin-root:not(.admin-root-login-only) .pill.ok {
  color: #166534;
  border-color: rgba(22,101,52,0.16);
  background: rgba(187,247,208,0.62);
}

.admin-root:not(.admin-root-login-only) .pill.warn {
  color: #92400e;
  border-color: rgba(146,64,14,0.16);
  background: rgba(254,243,199,0.70);
}

.admin-root:not(.admin-root-login-only) .pill.neutral {
  color: #334155;
  border-color: rgba(15,23,42,0.10);
  background: rgba(255,255,255,0.46);
}

.admin-disclosure {
  display: grid;
  gap: 8px;
}

.admin-disclosure summary {
  list-style: none;
  cursor: pointer;
}

.admin-disclosure summary::-webkit-details-marker {
  display: none;
}

.admin-disclosure summary .admin-section-head,
.admin-disclosure summary .admin-node-rail-head {
  position: relative;
  padding-right: 22px;
}

.admin-disclosure summary .admin-section-head::after,
.admin-disclosure summary .admin-node-rail-head::after {
  content: "⌄";
  position: absolute;
  right: 0;
  top: 2px;
  color: #64748b;
  font-weight: 900;
  transition: transform .18s ease;
}

.admin-disclosure[open] summary .admin-section-head::after,
.admin-disclosure[open] summary .admin-node-rail-head::after {
  transform: rotate(180deg);
}

.admin-root:not(.admin-root-login-only) .admin-family-row,
.admin-root:not(.admin-root-login-only) .admin-profile-card {
  color: #102033;
}

.admin-root:not(.admin-root-login-only) .admin-drawer-overlay {
  background: rgba(148,163,184,0.30);
  backdrop-filter: blur(12px);
}

.admin-root:not(.admin-root-login-only) .admin-drawer {
  background:
    linear-gradient(180deg, rgba(255,255,255,0.82), rgba(255,255,255,0.58)),
    rgba(255,255,255,0.54);
  color: #102033;
  border-left: 1px solid rgba(255,255,255,0.64);
}

.admin-root:not(.admin-root-login-only) .admin-drawer-head {
  background: rgba(255,255,255,0.70);
  border-bottom-color: rgba(15,23,42,0.08);
  color: #0f172a;
}

.admin-root:not(.admin-root-login-only) .admin-detail-item,
.admin-root:not(.admin-root-login-only) .admin-detail-block {
  background: rgba(255,255,255,0.46);
  border-color: rgba(15,23,42,0.08);
  color: #102033;
}

.admin-root:not(.admin-root-login-only) .admin-detail-block p {
  color: #102033;
}

@media (max-width: 1200px) {
  .admin-root:not(.admin-root-login-only) {
    height: auto;
    overflow: auto;
  }

  .admin-root:not(.admin-root-login-only) .admin-console-layout {
    height: auto;
    grid-template-columns: 1fr;
  }

  .admin-root:not(.admin-root-login-only) .admin-map-area {
    grid-template-columns: 1fr;
  }

  .admin-root:not(.admin-root-login-only) .admin-map-area > section {
    min-height: 520px !important;
  }

  .admin-root:not(.admin-root-login-only) .admin-node-list {
    max-height: none;
  }
}

@media (max-width: 760px) {
  .admin-root:not(.admin-root-login-only) {
    padding: 8px;
  }

  .admin-root:not(.admin-root-login-only) .admin-sidebar-stats {
    grid-template-columns: 1fr;
  }

  .admin-root:not(.admin-root-login-only) .admin-workspace-bar {
    align-items: flex-start;
    flex-direction: column;
  }
}


/* Map-first CMS workspace tightening */
.admin-root:not(.admin-root-login-only) .admin-console-layout {
  grid-template-columns: 280px minmax(0, 1fr);
}

.admin-root:not(.admin-root-login-only) .admin-sidebar {
  padding: 12px;
  gap: 10px;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar h1 {
  font-size: 20px;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar p {
  font-size: 12px;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar-stats {
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}

.admin-root:not(.admin-root-login-only) .admin-stat {
  padding: 8px;
  border-radius: 15px;
  box-shadow:
    0 10px 24px rgba(15,23,42,0.07),
    inset 0 1px 0 rgba(255,255,255,0.55);
}

.admin-root:not(.admin-root-login-only) .admin-stat strong {
  font-size: 16px;
}

.admin-root:not(.admin-root-login-only) .admin-stat small {
  font-size: 10px;
}

.admin-root:not(.admin-root-login-only) .admin-workspace {
  gap: 8px;
}
`
