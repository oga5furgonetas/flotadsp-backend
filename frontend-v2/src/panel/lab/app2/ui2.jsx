/* FlotaDSP 2.0 · piezas compartidas.
   Un sistema pequeño y repetido en toda la app: si cada pantalla inventa su
   propia tarjeta, el producto parece hecho por cinco personas distintas. */
import { useEffect } from 'react'
import { X, Search } from 'lucide-react'

export const Etq = ({ T, children }) => (
  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.2em', textTransform: 'uppercase', color: T.tenue }}>{children}</div>
)

export const Titulo = ({ T, children, sub }) => (
  <>
    <h1 style={{ margin: '12px 0 0', fontSize: 'clamp(25px,3.6vw,36px)', lineHeight: 1.1, letterSpacing: '-.035em', fontWeight: 600 }}>{children}</h1>
    {sub && <p style={{ margin: '14px 0 0', fontSize: 15.5, lineHeight: 1.6, color: T.suave, maxWidth: 580, fontWeight: 300 }}>{sub}</p>}
  </>
)

export const Nota = ({ T, children }) => (
  <p style={{ margin: '16px 0 0', fontSize: 12.5, lineHeight: 1.7, color: T.tenue }}>{children}</p>
)

export const Chip = ({ T, tono, children }) => (
  <span style={{
    display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 99,
    background: (tono || T.tenue) + '1e', color: tono || T.tenue, fontSize: 10.5, fontWeight: 700,
    letterSpacing: '.01em', whiteSpace: 'nowrap',
  }}>{children}</span>
)

/* Fila de lista. Todas las listas de la app usan ésta: matrícula/nombre a la
   izquierda, señales en medio, lo cuantitativo a la derecha alineado. */
export const Fila = ({ T, onClick, izq, sub, medio, der, derTono, pie, activa }) => (
  <button onClick={onClick} disabled={!onClick} style={{
    display: 'flex', width: '100%', flexWrap: 'wrap', alignItems: 'center', gap: 12,
    padding: '13px 10px', margin: 0, textAlign: 'left', cursor: onClick ? 'pointer' : 'default',
    background: activa ? T.linea : 'transparent', border: 'none',
    borderTop: `1px solid ${T.lineaSuave}`, color: T.tinta,
  }}>
    <div style={{ flex: '1 1 165px', minWidth: 0 }}>
      <div style={{ fontSize: 14.5, fontWeight: 600, letterSpacing: '-.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{izq}</div>
      {sub && <div style={{ marginTop: 2, fontSize: 11.5, color: T.tenue, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</div>}
    </div>
    {medio && <div style={{ flex: '1 1 150px', display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>{medio}</div>}
    {der !== undefined && (
      <div style={{ minWidth: 88, textAlign: 'right', fontSize: 14, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: derTono || T.tinta }}>{der}</div>
    )}
    {pie && <div style={{ flexBasis: '100%', fontSize: 11.5, color: T.tenue }}>{pie}</div>}
  </button>
)

/* Panel de detalle. La profundidad se abre encima, no navega: no se pierde la
   lista ni dónde estabas. Es el patrón que sustituye a media docena de páginas. */
export function Panel({ T, titulo, sub, onCerrar, children }) {
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onCerrar() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onCerrar])

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', justifyContent: 'flex-end' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.42)' }} onClick={onCerrar} />
      <aside className="animate-pop" style={{
        position: 'relative', height: '100%', width: '100%', maxWidth: 470, overflowY: 'auto',
        background: T.papel, color: T.tinta, borderLeft: `1px solid ${T.linea}`,
      }}>
        <div style={{ position: 'sticky', top: 0, background: T.papel, borderBottom: `1px solid ${T.lineaSuave}`, padding: '18px 22px 14px', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: 21, fontWeight: 600, letterSpacing: '-.02em' }}>{titulo}</h2>
            {sub && <div style={{ marginTop: 3, fontSize: 12.5, color: T.tenue }}>{sub}</div>}
          </div>
          <button onClick={onCerrar} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.suave, padding: 2 }}>
            <X size={18} />
          </button>
        </div>
        <div style={{ padding: '4px 22px 70px' }}>{children}</div>
      </aside>
    </div>
  )
}

export const Bloque = ({ T, titulo, children, accion }) => (
  <section style={{ padding: '18px 0', borderBottom: `1px solid ${T.lineaSuave}` }}>
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
      <div style={{ flex: 1 }}><Etq T={T}>{titulo}</Etq></div>
      {accion}
    </div>
    <div style={{ marginTop: 10 }}>{children}</div>
  </section>
)

export const Dato = ({ T, k, v, tono, pie }) => (
  <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '4px 0' }}>
    <span style={{ fontSize: 12.5, color: T.tenue, flex: '1 1 auto' }}>{k}</span>
    <span style={{ fontSize: 13.5, fontWeight: 600, color: tono || T.tinta, textAlign: 'right' }}>{v}</span>
    {pie && <span style={{ flexBasis: '100%', fontSize: 11.5, color: T.tenue }}>{pie}</span>}
  </div>
)

export const Buscador = ({ T, valor, onChange, placeholder }) => (
  <div style={{ position: 'relative', flex: '1 1 180px', minWidth: 150 }}>
    <Search size={14} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: T.tenue, pointerEvents: 'none' }} />
    <input value={valor} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
      style={{
        width: '100%', padding: '8px 10px 8px 32px', borderRadius: 9, fontSize: 13.5,
        border: `1px solid ${T.linea}`, background: 'transparent', color: T.tinta,
      }} />
  </div>
)

export const Filtros = ({ T, valor, onChange, opciones }) => (
  <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
    {opciones.map(([id, txt, n]) => (
      <button key={id} onClick={() => onChange(id)} style={{
        padding: '7px 11px', borderRadius: 8, cursor: 'pointer', fontSize: 12.5,
        fontWeight: valor === id ? 600 : 500, border: 'none',
        background: valor === id ? T.linea : 'transparent',
        color: valor === id ? T.tinta : T.tenue,
      }}>
        {txt}{n !== undefined && <span style={{ opacity: .55, marginLeft: 5 }}>{n}</span>}
      </button>
    ))}
  </div>
)

export const Vacio = ({ T, children }) => (
  <p style={{ padding: '40px 0', textAlign: 'center', fontSize: 13.5, color: T.tenue }}>{children}</p>
)

export const Barra = ({ T, pct, tono }) => (
  <div style={{ height: 4, background: T.lineaSuave, borderRadius: 99, overflow: 'hidden' }}>
    <div style={{ width: `${Math.max(0, Math.min(100, pct))}%`, height: '100%', background: tono || T.bien }} />
  </div>
)
