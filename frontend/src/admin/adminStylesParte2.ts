/** Segunda mitad de la hoja de estilos del panel: ver adminStyles.ts. */
export const estilosAdminParte2 = `
.admin-root:not(.admin-root-login-only) .admin-workspace-bar {
  min-height: 58px;
  padding: 10px 13px;
  border-radius: 23px;
}

.admin-root:not(.admin-root-login-only) .admin-workspace-bar h2 {
  font-size: 22px;
}

.admin-root:not(.admin-root-login-only) .admin-map-area {
  grid-template-columns: minmax(0, 1fr) 245px;
  gap: 8px;
}

.admin-root:not(.admin-root-login-only) .admin-map-area > section {
  border-radius: 26px !important;
}

.admin-root:not(.admin-root-login-only) .admin-node-rail {
  padding: 9px;
  border-radius: 22px;
}

.admin-root:not(.admin-root-login-only) .admin-node-rail-head h3 {
  font-size: 15px;
}

.admin-root:not(.admin-root-login-only) .admin-node-list {
  max-height: calc(100vh - 168px);
  gap: 7px;
}

.admin-root:not(.admin-root-login-only) .admin-node-card {
  padding: 9px;
  border-radius: 15px;
  box-shadow:
    0 10px 24px rgba(15,23,42,0.07),
    inset 0 1px 0 rgba(255,255,255,0.55);
}

.admin-root:not(.admin-root-login-only) .admin-node-top {
  gap: 8px;
}

.admin-root:not(.admin-root-login-only) .admin-node-top > span {
  width: 28px;
  height: 28px;
  border-radius: 10px;
}

.admin-root:not(.admin-root-login-only) .admin-node-meta {
  grid-template-columns: 1fr;
  gap: 3px;
  margin-top: 7px;
  font-size: 10px;
}

.admin-root:not(.admin-root-login-only) .admin-profile-card,
.admin-root:not(.admin-root-login-only) .admin-family-row,
.admin-root:not(.admin-root-login-only) .admin-muted {
  border-radius: 15px;
  padding: 9px;
  box-shadow:
    0 10px 24px rgba(15,23,42,0.06),
    inset 0 1px 0 rgba(255,255,255,0.52);
}

.admin-root:not(.admin-root-login-only) .admin-profile-list,
.admin-root:not(.admin-root-login-only) .admin-family-count-list {
  gap: 7px;
}

.admin-root:not(.admin-root-login-only) .admin-family-row {
  grid-template-columns: 28px minmax(0, 1fr) auto;
}

.admin-root:not(.admin-root-login-only) .admin-family-row > span {
  width: 28px;
  height: 28px;
  border-radius: 10px;
}

.admin-cms-actions {
  align-items: center;
}

.admin-cms-action {
  min-height: 32px;
  padding: 0 11px;
  border-radius: 999px;
  border: 1px solid rgba(15,23,42,0.10);
  background: rgba(255,255,255,0.52);
  color: #334155;
  font-weight: 900;
  font-size: 11px;
  cursor: pointer;
}

.admin-cms-action.primary {
  background: linear-gradient(135deg, #38bdf8, #818cf8);
  color: #07111f;
  border-color: transparent;
  box-shadow: 0 10px 22px rgba(59,130,246,0.18);
}

.admin-operator-strip-compact {
  min-height: 50px;
  padding: 9px 12px !important;
  border-radius: 18px !important;
}

.admin-root:not(.admin-root-login-only) .admin-operator-strip-compact span {
  font-size: 11px;
}

.admin-root:not(.admin-root-login-only) .admin-drawer {
  width: min(520px, 100%);
}

@media (min-width: 1500px) {
  .admin-root:not(.admin-root-login-only) .admin-console-layout {
    grid-template-columns: 280px minmax(0, 1fr);
  }

  .admin-root:not(.admin-root-login-only) .admin-map-area {
    grid-template-columns: minmax(0, 1fr) 260px;
  }
}

@media (max-width: 1200px) {
  .admin-root:not(.admin-root-login-only) .admin-map-area > section {
    min-height: 620px !important;
  }
}


/* Legacy operator shell pass */
.admin-root:not(.admin-root-login-only) {
  height: 100vh;
  overflow: hidden;
  padding: 10px;
  background:
    radial-gradient(circle at 18% 12%, rgba(16,185,129,0.12), transparent 28%),
    radial-gradient(circle at 84% 10%, rgba(59,130,246,0.10), transparent 30%),
    linear-gradient(180deg, #0b1220 0%, #0f172a 58%, #111827 100%);
}

.admin-root:not(.admin-root-login-only) .admin-console-layout {
  height: calc(100vh - 20px) !important;
  min-height: 0 !important;
  grid-template-columns: 340px minmax(0, 1fr) !important;
  gap: 10px !important;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar {
  width: auto !important;
  min-width: 0 !important;
  height: 100% !important;
  min-height: 0 !important;
  overflow: auto !important;
  padding: 14px !important;
  gap: 12px !important;
  border-radius: 28px !important;
  border: 1px solid rgba(255,255,255,0.10) !important;
  background:
    linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.03)),
    rgba(17,24,39,0.74) !important;
  box-shadow:
    0 20px 60px rgba(0,0,0,0.28),
    inset 0 1px 0 rgba(255,255,255,0.08) !important;
  backdrop-filter: blur(22px) saturate(135%);
  -webkit-backdrop-filter: blur(22px) saturate(135%);
}

.admin-root:not(.admin-root-login-only) .admin-sidebar .admin-brand {
  display: inline-flex !important;
  align-items: center !important;
  justify-content: flex-start !important;
  width: auto !important;
  min-height: 40px !important;
  padding: 0 14px !important;
  border-radius: 18px !important;
  font-size: 11px !important;
  letter-spacing: 0.22em !important;
  background: rgba(255,255,255,0.08) !important;
  color: #86efac !important;
  border: 1px solid rgba(255,255,255,0.08) !important;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar > div:nth-of-type(2) h1 {
  margin: 0 !important;
  font-size: 18px !important;
  line-height: 1.04 !important;
  letter-spacing: -0.05em !important;
  color: #f8fafc !important;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar > div:nth-of-type(2) p {
  color: rgba(255,255,255,0.46) !important;
  font-size: 12px !important;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar-actions {
  display: grid !important;
  grid-template-columns: 1fr 1fr !important;
  gap: 8px !important;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar-actions button,
.admin-root:not(.admin-root-login-only) .admin-sidebar-actions a {
  min-height: 42px !important;
  height: 42px !important;
  padding: 0 12px !important;
  border-radius: 14px !important;
  font-size: 12px !important;
  font-weight: 900 !important;
  text-decoration: none !important;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar-stats,
.admin-root:not(.admin-root-login-only) .admin-sidebar .admin-disclosure {
  display: none !important;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar-cms {
  display: grid;
  gap: 10px;
  padding: 14px;
  border-radius: 22px;
  border: 1px solid rgba(255,255,255,0.08);
  background:
    linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02)),
    rgba(255,255,255,0.03);
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.06),
    0 12px 30px rgba(0,0,0,0.18);
}

.admin-root:not(.admin-root-login-only) .admin-sidebar-section-head {
  display: grid;
  gap: 4px;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar-section-head h3 {
  margin: 0;
  color: #f8fafc;
  font-size: 14px;
  line-height: 1.1;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar-cms-actions {
  display: grid;
  gap: 8px;
}

.admin-root:not(.admin-root-login-only) .admin-cms-side-action {
  min-height: 42px;
  padding: 0 12px;
  border-radius: 14px;
  border: 1px solid rgba(255,255,255,0.08);
  background: rgba(255,255,255,0.04);
  color: #e5e7eb;
  font-size: 12px;
  font-weight: 900;
  text-align: left;
  cursor: pointer;
  transition: transform 120ms ease, background 120ms ease, border-color 120ms ease;
}

.admin-root:not(.admin-root-login-only) .admin-cms-side-action:hover {
  transform: translateY(-1px);
  background: rgba(255,255,255,0.08);
  border-color: rgba(255,255,255,0.14);
}

.admin-root:not(.admin-root-login-only) .admin-cms-side-action--primary {
  background: linear-gradient(135deg, rgba(16,185,129,0.28), rgba(14,165,233,0.22));
  color: #f8fafc;
  border-color: rgba(110,231,183,0.22);
}

.admin-root:not(.admin-root-login-only) .admin-sidebar-cms-note {
  color: rgba(255,255,255,0.50);
  font-size: 11px;
  line-height: 1.4;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar-node-list {
  display: grid;
  gap: 8px;
  max-height: 320px;
  overflow: auto;
  padding-right: 2px;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar-node-item {
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr);
  align-items: flex-start;
  gap: 10px;
  padding: 10px;
  border-radius: 16px;
  border: 1px solid rgba(255,255,255,0.08);
  background: rgba(255,255,255,0.04);
  color: #e5e7eb;
  text-align: left;
  cursor: pointer;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar-node-item:hover,
.admin-root:not(.admin-root-login-only) .admin-sidebar-node-item.active {
  background: rgba(59,130,246,0.16);
  border-color: rgba(96,165,250,0.26);
}

.admin-root:not(.admin-root-login-only) .admin-sidebar-node-item > span {
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  border-radius: 12px;
  background: rgba(255,255,255,0.10);
  color: #93c5fd;
  font-size: 13px;
  font-weight: 900;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar-node-item strong {
  display: block;
  color: #f8fafc;
  font-size: 12px;
  line-height: 1.15;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar-node-item small {
  display: block;
  margin-top: 4px;
  color: rgba(255,255,255,0.54);
  font-size: 10px;
  line-height: 1.35;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar-empty {
  padding: 12px;
  border-radius: 14px;
  background: rgba(255,255,255,0.04);
  color: rgba(255,255,255,0.50);
  font-size: 11px;
}

.admin-root:not(.admin-root-login-only) .admin-workspace {
  height: 100% !important;
  min-height: 0 !important;
  grid-template-rows: minmax(0, 1fr) !important;
  gap: 0 !important;
}

.admin-root:not(.admin-root-login-only) .admin-workspace-bar,
.admin-root:not(.admin-root-login-only) .admin-topbar-pills,
.admin-root:not(.admin-root-login-only) .admin-operator-strip,
.admin-root:not(.admin-root-login-only) .admin-operator-strip-compact,
.admin-root:not(.admin-root-login-only) .admin-node-rail {
  display: none !important;
}

.admin-root:not(.admin-root-login-only) .admin-map-area {
  height: 100% !important;
  min-height: 0 !important;
  display: grid !important;
  grid-template-columns: 1fr !important;
  gap: 0 !important;
}

.admin-root:not(.admin-root-login-only) .admin-map-area > section:first-child {
  height: 100% !important;
  min-height: 0 !important;
  border-radius: 28px !important;
  overflow: hidden !important;
  border: 1px solid rgba(255,255,255,0.08) !important;
  background:
    linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.03)),
    rgba(255,255,255,0.03) !important;
  box-shadow:
    0 22px 60px rgba(0,0,0,0.24),
    inset 0 1px 0 rgba(255,255,255,0.08) !important;
}

.admin-root:not(.admin-root-login-only) .admin-drawer {
  width: min(480px, calc(100vw - 28px)) !important;
  border-left: 1px solid rgba(255,255,255,0.08) !important;
  background:
    linear-gradient(180deg, rgba(17,24,39,0.92), rgba(17,24,39,0.96)) !important;
  backdrop-filter: blur(24px) saturate(125%);
  -webkit-backdrop-filter: blur(24px) saturate(125%);
}

.admin-root:not(.admin-root-login-only) .admin-drawer-head,
.admin-root:not(.admin-root-login-only) .admin-drawer-body {
  padding: 16px !important;
}

.admin-root:not(.admin-root-login-only) .admin-detail-grid {
  grid-template-columns: 1fr 1fr !important;
  gap: 8px !important;
}

.admin-root:not(.admin-root-login-only) .admin-detail-item,
.admin-root:not(.admin-root-login-only) .admin-detail-block {
  border-radius: 16px !important;
  padding: 12px !important;
  border: 1px solid rgba(255,255,255,0.08) !important;
  background: rgba(255,255,255,0.03) !important;
}

@media (max-width: 1180px) {
  .admin-root:not(.admin-root-login-only) {
    height: auto;
    overflow: auto;
  }

  .admin-root:not(.admin-root-login-only) .admin-console-layout {
    height: auto !important;
    grid-template-columns: 1fr !important;
  }

  .admin-root:not(.admin-root-login-only) .admin-sidebar {
    height: auto !important;
  }

  .admin-root:not(.admin-root-login-only) .admin-map-area > section:first-child {
    min-height: 72vh !important;
  }
}



/* Local CMS actions and editable drawer pass */
.admin-root:not(.admin-root-login-only) .admin-sidebar > div:nth-of-type(2) h1,
.admin-root:not(.admin-root-login-only) .admin-sidebar-section-head h3,
.admin-root:not(.admin-root-login-only) .admin-sidebar-node-item strong {
  text-shadow: 0 1px 0 rgba(0,0,0,0.18);
}

.admin-root:not(.admin-root-login-only) .admin-cms-side-action.active {
  background: rgba(59,130,246,0.22);
  border-color: rgba(147,197,253,0.34);
  color: #f8fafc;
}

.admin-local-notice {
  padding: 10px 11px;
  border-radius: 14px;
  border: 1px solid rgba(110,231,183,0.18);
  background: rgba(16,185,129,0.12);
  color: rgba(236,253,245,0.86);
  font-size: 11px;
  line-height: 1.35;
}

.admin-cms-local-panel {
  display: grid;
  gap: 9px;
  padding: 11px;
  border-radius: 16px;
  border: 1px solid rgba(255,255,255,0.08);
  background: rgba(255,255,255,0.04);
}

.admin-cms-local-panel > strong {
  color: #f8fafc;
  font-size: 13px;
}

.admin-cms-local-panel > span,
.admin-cms-local-panel label {
  color: rgba(255,255,255,0.58);
  font-size: 11px;
  line-height: 1.35;
}

.admin-cms-local-panel label {
  display: grid;
  gap: 5px;
}

.admin-cms-local-panel input {
  min-height: 36px;
  padding: 0 10px;
  border-radius: 12px;
  border: 1px solid rgba(255,255,255,0.10);
  background: rgba(15,23,42,0.54);
  color: #f8fafc;
}

.admin-local-list {
  display: grid;
  gap: 6px;
}

.admin-local-row {
  display: grid;
  gap: 3px;
  min-height: 40px;
  padding: 8px 9px;
  border-radius: 12px;
  border: 1px solid rgba(255,255,255,0.08);
  background: rgba(255,255,255,0.04);
  color: #f8fafc;
  text-align: left;
}

.admin-local-row.static {
  cursor: default;
}

.admin-local-row small {
  color: rgba(255,255,255,0.52);
}

.admin-drawer-editable .admin-drawer-body {
  gap: 12px;
}

.admin-edit-section {
  display: grid;
  gap: 10px;
  padding: 13px;
  border-radius: 18px;
  border: 1px solid rgba(255,255,255,0.08);
  background: rgba(255,255,255,0.035);
}

.admin-edit-section-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}

.admin-edit-section-head strong {
  color: #f8fafc;
  font-size: 13px;
}

.admin-edit-section-head span {
  color: rgba(255,255,255,0.48);
  font-size: 11px;
}

.admin-edit-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 9px;
}

.admin-edit-field {
  display: grid;
  gap: 6px;
  color: rgba(255,255,255,0.62);
  font-size: 11px;
  font-weight: 850;
}

.admin-edit-field input,
.admin-edit-field select,
.admin-edit-field textarea {
  width: 100%;
  border: 1px solid rgba(255,255,255,0.10);
  border-radius: 12px;
  background: rgba(15,23,42,0.56);
  color: #f8fafc;
  padding: 10px;
  font: inherit;
  outline: none;
}

.admin-edit-field input,
.admin-edit-field select {
  min-height: 39px;
}

.admin-edit-field textarea {
  resize: vertical;
  line-height: 1.45;
}

.admin-edit-field input:focus,
.admin-edit-field select:focus,
.admin-edit-field textarea:focus {
  border-color: rgba(96,165,250,0.48);
  box-shadow: 0 0 0 3px rgba(59,130,246,0.16);
}

.admin-edit-check {
  display: flex;
  align-items: center;
  gap: 8px;
  color: rgba(255,255,255,0.72);
  font-size: 12px;
  font-weight: 850;
}

.admin-edit-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 9px;
}

@media (max-width: 620px) {
  .admin-edit-grid,
  .admin-edit-actions {
    grid-template-columns: 1fr;
  }
}



/* Persistent save flow pass */
.admin-root:not(.admin-root-login-only) .admin-cms-side-action--save {
  background: rgba(14,165,233,0.16);
  border-color: rgba(125,211,252,0.26);
  color: #e0f2fe;
}

.admin-root:not(.admin-root-login-only) .admin-cms-side-action--save:disabled {
  opacity: 0.68;
  cursor: wait;
}

.admin-save-error {
  display: grid;
  gap: 4px;
  padding: 10px 11px;
  border-radius: 14px;
  border: 1px solid rgba(248,113,113,0.26);
  background: rgba(127,29,29,0.24);
  color: #fecaca;
  font-size: 11px;
  line-height: 1.35;
}

.admin-save-error strong {
  color: #fee2e2;
}



/* Eliminar nodo and CMS clarity pass */
.admin-root:not(.admin-root-login-only) .admin-sidebar {
  scrollbar-width: thin;
  scrollbar-color: rgba(148,163,184,0.45) transparent;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar > div:nth-of-type(2) h1 {
  color: #ffffff !important;
  font-size: 19px !important;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar > div:nth-of-type(2) p {
  color: rgba(226,232,240,0.76) !important;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar-actions {
  grid-template-columns: 1fr !important;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar-actions button {
  text-align: left;
  justify-content: flex-start;
  background: rgba(14,165,233,0.12) !important;
  border-color: rgba(125,211,252,0.18) !important;
  color: #e0f2fe !important;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar-cms {
  gap: 12px;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar-section-head h3 {
  font-size: 15px;
  color: #ffffff;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar-cms-note {
  color: rgba(226,232,240,0.76);
}

.admin-root:not(.admin-root-login-only) .admin-cms-side-action {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.admin-root:not(.admin-root-login-only) .admin-cms-side-action::after {
  content: "›";
  opacity: .45;
  font-size: 16px;
}

.admin-root:not(.admin-root-login-only) .admin-cms-side-action--primary::after,
.admin-root:not(.admin-root-login-only) .admin-cms-side-action--save::after,
.admin-root:not(.admin-root-login-only) .admin-cms-side-action--danger::after {
  content: "";
}

.admin-root:not(.admin-root-login-only) .admin-cms-side-action--danger {
  background: rgba(127,29,29,0.30);
  border-color: rgba(248,113,113,0.30);
  color: #fecaca;
}

.admin-root:not(.admin-root-login-only) .admin-cms-side-action--danger:hover {
  background: rgba(153,27,27,0.42);
  border-color: rgba(252,165,165,0.38);
}

.admin-root:not(.admin-root-login-only) .admin-sidebar-node-list {
  max-height: 44vh;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar-node-item {
  position: relative;
  transition: transform 120ms ease, border-color 120ms ease, background 120ms ease;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar-node-item:hover {
  transform: translateY(-1px);
}

.admin-root:not(.admin-root-login-only) .admin-sidebar-node-item.active {
  box-shadow: inset 0 0 0 1px rgba(147,197,253,0.20), 0 12px 28px rgba(0,0,0,0.18);
}

.admin-sidebar-node-coords {
  color: rgba(186,230,253,0.70) !important;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
}

.admin-edit-actions-three {
  grid-template-columns: 1fr 1fr 1fr;
}

.admin-drawer-editable .admin-drawer-head h2 {
  color: #ffffff;
}

.admin-root:not(.admin-root-login-only) .admin-local-notice {
  color: #d1fae5;
}

@media (max-width: 760px) {
  .admin-edit-actions-three {
    grid-template-columns: 1fr;
  }
}



/* Resilient save and modern CMS polish */
.admin-root:not(.admin-root-login-only) .admin-sidebar h1,
.admin-root:not(.admin-root-login-only) .admin-sidebar-section-head h3,
.admin-root:not(.admin-root-login-only) .admin-cms-local-panel > strong,
.admin-root:not(.admin-root-login-only) .admin-sidebar-node-item strong {
  color: #f8fafc !important;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar p,
.admin-root:not(.admin-root-login-only) .admin-sidebar small,
.admin-root:not(.admin-root-login-only) .admin-cms-local-panel > span,
.admin-root:not(.admin-root-login-only) .admin-sidebar-cms-note {
  color: rgba(226,232,240,0.78) !important;
}

.admin-root:not(.admin-root-login-only) .admin-cms-side-action,
.admin-root:not(.admin-root-login-only) .admin-sidebar-actions button,
.admin-root:not(.admin-root-login-only) .admin-sidebar-node-item {
  border-radius: 16px;
  transition: transform 140ms ease, background 140ms ease, border-color 140ms ease, box-shadow 140ms ease;
}

.admin-root:not(.admin-root-login-only) .admin-cms-side-action:hover,
.admin-root:not(.admin-root-login-only) .admin-sidebar-actions button:hover,
.admin-root:not(.admin-root-login-only) .admin-sidebar-node-item:hover {
  transform: translateY(-1px);
}

.admin-root:not(.admin-root-login-only) .admin-cms-side-action--save {
  background: linear-gradient(180deg, rgba(14,165,233,0.24), rgba(14,165,233,0.14));
  border-color: rgba(125,211,252,0.32);
  box-shadow: 0 10px 26px rgba(14,165,233,0.18);
}

.admin-root:not(.admin-root-login-only) .admin-cms-side-action--danger {
  background: rgba(127,29,29,0.32);
  border-color: rgba(248,113,113,0.30);
  color: #fecaca;
}

.admin-root:not(.admin-root-login-only) .admin-local-notice {
  border: 1px solid rgba(74,222,128,0.22);
  background: rgba(20,83,45,0.24);
  color: #dcfce7;
}

.admin-root:not(.admin-root-login-only) .admin-save-error {
  border-radius: 16px;
}

.admin-root:not(.admin-root-login-only) .admin-edit-field input,
.admin-root:not(.admin-root-login-only) .admin-edit-field select,
.admin-root:not(.admin-root-login-only) .admin-edit-field textarea {
  border-radius: 14px;
  background: rgba(2,6,23,0.66);
  color: #f8fafc;
}

.admin-root:not(.admin-root-login-only) .admin-edit-field input:focus,
.admin-root:not(.admin-root-login-only) .admin-edit-field select:focus,
.admin-root:not(.admin-root-login-only) .admin-edit-field textarea:focus {
  border-color: rgba(125,211,252,0.42);
  box-shadow: 0 0 0 4px rgba(56,189,248,0.10);
}



/* Map node interaction polish */
.admin-root:not(.admin-root-login-only) .admin-sidebar-cms-note {
  border: 1px solid rgba(125,211,252,0.16);
  background: rgba(14,165,233,0.08);
  padding: 10px 11px;
  border-radius: 14px;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar-empty {
  color: rgba(226,232,240,0.78);
  border: 1px dashed rgba(125,211,252,0.20);
  background: rgba(14,165,233,0.07);
}

.admin-root:not(.admin-root-login-only) .admin-node-map-hint {
  color: rgba(226,232,240,0.76);
}



/* Non-blocking map editor drawer */
.admin-root:not(.admin-root-login-only) .admin-drawer-overlay--nonblocking {
  pointer-events: none !important;
  background: transparent !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
}

.admin-root:not(.admin-root-login-only) .admin-drawer-overlay--nonblocking .admin-drawer {
  pointer-events: auto !important;
}

.admin-root:not(.admin-root-login-only) .admin-drawer-overlay--nonblocking::before,
.admin-root:not(.admin-root-login-only) .admin-drawer-overlay--nonblocking::after {
  pointer-events: none !important;
  display: none !important;
}

.admin-root:not(.admin-root-login-only) .admin-drawer {
  box-shadow:
    -22px 0 60px rgba(2,6,23,0.38),
    inset 1px 0 0 rgba(255,255,255,0.08);
}

.admin-root:not(.admin-root-login-only) .admin-drawer-head {
  cursor: default;
}

.admin-root:not(.admin-root-login-only) .admin-map-dragging-node {
  cursor: grabbing !important;
}



/* Node reorder controls */
.admin-reorder-section {
  border-color: rgba(125,211,252,0.14);
  background:
    radial-gradient(circle at top left, rgba(14,165,233,0.10), transparent 42%),
    rgba(255,255,255,0.035);
}

.admin-reorder-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 9px;
}

.admin-reorder-actions .admin-cms-side-action {
  justify-content: center;
  min-height: 42px;
  text-align: center;
}

.admin-reorder-actions .admin-cms-side-action:disabled {
  opacity: 0.42;
  cursor: not-allowed;
  transform: none !important;
}

.admin-reorder-note {
  color: rgba(226,232,240,0.72);
  font-size: 11px;
  line-height: 1.35;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar-node-item span:first-child,
.admin-root:not(.admin-root-login-only) .admin-node-card .admin-node-top > span {
  font-variant-numeric: tabular-nums;
}

@media (max-width: 760px) {
  .admin-reorder-actions {
    grid-template-columns: 1fr;
  }
}



/* Persistent mission settings */
.admin-settings-panel {
  max-height: 52vh;
  overflow: auto;
  padding-right: 3px;
}

.admin-settings-panel label {
  display: grid;
  gap: 5px;
  color: rgba(226,232,240,0.78);
  font-size: 11px;
  font-weight: 850;
}

.admin-settings-panel input,
.admin-settings-panel select,
.admin-settings-panel textarea {
  width: 100%;
  border: 1px solid rgba(148,163,184,0.18);
  border-radius: 13px;
  background: rgba(2,6,23,0.62);
  color: #f8fafc;
  padding: 10px 11px;
  font: inherit;
  outline: none;
}

.admin-settings-panel textarea {
  min-height: 74px;
  resize: vertical;
}

.admin-settings-panel input:focus,
.admin-settings-panel select:focus,
.admin-settings-panel textarea:focus {
  border-color: rgba(125,211,252,0.42);
  box-shadow: 0 0 0 4px rgba(56,189,248,0.10);
}

.admin-settings-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.admin-settings-grid label:last-child {
  grid-column: 1 / -1;
}

@media (max-width: 760px) {
  .admin-settings-grid {
    grid-template-columns: 1fr;
  }
}



/* Persistent player profile editor */
.admin-players-panel {
  max-height: 52vh;
  overflow: auto;
  padding-right: 3px;
}

.admin-player-editor-list {
  display: grid;
  gap: 10px;
}

.admin-player-editor-card {
  display: grid;
  gap: 9px;
  padding: 10px;
  border-radius: 16px;
  border: 1px solid rgba(148,163,184,0.16);
  background: rgba(2,6,23,0.34);
}

.admin-player-editor-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 9px;
}

.admin-player-editor-head strong {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.admin-player-editor-head .admin-cms-side-action {
  width: auto;
  min-height: 34px;
  padding: 0 10px;
  font-size: 10px;
}

.admin-player-editor-card label {
  display: grid;
  gap: 5px;
  color: rgba(226,232,240,0.78);
  font-size: 11px;
  font-weight: 850;
}

.admin-player-editor-card input,
.admin-player-editor-card select {
  width: 100%;
  border: 1px solid rgba(148,163,184,0.18);
  border-radius: 13px;
  background: rgba(2,6,23,0.62);
  color: #f8fafc;
  padding: 10px 11px;
  font: inherit;
  outline: none;
}

.admin-player-editor-card input:focus,
.admin-player-editor-card select:focus {
  border-color: rgba(125,211,252,0.42);
  box-shadow: 0 0 0 4px rgba(56,189,248,0.10);
}

.admin-player-editor-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.admin-player-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 9px;
}

@media (max-width: 760px) {
  .admin-player-editor-grid,
  .admin-player-actions {
    grid-template-columns: 1fr;
  }
}



/* Family config editor */
.admin-family-config-section {
  border-color: rgba(168,85,247,0.18);
  background:
    radial-gradient(circle at top left, rgba(168,85,247,0.10), transparent 42%),
    rgba(255,255,255,0.035);
}

.admin-family-config-grid {
  display: grid;
  gap: 9px;
}

.admin-family-config-grid label {
  display: grid;
  gap: 5px;
  color: rgba(226,232,240,0.78);
  font-size: 11px;
  font-weight: 850;
}

.admin-family-config-grid input {
  width: 100%;
  border: 1px solid rgba(148,163,184,0.18);
  border-radius: 13px;
  background: rgba(2,6,23,0.62);
  color: #f8fafc;
  padding: 10px 11px;
  font: inherit;
  outline: none;
}

.admin-family-config-grid input:focus {
  border-color: rgba(168,85,247,0.44);
  box-shadow: 0 0 0 4px rgba(168,85,247,0.12);
}

.admin-family-config-note {
  color: rgba(226,232,240,0.68);
  font-size: 11px;
  line-height: 1.35;
}


`
