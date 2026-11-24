/** Segunda mitad de la hoja de estilos del panel: ver adminStyles.ts. */
export const estilosAdminParte2 = `

.admin-root:not(.admin-root-login-only) .admin-drawer {
  width: min(520px, 100%);
}


/* Legacy operator shell pass */
.admin-root:not(.admin-root-login-only) {
  height: 100vh;
  overflow: hidden;
  padding: 10px;
  background:
    radial-gradient(circle at 18% 12%, rgba(var(--a-ok-rgb, 16, 185, 129), 0.12), transparent 28%),
    radial-gradient(circle at 84% 10%, rgba(59,130,246,0.10), transparent 30%),
    linear-gradient(180deg, var(--a-fondo, #0b1220) 0%, var(--a-superficie, #0f172a) 58%, var(--a-superficie, #111827) 100%);
}

.admin-root:not(.admin-root-login-only) .admin-cms-side-action {
  min-height: 42px;
  padding: 0 12px;
  border-radius: 14px;
  border: 1px solid rgba(var(--a-texto-rgb, 255, 255, 255), 0.08);
  background: rgba(var(--a-texto-rgb, 255, 255, 255), 0.04);
  color: #e5e7eb;
  font-size: 12px;
  font-weight: 900;
  text-align: left;
  cursor: pointer;
  transition: transform 120ms ease, background 120ms ease, border-color 120ms ease;
}

.admin-root:not(.admin-root-login-only) .admin-cms-side-action:hover {
  transform: translateY(-1px);
  background: rgba(var(--a-texto-rgb, 255, 255, 255), 0.08);
  border-color: rgba(var(--a-texto-rgb, 255, 255, 255), 0.14);
}

.admin-root:not(.admin-root-login-only) .admin-drawer {
  width: min(480px, calc(100vw - 28px)) !important;
  border-left: 1px solid rgba(var(--a-texto-rgb, 255, 255, 255), 0.08) !important;
  background:
    linear-gradient(180deg, rgba(17,24,39,0.92), rgba(17,24,39,0.96)) !important;
  backdrop-filter: blur(24px) saturate(125%);
  -webkit-backdrop-filter: blur(24px) saturate(125%);
}

.admin-root:not(.admin-root-login-only) .admin-drawer-head,
.admin-root:not(.admin-root-login-only) .admin-drawer-body {
  padding: 16px !important;
}

@media (max-width: 1180px) {
  .admin-root:not(.admin-root-login-only) {
    height: auto;
    overflow: auto;
  }
}

.admin-root:not(.admin-root-login-only) .admin-cms-side-action.active {
  background: rgba(59,130,246,0.22);
  border-color: rgba(147,197,253,0.34);
  color: var(--a-texto, #f8fafc);
}

.admin-cms-local-panel {
  display: grid;
  gap: 9px;
  padding: 11px;
  border-radius: 16px;
  border: 1px solid rgba(var(--a-texto-rgb, 255, 255, 255), 0.08);
  background: rgba(var(--a-texto-rgb, 255, 255, 255), 0.04);
}

.admin-cms-local-panel > strong {
  color: var(--a-texto, #f8fafc);
  font-size: 13px;
}

.admin-cms-local-panel > span,
.admin-cms-local-panel label {
  color: rgba(var(--a-texto-rgb, 255, 255, 255), 0.58);
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
  border: 1px solid rgba(var(--a-texto-rgb, 255, 255, 255), 0.10);
  background: rgba(var(--a-superficie-rgb, 15, 23, 42), 0.54);
  color: var(--a-texto, #f8fafc);
}

.admin-drawer-editable .admin-drawer-body {
  gap: 12px;
}


/* Persistent save flow pass */
.admin-root:not(.admin-root-login-only) .admin-cms-side-action--save {
  background: rgba(var(--a-acento-rgb, 14, 165, 233), 0.16);
  border-color: rgba(var(--a-acento-rgb, 125, 211, 252), 0.26);
  color: var(--a-acento-fuerte, #e0f2fe);
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
  border: 1px solid rgba(var(--a-error-rgb, 248, 113, 113), 0.26);
  background: rgba(var(--a-error-rgb, 127, 29, 29), 0.24);
  color: var(--a-error, #fecaca);
  font-size: 11px;
  line-height: 1.35;
}

.admin-save-error strong {
  color: var(--a-error, #fee2e2);
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

.admin-root:not(.admin-root-login-only) .admin-cms-side-action--save::after {
  content: "";
}

.admin-drawer-editable .admin-drawer-head h2 {
  color: var(--a-texto, #ffffff);
}


/* Resilient save and modern CMS polish */
.admin-root:not(.admin-root-login-only) .admin-cms-local-panel > strong {
  color: var(--a-texto, #f8fafc) !important;
}

.admin-root:not(.admin-root-login-only) .admin-cms-local-panel > span {
  color: rgba(var(--a-texto-rgb, 226, 232, 240), 0.78) !important;
}

.admin-root:not(.admin-root-login-only) .admin-cms-side-action {
  border-radius: 16px;
  transition: transform 140ms ease, background 140ms ease, border-color 140ms ease, box-shadow 140ms ease;
}

.admin-root:not(.admin-root-login-only) .admin-cms-side-action:hover {
  transform: translateY(-1px);
}

.admin-root:not(.admin-root-login-only) .admin-cms-side-action--save {
  background: linear-gradient(180deg, rgba(var(--a-acento-rgb, 14, 165, 233), 0.24), rgba(var(--a-acento-rgb, 14, 165, 233), 0.14));
  border-color: rgba(var(--a-acento-rgb, 125, 211, 252), 0.32);
  box-shadow: 0 10px 26px rgba(var(--a-acento-rgb, 14, 165, 233), 0.18);
}

.admin-root:not(.admin-root-login-only) .admin-save-error {
  border-radius: 16px;
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
    -22px 0 60px rgba(var(--a-fondo-rgb, 2, 6, 23), 0.38),
    inset 1px 0 0 rgba(255,255,255,0.08);
}

.admin-root:not(.admin-root-login-only) .admin-drawer-head {
  cursor: default;
}

.admin-root:not(.admin-root-login-only) .admin-map-dragging-node {
  cursor: grabbing !important;
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
  color: rgba(var(--a-texto-rgb, 226, 232, 240), 0.78);
  font-size: 11px;
  font-weight: 850;
}

.admin-settings-panel input,
.admin-settings-panel select,
.admin-settings-panel textarea {
  width: 100%;
  border: 1px solid rgba(var(--a-linea-rgb, 148, 163, 184), 0.18);
  border-radius: 13px;
  background: rgba(var(--a-fondo-rgb, 2, 6, 23), 0.62);
  color: var(--a-texto, #f8fafc);
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
  border-color: rgba(var(--a-acento-rgb, 125, 211, 252), 0.42);
  box-shadow: 0 0 0 4px rgba(var(--a-acento-rgb, 56, 189, 248), 0.10);
}


/* Persistent player profile editor */
.admin-players-panel {
  max-height: 52vh;
  overflow: auto;
  padding-right: 3px;
}


`
