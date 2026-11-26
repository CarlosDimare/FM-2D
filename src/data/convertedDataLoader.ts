// Lazy-loaded & chunked database from open-football-database + Wikidata staff snapshot
// Data files live in public/data/ and are fetched at runtime (not bundled)

export type PlayerTuple = [
  id: string,
  firstName: string,
  lastName: string,
  birthDate: string,
  natIdx: number,
  clubId: string,
  squadIdx: number,
  posIndices: number[],
  attrs13: number[],
  ca: number,
  pa: number,
  value: number,
  salary: number,
  contractExpiry: string,
  height: number,
  weight: number,
  person4: number[],
];

export interface PlayersManifest {
  nats: string[];
  pos: string[];
  squads: ('SENIOR' | 'RESERVE' | 'U20')[];
  leagues: string[];
  totalPlayers: number;
}

export type StaffTuple = [
  clubId: string,
  roleIdx: number,
  name: string,
  age: number,
  natIdx: number,
  rep: number,
  styleIdx: number,
  formIdx: number,
  baseSkill: number,
];

export interface ConvertedStaffBundle {
  roles: string[];
  styles: string[];
  formations: string[];
  nats: string[];
  rows: StaffTuple[];
}

let cachedClubsPromise: Promise<any[]> | null = null;
let cachedLeaguesPromise: Promise<any[]> | null = null;
let cachedStaffPromise: Promise<ConvertedStaffBundle> | null = null;
let cachedManifestPromise: Promise<PlayersManifest> | null = null;
const cachedLeagueChunks = new Map<string, Promise<PlayerTuple[]>>();

export function loadConvertedClubs(): Promise<any[]> {
  if (!cachedClubsPromise) {
    cachedClubsPromise = fetch('data/convertedClubs.json').then(r => {
      if (!r.ok) throw new Error(`Failed to fetch convertedClubs.json (${r.status})`);
      return r.json();
    });
  }
  return cachedClubsPromise;
}

export function loadConvertedLeagues(): Promise<any[]> {
  if (!cachedLeaguesPromise) {
    cachedLeaguesPromise = fetch('data/convertedLeagues.json').then(r => {
      if (!r.ok) throw new Error(`Failed to fetch convertedLeagues.json (${r.status})`);
      return r.json();
    });
  }
  return cachedLeaguesPromise;
}

export function loadConvertedStaff(): Promise<ConvertedStaffBundle> {
  if (!cachedStaffPromise) {
    cachedStaffPromise = fetch('data/convertedStaff.json').then(r => {
      if (!r.ok) throw new Error(`Failed to fetch convertedStaff.json (${r.status})`);
      return r.json();
    });
  }
  return cachedStaffPromise;
}

export function loadPlayersManifest(): Promise<PlayersManifest> {
  if (!cachedManifestPromise) {
    cachedManifestPromise = fetch('data/players/manifest.json').then(r => {
      if (!r.ok) throw new Error(`Failed to fetch players/manifest.json (${r.status})`);
      return r.json();
    });
  }
  return cachedManifestPromise;
}

export function loadLeaguePlayerChunk(leagueId: string): Promise<PlayerTuple[]> {
  let pending = cachedLeagueChunks.get(leagueId);
  if (!pending) {
    pending = fetch(`data/players/${leagueId}.json`)
      .then(r => {
        if (r.status === 404) return [] as PlayerTuple[];
        if (!r.ok) throw new Error(`Failed to fetch players/${leagueId}.json (${r.status})`);
        return r.json() as Promise<PlayerTuple[]>;
      })
      .catch(() => [] as PlayerTuple[]);
    cachedLeagueChunks.set(leagueId, pending);
  }
  return pending;
}
