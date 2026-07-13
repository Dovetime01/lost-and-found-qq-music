'use client'

import { useEffect, useRef } from 'react'
import * as THREE from 'three'

const DEEP = new THREE.Color('#05070c')
const GOLD = new THREE.Color('#E8C078')
const TEAL = new THREE.Color('#7ECFD3')

/** Full-screen ambient sky — no photo, extends the mood around the phone. */
function createAmbientSky() {
  const geometry = new THREE.PlaneGeometry(2, 2)
  const material = new THREE.ShaderMaterial({
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uMouse: { value: new THREE.Vector2(0, 0) },
      uResolution: { value: new THREE.Vector2(1, 1) },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec2 uMouse;
      uniform vec2 uResolution;
      varying vec2 vUv;

      float star(vec2 uv, vec2 pos, float size) {
        float d = length(uv - pos);
        return smoothstep(size, 0.0, d);
      }

      void main() {
        vec2 uv = vUv;
        vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
        vec2 p = (uv - 0.5) * aspect;
        p.x += uMouse.x * 0.012;
        p.y += uMouse.y * 0.008;

        vec3 col = vec3(0.02, 0.028, 0.05);

        // Upper sky lift
        col += vec3(0.04, 0.035, 0.02) * smoothstep(0.85, 0.2, uv.y);

        // Central golden nebula column (matches photo mood, not the photo itself)
        float column = exp(-pow(p.x * 2.6, 2.0)) * smoothstep(0.15, 0.72, uv.y);
        col += vec3(0.55, 0.38, 0.12) * column * 0.09;

        // Horizon warmth
        float horizon = exp(-pow((uv.y - 0.38) * 9.0, 2.0));
        col += vec3(0.72, 0.52, 0.18) * horizon * (0.06 + 0.02 * sin(uTime * 0.3));

        // Bottom falls to pure dark (phone carries the water imagery)
        col *= smoothstep(0.0, 0.22, uv.y) * 0.55 + 0.45;

        // Tiny static-like stars in shader (very sparse, large viewport only)
        float s = 0.0;
        for (float i = 0.0; i < 6.0; i += 1.0) {
          vec2 sp = vec2(
            0.5 + sin(i * 2.17 + 1.3) * (0.22 + i * 0.03),
            0.55 + cos(i * 1.91) * 0.18 + i * 0.04
          );
          float tw = 0.6 + 0.4 * sin(uTime * 0.5 + i * 1.7);
          s += star(uv, sp, 0.0018 + i * 0.0004) * tw;
        }
        col += vec3(0.95, 0.78, 0.45) * s * column * 1.4;
        col += vec3(0.45, 0.82, 0.85) * s * 0.15;

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  })

  const mesh = new THREE.Mesh(geometry, material)
  mesh.frustumCulled = false
  mesh.renderOrder = -1
  return mesh
}

function createFloatingStars(count: number) {
  const positions = new Float32Array(count * 3)
  const colors = new Float32Array(count * 3)
  const sizes = new Float32Array(count)
  const seeds = new Float32Array(count)

  for (let i = 0; i < count; i += 1) {
    const i3 = i * 3
    const column = Math.pow(Math.random(), 0.65)
    positions[i3] = (Math.random() - 0.5) * 16 * (0.4 + column)
    positions[i3 + 1] = (Math.random() - 0.5) * 10 + 2.5
    positions[i3 + 2] = -4 - Math.random() * 8

    const warm = Math.random() > 0.2
    const color = warm ? GOLD : TEAL
    const brightness = 0.25 + Math.random() * 0.55
    colors[i3] = color.r * brightness
    colors[i3 + 1] = color.g * brightness
    colors[i3 + 2] = color.b * brightness
    sizes[i] = warm && Math.random() > 0.94 ? 2.2 + Math.random() * 1.5 : 0.5 + Math.random() * 1.2
    seeds[i] = Math.random() * Math.PI * 2
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1))
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1))

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uPixelRatio: { value: 1 },
      uTime: { value: 0 },
    },
    vertexShader: `
      attribute float aSize;
      attribute float aSeed;
      attribute vec3 color;
      varying vec3 vColor;
      varying float vAlpha;
      uniform float uPixelRatio;
      uniform float uTime;
      void main() {
        vColor = color;
        vec3 pos = position;
        pos.x += sin(uTime * 0.08 + aSeed) * 0.15;
        pos.y += cos(uTime * 0.06 + aSeed * 1.4) * 0.1;
        vec4 mv = modelViewMatrix * vec4(pos, 1.0);
        float tw = 0.7 + 0.3 * sin(uTime * 0.45 + aSeed);
        vAlpha = tw;
        gl_PointSize = aSize * uPixelRatio * (90.0 / -mv.z) * tw;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        vec2 uv = gl_PointCoord - 0.5;
        float d = length(uv);
        float alpha = smoothstep(0.5, 0.0, d);
        alpha *= alpha * vAlpha * 0.75;
        gl_FragColor = vec4(vColor, alpha);
      }
    `,
  })

  return new THREE.Points(geometry, material)
}

