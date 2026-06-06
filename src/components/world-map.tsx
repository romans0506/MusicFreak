"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { geoEqualEarth, geoPath } from "d3-geo"
import { feature } from "topojson-client"
import countries from "i18n-iso-countries"
import { motion, AnimatePresence } from "framer-motion"
import { Globe, Users, Clock, Music2, X, Loader2, MapPin, Plus, Minus, Locate } from "lucide-react"
import { cn } from "@/lib/utils"

type CountryData = {
  country: string
  artistId: string
  artistName: string
  artistImage: string | null
  artistMs: number
  countryMs: number
  listeners: number
}

type Detail = {
  topArtists: { artistId: string; name: string; image: string | null; ms: number }[]
  topListeners: { userId: string; username: string | null; avatarUrl: string | null; ms: number }[]
}

const WIDTH = 980
const HEIGHT = 500
const MIN_K = 1
const MAX_K = 10

function formatMinutes(ms: number): string {
  const minutes = Math.round(ms / 60000)
  if (minutes >= 60) return `${Math.floor(minutes / 60).toLocaleString("en")}h ${minutes % 60}m`
  return `${minutes}m`
}

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v))
}

type Item = {
  d: string
  cc: string | null
  name: string
  bbox: { x: number; y: number; w: number; h: number }
}

