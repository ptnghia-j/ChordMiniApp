"use client";
import React, { useEffect, useRef, useState } from "react";
import {
  motion,
  useTransform,
  useScroll,
  useSpring,
  useMotionValueEvent,
} from "framer-motion";
import { cn } from "@/utils/toastStyles";

export interface TracingBeamProps {
  children: React.ReactNode;
  className?: string;
}

export function TracingBeam({ children, className }: TracingBeamProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start center", "end center"],
  });

  const contentRef = useRef<HTMLDivElement>(null);
  const [svgHeight, setSvgHeight] = useState(0);
  const [hasScrolled, setHasScrolled] = useState(false);

  useEffect(() => {
    if (!contentRef.current) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setSvgHeight(entry.contentRect.height);
      }
    });

    observer.observe(contentRef.current);
    return () => observer.disconnect();
  }, []);

  useMotionValueEvent(scrollYProgress, "change", (latest) => {
    setHasScrolled(latest > 0);
  });

  // Animated gradient coordinates centered around the viewport focus
  const y1 = useSpring(
    useTransform(scrollYProgress, [0, 1], [-150, svgHeight - 150]),
    {
      stiffness: 500,
      damping: 90,
      restDelta: 0.001,
    }
  );
  const y2 = useSpring(
    useTransform(scrollYProgress, [0, 1], [150, svgHeight + 150]),
    {
      stiffness: 500,
      damping: 90,
      restDelta: 0.001,
    }
  );

  return (
    <motion.div ref={ref} className={cn("relative w-full h-full", className)}>
      {/* SVG Tracing Line */}
      <div className="absolute left-0 top-3 pointer-events-none h-full w-16" aria-hidden="true">
        {/* Top Indicator Dot (centered at X = 24px) */}
        <motion.div
          animate={{
            boxShadow: hasScrolled ? "none" : "rgba(30, 64, 175, 0.2) 0px 3px 8px",
          }}
          className="absolute left-[24px] -translate-x-1/2 h-4 w-4 rounded-full border border-gray-200 dark:border-gray-700 shadow-sm flex items-center justify-center bg-white dark:bg-dark-bg z-10"
        >
          <motion.div
            animate={{
              backgroundColor: hasScrolled ? "var(--heroui-primary)" : "#1e40af",
              borderColor: hasScrolled ? "var(--heroui-primary)" : "#1e88e5",
            }}
            className="h-2 w-2 rounded-full border border-gray-300 dark:border-gray-600 bg-white"
          />
        </motion.div>
        
        {/* SVG Path */}
        <svg
          viewBox={`0 0 64 ${svgHeight}`}
          width="64"
          height={svgHeight}
          className="block h-full text-blue-600 dark:text-blue-400"
          aria-hidden="true"
        >
          <defs>
            <motion.linearGradient
              id="beam-gradient"
              gradientUnits="userSpaceOnUse"
              x1="0"
              x2="0"
              y1={y1}
              y2={y2}
            >
              <stop stopColor="currentColor" stopOpacity="0" />
              <stop offset="0.3" stopColor="currentColor" stopOpacity="1" />
              <stop offset="0.7" stopColor="currentColor" stopOpacity="1" />
              <stop offset="1" stopColor="currentColor" stopOpacity="0" />
            </motion.linearGradient>
          </defs>
          {/* Background Path (inactive) */}
          <motion.path
            d={`M 24 0V -36 l 18 24 V ${svgHeight * 0.8} l -18 24V ${svgHeight}`}
            fill="none"
            stroke="currentColor"
            strokeOpacity="0.16"
            className="text-gray-300 dark:text-gray-700"
          />
          {/* Foreground Tracing Path (active single-color beam) */}
          <motion.path
            d={`M 24 0V -36 l 18 24 V ${svgHeight * 0.8} l -18 24V ${svgHeight}`}
            fill="none"
            stroke="url(#beam-gradient)"
            strokeWidth="2"
          />
        </svg>
      </div>
      
      {/* Content */}
      <div ref={contentRef} className="w-full">{children}</div>
    </motion.div>
  );
}
