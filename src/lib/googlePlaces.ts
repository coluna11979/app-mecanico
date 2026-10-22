/**
 * Google Places API (New) — Text Search
 * https://developers.google.com/maps/documentation/places/web-service/text-search
 *
 * Rodamos direto do browser (admin-only). A key fica em app_settings e deve
 * ter restrição por domínio no GCP para não vazar.
 */

export interface PlaceResult {
  placeId:    string;
  nome:       string;
  endereco:   string;
  telefone:   string | null;
  rating:     number | null;
  reviews:    number | null;
  mapsUrl:    string | null;
  lat:        number | null;
  lng:        number | null;
}

const FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.nationalPhoneNumber',
  'places.internationalPhoneNumber',
  'places.rating',
  'places.userRatingCount',
  'places.googleMapsUri',
  'places.location',
].join(',');

export async function searchPlaces(opts: {
  apiKey: string;
  query: string;
  maxResults?: number;
}): Promise<PlaceResult[]> {
  if (!opts.apiKey) throw new Error('API Key do Google Places não configurada em Configurações.');
  if (!opts.query.trim()) return [];

  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': opts.apiKey,
      'X-Goog-FieldMask': FIELD_MASK,
    },
    body: JSON.stringify({
      textQuery: opts.query,
      languageCode: 'pt-BR',
      regionCode: 'BR',
      maxResultCount: Math.min(opts.maxResults ?? 20, 20),
    }),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Google Places retornou ${res.status}: ${txt.slice(0, 200)}`);
  }

  const json = await res.json() as { places?: GooglePlace[] };
  return (json.places ?? []).map(mapPlace);
}

interface GooglePlace {
  id: string;
  displayName?: { text: string };
  formattedAddress?: string;
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  rating?: number;
  userRatingCount?: number;
  googleMapsUri?: string;
  location?: { latitude: number; longitude: number };
}

function mapPlace(p: GooglePlace): PlaceResult {
  return {
    placeId:  p.id,
    nome:     p.displayName?.text ?? '(sem nome)',
    endereco: p.formattedAddress ?? '',
    telefone: p.nationalPhoneNumber ?? p.internationalPhoneNumber ?? null,
    rating:   p.rating ?? null,
    reviews:  p.userRatingCount ?? null,
    mapsUrl:  p.googleMapsUri ?? null,
    lat:      p.location?.latitude ?? null,
    lng:      p.location?.longitude ?? null,
  };
}

/** Extrai cidade/UF do endereço formatado "Rua X, 123 - Bairro, Cidade - UF, CEP, Brasil". */
export function parseCidadeUf(endereco: string): { cidade: string | null; estado: string | null } {
  // Procura "Cidade - UF" (UF em 2 letras maiúsculas)
  const match = endereco.match(/([^,-]+)\s*-\s*([A-Z]{2})(?:,|$)/);
  if (match) return { cidade: match[1].trim(), estado: match[2] };
  return { cidade: null, estado: null };
}
