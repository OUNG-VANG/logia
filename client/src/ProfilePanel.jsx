import { useState } from 'react'
import api from './lib/api'
import { profileFormFromUser, profilePayload } from './lib/profile'
import ProfileFields from './ProfileFields'

// Formulaire « Mon profil » affiché dans le tableau de bord.
function ProfilePanel({ user, onSaved, onClose }) {
  const [profile, setProfile] = useState(() => profileFormFromUser(user))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  async function save(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const { data } = await api.patch('/auth/me', profilePayload(profile, user.role))
      onSaved(data.user)
      setMessage('Ton profil est enregistré.')
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Impossible d’enregistrer ton profil.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="listing-form-panel profile-panel" onSubmit={save} aria-labelledby="profile-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">TON COMPTE</p>
          <h2 id="profile-title">Mon profil</h2>
        </div>
        <button className="text-button" type="button" onClick={onClose}>Fermer</button>
      </div>
      <p className="profile-email">Adresse e-mail : <strong>{user.email}</strong></p>
      <ProfileFields role={user.role} value={profile} onChange={setProfile} idPrefix="edit-profile" />
      {error && <p className="form-error" role="alert">{error}</p>}
      {message && <p className="form-success" role="status">{message}</p>}
      <button className="submit-button" type="submit" disabled={saving}>
        {saving ? 'Enregistrement…' : 'Enregistrer mon profil'} {!saving && <span aria-hidden="true">→</span>}
      </button>
    </form>
  )
}

export default ProfilePanel
