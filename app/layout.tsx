import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { DisciplineProvider } from "@/components/DisciplineProvider";
import { InstitutionProvider } from "@/components/institutional/InstitutionProvider";
import { RF_LOGO_SRC } from "@/lib/brand";
import "./globals.css";

export const metadata: Metadata = {
  title: "RefLab",
  description: "Referee Decision Lab",
  applicationName: "RefLab",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "RefLab",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: RF_LOGO_SRC,
    apple: RF_LOGO_SRC,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html lang="es" className="h-full antialiased">
        <body className="min-h-full flex flex-col">
          <DisciplineProvider>
            <InstitutionProvider>{children}</InstitutionProvider>
          </DisciplineProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
