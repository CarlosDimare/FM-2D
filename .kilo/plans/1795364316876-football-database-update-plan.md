# Plan: Update Football Database from openfootball/football.db (via ZOXEXIVO fork)

## Goal
Replace `public/data/convertedClubs.json`, `convertedPlayers.json`, `convertedLeagues.json` with fresh data from **ZOXEXIVO/open-football-database** (primary) or **openfootball/clubs** (fallback), covering all leagues currently in the project **except**:
- Croacia (hr), Polonia (pl), Austria (at), Suiza (ch), Ucrania (ua)
- Sudáfrica (za), Egipto (eg), Australia (au)

Update: squads, player attributes, team colors, facilities, reputation — everything needed for gameplay.

---

## Current Project Leagues (from `src/data/static.ts` + `worldManager.ts`)

| League Constant | Country | competitionId | Source |
|-----------------|---------|---------------|--------|
| ARG_PRIMERA / ZONA_B | Argentina | L_ARG_1 | static + converted |
| BRA_SERIE_A / B | Brasil | L_BRA_1 / L_BRA_2 | static + converted |
| ESP_LA_LIGA | España | L_ESP_1 | static + converted |
| ITA_SERIE_A | Italia | L_ITA_1 | static + converted |
| DEU_BUNDESLIGA / 2 | Alemania | L_DEU_1 / L_DEU_2 | static + converted |
| FRA_LIGUE_1 / 2 | Francia | L_FRA_1 / L_FRA_2 | static + converted |
| PRT_LIGA | Portugal | L_PRT_1 | static + converted |
| NLD_EREDIVISIE | Países Bajos | L_NLD_1 | static + converted |
| MEX_LIGA_MX | México | L_MEX_1 | static + converted |
| USA_MLS | USA | L_USA_1 | static + converted |
| JPN_J1 | Japón | L_JPN_1 | static + converted |
| ENG_PREMIER | Inglaterra | L_ENG_1 | static + converted |
| CHI_PRIMERA | Chile | L_CHI_1 | static + converted |
| COL_LIGA | Colombia | L_COL_1 | static + converted |
| URY_PRIMERA | Uruguay | L_URY_1 | static + converted |
| ECU_LIGA_PRO | Ecuador | L_ECU_1 | static + converted |
| VEN_LIGA | Venezuela | L_VEN_1 | static + converted |
| PER_LIGA1 | Perú | L_PER_1 | static + converted |
| KOR_K_LEAGUE | Corea del Sur | L_KOR_1 | static (loaded via `loadRealClubs`) |
| CHN_SUPER_LEAGUE | China | L_CHN_1 | static (loaded via `loadRealClubs`) |
| AUS_A_LEAGUE | Australia | L_AUS_1 | static (loaded via `loadRealClubs`) **EXCLUDE** |
| EGY_PREMIER | Egipto | L_EGY_1 | static (loaded via `loadRealClubs`) **EXCLUDE** |
| MAR_BOTOLA | Marruecos | L_MAR_1 | static (loaded via `loadRealClubs`) |
| RSA_PSL | Sudáfrica | L_RSA_1 | static (loaded via `loadRealClubs`) **EXCLUDE** |
| DEU_2_BUNDESLIGA | Alemania 2 | L_DEU_2 | static |
| FRA_LIGUE_2 | Francia 2 | L_FRA_2 | static |
| ITA_SERIE_B | Italia 2 | L_ITA_2 | static |
| ENG_CHAMPIONSHIP | Inglaterra 2 | L_ENG_2 | static |

**Excluded country codes**: `hr`, `pl`, `at`, `ch`, `ua`, `za`, `eg`, `au`

---

## Data Source: ZOXEXIVO/open-football-database

Structure (from compiler `main.rs`):
```
data/
├── continents.json
├── countries.json
├── national_competitions.json
├── domestic_cups.json
├── history_clubs.json
├── {cc}/country.json          # country card + transfer priors
├── {cc}/names.json            # regen name pools
├── {cc}/{league_slug}/league.json
├── {cc}/{league_slug}/{club_slug}/club.json
├── {cc}/{league_slug}/{club_slug}/players/*.json
└── {cc}/free_agents/*.json
```

