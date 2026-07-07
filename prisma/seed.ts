import "dotenv/config";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Hard-filter + scoring logic (copied from src/lib/scoring.ts for seed)
// ---------------------------------------------------------------------------

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

function countTechMatches(text: string): number {
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

function passesHardFilter(offer: {
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

function calculateScore(offer: {
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function detectModalidad(funciones: string, perfil: string): string {
  const combined = `${funciones} ${perfil}`;
  const lower = normalizeText(combined);
  if (
    ["remoto", "virtual", "home office"].some((m) =>
      new RegExp(m).test(lower)
    )
  ) {
    return "Remoto";
  }
  if (new RegExp("hibrido").test(lower)) {
    return "Hibrido";
  }
  return "Presencial";
}

function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  const parts = dateStr.trim().split("/");
  if (parts.length !== 3) return null;
  const [day, month, year] = parts.map(Number);
  if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
  return new Date(year, month - 1, day);
}

interface SgvaOffer {
  id: string;
  especialidad: string;
  perfil: string;
  funciones: string;
  departamento?: string;
  ciudad?: string;
  direccion?: string;
  telefono?: string;
  contacto?: string;
  email?: string;
  empresa: string;
  nit?: string;
  fecha_creacion?: string;
  fecha_cierre?: string;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });

  try {
    const jsonPath = resolve(__dirname, "..", "..", "all_solicitudes.json");
    const raw = readFileSync(jsonPath, "utf-8");
    const offers: SgvaOffer[] = JSON.parse(raw);

    console.log(`Loaded ${offers.length} offers from ${jsonPath}`);

    let passed = 0;
    let rejected = 0;

    for (let i = 0; i < offers.length; i++) {
      const offer = offers[i];
      const idx = i + 1;
      console.log(
        `Processing offer ${idx}/${offers.length}: ${offer.empresa}`
      );

      if (!passesHardFilter({ perfil: offer.perfil, funciones: offer.funciones })) {
        rejected++;
        continue;
      }

      const modalidad = detectModalidad(offer.funciones, offer.perfil);
      const fechaPub = parseDate(offer.fecha_creacion ?? "");
      const fechaCierre = parseDate(offer.fecha_cierre ?? "");

      const { total, breakdown } = calculateScore({
        perfil: offer.perfil,
        funciones: offer.funciones,
        ciudad: offer.ciudad?.trim(),
        modalidad,
        empresa: offer.empresa,
        nit: offer.nit,
        descripcion: null as unknown as string,
        fecha_cierre: offer.fecha_cierre,
      });

      await prisma.offer.upsert({
        where: { sgvaId: offer.id },
        create: {
          sgvaId: offer.id,
          titulo: offer.especialidad?.trim() ?? "",
          empresa: offer.empresa?.trim() ?? "",
          nit: offer.nit?.trim() ?? null,
          descripcion: null,
          funciones: offer.funciones?.trim() ?? null,
          perfil: offer.perfil?.trim() ?? null,
          ciudad: offer.ciudad?.trim() ?? null,
          departamento: offer.departamento?.trim() ?? null,
          direccion: offer.direccion?.trim() ?? null,
          telefono: offer.telefono?.trim() ?? null,
          contacto: offer.contacto?.trim() ?? null,
          email: offer.email?.trim() ?? null,
          modalidad,
          fechaPublicacion: fechaPub,
          fechaCierre,
          score: total,
          scoreGitHub: 0,
          scoreFunciones: breakdown["funciones_ads"] ?? 0,
          scoreRUES: breakdown["rues_activo"] ?? 0,
          scoreUbicacion: breakdown["ciudad_prioritaria"] ?? 0,
          scoreModalidad: breakdown["modalidad_remota"] ?? 0,
          scoreResenas: 0,
          scoreLinkedIn: 0,
          scoreTamano: breakdown["empresa"] ?? 0,
          scoreAntiguedad: breakdown["fecha_cierre"] ?? 0,
          isActive: true,
          isVisible: true,
        },
        update: {
          titulo: offer.especialidad?.trim() ?? "",
          empresa: offer.empresa?.trim() ?? "",
          nit: offer.nit?.trim() ?? null,
          funciones: offer.funciones?.trim() ?? null,
          perfil: offer.perfil?.trim() ?? null,
          ciudad: offer.ciudad?.trim() ?? null,
          departamento: offer.departamento?.trim() ?? null,
          direccion: offer.direccion?.trim() ?? null,
          telefono: offer.telefono?.trim() ?? null,
          contacto: offer.contacto?.trim() ?? null,
          email: offer.email?.trim() ?? null,
          modalidad,
          fechaPublicacion: fechaPub,
          fechaCierre,
          score: total,
          scoreGitHub: 0,
          scoreFunciones: breakdown["funciones_ads"] ?? 0,
          scoreRUES: breakdown["rues_activo"] ?? 0,
          scoreUbicacion: breakdown["ciudad_prioritaria"] ?? 0,
          scoreModalidad: breakdown["modalidad_remota"] ?? 0,
          scoreResenas: 0,
          scoreLinkedIn: 0,
          scoreTamano: breakdown["empresa"] ?? 0,
          scoreAntiguedad: breakdown["fecha_cierre"] ?? 0,
          isActive: true,
          isVisible: true,
        },
      });

      passed++;
    }

    console.log(
      `\nImport complete: ${passed} passed, ${rejected} rejected, ${offers.length} total`
    );
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
