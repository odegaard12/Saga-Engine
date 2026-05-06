import type { PlayerDraft } from '../lib/playerDrafts'

type PlayersPanelProps = {
  playerDrafts: PlayerDraft[]
  playerSaveState: 'idle' | 'saving' | 'saved' | 'error'
  playerSaveError: string | null
  onUpdatePlayer: (index: number, key: keyof PlayerDraft, value: string) => void
  onDeletePlayer: (index: number) => void
  onAddPlayer: () => void
  onSavePlayers: () => void
}

export default function PlayersPanel({
  playerDrafts,
  playerSaveState,
  playerSaveError,
  onUpdatePlayer,
  onDeletePlayer,
  onAddPlayer,
  onSavePlayers,
}: PlayersPanelProps) {
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
                <div className="admin-player-avatar">{index + 1}</div>
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
