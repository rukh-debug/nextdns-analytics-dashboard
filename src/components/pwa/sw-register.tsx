"use client";

import { useEffect } from "react";

export default function SWRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/", updateViaCache: "none" })
        .then((registration) => {
          void registration.update();
          console.info("SW registered:", registration.scope);
        })
        .catch((error) => {
          console.info("SW registration failed:", error);
        });
    }
  }, []);

  return null;
}
