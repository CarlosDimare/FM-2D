import { create } from 'zustand';
import { CompetitionSummary } from '../components/SeasonSummaryModal';
import { MatchSnapshot, TeamSide } from '../types/match';

export interface OptaMatchReport {
  fixtureId?: string;
  competitionId?: string;
  dateIso: string;
  homeClubId: string;
  awayClubId: string;
  userSide: TeamSide;
  penaltyHome?: number;
  penaltyAway?: number;
  snapshot: MatchSnapshot;
}

interface MatchStore {
  currentDate: Date;
  seasonEndDate: Date;
  isSimulating: boolean;
  isInVacation: boolean;
  isVacationModalOpen: boolean;
  vacationTargetDate: string;
  vacationProgress: number;
  vacationDetail: string;
  vacationCancelled: boolean;
  simProgress: number;
  simProgressDetail: string;
  seasonSummary: CompetitionSummary[] | null;
  userWonLeague: boolean;
  lastOptaReport: OptaMatchReport | null;
  optaReportsByFixture: Record<string, OptaMatchReport>;

  setCurrentDate: (date: Date) => void;
  setSeasonEndDate: (date: Date) => void;
  setIsSimulating: (sim: boolean) => void;
  setIsInVacation: (inVacation: boolean) => void;
  setIsVacationModalOpen: (open: boolean) => void;
  setVacationTargetDate: (date: string) => void;
  setVacationProgress: (progress: number) => void;
  setVacationDetail: (detail: string) => void;
  setVacationCancelled: (cancelled: boolean) => void;
  setSimProgress: (progress: number) => void;
  setSimProgressDetail: (detail: string) => void;
  resetVacationState: () => void;
  setSeasonSummary: (summary: CompetitionSummary[] | null) => void;
  setUserWonLeague: (won: boolean) => void;
  setLastOptaReport: (report: OptaMatchReport | null) => void;
}

export const useMatchStore = create<MatchStore>((set) => ({
  currentDate: new Date(2025, 6, 20),
  seasonEndDate: new Date(2026, 6, 10),
  isSimulating: false,
  isInVacation: false,
  vacationTargetDate: '',
  vacationProgress: 0,
  vacationDetail: '',
  vacationCancelled: false,
  isVacationModalOpen: false,
  simProgress: 0,
  simProgressDetail: '',
  seasonSummary: null,
  userWonLeague: false,
  lastOptaReport: null,
  optaReportsByFixture: {},

  setCurrentDate: (currentDate) => set({ currentDate }),
  setSeasonEndDate: (seasonEndDate) => set({ seasonEndDate }),
  setIsSimulating: (isSimulating) => set({ isSimulating }),
  setIsInVacation: (isInVacation) => set({ isInVacation }),
  setVacationTargetDate: (vacationTargetDate) => set({ vacationTargetDate }),
  setVacationProgress: (progress) => set({ vacationProgress: progress }),
  setVacationDetail: (detail) => set({ vacationDetail: detail }),
  setVacationCancelled: (cancelled) => set({ vacationCancelled: cancelled }),
  setIsVacationModalOpen: (isVacationModalOpen) => set({ isVacationModalOpen }),
  setSimProgress: (simProgress) => set({ simProgress }),
  setSimProgressDetail: (simProgressDetail) => set({ simProgressDetail }),
  resetVacationState: () => set({ vacationProgress: 0, vacationDetail: '', vacationCancelled: false }),
  setSeasonSummary: (seasonSummary) => set({ seasonSummary }),
  setUserWonLeague: (userWonLeague) => set({ userWonLeague }),
  setLastOptaReport: (report) =>
    set((state) => {
      if (!report) return { lastOptaReport: null };
      const nextMap = { ...state.optaReportsByFixture };
      if (report.fixtureId) {
        nextMap[report.fixtureId] = report;
        const keys = Object.keys(nextMap);
        if (keys.length > 20) {
          delete nextMap[keys[0]];
        }
      }
      return { lastOptaReport: report, optaReportsByFixture: nextMap };
    }),
}));
