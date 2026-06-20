import type { MetadataRoute } from "next";
import { RF_LOGO_SRC } from "@/lib/brand";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "RefLab",
    short_name: "RefLab",
    description: "Referee Decision Lab",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#030712",
    theme_color: "#030712",
    icons: [
      {
        src: RF_LOGO_SRC,
        sizes: "1024x1024",
        type: "image/png",
        purpose: "any",
      },
      {
        src: RF_LOGO_SRC,
        sizes: "1024x1024",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
