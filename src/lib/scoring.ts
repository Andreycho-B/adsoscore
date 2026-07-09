const REJECTION_KEYWORDS = [
  "recepcion",
  "recepcionista",
  "atencion al cliente",
  "call center",
  "servicio al cliente",
  "correspondencia",
  "archivo",
  "archivo documental",
  "gestion documental",
  "digitacion",
  "bodega",
  "almacen",
  "inventario",
  "despacho",
  "entrega",
  "reparto",
  "logistica",
  "transporte",
  "conduccion",
  "aseo",
  "limpieza",
  "mantenimiento",
  "jardineria",
  "contabilidad",
  "facturacion",
  "cobranza",
  "tesoreria",
  "recursos humanos",
  "nomina",
  "liquidacion",
  "ventas",
  "comercial",
  "marketing",
  "publicidad",
  "community manager",
  "telemercadeo",
  "coworking",
  "espacio coworking",
  "salas de reunion",
  "reservas de salas",
  "atencion a visitantes",
];

const MANDATORY_KEYWORDS = [
  "programacion",
  "desarrollo",
  "software",
  "frontend",
  "backend",
  "fullstack",
  "full stack",
  "aplicacion",
  "sistema",
  "plataforma",
  "arquitectura",
  "integracion",
  "implementacion",
  "javascript",
  "typescript",
  "python",
  "java",
  "c#",
  "csharp",
  "php",
  "ruby",
  "go",
  "rust",
  "kotlin",
  "swift",
  "dart",
  "react",
  "angular",
  "vue",
  "next",
  "nuxt",
  "node",
  "express",
  "django",
  "flask",
  "fastapi",
  "spring",
  "laravel",
  "rails",
  ".net",
  "dotnet",
  "spring boot",
  "base de datos",
  "sql",
  "nosql",
  "mysql",
  "postgresql",
  "mongodb",
  "redis",
  "firebase",
  "supabase",
  "oracle",
  "api",
  "rest",
  "restful",
  "graphql",
  "microservicios",
  "devops",
  "ci/cd",
  "docker",
  "kubernetes",
  "git",
  "github",
  "gitlab",
  "pruebas",
  "testing",
  "qa",
  "aseguramiento",
  "calidad",
  "scrum",
  "agile",
  "kanban",
  "diseno",
  "ui",
  "ux",
  "interfaz",
  "mockup",
  "wireframe",
  "figma",
  "prototipado",
  "analisis",
  "requisitos",
  "levantamiento",
  "documentacion",
  "diagrama",
  "uml",
  "modelado",
];

const PRIORITY_CITIES = [
  "manizales",
  "pereira",
  "medellin",
  "bogota",
  "bucaramanga",
];

const ADS_PROGRAM_KEYWORDS = [
  "analisis de sistemas",
  "analisis de software",
  "desarrollo de software",
  "programacion",
  "ingenieria de software",
  "sistemas computacionales",
  "informatica",
  "tecnologia",
  "ciencias de la computacion",
];

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function hasKeyword(text: string, keyword: string): boolean {
  const normalized = normalizeText(text);
  const normalizedKeyword = normalizeText(keyword);
  const escaped = normalizedKeyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(escaped).test(normalized);
}

export function countTechMatches(text: string): number {
  const normalized = normalizeText(text);
  const seen = new Set<string>();
  for (const kw of MANDATORY_KEYWORDS) {
    const nKw = normalizeText(kw);
    const escaped = nKw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(escaped).test(normalized) && !seen.has(nKw)) {
      seen.add(nKw);
    }
  }
  return seen.size;
}

export function passesHardFilter(offer: {
  perfil: string;
  funciones: string;
}): boolean {
  const combined = `${offer.perfil} ${offer.funciones}`;

  for (const kw of REJECTION_KEYWORDS) {
    if (hasKeyword(combined, kw)) return false;
  }

  let mandatoryFound = false;
  for (const kw of MANDATORY_KEYWORDS) {
    if (hasKeyword(combined, kw)) {
      mandatoryFound = true;
      break;
    }
  }
  if (!mandatoryFound) return false;

  if (offer.funciones.length < 30) return false;

  return true;
}

export function calculateScore(offer: {
  perfil: string;
  funciones: string;
  ciudad?: string;
  modalidad?: string;
  empresa?: string;
  nit?: string;
  descripcion?: string;
  fecha_cierre?: string;
}): { total: number; breakdown: Record<string, number> } {
  const breakdown: Record<string, number> = {};

  const techMatches = countTechMatches(`${offer.perfil} ${offer.funciones}`);
  breakdown["stack_tecnologico"] = Math.min(techMatches, 25);

  let funcionesScore = 0;
  if (offer.funciones.length > 100) funcionesScore += 10;
  if (offer.funciones.length > 200) funcionesScore += 10;
  breakdown["funciones_ads"] = funcionesScore;

  breakdown["rues_activo"] = 5;

  if (
    offer.ciudad &&
    PRIORITY_CITIES.some(
      (c) => c === normalizeText(offer.ciudad as string)
    )
  ) {
    breakdown["ciudad_prioritaria"] = 10;
  } else {
    breakdown["ciudad_prioritaria"] = 0;
  }

  if (
    offer.modalidad &&
    ["remoto", "virtual", "home office"].some((m) =>
      hasKeyword(offer.modalidad as string, m)
    )
  ) {
    breakdown["modalidad_remota"] = 5;
  } else {
    breakdown["modalidad_remota"] = 0;
  }

  let empresaScore = 0;
  if (offer.empresa && offer.empresa.length > 5) empresaScore += 5;
  if (offer.nit && offer.nit.length > 0) empresaScore += 5;
  breakdown["empresa"] = empresaScore;

  if (offer.fecha_cierre) {
    const cierre = new Date(offer.fecha_cierre);
    const now = new Date();
    const diffDays =
      (cierre.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    breakdown["fecha_cierre"] = diffDays > 30 ? 10 : 0;
  } else {
    breakdown["fecha_cierre"] = 0;
  }

  if (offer.descripcion && offer.descripcion.length > 50) {
    breakdown["descripcion"] = 5;
  } else {
    breakdown["descripcion"] = 0;
  }

  const perfilLower = normalizeText(offer.perfil);
  const hasAdsProgram = ADS_PROGRAM_KEYWORDS.some((kw) => {
    const nKw = normalizeText(kw);
    const escaped = nKw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(escaped).test(perfilLower);
  });
  breakdown["perfil_ads"] = hasAdsProgram ? 5 : 0;

  const total = Object.values(breakdown).reduce((a, b) => a + b, 0);

  return { total, breakdown };
}

export function detectModalidad(funciones: string, perfil: string): string {
  const combined = `${funciones} ${perfil}`;
  const lower = combined
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (/\b(remoto|teletrabajo|home\s*office|trabajo\s*(en\s+)?casa|virtual)\b/.test(lower)) {
    return "Remoto";
  }
  if (/\b(hibrido|mixto|semipresencial)\b/.test(lower)) {
    return "Hibrido";
  }
  return "Presencial";
}

export function getScoreLabel(score: number): string {
  if (score >= 80) return "Excelente";
  if (score >= 60) return "Buena";
  if (score >= 40) return "Regular";
  return "Baja";
}

export function getScoreColor(score: number): string {
  if (score >= 80) return "var(--color-success)";
  if (score >= 60) return "var(--color-warning)";
  return "var(--color-error)";
}