Output `database.db` (gzipped JSON) contains: `continents`, `countries`, `leagues`, `clubs`, `players`, `names`, `country_transfers`, `domestic_cups`, `history_clubs`.

---

## Mapping: ZOXEXIVO → Project Format

### Leagues (`convertedLeagues.json`)
| Project Field | ZOXEXIVO Source |
|---------------|-----------------|
| `id` | `league.id` prefixed with `L_` + country_code upper + `_` + tier (e.g., `L_ESP_1`) |
| `name` | `league.name` |
| `country` | `countries.json` entry by `code` → `name` (ES) |
| `tier` | `league.tier` |
| `reputation` | `league.reputation` |
| `promotion_spots` | `league.promotion_spots` |
| `relegation_spots` | `league.relegation_spots` |
| `playable` | `true` for tier 1, `false` for tier 2+ |

### Clubs (`convertedClubs.json`)
| Project Field | ZOXEXIVO Source |
|---------------|-----------------|
| `id` | `club.teams[0].id` (Main team id) |
| `name` | `club.name` |
| `slug` | `club.teams[0].slug` |
| `shortName` | First 3-4 chars of name, uppercase |
| `primaryColor` | `club.colors.background` |
| `secondaryColor` | `club.colors.foreground` |
| `reputation` | `club.teams[0].reputation.home` |
| `country` | `countries.json` name (ES) |
| `countryCode` | `club.country_code` |
| `competitionId` | `club.teams[0].league_id` mapped to project league id |
| `playable` | `true` for tier 1 leagues |
| `average_attendance` | `club.average_attendance` |
| `facilities` | `club.facilities` (training, youth, academy, recruitment) |

### Players (`convertedPlayers.json`)
| Project Field | ZOXEXIVO Source |
|---------------|-----------------|
| `id` | `player.id` (string) |
| `name` | `player.name` |
| `firstName` | `player.first_name` or split `name` |
| `lastName` | `player.last_name` or split `name` |
| `birthDate` | `player.birth_date` → ISO string |
| `age` | Calculated from birthDate |
| `nationality` | `names.json` country → `countries.json` name |
| `countryId` | `countries.json` id |
| `clubId` | `player.club_id` (string) |
| `positions` | Map `player.position` → project position codes (P→POR, DC→DFC, etc.) |
| `primaryPosition` | First of `positions` |
| `stats.internal` | Map ZOXEXIVO attributes → project 13 attrs (see below) |
| `stats.visible` | Derived from internal (fisico/mental/tecnica/agresividad/polivalencia) |
| `ca` | `player.current_ability` or computed from stats |
| `pa` | `player.potential_ability` or `ca` + random 0-40 |
| `value` | `ca² * 2500` |
| `salary` | `ca * 2500 / 10` |
| `contractExpiry` | `player.contract_until` or default 2027-06-30 |
| `height` | `player.height` |
| `weight` | `player.weight` |
| `history` | `player.history[]` → `{s: season, c: club_id, p: apps, g: goals}` |

**Attribute Mapping (ZOXEXIVO → Project 13):**
```
ZOXEXIVO has: pace, stamina, strength, ball_control, passing, dribbling, shooting,
              positioning, vision, decisions, anticipation, aggression, versatility,
              composure, flair, technique, work_rate, teamwork, leadership, etc.

Map to project:
velocidad      ← pace
resistencia    ← stamina
fuerza         ← strength
control        ← ball_control
pase           ← passing
regate         ← dribbling
disparo        ← shooting
anticipacion   ← anticipation
decision       ← decisions
posicionamiento← positioning
vision         ← vision
agresividad    ← aggression
polivalencia   ← versatility
```

---

## Implementation Tasks

### 1. Create Conversion Script (`scripts/update-football-data.ts`)
- **Input**: Clone ZOXEXIVO repo (shallow) or download `database.db` release artifact
- **Process**:
  1. Parse `database.db` (gzipped JSON) or walk `data/` tree
  2. Filter countries: exclude `hr`, `pl`, `at`, `ch`, `ua`, `za`, `eg`, `au`
  3. For each remaining country, process all leagues (tier 1 + 2)
  4. Build `convertedLeagues.json`, `convertedClubs.json`, `convertedPlayers.json`
  5. Apply attribute mapping, position mapping, ID normalization
  6. **Stable IDs**: Use `club.teams[0].id` as string for clubs; `player.id` as string for players
  7. Write to `public/data/*.json`
