import type { ChangeEvent } from 'react'
import type { AdminProfileAction } from '../lib/adminApi'
import type { PlayerDraft } from '../lib/playerDrafts'
import { getPlayerInitials, getStablePlayerColor } from '../../shared/playerIdentity'


const AVATAR_CANVAS_SIZE = 160

function fileToAvatarDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('El archivo debe ser una imagen.'))
      return
    }

    const reader = new FileReader()

    reader.onerror = () => reject(new Error('No se pudo leer la imagen.'))
    reader.onload = () => {
      const image = new Image()

      image.onerror = () => reject(new Error('No se pudo procesar la imagen.'))
      image.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = AVATAR_CANVAS_SIZE
        canvas.height = AVATAR_CANVAS_SIZE

        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('Canvas no disponible.'))
          return
        }

        ctx.fillStyle = '#0f172a'
        ctx.fillRect(0, 0, AVATAR_CANVAS_SIZE, AVATAR_CANVAS_SIZE)

        const scale = Math.max(AVATAR_CANVAS_SIZE / image.width, AVATAR_CANVAS_SIZE / image.height)
        const width = image.width * scale
        const height = image.height * scale
        const x = (AVATAR_CANVAS_SIZE - width) / 2
        const y = (AVATAR_CANVAS_SIZE - height) / 2

        ctx.drawImage(image, x, y, width, height)
        resolve(canvas.toDataURL('image/jpeg', 0.82))
      }

      image.src = String(reader.result || '')
    }

    reader.readAsDataURL(file)
  })
}

type PlayersPanelProps = {
  playerDrafts: PlayerDraft[]
  playerSaveState: 'idle' | 'saving' | 'saved' | 'error'
  playerSaveError: string | null
  profileProgress: Record<string, { level: number | null; finished: boolean }>
  profileActionState: Record<string, string>
  profileActionError: Record<string, string>
  onUpdatePlayer: (index: number, key: keyof PlayerDraft, value: string) => void
  onDeletePlayer: (index: number) => void
  onAddPlayer: () => void
  onSavePlayers: () => void
  onProfileAction: (profileId: string, action: AdminProfileAction) => void
}

