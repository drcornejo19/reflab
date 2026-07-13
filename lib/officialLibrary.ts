import type { SportType } from "@/lib/sports";

export type OfficialLibraryDocument = {
  id: string;
  sportType: SportType;
  title: string;
  subtitle: string;
  language: string;
  type: string;
  href: string;
  status: "vigente" | "proxima_actualizacion" | "archivado";
  season: string;
  governingBody: "IFAB" | "FIFA";
  effectiveDate?: string | null;
};

export const officialLibraryDocuments: Record<
  SportType,
  OfficialLibraryDocument[]
> = {
  football_11: [
    {
      id: "ifab-2026-27-es",
      sportType: "football_11",
      title: "Reglas de Juego 2026/27",
      subtitle: "Portal oficial IFAB en espanol para la temporada publicada.",
      language: "Espanol",
      type: "Reglamento",
      href: "https://www.theifab.com/es/laws-of-the-game-documents/",
      status: "vigente",
      season: "2026/27",
      governingBody: "IFAB",
    },
    {
      id: "ifab-2026-27-en",
      sportType: "football_11",
      title: "Laws of the Game 2026/27",
      subtitle: "Official IFAB documents portal for the published season.",
      language: "English",
      type: "Laws",
      href: "https://www.theifab.com/laws-of-the-game-documents/",
      status: "vigente",
      season: "2026/27",
      governingBody: "IFAB",
    },
    {
      id: "ifab-law-changes-2026-27",
      sportType: "football_11",
      title: "Cambios reglamentarios 2026/27",
      subtitle: "Cambios oficiales de la temporada en el portal IFAB.",
      language: "Multilenguaje",
      type: "Cambios",
      href: "https://www.theifab.com/law-changes/latest/",
      status: "vigente",
      season: "2026/27",
      governingBody: "IFAB",
    },
    {
      id: "ifab-var-protocol",
      sportType: "football_11",
      title: "VAR Protocol",
      subtitle: "Protocolo oficial IFAB para competiciones con VAR.",
      language: "English",
      type: "VAR",
      href: "https://www.theifab.com/laws/latest/video-assistant-referee-var-protocol/",
      status: "vigente",
      season: "2026/27",
      governingBody: "IFAB",
    },
    {
      id: "ifab-archive",
      sportType: "football_11",
      title: "Archivo documental IFAB",
      subtitle: "Historico oficial de documentos, temporadas y circulares.",
      language: "Multilenguaje",
      type: "Archivo",
      href: "https://www.theifab.com/documents/",
      status: "archivado",
      season: "Historico",
      governingBody: "IFAB",
    },
  ],
  futsal: [
    {
      id: "fifa-futsal-2024-25",
      sportType: "futsal",
      title: "Futsal Laws of the Game 2024-25",
      subtitle: "Edicion oficial FIFA publicada en Digital Hub.",
      language: "English",
      type: "Reglamento",
      href: "https://digitalhub.fifa.com/m/7b1da24ec7a25f67/original/Futsal-Laws-of-the-Game-2024-2025.pdf",
      status: "vigente",
      season: "2024-25",
      governingBody: "FIFA",
      effectiveDate: "2024-11-04",
    },
  ],
};
