export type AppLanguage = "es" | "en" | "pt";

export const languageOptions: { value: AppLanguage; label: string; shortLabel: string }[] = [
  { value: "es", label: "Espanol", shortLabel: "ES" },
  { value: "en", label: "English", shortLabel: "EN" },
  { value: "pt", label: "Portugues", shortLabel: "PT" },
];

export const languageStorageKey = "reflab-language";

export type TranslationKey =
  | "nav.dashboard"
  | "nav.training"
  | "nav.evaluations"
  | "nav.performance"
  | "nav.library"
  | "nav.institutions"
  | "nav.notifications"
  | "nav.profile"
  | "nav.support"
  | "nav.admin"
  | "nav.reflab"
  | "nav.train"
  | "nav.evaluate"
  | "nav.moreAccess"
  | "nav.openMenu"
  | "nav.closeMenu"
  | "settings.title"
  | "settings.languageSubtitle"
  | "settings.selectLanguage"
  | "common.open"
  | "common.comingSoon"
  | "common.available"
  | "common.beta"
  | "common.notRegistered"
  | "common.pending"
  | "common.save"
  | "common.saving"
  | "common.saved"
  | "profile.loading"
  | "profile.refCard"
  | "profile.downloadRefCard"
  | "profile.changePhoto"
  | "profile.uploadingPhoto"
  | "profile.technicalSheet"
  | "profile.title"
  | "profile.description"
  | "profile.firstName"
  | "profile.lastName"
  | "profile.refereeType"
  | "profile.mainRole"
  | "profile.association"
  | "profile.category"
  | "profile.country"
  | "profile.city"
  | "profile.location"
  | "profile.rankingPrivacy"
  | "profile.rankingPrivacyHelp"
  | "profile.showRealName"
  | "profile.rankingFallback"
  | "profile.saveProfile"
  | "profile.savingProfile"
  | "profile.saved"
  | "profile.signOut"
  | "profile.verified"
  | "profile.verifiedRefLab"
  | "profile.score"
  | "profile.tests"
  | "profile.best"
  | "profile.ratingTrend"
  | "profile.discipline"
  | "profile.experience"
  | "profile.lastTest"
  | "profile.ranking"
  | "profile.trainings"
  | "profile.cityCountry"
  | "evaluations.kicker"
  | "evaluations.title"
  | "evaluations.description"
  | "evaluations.videoAnalysis.title"
  | "evaluations.videoAnalysis.category"
  | "evaluations.videoAnalysis.description"
  | "evaluations.refereeExam.title"
  | "evaluations.refereeExam.category"
  | "evaluations.refereeExam.description"
  | "evaluations.rulesExam.title"
  | "evaluations.rulesExam.category"
  | "evaluations.rulesExam.description"
  | "evaluations.varExam.title"
  | "evaluations.varExam.category"
  | "evaluations.varExam.description"
  | "evaluations.englishExam.title"
  | "evaluations.englishExam.category"
  | "evaluations.englishExam.description"
  | "evaluations.timedSimulation.title"
  | "evaluations.timedSimulation.category"
  | "evaluations.timedSimulation.description";