export default function PlayersPanel({
  playerDrafts,
  playerSaveState,
  playerSaveError,
  profileProgress,
  profileActionState,
  profileActionError,
  onUpdatePlayer,
  onDeletePlayer,
  onAddPlayer,
  onSavePlayers,
  onProfileAction,
}: PlayersPanelProps) {
  async function handleAvatarFile(event: ChangeEvent<HTMLInputElement>, index: number) {
    const file = event.currentTarget.files?.[0]
    if (!file) return

    try {
      const dataUrl = await fileToAvatarDataUrl(file)
      onUpdatePlayer(index, 'avatar_url', dataUrl)
      onUpdatePlayer(index, 'avatar_initials', '')
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'No se pudo cargar el avatar.')
    } finally {
      event.currentTarget.value = ''
    }
  }

  return (
    <div className="admin-cms-local-panel admin-players-panel admin-panel-modern">
      <div className="admin-panel-hero">
        <div>
          <span className="admin-kicker">Players</span>
          <h2>Players & teams</h2>
          <p>Manage who can play this mission. Save players to persist changes.</p>
        </div>

        <div className="admin-panel-count">
          <strong>{playerDrafts.length}</strong>
          <span>profiles</span>
        </div>
      </div>

      {playerDrafts.length === 0 ? (
        <div className="admin-empty-panel admin-empty-panel-modern">
          <strong>No players yet</strong>
          <span>Add one player or team to start testing the mission.</span>
        </div>
      ) : (
        <div className="admin-player-editor-list admin-player-editor-list-modern">
          {playerDrafts.map((draft, index) => (
            <section className="admin-player-editor-card admin-player-card-modern" key={`${draft.id}-${index}`}>
              <div className="admin-player-editor-head admin-player-head-modern">
                <div
                  className="admin-player-avatar"
                  style={{
                    background: draft.color || getStablePlayerColor(draft.id || draft.display_name),
                    color: '#ffffff',
                    boxShadow: '0 10px 26px rgba(15,23,42,0.28)',
                    overflow: 'hidden',
                  }}
                >
                  {draft.avatar_url ? (
                    <img
                      src={draft.avatar_url}
                      alt=""
                      className="admin-player-avatar-image"
                    />
                  ) : (
                    draft.avatar_initials || getPlayerInitials(draft.display_name || draft.id)
                  )}
                </div>
                <div>
                  <strong>{draft.display_name || draft.id || `Player ${index + 1}`}</strong>
                  <span>{draft.mode === 'team' ? 'Team profile' : 'Solo profile'} · {draft.status || 'active'}</span>
                </div>

                <button
                  type="button"
                  className="admin-inline-danger"
                  onClick={() => onDeletePlayer(index)}
                >
                  Delete
                </button>
              </div>

              <div className="admin-player-progress-controls">
                <div className="admin-player-progress-copy">
                  <strong>Progreso de partida</strong>
                  <span>
                    Nivel {profileProgress[draft.id]?.level ?? 0}
                    {profileProgress[draft.id]?.finished ? ' · finalizado' : ''}
                  </span>
                  {profileActionError[draft.id] ? <small>{profileActionError[draft.id]}</small> : null}
                </div>

                <div className="admin-player-progress-buttons">
                  <button
                    type="button"
                    className="admin-inline-soft"
                    disabled={profileActionState[draft.id] === 'running'}
                    onClick={() => onProfileAction(draft.id, 'level_prev')}
                  >
                    ← 1 nodo
                  </button>
                  <button
                    type="button"
                    className="admin-inline-soft"
                    disabled={profileActionState[draft.id] === 'running'}
                    onClick={() => onProfileAction(draft.id, 'level_next')}
                  >
                    +1 nodo
                  </button>
                  <button
                    type="button"
                    className="admin-inline-soft"
                    disabled={profileActionState[draft.id] === 'running'}
                    onClick={() => onProfileAction(draft.id, 'reset_profile')}
                  >
                    Reset
                  </button>
                  <button
                    type="button"
                    className="admin-inline-soft"
                    disabled={profileActionState[draft.id] === 'running'}
                    onClick={() => onProfileAction(draft.id, 'mark_finished')}
                  >
                    Finalizar
                  </button>
                </div>
              </div>

              <div className="admin-player-form-grid">
                <label>
                  Player ID
                  <input
                    value={draft.id}
                    onChange={(event) => onUpdatePlayer(index, 'id', event.target.value)}
                  />
                </label>

                <label>
                  Display name
                  <input
                    value={draft.display_name}
                    onChange={(event) => onUpdatePlayer(index, 'display_name', event.target.value)}
                  />
                </label>

                <label>
                  Mode
                  <select
                    value={draft.mode}
                    onChange={(event) => onUpdatePlayer(index, 'mode', event.target.value)}
                  >
                    <option value="solo">solo</option>
                    <option value="team">team</option>
                  </select>
                </label>

                <label>
                  Status
                  <input
                    value={draft.status}
                    onChange={(event) => onUpdatePlayer(index, 'status', event.target.value)}
                  />
                </label>
              </div>

              <div className="admin-player-avatar-tools">
                <div className="admin-player-avatar-preview-row">
                  <label>
                    Color
                    <input
                      type="color"
                      value={/^#[0-9a-fA-F]{6}$/.test(draft.color) ? draft.color : getStablePlayerColor(draft.id || draft.display_name)}
                      onChange={(event) => onUpdatePlayer(index, 'color', event.target.value)}
                    />
                  </label>

                  <label>
                    Iniciales
                    <input
                      value={draft.avatar_initials}
                      maxLength={3}
                      placeholder={getPlayerInitials(draft.display_name || draft.id)}
                      onChange={(event) => onUpdatePlayer(index, 'avatar_initials', event.target.value.toUpperCase().slice(0, 3))}
                    />
                  </label>
                </div>

                <label className="admin-player-avatar-upload">
                  Foto/avatar
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={(event) => void handleAvatarFile(event, index)}
                  />
                  <span>Se comprime en el navegador y se guarda en la configuración runtime, no en el repo.</span>
                </label>

                <label>
                  URL/data URL avatar
                  <input
                    value={draft.avatar_url}
                    placeholder="Al subir imagen aparecerá aquí un data:image/..."
                    onChange={(event) => onUpdatePlayer(index, 'avatar_url', event.target.value)}
                  />
                </label>

                {draft.avatar_url ? (
                  <button
                    type="button"
                    className="admin-inline-soft"
                    onClick={() => onUpdatePlayer(index, 'avatar_url', '')}
                  >
                    Quitar foto
                  </button>
                ) : null}
              </div>

              {draft.mode === 'team' ? (
                <label className="admin-player-members">
                  Team members
                  <input
                    value={draft.members}
                    placeholder="Name 1, Name 2"
                    onChange={(event) => onUpdatePlayer(index, 'members', event.target.value)}
                  />
                </label>
              ) : null}
            </section>
          ))}
        </div>
      )}

      {playerSaveState === 'error' && playerSaveError ? (
        <div className="admin-save-error">
          <strong>Player save failed</strong>
          <span>{playerSaveError}</span>
        </div>
      ) : null}

      <div className="admin-local-actions admin-panel-sticky-actions">
        <button type="button" onClick={onAddPlayer}>
          Add player
        </button>
        <button
          type="button"
          className="admin-cms-side-action--save"
          onClick={onSavePlayers}
          disabled={playerSaveState === 'saving'}
        >
          {playerSaveState === 'saving'
            ? 'Saving players…'
            : playerSaveState === 'saved'
              ? 'Players saved'
              : 'Save players'}
        </button>
      </div>
    </div>
  )
}
