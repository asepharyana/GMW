"use client";

import dynamic from "next/dynamic";
import type { OrbFieldProps } from "./orb-field";
import type { SignalFieldProps } from "./signal-field";
import { StaticFallback } from "./static-fallback";
import { WebGLGuard } from "./webgl-guard";

const SignalFieldImpl = dynamic(
  () => import("./signal-field").then((m) => m.SignalField),
  {
    ssr: false,
    loading: () => null,
  },
);

const OrbFieldImpl = dynamic(
  () => import("./orb-field").then((m) => m.OrbField),
  {
    ssr: false,
    loading: () => null,
  },
);

export function SignalField(props: SignalFieldProps) {
  return (
    <WebGLGuard
      fallback={<StaticFallback variant="signal" className={props.className} />}
    >
      <SignalFieldImpl {...props} />
    </WebGLGuard>
  );
}

export function OrbField(props: OrbFieldProps) {
  return (
    <WebGLGuard
      fallback={
        <StaticFallback
          variant="orb"
          count={props.speakers.length}
          className={props.className}
        />
      }
    >
      <OrbFieldImpl {...props} />
    </WebGLGuard>
  );
}
