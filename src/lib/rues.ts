const RUES_API_URL = 'https://consultaweb.rues.org.co/ConsultaNITProxy/ConsultaNITProxy.aspx';

interface RUESValidationResult {
  ruesActivo: boolean;
  razonSocial: string;
  estado: string;
  fechaConstitucion: string | null;
  direccion: string | null;
  telefono: string | null;
}

interface RUESEnrichResult {
  ruesScore: number;
  ruesData: Record<string, unknown>;
}

const ruesCache = new Map<string, RUESValidationResult>();

function cleanNIT(nit: string): string {
  return nit.replace(/[.\-\s]/g, '');
}

function isValidNIT(nit: string): boolean {
  const cleaned = cleanNIT(nit);
  return /^\d{9,10}$/.test(cleaned);
}

function getDefaultResult(): RUESValidationResult {
  return {
    ruesActivo: false,
    razonSocial: '',
    estado: 'DESCONOCIDO',
    fechaConstitucion: null,
    direccion: null,
    telefono: null,
  };
}

async function fetchRUESData(nit: string): Promise<RUESValidationResult> {
  const cleaned = cleanNIT(nit);

  try {
    const response = await fetch(RUES_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        txtNIT: cleaned,
        btnConsulta: 'Consultar',
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      return getDefaultResult();
    }

    const html = await response.text();

    const razonSocialMatch = html.match(/Raz[oó]n\s*Social[^<]*<[^>]*>([^<]+)/i);
    const estadoMatch = html.match(/Estado[^<]*<[^>]*>([^<]+)/i);
    const fechaMatch = html.match(/Fecha\s*(?:de\s*)?(?:Constituci[oó]n|Registro)[^<]*<[^>]*>([^<]+)/i);
    const direccionMatch = html.match(/Direcci[oó]n[^<]*<[^>]*>([^<]+)/i);
    const telefonoMatch = html.match(/Tel[eé]fono[^<]*<[^>]*>([^<]+)/i);

    const estado = estadoMatch ? estadoMatch[1].trim() : 'DESCONOCIDO';
    const isActive = /activa?/i.test(estado);

    return {
      ruesActivo: isActive,
      razonSocial: razonSocialMatch ? razonSocialMatch[1].trim() : '',
      estado,
      fechaConstitucion: fechaMatch ? fechaMatch[1].trim() : null,
      direccion: direccionMatch ? direccionMatch[1].trim() : null,
      telefono: telefonoMatch ? telefonoMatch[1].trim() : null,
    };
  } catch {
    return getDefaultResult();
  }
}

export async function validateRUES(nit: string): Promise<RUESValidationResult> {
  if (!nit || !isValidNIT(nit)) {
    return getDefaultResult();
  }

  const cleaned = cleanNIT(nit);

  if (ruesCache.has(cleaned)) {
    return ruesCache.get(cleaned)!;
  }

  const result = await fetchRUESData(cleaned);
  ruesCache.set(cleaned, result);

  return result;
}

export async function enrichOfferFromRUES(nit: string): Promise<RUESEnrichResult> {
  const validation = await validateRUES(nit);

  const ruesScore = validation.ruesActivo ? 10 : 0;

  const ruesData: Record<string, unknown> = {
    ruesActivo: validation.ruesActivo,
    razonSocial: validation.razonSocial,
    estado: validation.estado,
    fechaConstitucion: validation.fechaConstitucion,
    direccion: validation.direccion,
    telefono: validation.telefono,
    validatedAt: new Date().toISOString(),
  };

  return { ruesScore, ruesData };
}
