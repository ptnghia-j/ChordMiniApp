'use client';

import React, { useRef } from 'react';
import { motion, useMotionValue, useSpring, useTransform, type MotionValue } from 'framer-motion';
import { cn } from '@/utils/toastStyles';

export interface FloatingDockProps {
  children: React.ReactNode;
  className?: string;
}

export function FloatingDock({ children, className }: FloatingDockProps) {
  const mouseX = useMotionValue(Infinity);

  return (
    <motion.div
      onMouseMove={(e) => mouseX.set(e.pageX)}
      onMouseLeave={() => mouseX.set(Infinity)}
      className={cn(
        "mx-auto flex h-16 items-end gap-3 rounded-3xl border border-white/25 bg-default-200/50 px-4 pb-3 shadow-[0_24px_60px_-24px_rgba(15,23,42,0.7)] backdrop-blur-md dark:border-white/10 dark:bg-gray-800/40 w-fit overflow-visible",
        className
      )}
    >
      {React.Children.map(children, (child) => {
        if (!child) return null;
        return (
          <DockItem mouseX={mouseX}>
            {child}
          </DockItem>
        );
      })}
    </motion.div>
  );
}

function DockItem({
  mouseX,
  children,
}: {
  mouseX: MotionValue<number>;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  const distance = useTransform(mouseX, (val: number) => {
    const bounds = ref.current?.getBoundingClientRect() ?? { x: 0, width: 0 };
    return val - bounds.x - bounds.width / 2;
  });

  const widthTransform = useTransform(distance, [-150, 0, 150], [40, 56, 40]);
  const heightTransform = useTransform(distance, [-150, 0, 150], [40, 56, 40]);

  const width = useSpring(widthTransform, {
    mass: 0.1,
    stiffness: 150,
    damping: 12,
  });
  const height = useSpring(heightTransform, {
    mass: 0.1,
    stiffness: 150,
    damping: 12,
  });

  return (
    <motion.div
      ref={ref}
      style={{ width, height }}
      className="relative flex aspect-square items-center justify-center rounded-full bg-transparent dock-item"
    >
      <div className="flex h-full w-full items-center justify-center">
        {children}
      </div>
    </motion.div>
  );
}
