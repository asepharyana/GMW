import { Sparkles } from "@react-three/drei";
import { Canvas, type ThreeElement, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import type * as THREE from "three";

// ─── Sakura petal geometry ───────────────────────────────────────────────────

function createPetalShape() {
  const shape = new THREE.Shape();
  // Teardrop/petal shape
  shape.moveTo(0, 0.5);
  shape.bezierCurveTo(0.3, 0.3, 0.4, -0.1, 0, -0.5);
  shape.bezierCurveTo(-0.4, -0.1, -0.3, 0.3, 0, 0.5);
  return shape;
}

const petalShape = createPetalShape();
const petalGeometry = new THREE.ShapeGeometry(petalShape);

// ─── Inner particle scene ────────────────────────────────────────────────────

function Petal({ mouse }: { mouse: React.RefObject<THREE.Vector2 | null> }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const initial = useMemo(() => ({
    x: (Math.random() - 0.5) * 20,
    y: Math.random() * 20 - 5,
    z: (Math.random() - 0.5) * 10 - 2,
    rotSpeed: (Math.random() - 0.5) * 2,
    driftX: (Math.random() - 0.5) * 0.005,
    driftZ: (Math.random() - 0.5) * 0.003,
    hue: 340 + Math.random() * 30, // pink range: 340–370
    saturation: 60 + Math.random() * 30,
    lightness: 65 + Math.random() * 20,
  }), []);

  useFrame((_, delta) => {
    if (!meshRef.current) return;
    const mesh = meshRef.current;

    // Slow drift downward
    mesh.position.y -= delta * 0.3;
    mesh.position.x += Math.sin(Date.now() * initial.driftX) * 0.002;
    mesh.position.z += Math.cos(Date.now() * initial.driftZ) * 0.001;
    mesh.rotation.z += delta * initial.rotSpeed;
    mesh.rotation.x += delta * initial.rotSpeed * 0.3;

    // Gentle mouse attraction
    const dx = mouse.current.x * 3 - mesh.position.x;
    const dy = mouse.current.y * 2 - mesh.position.y;
    mesh.position.x += dx * 0.0001;
    mesh.position.y += dy * 0.0001;

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
      geometry={petalGeometry}
      position={[initial.x, initial.y, initial.z]}
      scale={[0.12, 0.12, 0.12]}
    >
      <meshStandardMaterial
        color={`hsl(${initial.hue}, ${initial.saturation}%, ${initial.lightness}%)`}
        transparent
        opacity={0.7}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  );
}

function ParticleScene() {
  const mouse = useRef(new THREE.Vector2(0, 0));
  const { size } = useThree();
  const hiddenRef = useRef(false);

  useEffect(() => {
    const onMouse = (e: MouseEvent) => {
      // Normalise to -1..1 relative to viewport
      mouse.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      mouse.current.y = -(e.clientY / window.innerHeight) * 2 + 1;
    };
    window.addEventListener("mousemove", onMouse);

    const onVisibility = () => {
      hiddenRef.current = document.hidden;
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.removeEventListener("mousemove", onMouse);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  // Petal count depends on viewport width (fewer on mobile)
  const petalCount = size.width < 640 ? 10 : size.width < 1024 ? 20 : 35;
  const petals = useMemo(
    () => Array.from({ length: petalCount }, (_, i) => <Petal key={i} mouse={mouse} />),
    [petalCount],
  );

  return (
    <>
      {/* Ambient + directional for soft lighting */}
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 5, 5]} intensity={0.3} />

      {/* Petals */}
      {!hiddenRef.current && petals}

      {/* Sparkles from drei */}
      <Sparkles
        count={size.width < 640 ? 15 : 30}
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
      style={{ zIndex: -1 }}
    >
      <Canvas
        camera={{ position: [0, 0, 8], fov: 75 }}
        dpr={[1, 2]}
        gl={{ antialias: false, alpha: true }}
        style={{ background: "transparent" }}
      >
        <ParticleScene />
      </Canvas>
    </div>
  );
}
