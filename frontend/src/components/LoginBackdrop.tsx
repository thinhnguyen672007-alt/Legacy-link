import { memo, useEffect, useState } from "react";
import { AnimatedLoginBackground } from "./AnimatedLoginBackground";
import "./login-backdrop.css";

// Keep the artwork and its animation timeline mounted across navigation.
// Route updates must not reconcile the 118 decorative SVG paths.
const Artwork = memo(AnimatedLoginBackground);

export const LoginBackdrop = memo(function LoginBackdrop({ collapsed }: { collapsed: boolean }) {
  const [hidden, setHidden] = useState(() => document.hidden);
  useEffect(() => {
    const update = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  return <div className={`ll-login ll-morph-surface${collapsed ? " collapsed" : ""}`} aria-hidden="true" data-paused={hidden}>
    <Artwork />
  </div>;
});
