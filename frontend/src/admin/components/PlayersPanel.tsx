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
    <div className="admin-cms-local-panel admin-players-panel">
      <strong>Players</strong>
      <span>Edit players and teams. Save players to persist.</span>

      {playerDrafts.length === 0 ? (
        <div className="admin-empty-panel">
          No players yet. Add one to start.
        </div>
      ) : (
        <div className="admin-player-editor-list">
          {playerDrafts.map((draft, index) => (
            <div className="admin-player-editor-card" key={`${draft.id}-${index}`}>
              <div className="admin-player-editor-head">
                <strong>{draft.display_name || draft.id || `Player ${index + 1}`}</strong>
                <button type="button" onClick={() => onDeletePlayer(index)}>
                  Delete
                </button>
              </div>

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

              <div className="admin-player-editor-grid">
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
                <label>
                  Team members
                  <input
                    value={draft.members}
                    placeholder="Name 1, Name 2"
                    onChange={(event) => onUpdatePlayer(index, 'members', event.target.value)}
                  />
                </label>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {playerSaveState === 'error' && playerSaveError ? (
        <div className="admin-save-error">
          <strong>Player save failed</strong>
          <span>{playerSaveError}</span>
        </div>
      ) : null}

      <div className="admin-local-actions">
        <button type="button" onClick={onAddPlayer}>
          Add player
        </button>
        <button
          type="button"
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
