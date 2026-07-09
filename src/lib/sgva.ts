export interface SGVAOffer {
  id: string;
  especialidad: string;
  perfil: string;
  funciones: string;
  departamento: string;
  ciudad: string;
  direccion: string;
  telefono: string;
  contacto: string;
  requeridos: string;
  email: string;
  fecha_creacion: string;
  fecha_cierre: string;
  aplicados: string;
  empresa: string;
  nit: string;
}

const SGVA_BASE = 'https://caprendizaje.sena.edu.co/sgva';

function extractHiddenField(html: string, name: string): string | null {
  const regex = new RegExp(`id="${name}"[^>]*value="([^"]*)"`, 'i');
  const match = html.match(regex);
  return match ? match[1] : null;
}

export async function loginToSGVA(
  document: string,
  password: string
): Promise<{ cookies: Record<string, string>; especialidadId: string }> {
  const headers: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'X-Requested-With': 'XMLHttpRequest',
    Referer: `${SGVA_BASE}/Aprendices/Solicitudes/`,
  };

  const loginPageRes = await fetch(`${SGVA_BASE}/SGVA_Diseno/pag/login.aspx`, {
    headers,
  });
  const loginHtml = await loginPageRes.text();

  const viewState = extractHiddenField(loginHtml, '__VIEWSTATE');
  const viewStateGen = extractHiddenField(loginHtml, '__VIEWSTATEGENERATOR');
  const eventValidation = extractHiddenField(loginHtml, '__EVENTVALIDATION');

  if (!viewState || !viewStateGen || !eventValidation) {
    throw new Error('No se pudieron extraer los campos del formulario de login SGVA');
  }

  const formData = new URLSearchParams({
    __EVENTTARGET: 'ini_session_aprendiz',
    __EVENTARGUMENT: '',
    __LASTFOCUS: '',
    __VIEWSTATE: viewState,
    __VIEWSTATEGENERATOR: viewStateGen,
    __EVENTVALIDATION: eventValidation,
    tbLoginUsuario: document,
    __tbPasswordUsuario: password,
    ini_session_aprendiz: 'Iniciar sesion',
  });

  const loginRes = await fetch(`${SGVA_BASE}/SGVA_Diseno/pag/login.aspx`, {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: formData.toString(),
    redirect: 'manual',
  });

  const setCookie = loginRes.headers.get('set-cookie');
  const cookies: Record<string, string> = {};
  if (setCookie) {
    for (const c of setCookie.split(',')) {
      const [kv] = c.trim().split(';');
      const [key, val] = kv.split('=');
      if (key && val) cookies[key.trim()] = val.trim();
    }
  }

  const redirectUrl = loginRes.headers.get('location');
  if (!redirectUrl) {
    throw new Error('Login SGVA fallido: no se recibio redireccion');
  }

  await fetch(redirectUrl.replace('http://', 'https://'), {
    headers: {
      ...headers,
      Cookie: Object.entries(cookies)
        .map(([k, v]) => `${k}=${v}`)
        .join('; '),
    },
  });

  const acadRes = await fetch(
    `${SGVA_BASE}/AprendizAcademico/AprendizConsultarAcademicos`,
    {
      headers: {
        ...headers,
        Cookie: Object.entries(cookies)
          .map(([k, v]) => `${k}=${v}`)
          .join('; '),
      },
    }
  );
  const acadData = await acadRes.json() as any;
  const especialidadId = acadData.aaData?.[0]?.[7];

  if (!especialidadId) {
    throw new Error('No se pudo obtener la especialidad del aprendiz');
  }

  return { cookies, especialidadId: String(especialidadId) };
}

function cookieString(cookies: Record<string, string>): string {
  return Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

export async function fetchOffersFromSGVA(
  cookies: Record<string, string>,
  especialidadId: string
): Promise<SGVAOffer[]> {
  const headers: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0',
    Accept: 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
    Referer: `${SGVA_BASE}/Aprendices/Solicitudes/`,
    Cookie: cookieString(cookies),
  };

  const solRes = await fetch(
    `${SGVA_BASE}/Solicitudes/AprendizConsultarSolicitudesRequeridas?especialidad=${especialidadId}&dpto=0&ciudad=0&RSocial=`,
    { headers }
  );
  const solData = await solRes.json() as any;
  const allSols: any[] = solData.aaData || [];

  const solicitudIds: string[] = [];
  for (const sol of allSols) {
    const btnHtml = sol[0] as string;
    const match = btnHtml?.match?.(/data-id-solicitud="(\d+)"/);
    if (match) solicitudIds.push(match[1]);
  }

  const offers: SGVAOffer[] = [];

  for (const solId of solicitudIds) {
    try {
      const detailRes = await fetch(
        `${SGVA_BASE}/Solicitudes/ConsultarSolicitud?solicitudID=${solId}`,
        { headers }
      );

      if (detailRes.status !== 200) continue;

      const detail = await detailRes.json() as any;
      const row = detail.aaData?.[0];
      if (!row) continue;

      offers.push({
        id: solId,
        especialidad: row[0] ?? '',
        perfil: row[1] ?? '',
        funciones: row[2] ?? '',
        departamento: row[3] ?? '',
        ciudad: typeof row[4] === 'string' ? row[4].trim() : '',
        direccion: row[5] ?? '',
        telefono: String(row[6] ?? ''),
        contacto: row[7] ?? '',
        requeridos: String(row[8] ?? ''),
        email: row[9] ?? '',
        fecha_creacion: row[10] ?? '',
        fecha_cierre: row[12] ?? '',
        aplicados: String(row[15] ?? ''),
        empresa: row[16] ?? '',
        nit: String(row[17] ?? ''),
      });
    } catch {
      // Continuar con la siguiente oferta ante cualquier error individual
    }

    await new Promise((r) => setTimeout(r, 200));
  }

  return offers;
}
