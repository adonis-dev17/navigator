import { useState, useRef, useEffect } from "react";
import {
  motion,
  useMotionValue,
  useSpring,
  useReducedMotion,
} from "motion/react";

export function AnimatedLiquidGlass({ isActive, darkMode, isPressed }) {
  const shadowColor = darkMode ? "rgba(0, 0, 0, 0.5)" : "rgba(0, 0, 0, 0.15)";
  const highlightColor = darkMode
    ? "rgba(255,255,255,0.15)"
    : "rgba(255,255,255,0.6)";
  const baseColor = darkMode
    ? "rgba(16, 185, 129, 0.4)"
    : "rgba(16, 185, 129, 0.2)";

  return (
    <div
      className="absolute inset-0 w-full h-full rounded-xl overflow-hidden"
      style={{
        backgroundColor: baseColor,
        backdropFilter: "blur(8px) saturate(120%) brightness(1.1)",
        WebkitBackdropFilter: "blur(8px)",
        boxShadow: isPressed
          ? `0 2px 4px ${shadowColor}, inset 0 2px 4px rgba(0,0,0,0.2)`
          : `0 4px 12px ${shadowColor}, inset 0 1px 1px rgba(255,255,255,0.3)`,
        transition: "box-shadow 0.15s ease-out",
        border: darkMode
          ? "1px solid rgba(16,185,129,0.3)"
          : "1px solid rgba(255,255,255,0.6)",
      }}
    >
      <div
        className="absolute top-0 left-0 w-full h-[45%] rounded-t-xl"
        style={{
          background: `linear-gradient(180deg, ${highlightColor} 0%, transparent 100%)`,
        }}
      />
      <motion.div
        className="absolute top-0 left-0 w-full h-full pointer-events-none"
        initial={false}
        animate={{
          background: isActive
            ? `linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.2) 50%, transparent 100%)`
            : `linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.05) 50%, transparent 100%)`,
          x: isActive ? ["-100%", "100%"] : ["100%", "-100%"],
        }}
        transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
      />
    </div>
  );
}

const sizeConfig = {
  sm: {
    trackWidth: 51,
    trackHeight: 31,
    knobWidth: 27,
    knobHeight: 21,
    knobMargin: 2,
    indicatorWidth: 2,
    indicatorHeight: 9,
    indicatorOffset: 11,
    circleSize: 7,
  },
  md: {
    trackWidth: 60,
    trackHeight: 33,
    knobWidth: 35,
    knobHeight: 24,
    knobMargin: 2.5,
    indicatorWidth: 2,
    indicatorHeight: 10,
    indicatorOffset: 12,
    circleSize: 8,
  },
  lg: {
    trackWidth: 80,
    trackHeight: 36,
    knobWidth: 47,
    knobHeight: 30,
    knobMargin: 3,
    indicatorWidth: 2,
    indicatorHeight: 13,
    indicatorOffset: 15.5,
    circleSize: 10.5,
  },
};

const VELOCITY_THRESHOLD = 200;

