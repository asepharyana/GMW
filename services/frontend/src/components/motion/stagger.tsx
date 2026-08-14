"use client";

import { motion, type Variants } from "motion/react";
import type { ReactNode } from "react";
import { fadeUp, stagger } from "./variants";

type V = Variants;

interface StaggerGroupProps {
  children: ReactNode;
  className?: string;
  variants?: V;
  as?: "div" | "ul" | "section";
}

export function StaggerGroup({
  children,
  className,
  variants = stagger,
  as = "div",
}: StaggerGroupProps) {
  const Tag = motion[as];
  return (
    <Tag
      className={className}
      variants={variants}
      initial="hidden"
      animate="visible"
    >
      {children}
    </Tag>
  );
}

interface StaggerItemProps {
  children: ReactNode;
  className?: string;
  variants?: V;
  layout?: boolean;
}

export function StaggerItem({
  children,
  className,
  variants = fadeUp,
  layout,
}: StaggerItemProps) {
  return (
    <motion.div className={className} variants={variants} layout={layout}>
      {children}
    </motion.div>
  );
}
