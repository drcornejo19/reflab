"use client";

import Image from "next/image";
import { useState } from "react";
import { UserRound } from "lucide-react";

export function FounderPhoto() {
  const [imageError, setImageError] = useState(false);

  return (
    <div className="relative mx-auto w-full max-w-[520px] overflow-hidden rounded-[30px] border border-[#6fc11f]/25 bg-[#12333b] shadow-[0_0_50px_rgba(111,193,31,0.08)]">
      <div className="absolute -inset-8 bg-[radial-gradient(circle_at_top_left,rgba(111,193,31,0.26),transparent_34%)]" />

      <div className="relative aspect-[4/5] min-h-[320px]">
        {imageError ? (
          <div className="flex h-full min-h-[320px] flex-col items-center justify-center p-8 text-center">
            <div className="grid h-20 w-20 place-items-center rounded-full border border-[#6fc11f]/35 bg-[#6fc11f]/10 text-[#6fc11f]">
              <UserRound className="h-10 w-10" />
            </div>
            <p className="mt-5 text-sm font-black uppercase tracking-[0.24em] text-[#6fc11f]">
              Imagen pendiente
            </p>
            <p className="mt-3 max-w-xs text-sm leading-6 text-zinc-300">
              Colocá la foto en public/david-referee.jpg para completar esta
              sección.
            </p>
          </div>
        ) : (
          <Image
            src="/david-referee.jpg"
            alt="David Cornejo, fundador de RefLab"
            fill
            sizes="(max-width: 768px) 100vw, 520px"
            className="object-cover object-center"
            onError={() => setImageError(true)}
          />
        )}
      </div>
    </div>
  );
}
