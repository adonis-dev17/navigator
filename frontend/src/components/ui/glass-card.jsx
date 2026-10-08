import { cn } from "../../lib/utils";
import { motion, useReducedMotion, useSpring } from "motion/react";
import { useCallback, useEffect, useId, useState } from "react";

const DEFAULT_BLUR = 16;
const DEFAULT_RADIUS = 24;
const DEFAULT_REFRACTION = 20;
const DEFAULT_RIM_WIDTH = 2;
const DEFAULT_TINT = "oklch(0.35 0.08 240 / 0.15)";

const HOVER_QUERY = "(hover: hover) and (pointer: fine)";
const SPECULAR_SIZE = 300;
const SPECULAR_BASE_X = 0.3;
const SPECULAR_BASE_Y = 0.28;
const SWEEP_WIDTH = 42;
const RIM_SHIFT = 4;
const CONTENT_PADDING_MIN = 20;
const CONTENT_PADDING_GAP = 10;
const INNER_RADIUS_MIN = 6;
const RIM_BLUR_RATIO = 0.12;

const SPRING = { damping: 30, mass: 0.4, stiffness: 200 };
const LIFT = { scale: 1.01, y: -2 };

const SPECULAR_GRADIENT =
  "radial-gradient(closest-side, oklch(0.7 0.15 220 / 0.25), oklch(0.5 0.1 250 / 0.05) 48%, transparent 74%)";
const SWEEP_GRADIENT =
  "linear-gradient(to bottom, oklch(0.9 0.05 220 / 0.8), oklch(0.6 0.1 250 / 0.2) 55%, transparent)";
const SWEEP_MASK =
  "linear-gradient(90deg, transparent, oklch(0 0 0) 42%, oklch(0 0 0) 58%, transparent)";
const CHROMATIC_RIM =
  "linear-gradient(125deg, oklch(0.7 0.15 200 / 0.5) 0%, transparent 36%, transparent 64%, oklch(0.6 0.12 260 / 0.4) 100%)";
const BODY_EDGE =
  "inset 0 1px 0 oklch(1 1 1 / 0.15), inset 0 0 0 1px oklch(1 1 1 / 0.05)";
const BOTTOM_SHADE =
  "linear-gradient(to bottom, transparent 48%, oklch(0 0 0 / 0.3) 100%)";
const INNER_RING =
  "inset 0 1px 0 oklch(1 1 1 / 0.2), inset 0 0 0 1px oklch(1 1 1 / 0.05), inset 0 -1px 0 oklch(1 1 1 / 0.02)";
const DROP_SHADOW =
  "0 26px 60px -26px oklch(0 0 0 / 0.7), 0 10px 26px -18px oklch(0 0 0 / 0.5)";

const ringMask = (width) => ({
  boxSizing: "border-box",
  maskClip: "content-box, border-box",
  maskComposite: "exclude",
  maskImage:
    "linear-gradient(oklch(0 0 0), oklch(0 0 0)), linear-gradient(oklch(0 0 0), oklch(0 0 0))",
  padding: width,
  WebkitMaskClip: "content-box, border-box",
  WebkitMaskComposite: "xor",
  WebkitMaskImage:
    "linear-gradient(oklch(0 0 0), oklch(0 0 0)), linear-gradient(oklch(0 0 0), oklch(0 0 0))",
});