const translations: Record<AppLanguage, Record<TranslationKey, string>> = {
  es: {
    "nav.dashboard": "Dashboard",
    "nav.training": "Entrenamiento",
    "nav.evaluations": "Evaluaciones",
    "nav.performance": "Ref Performance",
    "nav.library": "Biblioteca IFAB",
    "nav.institutions": "Instituciones",
    "nav.notifications": "Notificaciones",
    "nav.profile": "Perfil",
    "nav.support": "Soporte",
    "nav.admin": "Admin",
    "nav.reflab": "RefLab",
    "nav.train": "Entrenar",
    "nav.evaluate": "Evaluar",
    "nav.moreAccess": "Mas accesos",
    "nav.openMenu": "Abrir menu",
    "nav.closeMenu": "Cerrar menu",
    "settings.title": "Configuracion",
    "settings.languageSubtitle": "Idioma de la app y feedback",
    "settings.selectLanguage": "Seleccionar idioma",
    "common.open": "Abrir",
    "common.comingSoon": "Proximamente",
    "common.available": "Disponible",
    "common.beta": "Beta",
    "common.notRegistered": "No registrado",
    "common.pending": "Pendiente",
    "common.save": "Guardar",
    "common.saving": "Guardando...",
    "common.saved": "Guardado",
    "profile.loading": "Cargando perfil...",
    "profile.refCard": "RefCard",
    "profile.downloadRefCard": "Descargar RefCard",
    "profile.changePhoto": "Cambiar foto",
    "profile.uploadingPhoto": "Subiendo...",
    "profile.technicalSheet": "Ficha tecnica",
    "profile.title": "Perfil arbitral",
    "profile.description": "Identidad, rol, categoria y lectura rapida de rendimiento. La ficha conserva tus datos reales y usa las mismas metricas que Rendimiento.",
    "profile.firstName": "Nombre",
    "profile.lastName": "Apellido",
    "profile.refereeType": "Tipo de arbitro",
    "profile.mainRole": "Rol principal",
    "profile.association": "Asociacion / Liga",
    "profile.category": "Categoria",
    "profile.country": "Pais",
    "profile.city": "Ciudad",
    "profile.location": "Ubicacion",
    "profile.rankingPrivacy": "Privacidad en ranking",
    "profile.rankingPrivacyHelp": "Este nombre y apellido puede figurar en el ranking de RefLab. Tu RefCard identifica tu perfil sin exponer tu nombre completo.",
    "profile.showRealName": "Mostrar mi nombre y apellido en el ranking",
    "profile.rankingFallback": "Si lo desactivas, el ranking mostrara solamente tu RefCard:",
    "profile.saveProfile": "Guardar perfil",
    "profile.savingProfile": "Guardando...",
    "profile.saved": "Perfil guardado correctamente.",
    "profile.signOut": "Cerrar sesion",
    "profile.verified": "Verificado",
    "profile.verifiedRefLab": "Verificado RefLab",
    "profile.score": "Score",
    "profile.tests": "Tests",
    "profile.best": "Best",
    "profile.ratingTrend": "Rating trend",
    "profile.discipline": "Disciplina",
    "profile.experience": "Experiencia",
    "profile.lastTest": "Ultimo test",
    "profile.ranking": "Ranking",
    "profile.trainings": "Entrenamientos",
    "profile.cityCountry": "Ciudad / pais",
    "evaluations.kicker": "Evaluaciones",
    "evaluations.title": "Evaluaciones",
    "evaluations.description": "Rendi simulaciones y examenes para medir tu criterio arbitral bajo condiciones formales.",
    "evaluations.videoAnalysis.title": "Video Analisis",
    "evaluations.videoAnalysis.category": "Evaluacion por video",
    "evaluations.videoAnalysis.description": "Analiza clips reales por disputas, faltas tacticas, manos y fuera de juego. Registra decision tecnica, disciplina y criterio.",
    "evaluations.refereeExam.title": "Examen arbitral",
    "evaluations.refereeExam.category": "Formal",
    "evaluations.refereeExam.description": "Clips consecutivos sin feedback inmediato, score final y cierre tecnico del examen.",
    "evaluations.rulesExam.title": "Examen de reglas",
    "evaluations.rulesExam.category": "IFAB",
    "evaluations.rulesExam.description": "20 preguntas exigentes para medir interpretacion reglamentaria bajo tiempo.",
    "evaluations.varExam.title": "Examen VAR",
    "evaluations.varExam.category": "VAR",
    "evaluations.varExam.description": "Evaluacion formal de protocolo VAR, OFR, APP, factual e interpretativo.",
    "evaluations.englishExam.title": "Examen de comunicacion arbitral",
    "evaluations.englishExam.category": "Comunicacion",
    "evaluations.englishExam.description": "Situaciones para explicar decisiones en espanol e ingles tecnico arbitral.",
    "evaluations.timedSimulation.title": "Simulacion cronometrada",
    "evaluations.timedSimulation.category": "Tiempo real",
    "evaluations.timedSimulation.description": "Practica bajo presion con reloj, bloques de clips y cierre de rendimiento.",
  },
  en: {
    "nav.dashboard": "Dashboard",
    "nav.training": "Training",
    "nav.evaluations": "Evaluations",
    "nav.performance": "Ref Performance",
    "nav.library": "IFAB Library",
    "nav.institutions": "Institutions",
    "nav.notifications": "Notifications",
    "nav.profile": "Profile",
    "nav.support": "Support",
    "nav.admin": "Admin",
    "nav.reflab": "RefLab",
    "nav.train": "Train",
    "nav.evaluate": "Evaluate",
    "nav.moreAccess": "More access",
    "nav.openMenu": "Open menu",
    "nav.closeMenu": "Close menu",
    "settings.title": "Settings",
    "settings.languageSubtitle": "App and feedback language",
    "settings.selectLanguage": "Select language",
    "common.open": "Open",
    "common.comingSoon": "Coming soon",
    "common.available": "Available",
    "common.beta": "Beta",
    "common.notRegistered": "Not registered",
    "common.pending": "Pending",
    "common.save": "Save",
    "common.saving": "Saving...",
    "common.saved": "Saved",
    "profile.loading": "Loading profile...",
    "profile.refCard": "RefCard",
    "profile.downloadRefCard": "Download RefCard",
    "profile.changePhoto": "Change photo",
    "profile.uploadingPhoto": "Uploading...",
    "profile.technicalSheet": "Technical sheet",
    "profile.title": "Referee profile",
    "profile.description": "Identity, role, category and quick performance reading. The card keeps your real data and uses the same metrics as Performance.",
    "profile.firstName": "First name",
    "profile.lastName": "Last name",
    "profile.refereeType": "Referee type",
    "profile.mainRole": "Main role",
    "profile.association": "Association / League",
    "profile.category": "Category",
    "profile.country": "Country",
    "profile.city": "City",
    "profile.location": "Location",
    "profile.rankingPrivacy": "Ranking privacy",
    "profile.rankingPrivacyHelp": "This first and last name may appear in the RefLab ranking. Your RefCard identifies your profile without exposing your full name.",
    "profile.showRealName": "Show my first and last name in ranking",
    "profile.rankingFallback": "If disabled, ranking will only show your RefCard:",
    "profile.saveProfile": "Save profile",
    "profile.savingProfile": "Saving...",
    "profile.saved": "Profile saved successfully.",
    "profile.signOut": "Sign out",
    "profile.verified": "Verified",
    "profile.verifiedRefLab": "Verified RefLab",
    "profile.score": "Score",
    "profile.tests": "Tests",
    "profile.best": "Best",
    "profile.ratingTrend": "Rating trend",
    "profile.discipline": "Discipline",
    "profile.experience": "Experience",
    "profile.lastTest": "Last test",
    "profile.ranking": "Ranking",
    "profile.trainings": "Trainings",
    "profile.cityCountry": "City / country",
    "evaluations.kicker": "Evaluations",
    "evaluations.title": "Evaluations",
    "evaluations.description": "Take simulations and exams to measure your referee criteria under formal conditions.",
    "evaluations.videoAnalysis.title": "Video Analysis",
    "evaluations.videoAnalysis.category": "Video evaluation",
    "evaluations.videoAnalysis.description": "Analyze real clips by duels, tactical fouls, handball and offside. Records technical decision, discipline and criteria.",
    "evaluations.refereeExam.title": "Referee exam",
    "evaluations.refereeExam.category": "Formal",
    "evaluations.refereeExam.description": "Consecutive clips without instant feedback, final score and technical exam summary.",
    "evaluations.rulesExam.title": "Rules exam",
    "evaluations.rulesExam.category": "IFAB",
    "evaluations.rulesExam.description": "20 demanding questions to measure rule interpretation under time pressure.",
    "evaluations.varExam.title": "VAR exam",
    "evaluations.varExam.category": "VAR",
    "evaluations.varExam.description": "Formal evaluation of VAR protocol, OFR, APP, factual and interpretative decisions.",
    "evaluations.englishExam.title": "Referee communication exam",
    "evaluations.englishExam.category": "Communication",
    "evaluations.englishExam.description": "Situations to explain decisions in Spanish and technical refereeing English.",
    "evaluations.timedSimulation.title": "Timed simulation",
    "evaluations.timedSimulation.category": "Real time",
    "evaluations.timedSimulation.description": "Practice under pressure with timer, clip blocks and performance closure.",
  },
  pt: {
    "nav.dashboard": "Painel",
    "nav.training": "Treinamento",
    "nav.evaluations": "Avaliacoes",
    "nav.performance": "Ref Performance",
    "nav.library": "Biblioteca IFAB",
    "nav.institutions": "Instituicoes",
    "nav.notifications": "Notificacoes",
    "nav.profile": "Perfil",
    "nav.support": "Suporte",
    "nav.admin": "Admin",
    "nav.reflab": "RefLab",
    "nav.train": "Treinar",
    "nav.evaluate": "Avaliar",
    "nav.moreAccess": "Mais acessos",
    "nav.openMenu": "Abrir menu",
    "nav.closeMenu": "Fechar menu",
    "settings.title": "Configuracao",
    "settings.languageSubtitle": "Idioma do app e do feedback",
    "settings.selectLanguage": "Selecionar idioma",
    "common.open": "Abrir",
    "common.comingSoon": "Em breve",
    "common.available": "Disponivel",
    "common.beta": "Beta",
    "common.notRegistered": "Nao registrado",
    "common.pending": "Pendente",
    "common.save": "Salvar",
    "common.saving": "Salvando...",
    "common.saved": "Salvo",
    "profile.loading": "Carregando perfil...",
    "profile.refCard": "RefCard",
    "profile.downloadRefCard": "Baixar RefCard",
    "profile.changePhoto": "Alterar foto",
    "profile.uploadingPhoto": "Enviando...",
    "profile.technicalSheet": "Ficha tecnica",
    "profile.title": "Perfil arbitral",
    "profile.description": "Identidade, funcao, categoria e leitura rapida de desempenho. A ficha preserva seus dados reais e usa as mesmas metricas de Desempenho.",
    "profile.firstName": "Nome",
    "profile.lastName": "Sobrenome",
    "profile.refereeType": "Tipo de arbitro",
    "profile.mainRole": "Funcao principal",
    "profile.association": "Associacao / Liga",
    "profile.category": "Categoria",
    "profile.country": "Pais",
    "profile.city": "Cidade",
    "profile.location": "Localizacao",
    "profile.rankingPrivacy": "Privacidade no ranking",
    "profile.rankingPrivacyHelp": "Este nome e sobrenome podem aparecer no ranking RefLab. Sua RefCard identifica seu perfil sem expor seu nome completo.",
    "profile.showRealName": "Mostrar meu nome e sobrenome no ranking",
    "profile.rankingFallback": "Se desativado, o ranking mostrara somente sua RefCard:",
    "profile.saveProfile": "Salvar perfil",
    "profile.savingProfile": "Salvando...",
    "profile.saved": "Perfil salvo corretamente.",
    "profile.signOut": "Sair",
    "profile.verified": "Verificado",
    "profile.verifiedRefLab": "Verificado RefLab",
    "profile.score": "Score",
    "profile.tests": "Testes",
    "profile.best": "Melhor",
    "profile.ratingTrend": "Tendencia",
    "profile.discipline": "Disciplina",
    "profile.experience": "Experiencia",
    "profile.lastTest": "Ultimo teste",
    "profile.ranking": "Ranking",
    "profile.trainings": "Treinos",
    "profile.cityCountry": "Cidade / pais",
    "evaluations.kicker": "Avaliacoes",
    "evaluations.title": "Avaliacoes",
    "evaluations.description": "Realize simulacoes e provas para medir seu criterio arbitral em condicoes formais.",
    "evaluations.videoAnalysis.title": "Video Analise",
    "evaluations.videoAnalysis.category": "Avaliacao por video",
    "evaluations.videoAnalysis.description": "Analise clipes reais por disputas, faltas taticas, mao na bola e impedimento. Registra decisao tecnica, disciplina e criterio.",
    "evaluations.refereeExam.title": "Exame arbitral",
    "evaluations.refereeExam.category": "Formal",
    "evaluations.refereeExam.description": "Clipes consecutivos sem feedback imediato, score final e fechamento tecnico do exame.",
    "evaluations.rulesExam.title": "Exame de regras",
    "evaluations.rulesExam.category": "IFAB",
    "evaluations.rulesExam.description": "20 perguntas exigentes para medir interpretacao das regras contra o tempo.",
    "evaluations.varExam.title": "Exame VAR",
    "evaluations.varExam.category": "VAR",
    "evaluations.varExam.description": "Avaliacao formal de protocolo VAR, OFR, APP, factual e interpretativo.",
    "evaluations.englishExam.title": "Exame de comunicacao arbitral",
    "evaluations.englishExam.category": "Comunicacao",
    "evaluations.englishExam.description": "Situacoes para explicar decisoes em espanhol e ingles tecnico arbitral.",
    "evaluations.timedSimulation.title": "Simulacao cronometrada",
    "evaluations.timedSimulation.category": "Tempo real",
    "evaluations.timedSimulation.description": "Pratica sob pressao com relogio, blocos de clipes e fechamento de desempenho.",
  },
};

