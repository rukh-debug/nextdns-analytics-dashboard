import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "NDNS Analytics Dashboard",
    short_name: "NDNS Analytics",
    description: "NextDNS monitoring and analytics dashboard",
    start_url: "/",
    display: "standalone",
    background_color: "#171727",
    theme_color: "#6366f1",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