export default function GlassCard({
  blur = DEFAULT_BLUR,
  border = true,
  children,
  className,
  interactive = true,
  radius = DEFAULT_RADIUS,
  refraction = DEFAULT_REFRACTION,
  rimWidth = DEFAULT_RIM_WIDTH,
  shadow = true,
  specular = true,
  tint = DEFAULT_TINT,
}) {
  const shouldReduceMotion = useReducedMotion();
  const rawId = useId();
  const filterId = `glass-refraction-${rawId.replace(/:/g, "")}`;
  const [isHoverDevice, setIsHoverDevice] = useState(false);
  const [canDisplace, setCanDisplace] = useState(false);

  const specularX = useSpring(0, SPRING);
  const specularY = useSpring(0, SPRING);
  const sweepX = useSpring(0, SPRING);
  const rimX = useSpring(0, SPRING);
  const rimY = useSpring(0, SPRING);

  const tracksPointer = interactive && isHoverDevice && !shouldReduceMotion;

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const query = window.matchMedia(HOVER_QUERY);
    setIsHoverDevice(query.matches);
    const onChange = (event) => setIsHoverDevice(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (typeof CSS === "undefined" || typeof CSS.supports !== "function")
      return;
    const probe = `url(#${filterId}) blur(2px)`;
    setCanDisplace(
      CSS.supports("backdrop-filter", probe) ||
        CSS.supports("-webkit-backdrop-filter", probe),
    );
  }, [filterId]);

  const handlePointerMove = useCallback(
    (event) => {
      const rect = event.currentTarget.getBoundingClientRect();
      const pointerX = event.clientX - rect.left;
      const pointerY = event.clientY - rect.top;
      specularX.set(pointerX - rect.width * SPECULAR_BASE_X);
      specularY.set(pointerY - rect.height * SPECULAR_BASE_Y);
      sweepX.set(pointerX - rect.width / 2);
      rimX.set((pointerX / rect.width - 0.5) * RIM_SHIFT);
      rimY.set((pointerY / rect.height - 0.5) * RIM_SHIFT);
    },
    [rimX, rimY, specularX, specularY, sweepX],
  );

  const handlePointerLeave = useCallback(() => {
    for (const value of [specularX, specularY, sweepX, rimX, rimY])
      value.set(0);
  }, [rimX, rimY, specularX, specularY, sweepX]);

  const bodyFilters = `blur(${blur}px) saturate(140%) brightness(1.1)`;
  const rimBlur = Math.max(1, Math.round(blur * RIM_BLUR_RATIO));
  const rimFilters = `blur(${rimBlur}px) saturate(160%) brightness(1.2)`;
  const displaces = refraction > 0 && canDisplace;
  const rimBackdrop = displaces
    ? `url(#${filterId}) ${rimFilters}`
    : rimFilters;
  const contentPadding = Math.max(
    CONTENT_PADDING_MIN,
    rimWidth + CONTENT_PADDING_GAP,
  );

  return (
    <motion.div
      className={cn("relative overflow-hidden group", className)}
      onPointerLeave={tracksPointer ? handlePointerLeave : undefined}
      onPointerMove={tracksPointer ? handlePointerMove : undefined}
      style={{
        borderRadius: radius,
        boxShadow: shadow ? DROP_SHADOW : undefined,
      }}
      transition={
        shouldReduceMotion
          ? { duration: 0 }
          : { bounce: 0, duration: 0.3, type: "spring" }
      }
      whileHover={tracksPointer ? LIFT : undefined}
    >
      {displaces ? (
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute h-0 w-0"
          focusable="false"
        >
          <defs>
            <filter id={filterId}>
              <feTurbulence
                baseFrequency="0.02 0.03"
                numOctaves={2}
                result="noise"
                seed={7}
                type="fractalNoise"
              />
              <feGaussianBlur in="noise" result="soft" stdDeviation={1.5} />
              <feDisplacementMap
                in="SourceGraphic"
                in2="soft"
                scale={refraction}
                xChannelSelector="R"
                yChannelSelector="G"
              />
            </filter>
          </defs>
        </svg>
      ) : null}

      <div
        aria-hidden="true"
        className="absolute"
        style={{
          backdropFilter: bodyFilters,
          backgroundColor: tint,
          borderRadius: Math.max(radius - rimWidth, INNER_RADIUS_MIN),
          boxShadow: BODY_EDGE,
          inset: rimWidth,
          WebkitBackdropFilter: bodyFilters,
        }}
      />

      <div
        aria-hidden="true"
        className="absolute inset-0 rounded-[inherit]"
        style={{
          ...ringMask(rimWidth),
          backdropFilter: rimBackdrop,
          WebkitBackdropFilter: rimBackdrop,
        }}
      />

      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 isolate overflow-hidden rounded-[inherit]"
      >
        <motion.div
          className="absolute inset-0 rounded-[inherit]"
          style={{
            ...ringMask(rimWidth),
            backgroundImage: CHROMATIC_RIM,
            mixBlendMode: "plus-lighter",
            x: rimX,
            y: rimY,
          }}
        />
        {specular ? (
          <motion.div
            className="absolute transition-opacity duration-300 opacity-0 group-hover:opacity-100"
            style={{
              backgroundImage: SPECULAR_GRADIENT,
              height: SPECULAR_SIZE,
              left: `${SPECULAR_BASE_X * 100}%`,
              marginLeft: -SPECULAR_SIZE / 2,
              marginTop: -SPECULAR_SIZE / 2,
              mixBlendMode: "plus-lighter",
              top: `${SPECULAR_BASE_Y * 100}%`,
              width: SPECULAR_SIZE,
              willChange: "transform",
              x: specularX,
              y: specularY,
            }}
          />
        ) : null}
        {specular ? (
          <motion.div
            className="absolute top-0 transition-opacity duration-300 opacity-0 group-hover:opacity-100"
            style={{
              backgroundImage: SWEEP_GRADIENT,
              height: rimWidth + 2,
              left: `${50 - SWEEP_WIDTH / 2}%`,
              maskImage: SWEEP_MASK,
              mixBlendMode: "plus-lighter",
              WebkitMaskImage: SWEEP_MASK,
              width: `${SWEEP_WIDTH}%`,
              willChange: "transform",
              x: sweepX,
            }}
          />
        ) : null}
        <div
          className="absolute inset-0 rounded-[inherit]"
          style={{ backgroundImage: BOTTOM_SHADE }}
        />
      </div>

      {border ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-[inherit]"
          style={{ boxShadow: INNER_RING }}
        />
      ) : null}

      <div className="relative z-10" style={{ padding: contentPadding }}>
        {children}
      </div>
    </motion.div>
  );
}
