import { Club, Competition, Player, Staff, SquadType } from '../types';

export const COUNTRY_ECONOMY_FACTOR: Record<string, number> = {
  'Argentina': 0.55,
  'Brasil': 0.85,
  'Uruguay': 0.50,
  'Chile': 0.60,
  'Colombia': 0.55,
  'Paraguay': 0.48,
  'Perú': 0.50,
  'Ecuador': 0.52,
  'Bolivia': 0.42,
  'Venezuela': 0.42,
  'México': 0.85,
  'USA': 1.80,
  'Estados Unidos': 1.80,
  'Inglaterra': 2.00,
  'España': 1.75,
  'Italia': 1.65,
  'Alemania': 1.85,
  'Francia': 1.70,
  'Portugal': 1.05,
  'Países Bajos': 1.35,
  'Bélgica': 1.15,
  'Turquía': 0.95,
  'Rusia': 0.90,
  'Croacia': 0.65,
  'Grecia': 0.65,
  'Austria': 1.15,
  'Suiza': 1.25,
  'Dinamarca': 1.10,
  'Suecia': 0.95,
  'Noruega': 1.05,
  'Polonia': 0.70,
  'Ucrania': 0.55,
  'Japón': 1.25,
  'Corea del Sur': 1.15,
  'China': 1.10,
  'Arabia Saudita': 1.75,
  'Emiratos Árabes Unidos': 1.45,
  'Australia': 1.00,
  'Egipto': 0.65,
  'Marruecos': 0.60,
  'Sudáfrica': 0.65,
};

export function getCountryEconomy(country?: string): number {
  if (!country) return 0.75;
  return COUNTRY_ECONOMY_FACTOR[country] ?? 0.75;
}

export function calibrateClubReputation(rawRep: number, leagueRep = 3500, tier = 1): number {
  const tierFactor = tier === 1 ? 0.68 : tier === 2 ? 0.75 : 0.78;
  const floor = Math.max(1500, Math.round(leagueRep * tierFactor));
  return Math.max(floor, Math.min(9900, Math.round(rawRep || floor)));
}

export function computeRealisticPlayerValue(params: {
  ca: number;
  pa: number;
  age: number;
  clubRep: number;
  leagueRep: number;
  country?: string;
}): number {
  const ca = Math.max(35, Math.min(200, params.ca || 85));
  const pa = Math.max(ca, Math.min(200, params.pa || ca));
  const age = Math.max(15, Math.min(44, params.age || 24));
  const clubRep = Math.max(1200, Math.min(9900, params.clubRep || 3500));
  const leagueRep = Math.max(1200, Math.min(9900, params.leagueRep || 3500));
  const econ = getCountryEconomy(params.country);

  const normCa = Math.max(0, Math.min(1, (ca - 50) / 150));
  const baseVal = 25_000 + Math.pow(normCa, 4.2) * 195_000_000;

  const potBonus =
    age <= 23 && pa > ca
      ? 1 + Math.min(0.65, ((pa - ca) / 45) * Math.max(0.15, (24 - age) * 0.08))
      : 1;

  const ageFactor =
    age <= 27
      ? 1.0
      : age <= 30
      ? 0.90 - (age - 27) * 0.06
      : Math.max(0.16, 0.72 - (age - 30) * 0.11);

  const marketMult = Math.max(
    0.10,
    Math.min(1.22, (leagueRep / 9500) * 0.48 + (clubRep / 9500) * 0.24 + econ * 0.22)
  );

  const raw = baseVal * potBonus * ageFactor * marketMult;
  const rounded = raw >= 1_000_000
    ? Math.round(raw / 50_000) * 50_000
    : raw >= 100_000
    ? Math.round(raw / 5_000) * 5_000
    : Math.round(raw / 1_000) * 1_000;

  return Math.max(15_000, rounded);
}

/**
 * Sueldo MENSUAL realista en £ para un futbolista profesional.
 * Unificado como unidad mensual en todo el juego (EconomyView, SquadView, PlayerModal, ContractNegotiationModal).
 */
export function computeRealisticPlayerSalary(params: {
  ca: number;
  age: number;
  squad?: SquadType;
  clubRep: number;
  leagueRep: number;
  country?: string;
}): number {
  const ca = Math.max(35, Math.min(200, params.ca || 85));
  const econ = getCountryEconomy(params.country);
  const primeValue = computeRealisticPlayerValue({
    ca,
    pa: ca,
    age: Math.min(27, Math.max(22, params.age || 24)),
    clubRep: params.clubRep,
    leagueRep: params.leagueRep,
    country: params.country,
  });

  // Relación salario mensual / valor de mercado: ~0.95% en élite, ~1.05% en ligas medias
  const rate = ca >= 155 ? 0.0088 : ca >= 130 ? 0.0095 : 0.0105;
  const squadMult = params.squad === 'U20' ? 0.42 : params.squad === 'RESERVE' ? 0.65 : 1.0;
  const minMonthly =
    params.squad === 'U20'
      ? Math.max(350, Math.round(econ * 550))
      : params.squad === 'RESERVE'
      ? Math.max(550, Math.round(econ * 900))
      : Math.max(850, Math.round(econ * 1_500));

  const raw = Math.max(minMonthly, primeValue * rate * squadMult);
  const step = raw >= 100_000 ? 1_000 : raw >= 10_000 ? 250 : 50;
  return Math.round(raw / step) * step;
}

/**
 * Sueldo MENSUAL realista en £ para un empleado / cuerpo técnico.
 */
