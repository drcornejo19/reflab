import Image from "next/image";
import { RF_LOGO_SIZE, RF_LOGO_SRC } from "@/lib/brand";

export function Logo() {
  return (
    <div className="flex items-center gap-3">
      <Image
        src={RF_LOGO_SRC}
        alt="RefLab RF Logo"
        width={RF_LOGO_SIZE}
        height={RF_LOGO_SIZE}
        sizes="52px"
        className="h-[52px] w-[52px] object-contain"
        priority
      />

<div>
  <div className="text-2xl font-extrabold tracking-widest">
    <span className="text-white">REF</span>
    <span className="text-[#6fc11f]">LAB</span>
  </div>

  <div className="mt-1 text-[9px] uppercase tracking-[0.35em] text-zinc-500">
    Referee Decision Lab
  </div>
</div>
    </div>
  );
}