- **Output**: 3 JSON files + summary log (counts per league)

### 2. GitHub Actions Workflow (`.github/workflows/update-football-data.yml`)
```yaml
name: Update Football Data
on:
  schedule:
    - cron: '0 3 * * 1'  # Mondays 03:00 UTC
  workflow_dispatch:
jobs:
  update:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun run scripts/update-football-data.ts
      - uses: stefanzweifel/git-auto-commit-action@v5
        with:
          commit_message: "chore(data): update open-football-database snapshot"
          file_pattern: public/data/*.json
```
- Runs weekly, commits only if data changed
- Uses `GITHUB_TOKEN` (no extra secrets)

### 3. Validation Script (`scripts/validate-football-data.ts`)
- Run after conversion in CI
- Checks:
  - All project leagues (except excluded) have ≥18 clubs
  - All clubs have `primaryColor`, `secondaryColor`, `facilities`
  - All players have `clubId` pointing to existing club
  - No duplicate IDs
  - `ca`/`pa` in reasonable ranges (40-200)
  - Position codes valid
- Fails build if critical checks fail

### 4. Fallback to openfootball/clubs
- If ZOXEXIVO repo unavailable or `database.db` missing:
  - Download `clubs.db` from openfootball/clubs releases
  - Parse with same logic (structure differs slightly — only clubs, no players)
  - For players: fall back to `generateRandomPlayer` + `realPlayers.ts` hardcoded
- Document in script with clear error messages

### 5. Update `realPlayers.ts` (Argentine clubs)
- Keep Boca/River/Central/Quilmes hardcoded overrides
- Conversion script should **skip** players for clubs with `clubShort` in `["BOC","RIV","CEN","QUI"]` to preserve manual data

### 6. Documentation
- Update `README.md` with data source, update schedule, how to run manually
- Add `scripts/README.md` explaining conversion logic

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| ZOXEXIVO IDs change between releases → breaks saves | Use stable composite keys: `country_code + club_slug` for clubs; `player.name + birth_date` hash for players. Store mapping in `public/data/id-map.json` for migration. |
| Missing player attributes in source | Default to position-based averages from `INTERNAL_RANGES` in `playerGenerator.ts` |
| League tier mismatch (source has 3 tiers, project expects 1-2) | Only import tier 1 & 2; log tier 3+ as skipped |
| Team colors missing | Fallback: generate from club name hash |
| Player `history` references clubs not in dataset | Keep `history` as-is; `history_clubs.json` provides names for external clubs |

---

## Acceptance Criteria

1. `bun run scripts/update-football-data.ts` completes without errors
2. `public/data/converted*.json` updated with fresh data
3. All project leagues (minus excluded) present with correct club counts
4. `bun run lint` passes (no type errors from new data)
5. `bun run build:pages` succeeds
6. Manual smoke test: start game, pick Barcelona → real squad loads (Ter Stegen, Lewandowski, Pedri, etc.)
7. CI workflow runs weekly and commits only on changes

---

## Out of Scope

- Migrating existing user saves (requires separate migration tool)
- Adding new leagues not currently in project
- Real-time data updates (weekly batch is sufficient)
- Player photos (ZOXEXIVO doesn't include; would need separate source)

---

## Next Steps (Questions for User)

1. **Confirm excluded leagues**: Only the 8 listed, or also exclude 2nd divisions of those countries?
2. **ID stability**: Accept composite keys (`ES+barcelona`) or prefer keeping ZOXEXIVO numeric IDs?
3. **Player attributes**: ZOXEXIVO has 20+ attrs; project uses 13. Confirm mapping table above.
4. **Fallback priority**: Try ZOXEXIVO first, then openfootball/clubs, or vice versa?
5. **Run manually now?** If yes, I'll generate the script and you can execute.