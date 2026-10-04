import { useImports } from '../hooks/useImports'

export function HomePage() {
  const { data, isPending, isError, error } = useImports()

  return (
    <main style={{ maxWidth: 800, margin: '0 auto', padding: '2rem 1rem' }}>
      <h1>Datahub Simplifié</h1>

      {isPending && <p>Chargement…</p>}
      {isError && <p role="alert">Erreur : {error.message}</p>}
      {data && data.length === 0 && <p>Aucun import pour le moment.</p>}
      {data && data.length > 0 && (
        <ul>
          {data.map((item) => (
            <li key={item.id}>
              {item.name} ({item.row_count} lignes)
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}