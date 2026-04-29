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
    <main className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-[#030712]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(111,193,31,0.12),transparent_42%)]" />

      <div className="relative z-10 flex h-full w-full animate-splashFade items-center justify-center">
        <Image
          src="/splash.png"
          alt="RefLab Splash"
          width={1125}
          height={2436}
          priority
          className="h-auto max-h-[92vh] w-auto max-w-[92vw] object-contain"
        />
      </div>
    </main>
  );
}