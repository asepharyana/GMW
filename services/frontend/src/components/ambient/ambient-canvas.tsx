"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { SIGNAL_RGB, type SignalTone } from "./ambient-context";

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main(){
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const FRAG = /* glsl */ `
  precision mediump float;
  varying vec2 vUv;
  uniform float uTime;
  uniform vec3 uColor;
  uniform float uIntensity;
  uniform vec2 uRes;

  float hash(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
  float noise(vec2 p){
    vec2 i=floor(p); vec2 f=fract(p);
    float a=hash(i), b=hash(i+vec2(1.,0.)), c=hash(i+vec2(0.,1.)), d=hash(i+vec2(1.,1.));
    vec2 u=f*f*(3.-2.*f);
    return mix(mix(a,b,u.x),mix(c,d,u.x),u.y);
  }
  float fbm(vec2 p){
    float v=0.0, a=0.5;
    mat2 m=mat2(1.6,1.2,-1.2,1.6);
    for(int i=0;i<5;i++){ v+=a*noise(p); p=m*p; a*=0.5; }
    return v;
  }

  void main(){
    vec2 uv=vUv;
    vec2 p=uv-0.5;
    p.x*=uRes.x/uRes.y;
    float t=uTime*0.04*(0.6+uIntensity);
    vec2 q=vec2(fbm(p*1.5+t), fbm(p*1.5-t+5.0));
    float f=fbm(p*2.2 + q*1.8 + t*0.5);
    vec2 c=vec2(sin(uTime*0.05)*0.25, cos(uTime*0.04)*0.18);
    float d=length(p-c);
    float glow=smoothstep(0.95,0.0,d)*0.5;
    float haze=(f*0.7+glow)*uIntensity;
    vec3 col=uColor*haze;
    float g=hash(uv*uRes+uTime)*0.035;
    col+=g;
    float vig=smoothstep(1.25,0.15,length(p));
    col*=0.35+0.65*vig;
    gl_FragColor=vec4(col,1.0);
  }
`;

const MOTE_COUNT = 140;

export function AmbientCanvas({
  targetRef,
}: {
  targetRef: React.MutableRefObject<{ tone: SignalTone; intensity: number }>;
}) {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: false,
        alpha: false,
        powerPreference: "high-performance",
      });
    } catch {
      return; // static CSS fallback remains
    }

    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    renderer.setPixelRatio(dpr);
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    mount.appendChild(renderer.domElement);
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.display = "block";

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const uniforms = {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(...SIGNAL_RGB.signal) },
      uIntensity: { value: 0.35 },
      uRes: { value: new THREE.Vector2(1, 1) },
    };

    const quad = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        uniforms,
        depthTest: false,
        depthWrite: false,
      }),
    );
    scene.add(quad);

    // — Drifting motes —
    const positions = new Float32Array(MOTE_COUNT * 3);
    const speeds = new Float32Array(MOTE_COUNT);
    for (let i = 0; i < MOTE_COUNT; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 2;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 2;
      positions[i * 3 + 2] = 0;
      speeds[i] = 0.01 + Math.random() * 0.03;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const moteMat = new THREE.PointsMaterial({
      size: 0.012,
      color: new THREE.Color(...SIGNAL_RGB.signal),
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
    });
    const motes = new THREE.Points(geo, moteMat);
    scene.add(motes);

    const color = new THREE.Color();
    const target = new THREE.Color();
    let targetIntensity = 0.35;
    let intensity = 0.35;
    let raf = 0;
    let last = performance.now();
    let running = !reduce;

    const resize = () => {
      const w = mount.clientWidth || 1;
      const h = mount.clientHeight || 1;
      renderer.setSize(w, h);
      uniforms.uRes.value.set(w * dpr, h * dpr);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(mount);
    resize();

    const onVisibility = () => {
      running = !document.hidden && !reduce;
      if (running) {
        last = performance.now();
        loop();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      uniforms.uTime.value += dt;

      // Ease toward target signal/intensity each frame (no React re-render).
      const tgt = targetRef.current;
      target.set(...SIGNAL_RGB[tgt.tone]);
      color.lerp(target, 0.04);
      uniforms.uColor.value.copy(color);
      moteMat.color.copy(color);
      targetIntensity = 0.2 + tgt.intensity * 0.8;
      intensity = lerp(intensity, targetIntensity, 0.04);
      uniforms.uIntensity.value = intensity;

      const pos = geo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < MOTE_COUNT; i++) {
        let y = pos.getY(i) + speeds[i] * dt * (0.5 + tgt.intensity);
        if (y > 1.1) y = -1.1;
        pos.setY(i, y);
      }
      pos.needsUpdate = true;

      renderer.render(scene, camera);
      if (running) raf = requestAnimationFrame(frame);
    };

    const loop = () => {
      if (raf) cancelAnimationFrame(raf);
      last = performance.now();
      raf = requestAnimationFrame(frame);
    };

    if (reduce) {
      // single static frame
      uniforms.uIntensity.value = 0.3;
      renderer.render(scene, camera);
    } else {
      loop();
    }

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      geo.dispose();
      moteMat.dispose();
      (quad.geometry as THREE.BufferGeometry).dispose();
      (quad.material as THREE.Material).dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, [targetRef]);

  return (
    <div
      ref={mountRef}
      aria-hidden
      className="fixed inset-0 -z-10 overflow-hidden pointer-events-none select-none"
      style={{
        background:
          "radial-gradient(120% 90% at 50% 0%, oklch(0.2 0.04 70 / 0.5), oklch(0.1 0.015 70) 60%)",
      }}
    />
  );
}