export function translate(language: AppLanguage, key: TranslationKey) {
  return translations[language]?.[key] ?? translations.es[key] ?? key;
}

export function normalizeAppLanguage(value?: string | null): AppLanguage {
  const language = value?.trim().toLowerCase();

  if (language?.startsWith("en")) return "en";
  if (language?.startsWith("pt")) return "pt";
  return "es";
}

export function getStoredLanguage(): AppLanguage {
  if (typeof window === "undefined") return "es";

  const stored = window.localStorage.getItem(languageStorageKey);
  if (stored) return normalizeAppLanguage(stored);

  return normalizeAppLanguage(window.navigator.language);
}

export function setStoredLanguage(language: AppLanguage) {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(languageStorageKey, language);
  window.dispatchEvent(new CustomEvent("reflab-language-change", { detail: language }));
}

export function subscribeToLanguageChange(callback: (language: AppLanguage) => void) {
  if (typeof window === "undefined") return () => undefined;

  const handler = (event: Event) => {
    callback((event as CustomEvent<AppLanguage>).detail ?? getStoredLanguage());
  };

  const storageHandler = (event: StorageEvent) => {
    if (event.key === languageStorageKey) callback(getStoredLanguage());
  };

  window.addEventListener("reflab-language-change", handler);
  window.addEventListener("storage", storageHandler);

  return () => {
    window.removeEventListener("reflab-language-change", handler);
    window.removeEventListener("storage", storageHandler);
  };
}