export function computeRealisticStaffSalary(params: {
  skill: number;
  role: string;
  clubRep: number;
  country?: string;
}): number {
  const econ = getCountryEconomy(params.country);
  const repScale = Math.pow(Math.max(1500, params.clubRep || 3500) / 5000, 2.4);
  const skillFactor = 0.65 + (Math.max(4, Math.min(20, params.skill || 11)) / 20) * 0.75;
  const roleWeight =
    params.role === 'HEAD_COACH'
      ? 2.2
      : params.role === 'SPORTING_DIRECTOR' || params.role === 'ASSISTANT_MANAGER'
      ? 1.25
      : params.role === 'TREASURER' || params.role === 'RESERVE_MANAGER' || params.role === 'YOUTH_MANAGER'
      ? 0.95
      : 0.8;

  const raw = 2_400 * repScale * (0.45 + econ * 0.55) * skillFactor * roleWeight;
  const clamped = Math.max(750, Math.min(350_000, raw));
  const step = clamped >= 25_000 ? 500 : 100;
  return Math.round(clamped / step) * step;
}

export interface ClubFinancialProjection {
  seasonTicket: number;
  sponsorships: number;
  merchandising: number;
  gateIncome: number;
  totalMonthlyIncome: number;
  playerSalaries: number;
  staffSalaries: number;
  totalSalaries: number;
  operational: number;
  totalMonthlyExpenses: number;
  netMonthly: number;
}

/**
 * Fuente única de verdad para ingresos/gastos mensuales del club.
 * Usada por EconomyView, TreasurerDialog y LifecycleManager.processMonthlyFinances.
 */
export function computeClubFinancialProjection(
  club: Club,
  players: Player[],
  staffList: Staff[],
  accumulatedGateIncome?: number
): ClubFinancialProjection {
  const econ = getCountryEconomy(club.country);
  const repScale = Math.pow(Math.max(1500, club.reputation || 3500) / 5000, 3.35) * (0.42 + econ * 0.58);

  const sponsorships = Math.round(520_000 * repScale);
  const merchandising = Math.round(240_000 * repScale);
  const avgTicketPrice = Math.max(6, Math.min(48, Math.round(6 + (club.reputation / 9500) * 28 * (0.6 + econ * 0.4))));
  const seasonTicket = Math.round((club.stadiumCapacity || 8000) * 0.35 * avgTicketPrice * 0.8);
  const gateIncome = Math.max(
    0,
    accumulatedGateIncome !== undefined ? accumulatedGateIncome : Math.round(club.finances.monthlyIncome || 0)
  );

  const playerSalaries = players.reduce((s, p) => s + (p.salary || 0), 0);
  const staffSalaries = staffList.reduce((s, st) => s + (st.salary || 0), 0);
  const totalSalaries = playerSalaries + staffSalaries;
  const operational = Math.max(6_000, Math.round(145_000 * repScale));

  const totalMonthlyIncome = sponsorships + seasonTicket + merchandising + gateIncome;
  const totalMonthlyExpenses = totalSalaries + operational;

  return {
    seasonTicket,
    sponsorships,
    merchandising,
    gateIncome,
    totalMonthlyIncome,
    playerSalaries,
    staffSalaries,
    totalSalaries,
    operational,
    totalMonthlyExpenses,
    netMonthly: totalMonthlyIncome - totalMonthlyExpenses,
  };
}

/**
 * Calibra presupuestos iniciales del club en función de su reputación, liga y masa salarial real.
 */
export function calibrateClubInitialFinances(
  club: Club,
  players: Player[],
  staffList: Staff[],
  comp?: Competition
): void {
  const econ = getCountryEconomy(club.country);
  const repScale = Math.pow(Math.max(1500, club.reputation || 3500) / 5000, 3.35) * (0.42 + econ * 0.58);
  const proj = computeClubFinancialProjection(club, players, staffList, 0);

  // Tope salarial realista: permite operar al ~74%-88% al inicio de la partida
  const sustainableCap = Math.round((proj.sponsorships + proj.seasonTicket + proj.merchandising) * 0.85);
  const payrollAnchor = Math.round(proj.totalSalaries * 1.24);
  const wageBudget = Math.max(
    Math.round(proj.totalSalaries * 1.15),
    Math.min(Math.round(proj.totalSalaries * 1.55), Math.max(sustainableCap, payrollAnchor))
  );

  const baseTransfer = Math.round(3_200_000 * repScale * (comp?.tier === 1 ? 1.15 : comp?.tier === 2 ? 0.65 : 0.45));
  const transferBudget = Math.max(80_000, Math.min(180_000_000, Math.round(baseTransfer / 5_000) * 5_000));
  const balance = Math.max(250_000, Math.round(transferBudget * 1.45 + proj.totalSalaries * 3));
  const scoutingBudget = Math.max(15_000, Math.round(transferBudget * 0.08));

  club.finances.wageBudget = Math.max(50_000, Math.round(wageBudget / 1_000) * 1_000);
  club.finances.transferBudget = transferBudget;
  club.finances.balance = Math.round(balance / 5_000) * 5_000;
  club.finances.scoutingBudget = Math.round(scoutingBudget / 1_000) * 1_000;
  club.finances.monthlyIncome = Math.round((proj.sponsorships + proj.seasonTicket + proj.merchandising) * 0.22); // taquilla estimada inicial
  club.finances.monthlyExpenses = proj.totalMonthlyExpenses;
}
