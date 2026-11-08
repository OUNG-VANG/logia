import { lazy, Suspense } from 'react'

// La carte (MapLibre) est lourde : on ne la télécharge qu'au moment de l'afficher.
const HousingMap = lazy(() => import('./HousingMap'))

function LazyHousingMap(props) {
  return (
    <Suspense fallback={<div className="housing-map housing-map-loading" role="status">Chargement de la carte…</div>}>
      <HousingMap {...props} />
    </Suspense>
  )
}

export default LazyHousingMap
