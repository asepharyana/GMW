import { Sparkles } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";

// ─── Particle count by viewport ──────────────────────────────────────────────

function getPetalCount(width: number) {
  if (width < 640) return 10;
  if (width < 1024) return 20;
  return 35;
}

function getSparkleCount(width: number) {
  if (width < 640) return 15;
  return 30;
}

// ─── Sakura petal mesh ───────────────────────────────────────────────────────

interface PetalData {
  x: number;
  y: number;
  z: number;
  rotSpeed: number;
  driftX: number;
  driftZ: number;
  hue: number;
  sat: number;
  light: number;
  scale: number;
}

function createPetals(count: number): PetalData[] {
  return Array.from({ length: count }, () => ({
    x: (Math.random() - 0.5) * 20,
    y: Math.random() * 20 - 5,
    z: (Math.random() - 0.5) * 10 - 2,
    rotSpeed: (Math.random() - 0.5) * 2,
    driftX: (Math.random() - 0.5) * 0.005,
    driftZ: (Math.random() - 0.5) * 0.003,
    hue: 340 + Math.random() * 30,
    sat: 60 + Math.random() * 30,
    light: 65 + Math.random() * 20,
    scale: 0.08 + Math.random() * 0.08,
  }));
}

function Petal({
  data,
  mouseRef,
}: {
  data: PetalData;
  mouseRef: React.RefObject<{ x: number; y: number } | null>;
}) {
  const meshRef = useRef(null);

  useFrame((_state, delta) => {
    const mesh = meshRef.current as unknown as {
      position: { x: number; y: number; z: number };
      rotation: { z: number; x: number };
    } | null;
    if (!mesh) return;

    // Slow drift downward
    mesh.position.y -= delta * 0.3;
    mesh.position.x += Math.sin(Date.now() * data.driftX) * 0.002;
    mesh.position.z += Math.cos(Date.now() * data.driftZ) * 0.001;
    mesh.rotation.z += delta * data.rotSpeed;
    mesh.rotation.x += delta * data.rotSpeed * 0.3;

    // Gentle mouse attraction
    if (mouseRef.current) {
      const dx = mouseRef.current.x * 3 - mesh.position.x;
      const dy = mouseRef.current.y * 2 - mesh.position.y;
      mesh.position.x += dx * 0.0001;
      mesh.position.y += dy * 0.0001;
    }

    // Reset when out of view
    if (mesh.position.y < -10) {
      mesh.position.y = 8;
      mesh.position.x = (Math.random() - 0.5) * 20;
      mesh.position.z = (Math.random() - 0.5) * 10 - 2;
    }
  });

  return (
    <mesh
      ref={meshRef}
      position={[data.x, data.y, data.z]}
      scale={[data.scale, data.scale, data.scale]}
    >
      <planeGeometry args={[1, 1]} />
      <meshStandardMaterial
        color={`hsl(${data.hue}, ${data.sat}%, ${data.light}%)`}
        transparent
        opacity={0.65}
        side={2}
        depthWrite={false}
      />
    </mesh>
  );
}

// ─── Scene ───────────────────────────────────────────────────────────────────

function ParticleScene() {
  const mouseRef = useRef<{ x: number; y: number } | null>(null);
  const [viewportWidth, setViewportWidth] = useState(
    typeof window !== "undefined" ? window.innerWidth : 1024,
  );

  useEffect(() => {
    const onMouse = (e: MouseEvent) => {
      mouseRef.current = {
        x: (e.clientX / window.innerWidth) * 2 - 1,
        y: -(e.clientY / window.innerHeight) * 2 + 1,
      };
    };
    window.addEventListener("mousemove", onMouse);

    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("mousemove", onMouse);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  const petalCount = getPetalCount(viewportWidth);
  const sparkleCount = getSparkleCount(viewportWidth);

  const petals = useMemo(() => createPetals(petalCount), [petalCount]);

  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 5, 5]} intensity={0.3} />

      {petals.map((data, i) => (
        <Petal key={i} data={data} mouseRef={mouseRef} />
      ))}

      <Sparkles
        count={sparkleCount}
        scale={12}
        size={0.8}
        speed={0.2}
        color="#7EC8E3"
        opacity={0.5}
      />
    </>
  );
}

// ─── Exported component ──────────────────────────────────────────────────────

export function ParticleBackground() {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  if (reducedMotion) return null;

  return (
    <div
      className="fixed inset-0 pointer-events-none"
      aria-hidden="true"
      style={{ zIndex: -1, isolation: "isolate" }}
    >
      <Canvas
        camera={{ position: [0, 0, 8], fov: 75 }}
        dpr={[1, 2]}
        gl={{ antialias: false, alpha: true }}
        style={{ background: "transparent", width: "100%", height: "100%" }}
      >
        <ParticleScene />
      </Canvas>
    </div>
  );
}
