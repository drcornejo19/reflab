export function HowRefLabWasBorn() {
  return (
    <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-[#05070d] px-6 py-12 text-white shadow-2xl md:px-10">
      <div className="grid gap-10 md:grid-cols-[1fr_0.9fr] md:items-center">
        <div>
          <p className="mb-3 text-sm font-semibold uppercase tracking-[0.3em] text-green-400">
            Nuestra historia
          </p>

          <h2 className="mb-5 text-3xl font-bold tracking-tight md:text-5xl">
            Cómo nació RefLab
          </h2>

          <div className="space-y-4 text-sm leading-7 text-white/75 md:text-base">
            <p>
              RefLab nace mucho antes de ser una plataforma. Nace en un cuartito,
              viendo la Regla 11 junto a mi padre, cuando el arbitraje apareció
              en mi vida como una manera de empezar a construir algo propio.
            </p>

            <p>
              Lo que empezó como una oportunidad, con el tiempo se transformó en
              pasión, formación y propósito. Desde mi ciudad natal, dentro de una
              estructura arbitral con poca infraestructura y muchas limitaciones,
              entendí que no siempre alcanza con tener ganas, saber el reglamento
              o esforzarse. También hace falta acceso, guía, oportunidades y una
              estructura que acompañe el crecimiento real del árbitro.
            </p>

            <p>
              Después de formarme en una de las escuelas más prestigiosas de
              Argentina, entrenar, capacitarme y recorrer categorías durante más
              de 16 años, comprendí que el arbitraje es mucho más que tomar
              decisiones dentro de una cancha. Es lectura, comunicación,
              liderazgo, percepción, preparación mental, manejo del conflicto,
              ética y capacidad de sostenerse bajo presión.
            </p>

            <p>
              RefLab nace para transformar esa experiencia en una herramienta
              para otros árbitros. Una plataforma pensada para profesionalizar el
              entrenamiento arbitral en todos los niveles, desde quienes recién
              empiezan hasta quienes buscan crecer en estructuras más
              competitivas.
            </p>
          </div>

          <blockquote className="mt-8 border-l-4 border-green-400 pl-5 text-lg font-semibold text-white md:text-xl">
            “RefLab existe para visualizar lo que no se ve y profesionalizar el
            camino del árbitro.”
          </blockquote>

          <div className="mt-8">
            <p className="font-semibold text-white">David Cornejo</p>
            <p className="text-sm text-white/55">
              Árbitro de fútbol — Fundador de RefLab
            </p>
          </div>
        </div>

        <div className="relative">
          <div className="absolute -inset-4 rounded-3xl bg-green-500/20 blur-2xl" />

          <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/5">
            <img
              src="/david-referee.jpg"
              alt="David Cornejo, fundador de RefLab"
              className="h-[500px] w-full object-cover grayscale"
            />
          </div>
        </div>
      </div>
    </section>
  );
}