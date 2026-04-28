import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "RefLab",
    short_name: "RefLab",
    description: "Referee Decision Lab",
    start_url: "/",
    display: "standalone",
    background_color: "#030712",
    theme_color: "#6fc11f",
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