export default function WorldMap({ userCountry, currentUserId }: { userCountry: string | null; currentUserId: string }) {
  const [geographies, setGeographies] = useState<{ id: string | number; properties: { name?: string } }[]>([])
  const [dataByCc, setDataByCc] = useState<Record<string, CountryData>>({})
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<string | null>(null)
  const [detail, setDetail] = useState<Detail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [hover, setHover] = useState<{ name: string; data?: CountryData } | null>(null)
  const [transform, setTransform] = useState({ k: 1, x: 0, y: 0 })

  const svgRef = useRef<SVGSVGElement | null>(null)
  const dragRef = useRef<{ x: number; y: number; tx: number; ty: number; active: boolean } | null>(null)
  const movedRef = useRef(false)

  useEffect(() => {
    Promise.all([
      fetch("/world-110m.json").then((r) => r.json()),
      fetch("/api/map/countries").then((r) => r.json()).catch(() => ({ countries: [] })),
    ])
      .then(([topo, api]) => {
        const fc = feature(topo, topo.objects.countries) as unknown as {
          features: { id: string | number; properties: { name?: string } }[]
        }
        setGeographies(fc.features)
        const map: Record<string, CountryData> = {}
        for (const c of api.countries ?? []) map[c.country] = c
        setDataByCc(map)
      })
      .finally(() => setLoading(false))
  }, [])

  // Zoom to cursor on wheel (native listener so we can preventDefault).
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = svg.getBoundingClientRect()
      const px = ((e.clientX - rect.left) / rect.width) * WIDTH
      const py = ((e.clientY - rect.top) / rect.height) * HEIGHT
      setTransform((t) => {
        const factor = e.deltaY < 0 ? 1.18 : 1 / 1.18
        const k = clamp(t.k * factor, MIN_K, MAX_K)
        if (k === t.k) return t
        return { k, x: px - (px - t.x) * (k / t.k), y: py - (py - t.y) * (k / t.k) }
      })
    }
    svg.addEventListener("wheel", onWheel, { passive: false })
    return () => svg.removeEventListener("wheel", onWheel)
  }, [loading])

  const items: Item[] = useMemo(() => {
    if (geographies.length === 0) return []
    const projection = geoEqualEarth().fitSize([WIDTH, HEIGHT], { type: "Sphere" } as never)
    const pathGen = geoPath(projection)
    return geographies.map((geo) => {
      const d = pathGen(geo as never) || ""
      const cc = countries.numericToAlpha2(String(geo.id).padStart(3, "0")) || null
      const [[x0, y0], [x1, y1]] = pathGen.bounds(geo as never)
      return { d, cc, name: geo.properties?.name ?? cc ?? "", bbox: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } }
    })
  }, [geographies])

  const dataItems = items.filter((it) => it.cc && dataByCc[it.cc])
  const nameByCc = useMemo(() => {
    const m: Record<string, string> = {}
    for (const it of items) if (it.cc) m[it.cc] = it.name
    return m
  }, [items])

  function selectCountry(cc: string) {
    if (movedRef.current || !dataByCc[cc]) return
    setSelected(cc)
    setDetail(null)
    setDetailLoading(true)
    fetch(`/api/map/country?cc=${cc}`)
      .then((r) => r.json())
      .then((d) => setDetail({ topArtists: d.topArtists ?? [], topListeners: d.topListeners ?? [] }))
      .catch(() => setDetail({ topArtists: [], topListeners: [] }))
      .finally(() => setDetailLoading(false))
  }

  function onPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    // NB: don't setPointerCapture here — capturing on the <svg> swallows the
    // `click` event on child country paths, so the detail modal never opens.
    dragRef.current = { x: e.clientX, y: e.clientY, tx: transform.x, ty: transform.y, active: true }
    movedRef.current = false
  }
  function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    const d = dragRef.current
    if (!d?.active || !svgRef.current) return
    const rect = svgRef.current.getBoundingClientRect()
    if (Math.abs(e.clientX - d.x) > 4 || Math.abs(e.clientY - d.y) > 4) movedRef.current = true
    const dx = ((e.clientX - d.x) / rect.width) * WIDTH
    const dy = ((e.clientY - d.y) / rect.height) * HEIGHT
    setTransform((t) => ({ ...t, x: d.tx + dx, y: d.ty + dy }))
  }
  function onPointerUp() {
    if (dragRef.current) dragRef.current.active = false
  }

  function zoomBy(factor: number) {
    const px = WIDTH / 2
    const py = HEIGHT / 2
    setTransform((t) => {
      const k = clamp(t.k * factor, MIN_K, MAX_K)
      return { k, x: px - (px - t.x) * (k / t.k), y: py - (py - t.y) * (k / t.k) }
    })
  }

  const myData = userCountry ? dataByCc[userCountry] : null
  const selectedData = selected ? dataByCc[selected] : null

  if (loading) {
    return (
      <div className="flex flex-col items-center gap-4 py-32">
        <Loader2 className="size-8 animate-spin text-primary" />
        <p className="text-muted-foreground">Loading the world…</p>
      </div>
    )
  }

  return (
    <div>
      {/* Your country banner */}
      <div className="mb-6 flex items-center gap-4 rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/15 to-transparent p-5">
        <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary/20">
          <MapPin className="size-6 text-primary" />
        </div>
        <div className="min-w-0">
          {userCountry ? (
            myData ? (
              <p className="text-sm">
                You&apos;re in <span className="font-semibold">{nameByCc[userCountry] ?? userCountry}</span> — the top
                artist here is <span className="font-semibold text-primary">{myData.artistName}</span>.
              </p>
            ) : (
              <p className="text-sm">
                You&apos;re in <span className="font-semibold">{nameByCc[userCountry] ?? userCountry}</span>. Listen more
                to put an artist on the map here!
              </p>
            )
          ) : (
            <p className="text-sm text-muted-foreground">Set your country in your profile to appear on the map.</p>
          )}
        </div>
      </div>

      {/* Hover label */}
      <div className="mb-2 h-5 text-sm text-muted-foreground">
        {hover && (
          <span>
            <span className="font-medium text-foreground">{hover.name}</span>
            {hover.data && <> — {hover.data.artistName} · {hover.data.listeners} listener{hover.data.listeners === 1 ? "" : "s"}</>}
          </span>
        )}
      </div>

      {/* Map */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="w-full touch-none select-none"
          style={{ cursor: dragRef.current?.active ? "grabbing" : "grab" }}
          role="img"
          aria-label="World listening map"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
        >
          <defs>
            {dataItems
              .filter((it) => dataByCc[it.cc!].artistImage)
              .map((it) => (
                <clipPath key={`clip-${it.cc}`} id={`clip-${it.cc}`}>
                  <path d={it.d} />
                </clipPath>
              ))}
          </defs>

          <g transform={`translate(${transform.x},${transform.y}) scale(${transform.k})`}>
            {/* Base fills */}
            {items.map((it, i) => (
              <path key={`base-${i}`} d={it.d} className="fill-muted/40" style={{ pointerEvents: "none" }} />
            ))}

            {/* Data-country fills: artist photo, or tint as fallback */}
            {dataItems.map((it) => {
              const data = dataByCc[it.cc!]
              const dim = selected && selected !== it.cc ? 0.5 : 1
              if (data.artistImage) {
                return (
                  <image
                    key={`img-${it.cc}`}
                    href={data.artistImage}
                    x={it.bbox.x}
                    y={it.bbox.y}
                    width={it.bbox.w}
                    height={it.bbox.h}
                    preserveAspectRatio="xMidYMid slice"
                    clipPath={`url(#clip-${it.cc})`}
                    opacity={dim}
                    style={{ pointerEvents: "none" }}
                  />
                )
              }
              return (
                <path key={`fill-${it.cc}`} d={it.d} className="fill-primary/40" opacity={dim} style={{ pointerEvents: "none" }} />
              )
            })}

            {/* Interactive borders */}
            {items.map((it, i) => {
              const hasData = it.cc && !!dataByCc[it.cc]
              const isMine = it.cc && it.cc === userCountry
              const isSelected = it.cc && it.cc === selected
              return (
                <path
                  key={`line-${i}`}
                  d={it.d}
                  fill="transparent"
                  vectorEffect="non-scaling-stroke"
                  className={cn(
                    hasData ? "cursor-pointer" : "cursor-grab",
                    isSelected ? "stroke-primary" : isMine ? "stroke-primary/70" : "stroke-border hover:stroke-foreground/40"
                  )}
                  strokeWidth={isSelected || isMine ? 1.6 : 0.5}
                  onMouseEnter={() => it.cc && setHover({ name: it.name, data: dataByCc[it.cc] })}
                  onMouseLeave={() => setHover(null)}
                  onClick={() => it.cc && selectCountry(it.cc)}
                />
              )
            })}
          </g>
        </svg>

        {/* Zoom controls */}
        <div className="absolute bottom-3 right-3 flex flex-col gap-1.5">
          <button
            onClick={() => zoomBy(1.4)}
            className="flex size-9 items-center justify-center rounded-lg border border-border bg-background/80 backdrop-blur transition-colors hover:bg-muted"
            aria-label="Zoom in"
          >
            <Plus className="size-4" />
          </button>
          <button
            onClick={() => zoomBy(1 / 1.4)}
            className="flex size-9 items-center justify-center rounded-lg border border-border bg-background/80 backdrop-blur transition-colors hover:bg-muted"
            aria-label="Zoom out"
          >
            <Minus className="size-4" />
          </button>
          <button
            onClick={() => setTransform({ k: 1, x: 0, y: 0 })}
            className="flex size-9 items-center justify-center rounded-lg border border-border bg-background/80 backdrop-blur transition-colors hover:bg-muted"
            aria-label="Reset view"
          >
            <Locate className="size-4" />
          </button>
        </div>
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        Each country is painted with its #1 artist by minutes listened. Scroll to zoom, drag to pan, click a highlighted country for details.
      </p>

      {/* Detail modal */}
      <AnimatePresence>
        {selected && selectedData && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setSelected(null)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.2 }}
              className="relative z-10 max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-card shadow-2xl"
            >
              {/* Header */}
              <div className="flex items-center gap-4 border-b border-border p-5">
                {selectedData.artistImage ? (
                  <img src={selectedData.artistImage} alt="" className="size-16 rounded-xl object-cover shadow" />
                ) : (
                  <div className="flex size-16 items-center justify-center rounded-xl bg-muted">
                    <Music2 className="size-6 text-muted-foreground/40" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Globe className="size-4 text-primary" />
                    <h2 className="text-lg font-bold">{nameByCc[selected] ?? selected}</h2>
                  </div>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    #1 <span className="font-medium text-foreground">{selectedData.artistName}</span>
                  </p>
                </div>
                <button
                  onClick={() => setSelected(null)}
                  className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <X className="size-4" />
                </button>
              </div>

              {/* Summary */}
              <div className="grid grid-cols-2 gap-4 p-5">
                <div className="flex items-center gap-3 rounded-xl border border-border bg-background/40 p-4">
                  <Clock className="size-5 text-primary" />
                  <div>
                    <p className="text-lg font-bold">{formatMinutes(selectedData.countryMs)}</p>
                    <p className="text-xs text-muted-foreground">Listened here</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 rounded-xl border border-border bg-background/40 p-4">
                  <Users className="size-5 text-primary" />
                  <div>
                    <p className="text-lg font-bold">{selectedData.listeners.toLocaleString("en")}</p>
                    <p className="text-xs text-muted-foreground">Listener{selectedData.listeners === 1 ? "" : "s"}</p>
                  </div>
                </div>
              </div>

              {detailLoading ? (
                <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" /> <span className="text-sm">Loading…</span>
                </div>
              ) : (
                <div className="grid gap-6 p-5 pt-0 sm:grid-cols-2">
                  {/* Top artists */}
                  <div>
                    <h3 className="mb-3 text-sm font-semibold">Top artists</h3>
                    <div className="space-y-2">
                      {(detail?.topArtists ?? []).slice(0, 5).map((a, i) => (
                        <div key={a.artistId} className="flex items-center gap-3">
                          <span className="w-4 shrink-0 text-xs text-muted-foreground">{i + 1}</span>
                          {a.image ? (
                            <img src={a.image} alt="" className="size-9 shrink-0 rounded-full object-cover" />
                          ) : (
                            <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted">
                              <Music2 className="size-4 text-muted-foreground/40" />
                            </div>
                          )}
                          <span className="min-w-0 flex-1 truncate text-sm font-medium">{a.name}</span>
                          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{formatMinutes(a.ms)}</span>
                        </div>
                      ))}
                      {(detail?.topArtists?.length ?? 0) === 0 && <p className="text-sm text-muted-foreground">No data yet.</p>}
                    </div>
                  </div>

                  {/* Top listeners */}
                  <div>
                    <h3 className="mb-3 text-sm font-semibold">Top listeners</h3>
                    <div className="space-y-2">
                      {(detail?.topListeners ?? []).slice(0, 5).map((l, i) => {
                        const isMe = l.userId === currentUserId
                        const name = l.username ?? "Anonymous"
                        return (
                          <div key={l.userId} className={cn("flex items-center gap-3 rounded-lg px-2 py-1", isMe && "bg-primary/10")}>
                            <span className="w-4 shrink-0 text-xs text-muted-foreground">{i + 1}</span>
                            {l.avatarUrl ? (
                              <img src={l.avatarUrl} alt="" className="size-9 shrink-0 rounded-full object-cover" />
                            ) : (
                              <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                                {name[0]?.toUpperCase()}
                              </div>
                            )}
                            <span className="min-w-0 flex-1 truncate text-sm font-medium">
                              {name}
                              {isMe && <span className="ml-1 text-xs text-primary">(you)</span>}
                            </span>
                            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{formatMinutes(l.ms)}</span>
                          </div>
                        )
                      })}
                      {(detail?.topListeners?.length ?? 0) === 0 && <p className="text-sm text-muted-foreground">No data yet.</p>}
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
