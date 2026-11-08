import { genderLabels, guarantorLabels, situationLabels } from './lib/profile'
import './ProfileFields.css'

// Champs du profil, partagés entre l'inscription et la page « Mon profil ».
// `value` a la forme { firstName, lastName, gender, tenantProfile: { ... } }.
function ProfileFields({ role, value, onChange, idPrefix = 'profile' }) {
  const tenant = value.tenantProfile || {}
  const id = (name) => `${idPrefix}-${name}`

  function update(event) {
    onChange({ ...value, [event.target.name]: event.target.value })
  }

  function updateTenant(event) {
    onChange({ ...value, tenantProfile: { ...tenant, [event.target.name]: event.target.value } })
  }

  return (
    <div className="profile-fields">
      <fieldset>
        <legend>Qui es-tu ?</legend>
        <div className="profile-row">
          <div>
            <label htmlFor={id('first-name')}>Prénom</label>
            <input id={id('first-name')} name="firstName" value={value.firstName} onChange={update} autoComplete="given-name" maxLength={60} required />
          </div>
          <div>
            <label htmlFor={id('last-name')}>Nom</label>
            <input id={id('last-name')} name="lastName" value={value.lastName} onChange={update} autoComplete="family-name" maxLength={60} required />
          </div>
        </div>
        <label htmlFor={id('gender')}>Civilité</label>
        <select id={id('gender')} name="gender" value={value.gender} onChange={update} required>
          <option value="" disabled>Choisir…</option>
          {Object.entries(genderLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
      </fieldset>

      {role === 'tenant' && (
        <>
          <fieldset>
            <legend>Ta situation</legend>
            <div className="profile-row">
              <div>
                <label htmlFor={id('birth-date')}>Date de naissance</label>
                <input id={id('birth-date')} name="birthDate" type="date" value={tenant.birthDate || ''} onChange={updateTenant} autoComplete="bday" required />
              </div>
              <div>
                <label htmlFor={id('situation')}>Statut</label>
                <select id={id('situation')} name="situation" value={tenant.situation || ''} onChange={updateTenant} required>
                  <option value="" disabled>Choisir…</option>
                  {Object.entries(situationLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                </select>
              </div>
            </div>
            <label htmlFor={id('occupation')}>Précision <span className="optional">facultatif</span></label>
            <input id={id('occupation')} name="occupationDetail" value={tenant.occupationDetail || ''} onChange={updateTenant} maxLength={120} placeholder="Ex. Master 1 à l’université de Lyon, infirmière au CHU…" />
            <div className="profile-row">
              <div>
                <label htmlFor={id('income')}>Revenus nets / mois <span className="optional">facultatif</span></label>
                <input id={id('income')} name="monthlyIncome" type="number" min="0" step="1" value={tenant.monthlyIncome ?? ''} onChange={updateTenant} placeholder="€" />
              </div>
              <div>
                <label htmlFor={id('guarantor')}>Garant <span className="optional">facultatif</span></label>
                <select id={id('guarantor')} name="guarantorType" value={tenant.guarantorType || ''} onChange={updateTenant}>
                  <option value="">Non précisé</option>
                  {Object.entries(guarantorLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                </select>
              </div>
            </div>
          </fieldset>

          <fieldset>
            <legend>Ta recherche <span className="optional">facultatif</span></legend>
            <div className="profile-row">
              <div>
                <label htmlFor={id('city')}>Ville recherchée</label>
                <input id={id('city')} name="desiredCity" value={tenant.desiredCity || ''} onChange={updateTenant} maxLength={80} placeholder="Ex. Lyon" />
              </div>
              <div>
                <label htmlFor={id('budget')}>Budget max / mois</label>
                <input id={id('budget')} name="maxBudget" type="number" min="0" step="1" value={tenant.maxBudget ?? ''} onChange={updateTenant} placeholder="€" />
              </div>
            </div>
            <div className="profile-row">
              <div>
                <label htmlFor={id('move-in')}>Emménagement souhaité</label>
                <input id={id('move-in')} name="desiredMoveIn" type="date" value={tenant.desiredMoveIn || ''} onChange={updateTenant} />
              </div>
              <div>
                <label htmlFor={id('household')}>Nombre d’occupants</label>
                <input id={id('household')} name="householdSize" type="number" min="1" max="20" step="1" value={tenant.householdSize ?? ''} onChange={updateTenant} placeholder="1" />
              </div>
            </div>
          </fieldset>
          <p className="profile-privacy">Ta date de naissance et ta civilité ne sont jamais montrées aux propriétaires : la loi interdit de choisir un locataire selon son âge ou son sexe.</p>
        </>
      )}
    </div>
  )
}

export default ProfileFields
