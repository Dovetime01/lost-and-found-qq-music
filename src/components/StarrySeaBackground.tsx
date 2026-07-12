'use client'

/** Full-bleed atmosphere for pages 1–3. Crops via object-cover; never stretches. */
export default function StarrySeaBackground() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/image/background.png"
        alt=""
        draggable={false}
        className="absolute inset-0 h-full w-full object-cover object-center"
      />
      {/* Soft readabilty veil so UI stays legible on bright water reflections */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, rgba(6,8,14,0.35) 0%, rgba(6,8,14,0.18) 42%, rgba(6,8,14,0.45) 100%)',
        }}
      />
    </div>
  )
}
