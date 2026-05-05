export function RefLabHero() {
  return (
    <div className="mb-6 rounded-[28px] border border-white/10 bg-[#0b131b] p-6 text-center shadow-2xl">
      
      <h1 className="text-5xl font-black tracking-wide">
        REF<span className="text-[#6fc11f]">LAB</span>
      </h1>

      <p className="mt-2 text-sm tracking-[0.35em] text-zinc-400">
        REFEREE DECISION LAB
      </p>

      {/* ICONOS */}
      <div className="mt-6 grid grid-cols-5 gap-4 text-xs font-bold text-zinc-400">
        
        <div className="flex flex-col items-center gap-2">
          <div className="rounded-xl border border-[#6fc11f]/40 bg-[#6fc11f]/10 px-3 py-2 text-[#6fc11f]">
            VAR
          </div>
          ENTRENÁ
        </div>

        <div className="flex flex-col items-center gap-2">
          ⚖️
          ANALIZÁ
        </div>

        <div className="flex flex-col items-center gap-2">
          🎯
          DECIDÍ
        </div>

        <div className="flex flex-col items-center gap-2">
          📊
          MEJORÁ
        </div>

        <div className="flex flex-col items-center gap-2">
          📖
          APRENDÉ
        </div>

      </div>

      <p className="mt-6 text-sm font-black tracking-widest text-[#6fc11f]">
        ENTRENÁ. ANALIZÁ. DECIDÍ. MEJORÁ.
      </p>
    </div>
  );
}