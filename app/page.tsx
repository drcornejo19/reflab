"use client";

import Image from "next/image";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function SplashPage() {
  const router = useRouter();

  useEffect(() => {
    const timer = setTimeout(() => {
      router.replace("/mobile-dashboard");
    }, 2600);

    return () => clearTimeout(timer);
  }, [router]);

  return (
    <main className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-[#020b14]">
      <div className="relative flex h-full w-full animate-splashFade items-center justify-center">
        <Image
          src="/splash.png"
          alt="RefLab Splash Mobile"
          width={1125}
          height={2436}
          priority
          className="block h-full w-full object-contain md:hidden"
        />

        <Image
          src="/splash-desktop.png"
          alt="RefLab Splash Desktop"
          width={1920}
          height={1080}
          priority
          className="hidden h-full w-full object-cover md:block"
        />
      </div>
    </main>
  );
}