export default function StarrySeaBackdrop() {
  const mountRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const isMobile = window.matchMedia('(max-width: 768px)').matches
    const starCount = reduceMotion ? 0 : isMobile ? 120 : 280

    const renderer = new THREE.WebGLRenderer({
      antialias: false,
      alpha: false,
      powerPreference: 'high-performance',
    })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1.25 : 1.5))
    renderer.setSize(mount.clientWidth, mount.clientHeight)
    renderer.setClearColor(DEEP, 1)
    renderer.autoClear = false
    mount.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(
      45,
      mount.clientWidth / Math.max(mount.clientHeight, 1),
      0.1,
      50,
    )
    camera.position.z = 5

    const sky = createAmbientSky()
    const skyMat = sky.material as THREE.ShaderMaterial
    scene.add(sky)

    let stars: THREE.Points | null = null
    let starMat: THREE.ShaderMaterial | null = null
    if (starCount > 0) {
      stars = createFloatingStars(starCount)
      starMat = stars.material as THREE.ShaderMaterial
      starMat.uniforms.uPixelRatio.value = renderer.getPixelRatio()
      scene.add(stars)
    }

    const targetMouse = { x: 0, y: 0 }
    const smoothMouse = { x: 0, y: 0 }

    const onPointerMove = (event: PointerEvent) => {
      if (reduceMotion) return
      const nx = (event.clientX / window.innerWidth) * 2 - 1
      const ny = (event.clientY / window.innerHeight) * 2 - 1
      targetMouse.x = THREE.MathUtils.clamp(nx, -1, 1) * 0.18
      targetMouse.y = THREE.MathUtils.clamp(ny, -1, 1) * 0.1
    }

    const onResize = () => {
      const w = mount.clientWidth
      const h = Math.max(mount.clientHeight, 1)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
      skyMat.uniforms.uResolution.value.set(w, h)
      if (starMat) starMat.uniforms.uPixelRatio.value = renderer.getPixelRatio()
    }
    onResize()

    let visible = !document.hidden
    const onVisibility = () => {
      visible = !document.hidden
    }

    window.addEventListener('pointermove', onPointerMove, { passive: true })
    window.addEventListener('resize', onResize)
    document.addEventListener('visibilitychange', onVisibility)

    let frame = 0
    const timer = new THREE.Timer()
    timer.connect(document)

    const tick = (timestamp: number) => {
      frame = window.requestAnimationFrame(tick)
      timer.update(timestamp)
      if (!visible) return

      const t = timer.getElapsed()
      const ease = reduceMotion ? 1 : 0.04
      smoothMouse.x += (targetMouse.x - smoothMouse.x) * ease
      smoothMouse.y += (targetMouse.y - smoothMouse.y) * ease

      camera.position.x = smoothMouse.x * 0.25
      camera.position.y = smoothMouse.y * 0.15
      camera.lookAt(smoothMouse.x * 0.3, smoothMouse.y * 0.2, 0)

      skyMat.uniforms.uTime.value = t
      skyMat.uniforms.uMouse.value.set(smoothMouse.x, smoothMouse.y)
      if (starMat) starMat.uniforms.uTime.value = t

      renderer.clear()
      renderer.render(scene, camera)
    }

    tick(performance.now())

    return () => {
      window.cancelAnimationFrame(frame)
      timer.dispose()
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('resize', onResize)
      document.removeEventListener('visibilitychange', onVisibility)
      geometryDispose(sky)
      if (stars) geometryDispose(stars)
      renderer.dispose()
      if (renderer.domElement.parentElement === mount) {
        mount.removeChild(renderer.domElement)
      }
    }
  }, [])

  return (
    <div
      ref={mountRef}
      aria-hidden
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
    />
  )
}

function geometryDispose(object: THREE.Object3D) {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh | THREE.Points
    mesh.geometry?.dispose()
    const material = mesh.material
    if (!material) return
    if (Array.isArray(material)) material.forEach((item) => item.dispose())
    else material.dispose()
  })
}
