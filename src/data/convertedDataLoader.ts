// Lazy-loaded data from open-football-database
// Data files are in public/data/ and fetched at runtime (not bundled)

let cachedClubs: any[] | null = null;
let cachedPlayers: any[] | null = null;
let cachedLeagues: any[] | null = null;

// `BASE_URL` is "/" in dev and "/<repo>/" on GitHub Pages, so every request
// must be resolved against it instead of the server root.
const asset = (path: string) => `${import.meta.env.BASE_URL}${path.replace(/^\//, '')}`;

export async function loadConvertedClubs(): Promise<any[]> {
  if (cachedClubs) return cachedClubs;
  const resp = await fetch(asset('data/convertedClubs.json'));
  cachedClubs = await resp.json();
  return cachedClubs;
}

export async function loadConvertedPlayers(): Promise<any[]> {
  if (cachedPlayers) return cachedPlayers;
  const resp = await fetch(asset('data/convertedPlayers.json'));
  cachedPlayers = await resp.json();
  return cachedPlayers;
}

export async function loadConvertedLeagues(): Promise<any[]> {
  if (cachedLeagues) return cachedLeagues;
  const resp = await fetch(asset('data/convertedLeagues.json'));
  cachedLeagues = await resp.json();
  return cachedLeagues;
}
