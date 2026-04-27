import Image from "next/image";

export function Logo() {
  return (
    <div className="flex items-center gap-3">
      <Image
        src="/rf-logo.png"
        alt="RefLab RF Logo"
        width={52}
        height={52}
        className="rounded-full"
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