import { useState, useEffect } from "react";

export type Platform = "desktop" | "mobile";

export function usePlatform(): Platform {
  const [platform, setPlatform] = useState<Platform>(() => {
    if (window.innerWidth < 768) return "mobile";
    if (window.matchMedia("(pointer: coarse)").matches) return "mobile";
    return "desktop";
  });

  useEffect(() => {
    const handler = () => {
      const isMobile = window.innerWidth < 768 || window.matchMedia("(pointer: coarse)").matches;
      setPlatform(isMobile ? "mobile" : "desktop");
    };
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  return platform;
}
