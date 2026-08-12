import { useState, useEffect } from 'react'
import { api } from '../api/client'
import type { Photo } from '../types'

export function Cameras() {
  const [interiorLatest, setInteriorLatest] = useState<Photo | null>(null)
  const [exteriorLatest, setExteriorLatest] = useState<Photo | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.allSettled([
      api.camera.latest('interior'),
      api.camera.latest('exterior'),
    ]).then(([int, ext]) => {
      if (int.status === 'fulfilled') setInteriorLatest(int.value)
      if (ext.status === 'fulfilled') setExteriorLatest(ext.value)
      setLoading(false)
    })
  }, [])

  return (
    <div className="min-h-screen bg-panel-bg text-zinc-100 p-4 max-w-2xl mx-auto">
      <header className="flex items-center gap-3 mb-6 pt-2">
        <a href="/" className="text-zinc-600 font-mono hover:text-zinc-400">←</a>
        <div>
          <h1 className="text-lg font-mono font-bold">Cameras</h1>
          <p className="text-xs font-mono text-zinc-600">30 min interval · 24hr rolling retention</p>
        </div>
      </header>

      {loading ? (
        <div className="text-xs font-mono text-zinc-600 animate-pulse">Loading...</div>
      ) : (
        <div className="space-y-4">
          <CameraPane label="Interior" photo={interiorLatest} />
          <CameraPane label="Exterior" photo={exteriorLatest} />
        </div>
      )}
    </div>
  )
}

function CameraPane({ label, photo }: { label: string; photo: Photo | null }) {
  return (
    <div className="bg-panel-surface border border-panel-border rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-panel-border">
        <span className="text-xs font-mono text-zinc-500 uppercase tracking-widest">{label}</span>
        {photo && (
          <span className="text-xs font-mono text-zinc-600">{photo.timestamp}</span>
        )}
      </div>
      {photo ? (
        <img
          src={photo.url}
          alt={`${label} camera`}
          className="w-full object-cover"
          style={{ maxHeight: '280px' }}
        />
      ) : (
        <div className="flex items-center justify-center h-40 text-xs font-mono text-zinc-600">
          No photo available
        </div>
      )}
    </div>
  )
}
