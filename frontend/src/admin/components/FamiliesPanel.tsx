import { familyCards } from '../lib/familyConfigs'

export default function FamiliesPanel() {
  return (
    <div className="admin-cms-local-panel">
      <strong>Families / labels</strong>
      <span>Available family-native runtime labels.</span>

      <div className="admin-local-list">
        {familyCards.map((family) => (
          <div key={family.id} className="admin-local-row static">
            <span>{family.icon} {family.title}</span>
            <small>{family.id}</small>
          </div>
        ))}
      </div>
    </div>
  )
}