export default function ToggleSwitch({
  className = "",
  isActive: initialIsActive = false,
  onChange = () => {},
  darkMode = false,
  glassEffect = true,
  size = "md",
}) {
  const [isActive, setIsActive] = useState(initialIsActive);
  const [isDragging, setIsDragging] = useState(false);
  const [isPressed, setIsPressed] = useState(false);
  const trackRef = useRef(null);
  const velocityRef = useRef(0);
  const shouldReduceMotion = useReducedMotion();

  const { trackWidth, trackHeight, knobWidth, knobMargin, indicatorOffset } =
    sizeConfig[size];
  const calculateTravel = () => trackWidth - knobWidth - knobMargin * 2;
  const motionX = useMotionValue(initialIsActive ? calculateTravel() : 0);

  const springConfig = shouldReduceMotion
    ? { duration: 0 }
    : { type: "spring", stiffness: 750, damping: 38, mass: 0.6 };
  const springX = useSpring(motionX, springConfig);

  useEffect(() => {
    setIsActive(initialIsActive);
    motionX.set(initialIsActive ? calculateTravel() : 0);
  }, [initialIsActive]);

  function getBackgroundColor() {
    return isActive
      ? "#10B981"
      : darkMode
        ? "hsl(0, 0%, 25%)"
        : "hsl(0, 0%, 80%)";
  }

  function handleComponentClick() {
    if (isDragging) return;
    const newState = !isActive;
    setIsActive(newState);
    motionX.set(newState ? calculateTravel() : 0);
    onChange(newState);
  }

  function handleDragEnd() {
    const maxTravel = calculateTravel();
    const currentX = motionX.get();
    const velocity = velocityRef.current;
    let newState;
    if (Math.abs(velocity) > VELOCITY_THRESHOLD) {
      newState = velocity > 0;
    } else {
      newState = currentX > maxTravel / 2;
    }
    setIsActive(newState);
    motionX.set(newState ? maxTravel : 0);
    onChange(newState);
    setTimeout(() => setIsDragging(false), 10);
  }

  return (
    <div
      className={`${className} relative cursor-pointer touch-none overflow-visible`}
      onClick={handleComponentClick}
      onPointerDown={(e) => {
        setIsPressed(true);
        e.target.setPointerCapture(e.pointerId);
      }}
      onPointerUp={() => setIsPressed(false)}
      onPointerCancel={() => setIsPressed(false)}
    >
      <motion.div
        ref={trackRef}
        className="relative z-0 h-full w-full rounded-full"
        style={{ width: `${trackWidth}px`, height: `${trackHeight}px` }}
        animate={{
          backgroundColor: getBackgroundColor(),
          boxShadow: isPressed
            ? "inset 0 2px 4px rgba(0,0,0,0.2)"
            : "inset 0 1px 3px rgba(0,0,0,0.1)",
        }}
        transition={{ duration: 0.2 }}
      >
        {glassEffect && (
          <div
            className="absolute inset-0 rounded-full pointer-events-none"
            style={{ boxShadow: "inset 0 1px 2px rgba(255,255,255,0.2)" }}
          />
        )}

        <motion.div
          className="absolute pointer-events-none flex items-center justify-center text-white"
          style={{
            left: `${indicatorOffset}px`,
            top: "50%",
            transform: "translateY(-50%)",
          }}
          animate={{ opacity: isActive ? 1 : 0.3 }}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="12" cy="12" r="5" />
            <path d="M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" />
          </svg>
        </motion.div>

        <motion.div
          className="absolute pointer-events-none flex items-center justify-center text-white"
          style={{
            right: `${indicatorOffset}px`,
            top: "50%",
            transform: "translateY(-50%)",
          }}
          animate={{ opacity: isActive ? 0.3 : 1 }}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
        </motion.div>
      </motion.div>

      <motion.div
        className="absolute rounded-full z-20 cursor-grab active:cursor-grabbing bg-white"
        drag="x"
        dragConstraints={{ left: 0, right: calculateTravel() }}
        dragElastic={0}
        dragMomentum={false}
        onDragStart={() => {
          setIsDragging(true);
          velocityRef.current = 0;
        }}
        onDrag={(e, info) => {
          motionX.set(
            Math.max(
              0,
              Math.min(motionX.get() + info.delta.x, calculateTravel()),
            ),
          );
          velocityRef.current = info.velocity.x;
        }}
        onDragEnd={handleDragEnd}
        style={{
          x: springX,
          width: `${knobWidth}px`,
          height: `${trackHeight - knobMargin * 2}px`,
          top: `${knobMargin}px`,
          left: `${knobMargin}px`,
        }}
        animate={{
          scale: isDragging ? 1.1 : 1,
          boxShadow: isDragging
            ? "0 4px 12px rgba(0,0,0,0.2)"
            : "0 2px 4px rgba(0,0,0,0.15)",
        }}
      >
        <div
          className="absolute top-0 left-0 w-full h-[40%] rounded-t-full"
          style={{
            background:
              "linear-gradient(180deg, rgba(255,255,255,0.9) 0%, transparent 100%)",
          }}
        />
      </motion.div>
    </div>
  );
}
