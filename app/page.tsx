"use client";

import Image from "next/image";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function SplashPage() {
  const router = useRouter();

  useEffect(() => {
    const timer = setTimeout(() => {
      router.replace("/home");
    }, 2600);

    return () => clearTimeout(timer);
  }, [router]);

  return (
    <main className="fixed inset-0 z-50 flex items-center justify-center bg-[#020b14] overflow-hidden">

      {/* GLOW */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(111,193,31,0.12),transparent_45%)]" />

      {/* CONTENIDO */}
      <div className="relative w-full h-full flex items-center justify-center animate-splashFade">

        {/* 📱 MOBILE */}
        <Image
          src="/splash.png"
          alt="RefLab Mobile Splash"
          width={1125}
          height={2436}
          priority
          className="block md:hidden w-full h-full object-cover"
        />

        {/* 🖥 DESKTOP */}
        <Image
          src="/splash-desktop.png"
          alt="RefLab Desktop Splash"
          width={1920}
          height={1080}
          priority
          className="hidden md:block w-full h-full object-cover"
        />

      </div>
    </main>
  );
}