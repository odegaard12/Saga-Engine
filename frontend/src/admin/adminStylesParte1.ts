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
  color: var(--a-texto, #e5eefc);
  background:
    radial-gradient(circle at 0% 0%, rgba(var(--a-acento-rgb, 56, 189, 248), 0.18), transparent 28%),
    radial-gradient(circle at 100% 0%, rgba(var(--a-ok-rgb, 34, 197, 94), 0.12), transparent 30%),
    var(--a-fondo, #020617);
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

.admin-login-card {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px;
  border-radius: 28px;
  border: 1px solid rgba(var(--a-linea-rgb, 148, 163, 184), 0.24);
  background: rgba(var(--a-superficie-rgb, 15, 23, 42), 0.76);
  box-shadow: 0 24px 80px rgba(0,0,0,0.34);
  backdrop-filter: blur(20px);
}

.admin-brand {
  width: fit-content;
  padding: 7px 10px;
  border-radius: 999px;
  background: rgba(var(--a-acento-rgb, 56, 189, 248), 0.10);
  border: 1px solid rgba(var(--a-acento-rgb, 56, 189, 248), 0.22);
  color: var(--a-acento-fuerte, #7dd3fc);
  font-size: 10px;
  font-weight: 950;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.admin-login-card h1 {
  margin: 0;
  font-size: 42px;
  line-height: 0.95;
  letter-spacing: -0.07em;
}

.admin-login-card p {
  margin: 8px 0 0;
  color: var(--a-texto-3, #94a3b8);
  line-height: 1.45;
}

.admin-login-form {
  display: grid;
  gap: 9px;
}

.admin-login-form label,
.admin-kicker {
  color: var(--a-acento-fuerte, #7dd3fc);
  font-size: 10px;
  font-weight: 950;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.admin-login-form input {
  height: 44px;
  border: 1px solid rgba(var(--a-linea-rgb, 148, 163, 184), 0.25);
  border-radius: 16px;
  background: rgba(var(--a-fondo-rgb, 2, 6, 23), 0.62);
  color: var(--a-texto, #e5eefc);
  padding: 0 13px;
  outline: none;
}

.admin-login-form button,
.admin-drawer-head button {
  min-height: 42px;
  border: 0;
  border-radius: 999px;
  background: linear-gradient(135deg, var(--a-acento, #38bdf8), #818cf8);
  color: var(--a-acento-texto, #020617);
  font-weight: 950;
  cursor: pointer;
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
  border: 1px solid rgba(var(--a-ok-rgb, 34, 197, 94), 0.26);
  background: rgba(var(--a-ok-rgb, 34, 197, 94), 0.14);
  color: var(--a-ok, #bbf7d0);
}

.pill.warn {
  border: 1px solid rgba(var(--a-aviso-rgb, 251, 191, 36), 0.26);
  background: rgba(var(--a-aviso-rgb, 251, 191, 36), 0.12);
  color: var(--a-aviso, #fde68a);
}

.admin-error {
  display: grid;
  gap: 4px;
  padding: 12px;
  border-radius: 16px;
  border: 1px solid rgba(var(--a-error-rgb, 248, 113, 113), 0.28);
  background: rgba(var(--a-error-rgb, 127, 29, 29), 0.22);
  color: var(--a-error, #fecaca);
  font-size: 12px;
}

.admin-drawer-overlay {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  justify-content: flex-end;
  background: rgba(var(--a-fondo-rgb, 2, 6, 23), 0.58);
  backdrop-filter: blur(8px);
}

.admin-drawer {
  width: min(560px, 100%);
  height: 100%;
  overflow: auto;
  border-left: 1px solid rgba(var(--a-linea-rgb, 148, 163, 184), 0.22);
  background: rgba(var(--a-superficie-rgb, 15, 23, 42), 0.94);
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
  border-bottom: 1px solid rgba(var(--a-linea-rgb, 148, 163, 184), 0.18);
  background: rgba(var(--a-superficie-rgb, 15, 23, 42), 0.92);
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

@media (max-width: 700px) {
  .admin-root {
    padding: 8px;
  }

  .admin-login-card h1 {
    font-size: 34px;
  }
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
  border: 1px solid rgba(var(--a-texto-rgb, 255, 255, 255), 0.62);
  background:
    linear-gradient(180deg, rgba(var(--a-texto-rgb, 255, 255, 255), 0.72), rgba(var(--a-texto-rgb, 255, 255, 255), 0.42)),
    rgba(var(--a-texto-rgb, 255, 255, 255), 0.36);
  box-shadow:
    0 30px 90px rgba(var(--a-superficie-rgb, 15, 23, 42), 0.22),
    inset 0 1px 0 rgba(255,255,255,0.74);
  backdrop-filter: blur(28px) saturate(160%);
  -webkit-backdrop-filter: blur(28px) saturate(160%);
  color: var(--a-acento-texto, #0f172a);
}

.admin-login-card-minimal .admin-brand {
  background: rgba(var(--a-acento-rgb, 14, 165, 233), 0.12);
  border-color: rgba(var(--a-acento-rgb, 14, 165, 233), 0.18);
  color: #0369a1;
}

.admin-login-copy {
  display: grid;
  gap: 8px;
  margin: 20px 0 18px;
}

.admin-login-card-minimal h1 {
  margin: 0;
  color: var(--a-acento-texto, #0f172a);
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
  border-color: rgba(var(--a-superficie-rgb, 15, 23, 42), 0.12);
  background: rgba(var(--a-texto-rgb, 255, 255, 255), 0.62);
  color: var(--a-acento-texto, #0f172a);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.70);
}

.admin-login-card-minimal .admin-login-form input::placeholder {
  color: var(--a-texto-3, #64748b);
}

.admin-login-card-minimal .admin-login-form input:focus {
  border-color: rgba(var(--a-acento-rgb, 14, 165, 233), 0.52);
  box-shadow:
    0 0 0 4px rgba(var(--a-acento-rgb, 14, 165, 233), 0.12),
    inset 0 1px 0 rgba(255,255,255,0.70);
}

.admin-login-card-minimal .admin-login-form button {
  height: 48px;
  box-shadow: 0 14px 30px rgba(59,130,246,0.28);
}

.admin-login-card-minimal .admin-error {
  border-color: rgba(var(--a-error-rgb, 239, 68, 68), 0.25);
  background: rgba(254,226,226,0.72);
  color: #7f1d1d;
}

.admin-login-foot {
  display: grid;
  gap: 12px;
  margin-top: 20px;
  color: var(--a-texto-3, #64748b);
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
  border: 1px solid rgba(var(--a-superficie-rgb, 15, 23, 42), 0.10);
  background: rgba(var(--a-texto-rgb, 255, 255, 255), 0.38);
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
  background: radial-gradient(circle, rgba(var(--a-acento-rgb, 56, 189, 248), 0.60), transparent 68%);
}

.admin-login-orb-b {
  width: 220px;
  height: 220px;
  right: -86px;
  bottom: -82px;
  background: radial-gradient(circle, rgba(129,140,248,0.45), transparent 70%);
}

@media (max-width: 700px) {

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
    radial-gradient(circle at 12% 8%, rgba(var(--a-acento-rgb, 56, 189, 248), 0.22), transparent 30%),
    radial-gradient(circle at 88% 6%, rgba(129,140,248,0.18), transparent 32%),
    radial-gradient(circle at 55% 96%, rgba(var(--a-ok-rgb, 34, 197, 94), 0.10), transparent 34%),
    linear-gradient(180deg, #eef6ff 0%, #dbeafe 42%, #c4d5e8 100%);
}

.admin-root:not(.admin-root-login-only) .admin-brand {
  background: rgba(var(--a-acento-rgb, 14, 165, 233), 0.12);
  border-color: rgba(var(--a-acento-rgb, 14, 165, 233), 0.20);
  color: #0369a1;
}

.admin-root:not(.admin-root-login-only) .admin-drawer-head button {
  min-height: 38px;
  border-radius: 999px;
  border: 1px solid rgba(var(--a-superficie-rgb, 15, 23, 42), 0.08);
}

.admin-root:not(.admin-root-login-only) .admin-kicker {
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

.admin-root:not(.admin-root-login-only) .admin-drawer-overlay {
  background: rgba(var(--a-linea-rgb, 148, 163, 184), 0.30);
  backdrop-filter: blur(12px);
}

.admin-root:not(.admin-root-login-only) .admin-drawer {
  background:
    linear-gradient(180deg, rgba(var(--a-texto-rgb, 255, 255, 255), 0.82), rgba(var(--a-texto-rgb, 255, 255, 255), 0.58)),
    rgba(var(--a-texto-rgb, 255, 255, 255), 0.54);
  color: #102033;
  border-left: 1px solid rgba(var(--a-texto-rgb, 255, 255, 255), 0.64);
}

.admin-root:not(.admin-root-login-only) .admin-drawer-head {
  background: rgba(var(--a-texto-rgb, 255, 255, 255), 0.70);
  border-bottom-color: rgba(var(--a-superficie-rgb, 15, 23, 42), 0.08);
  color: var(--a-acento-texto, #0f172a);
}

@media (max-width: 1200px) {
  .admin-root:not(.admin-root-login-only) {
    height: auto;
    overflow: auto;
  }
}

@media (max-width: 760px) {
  .admin-root:not(.admin-root-login-only) {
    padding: 8px;
  }
}
`
