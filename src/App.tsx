import React, { useEffect, useCallback, useRef, Suspense, lazy } from 'react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Sidebar } from './components/Sidebar';
import { PlayerModal } from './components/PlayerModal';
import { LeagueTable } from './components/LeagueTable';
import { SquadView } from './components/SquadView';
import { StaffView } from './components/StaffView';
import { TrainingView } from './components/TrainingView';
import { ScoutingView } from './components/ScoutingView';
import { BoardView } from './components/BoardView';
import { VacationView } from './components/VacationView';
import { ClubReport } from './components/ClubReport';
import { PlayerCompareModal } from './components/PlayerCompareModal';
import { PeopleHub } from './components/PeopleHub';
import { PressConferenceView, getPressDelegate, resolveDelegatedPressConference } from './components/PressConferenceView';
import { MarketView } from './components/MarketView';
import { SearchView } from './components/SearchView';
import { ClubsListView } from './components/ClubsListView';
import { EconomyView } from './components/EconomyView';
import { ChronicleView } from './components/ChronicleView';
import { ManagerProfileView } from './components/ManagerProfileView';
import { HallOfFameView } from './components/HallOfFameView';
import { SeasonHistoryView } from './components/SeasonHistoryView';
import { InboxView } from './components/InboxView';
import { MediaView } from './components/MediaView';
import { TransferOfferModal } from './components/TransferOfferModal';
import { ContractNegotiationModal } from './components/ContractNegotiationModal';
import { SettingsModal } from './components/SettingsModal';
import { PlayerContextMenu } from './components/PlayerContextMenu';
import { SeasonSummaryModal } from './components/SeasonSummaryModal';
import { NationalTeamView } from './components/NationalTeamView';
import { DialogueHost } from './components/dialogs/DialogueHost';
import { ScreenBackground } from './components/ScreenBackground';
import {
  FmBroadcastHeader,
  FmClubShield,
  FmLedDisplay,
  FmMatchupBanner,
  getClubHexPalette,
} from './components/ClubBannerChrome';

function lazyWithReload(importFn: () => Promise<any>) {
  return lazy(() => importFn().catch(err => {
    console.error('Failed to load chunk', err);
    window.location.reload();
    return new Promise(() => {});
  }));
}

const MatchView = lazyWithReload(() => import('./components/MatchView').then(m => ({ default: m.MatchView })));
const TacticsView = lazyWithReload(() => import('./components/TacticsView').then(m => ({ default: m.TacticsView })));
const PreMatchView = lazyWithReload(() => import('./components/PreMatchView').then(m => ({ default: m.PreMatchView })));
const PostMatchSummaryView = lazyWithReload(() => import('./components/PostMatchSummaryView').then(m => ({ default: m.PostMatchSummaryView })));
import { NegotiationsView } from './components/NegotiationsView';
import { TournamentHub } from './components/TournamentHub';
import { BottomNav } from './components/BottomNav';
import { FeedbackHost } from './components/FeedbackHost';
import { OfflineIndicator, PWAInstallButton } from './components/PWAControls';
import { world, getBenchSizeForCompetition } from './services/worldManager';
import { LifecycleManager } from './services/lifecycleManager';
import { generateMatchChronicle, generateMonthlyChronicle, generateNationalTeamChronicle } from './services/chronicleService';
import { getNationalChronicleContext, simulateDayFixtures } from './services/simulationService';
import {
  applyWorldState,
  buildSaveData,
  exportSavedSlotById,
  exportSaveToJsonFile,
  importSaveFromJsonText,
  loadGameData,
  manualSave,
  performAutoSave as performAutoSaveService,
  resolveDeepLeagues,
  restoreNationalTeamManager,
  shareSavedSlotByEmail,
} from './services/saveLoadService';
import { detectPlayerDialogueTriggers } from './services/playerDialogueTriggers';
import { Club, Player, Fixture, SquadType, PlayerMatchStats, RealManager, CareerMode, Chronicle, Tactic } from './types';
import { checkSaveExists, listSaves, deleteSave, SaveMetadata } from './services/utils';
import { buildNationalTeamClub, MatchSimulator } from './services/engine';
import { sendMatchNotification } from './services/notifications';
import { RefreshCw, Play, Sun, Mail, Trophy, ChevronRight, ChevronLeft, User, ArrowLeft, HardDrive, Trash2, X, Briefcase, Flag, Bell, Download, Upload, Share2 } from 'lucide-react';
import { OnboardingTour, isOnboarded } from './components/OnboardingTour';
import { FMButton, FMLoadingOverlay, FMModal } from './components/FMUI';
import { PreCareerPreviewView } from './components/PreCareerPreviewView';
import { useWorldStore } from './stores/worldStore';
import { useUIStore } from './stores/uiStore';
import { useGameStore } from './stores/gameStore';
import { confirmAction, showToast } from './stores/feedbackStore';
import { getFlagUrl, TACTIC_PRESETS, WORLD_COUNTRIES } from './data/static';

const AttrBar: React.FC<{ label: string; value: number; color: string }> = ({ label, value, color }) => {
  const pct = Math.min(100, Math.max(0, (value / 20) * 100));
  return (
    <div className="flex items-center gap-2">
      <span className="text-[9px] font-bold text-slate-600 uppercase w-8 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-slate-200 rounded-sm overflow-hidden">
        <div className={`h-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[9px] font-black text-slate-900 w-6 text-right">{value}</span>
    </div>
  );
};

const App: React.FC = () => {
  const [showOnboarding, setShowOnboarding] = React.useState(false);
  const [scheduleCompFilter, setScheduleCompFilter] = React.useState('ALL');
  const [lastMatchStats, setLastMatchStats] = React.useState<Record<string, PlayerMatchStats>>({});
  const [lastChronicle, setLastChronicle] = React.useState<Chronicle | null>(null);
  const [isSackedModalOpen, setIsSackedModalOpen] = React.useState(false);
  const [sackedClubName, setSackedClubName] = React.useState('');
  const [overwriteSaveId, setOverwriteSaveId] = React.useState<string | undefined>(undefined);
  const [shareSaveTarget, setShareSaveTarget] = React.useState<SaveMetadata | null>(null);
  const [worldClubsReady, setWorldClubsReady] = React.useState(() => world.clubsReady);
  const [worldFullReady, setWorldFullReady] = React.useState(() => world.isReady);
  const [isPreparingCareer, setIsPreparingCareer] = React.useState(false);
  const [previewClub, setPreviewClub] = React.useState<Club | null>(null);
  const [previewNationalTeamId, setPreviewNationalTeamId] = React.useState<string | null>(null);
  const importFileInputRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    let active = true;
    if (!world.clubsReady) {
      world.clubsReadyPromise.then(() => {
        if (active) setWorldClubsReady(true);
      });
    }
    if (!world.isReady) {
      world.readyPromise.then(() => {
        if (active) setWorldFullReady(true);
      });
    }
    return () => { active = false; };
  }, []);

  React.useEffect(() => {
    if (!isOnboarded()) {
      const t = setTimeout(() => setShowOnboarding(true), 1200);
      return () => clearTimeout(t);
    }
  }, []);

  const notify = useWorldStore(s => s.notify);

const {
    gameState, currentView, selectedPlayer, selectedStaff, contextMenu,
    userName, userSurname, userNationality, userOrigin, userBirthDate, selectedCountry, selectedLeague, userClub, viewExternalClub,
    careerMode, selectedNationalTeamId,
    isVacationModalOpen, vacationTargetDate, isSimulating, isInVacation,
    vacationProgress, vacationDetail, vacationCancelled, setVacationProgress, setVacationDetail, setVacationCancelled, resetVacationState,
    simProgress, simProgressDetail, setSimProgress, setSimProgressDetail,
    seasonSummary, userWonLeague, viewLeagueId, viewSquadType,
    currentDate, seasonEndDate, hasSave,
    isSaveModalOpen, saveNameInput, isLoadModalOpen, availableSaves,
    setGameState, setView, setSelectedPlayer, setSelectedStaff, setContextMenu,
    setUserName, setUserSurname, setUserNationality, setUserOrigin, setUserBirthDate, setSelectedCountry, setSelectedLeague, setUserClub, setCareerMode, setSelectedNationalTeamId,
    setViewExternalClub, setIsVacationModalOpen, setVacationTargetDate, setIsSimulating,
    setIsInVacation, setSeasonSummary, setUserWonLeague, setViewLeagueId, setViewSquadType,
    setCurrentDate, setSeasonEndDate, setHasSave,
    setIsSaveModalOpen, setSaveNameInput, setIsLoadModalOpen, setAvailableSaves,
    isAutoSaveEnabled, setIsAutoSaveEnabled,
    comparePlayerA, comparePlayerB, setComparePlayerA, setComparePlayerB,
    selectedExistingManager, setSelectedExistingManager,
  } = useUIStore();

  const { fixtures, nextFixture, setFixtures, setNextFixture, initSeasonFixtures, updateNextFixture } = useGameStore();

  useEffect(() => {
    if (comparePlayerA && selectedPlayer && selectedPlayer.id !== comparePlayerA.id && !comparePlayerB) {
      setComparePlayerB(selectedPlayer);
      setSelectedPlayer(null);
    }
  }, [selectedPlayer, comparePlayerA, comparePlayerB]);

  const activeManagedTeamId = userClub?.id || selectedNationalTeamId || undefined;

  const isNationalFixture = (f: Fixture | null | undefined): boolean =>
    Boolean(f && ['WC_Q', 'WC_FINAL', 'COPA', 'EURO', 'AFCON'].includes(f.competitionId));

  const getNationalMatchSquad = (teamId: string): Player[] => {
    const manager = world.nationalTeamManager;
    const isControlled = Boolean(manager?.isControlled(teamId));
    const controlledIds: string[] = isControlled ? manager.getControlledSquadIds(teamId) : [];
    const pool =
      controlledIds.length >= 11
        ? controlledIds
            .map((id) => world.getPlayer(id))
            .filter((p: Player | undefined): p is Player => Boolean(p))
        : world.getPlayersByNationalTeam(teamId);

    const controlledLineup: (string | null)[] = isControlled
      ? manager.getControlledLineup(teamId) || []
      : [];
    const starterSet = new Set(controlledLineup.filter(Boolean) as string[]);

    if (starterSet.size >= 11) {
      return pool.map((p) => ({
        ...p,
        isStarter: starterSet.has(p.id),
        tacticalPosition: starterSet.has(p.id)
          ? controlledLineup.indexOf(p.id)
          : undefined,
      }));
    }
    return pool.map((p, idx) => ({
      ...p,
      isStarter: idx < 11,
      tacticalPosition: idx < 11 ? idx : undefined,
    }));
  };

  const getNationalTacticForMatch = (teamId: string): { tactic?: Tactic; settings?: any } => {
    const manager = world.nationalTeamManager;
    const formationId = manager?.getControlledFormation?.(teamId) || '4-4-2';
    const settings = manager?.getControlledTactic?.(teamId);
    const preset = TACTIC_PRESETS.find((t) => t.id === formationId) || TACTIC_PRESETS[0];
    return {
      tactic: preset ? { ...preset, settings: settings || preset.settings } : undefined,
      settings,
    };
  };

  const getMatchSquad = (clubId: string) => {
    const clubPlayers = world.getPlayersByClub(clubId);
    let starters = clubPlayers.filter(p => p.isStarter && p.tacticalPosition !== undefined)
      .sort((a, b) => (a.tacticalPosition || 0) - (b.tacticalPosition || 0));

    if (starters.length < 11) {
      world.selectBestEleven(clubId, 'SENIOR');
      starters = world.getPlayersByClub(clubId)
        .filter(p => p.isStarter && p.tacticalPosition !== undefined)
        .sort((a, b) => (a.tacticalPosition || 0) - (b.tacticalPosition || 0));
    }

    const comp = nextFixture ? world.competitions.find(c => c.id === nextFixture.competitionId) : undefined;
    const benchSize = getBenchSizeForCompetition(comp);

    const seated = clubPlayers
      .filter(p => !p.isStarter && p.benchPosition !== undefined && !p.injury && (!p.suspension || p.suspension.matchesLeft === 0))
      .sort((a, b) => (a.benchPosition || 0) - (b.benchPosition || 0));
    const fill = clubPlayers
      .filter(p => !p.isStarter && p.benchPosition === undefined && !p.injury && (!p.suspension || p.suspension.matchesLeft === 0))
      .sort((a, b) => b.currentAbility - a.currentAbility);

    const bench = [...seated, ...fill].slice(0, benchSize);

    return [...starters, ...bench];
  };

  useEffect(() => {
    checkSaveExists().then(exists => setHasSave(exists));
    if (gameState === 'LOADING') {
      setGameState('SETUP_USER');
    }
  }, []);

  const handleGlobalClick = useCallback(() => {
    if (contextMenu) setContextMenu(null);
  }, [contextMenu]);

  useEffect(() => {
    window.addEventListener('click', handleGlobalClick);
    return () => window.removeEventListener('click', handleGlobalClick);
  }, [handleGlobalClick]);

  const advanceTimeRef = useRef<() => void>(null as any);
  const advancingRef = useRef(false);
  const lastChronicleMonth = useRef<number>(-1);
  const lastAutoPrePressFixtureRef = useRef<string | null>(null);
  const perfSamples = useRef<number[]>([]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      if (e.key === 'Escape') {
        if (isSaveModalOpen) setIsSaveModalOpen(false);
        else if (currentView !== 'HOME' && gameState === 'PLAYING') setView('HOME');
      }
      const canSpaceContinue =
        currentView === 'HOME' ||
        currentView === 'PRE_MATCH' ||
        currentView === 'POST_MATCH_SUMMARY' ||
        currentView === 'PRESS_CONFERENCE_PRE' ||
        currentView === 'PRESS_CONFERENCE_POST';
      if (e.key === ' ' && canSpaceContinue && gameState === 'PLAYING' && !isVacationModalOpen && !isSaveModalOpen) {
        e.preventDefault();
        advanceTimeRef.current();
      }
      if (e.key === 'm' && gameState === 'PLAYING' && currentView === 'HOME') setView('MARKET');
      if (e.key === 't' && gameState === 'PLAYING' && currentView === 'HOME') setView('SENIOR_TACTICS');
      if (e.key === 's' && gameState === 'PLAYING' && currentView === 'HOME') setView('SENIOR_SQUAD');
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [currentView, gameState, isSaveModalOpen, isVacationModalOpen, setView]);

  const handlePlayerContextMenu = (e: React.MouseEvent, player: Player) => {
    e.preventDefault();
    setContextMenu({ player, x: e.clientX, y: e.clientY });
  };

  const handleStartMatch = () => {
    if (nextFixture) setView('PRE_MATCH');
  };

  const setupNationalControl = (teamId: string): boolean => {
    const manager = world.nationalTeamManager;
    const team = manager?.nationalTeams?.find((candidate: any) => candidate.id === teamId);
    if (!manager || !team) return false;
    const eligiblePlayers = manager.getEligiblePlayers(teamId, world.players, world.clubs);
    const eligibleIds = new Set(eligiblePlayers.map((player: Player) => player.id));
    const savedIds = (team.playerIds || []).filter((id: string) => eligibleIds.has(id));
    const fallbackIds = eligiblePlayers.map((player: Player) => player.id).filter((id: string) => !savedIds.includes(id));
    const preset = TACTIC_PRESETS.find(tactic => tactic.id === team.formation) || TACTIC_PRESETS[0];
    return manager.assumeControl(teamId, [...savedIds, ...fallbackIds].slice(0, 23), { ...preset.settings }, eligiblePlayers.map((player: Player) => player.id));
  };

  const ensureWorldReadyForStart = async (): Promise<void> => {
    if (world.isReady) return;
    setIsPreparingCareer(true);
    try {
      await world.readyPromise;
    } finally {
      setIsPreparingCareer(false);
    }
  };

  const startNationalCareer = async (teamId: string, managerData?: RealManager | null, clubId: string | null = null) => {
    await ensureWorldReadyForStart();
    if (!setupNationalControl(teamId)) {
      showToast('No hay suficientes jugadores elegibles para formar una convocatoria internacional.', 'warning');
      return;
    }
    const club = clubId ? world.getClub(clubId) : null;
    setSelectedNationalTeamId(teamId);
    setUserClub(club || null);
    if (club) {
      world.ensureDeepSquads(club.leagueId);
      useGameStore.getState().setDeepSimLeagues([club.leagueId]);
    }
    const allFix = initSeasonFixtures(currentDate, club?.id);
    updateNextFixture(allFix, currentDate, club?.id || teamId);
    world.createManagerProfile(club?.id || null, managerData?.name || userName, managerData?.surname || userSurname, managerData?.nationality || userNationality, managerData ? 'EX_PLAYER' : userOrigin, managerData?.birthDate || userBirthDate, currentDate, teamId);
    if (club) {
      if (managerData) world.replaceHeadCoach(managerData, club.id, false);
      else world.createHumanManager(club.id, `${userName} ${userSurname}`);
    }
    setGameState('PLAYING');
    setView('HOME');
    notify();
  };

  const createManagerAndStartGame = async (manager: RealManager, clubId: string, fired: boolean) => {
    await ensureWorldReadyForStart();
    const club = world.getClub(clubId);
    if (!club) return;
    if (selectedNationalTeamId && careerMode !== 'CLUB') {
      if (!setupNationalControl(selectedNationalTeamId)) return;
      world.replaceHeadCoach(manager, club.id, fired);
    } else {
      world.replaceHeadCoach(manager, club.id, fired);
    }
    setUserClub(club);
    world.ensureDeepSquads(club.leagueId);
    useGameStore.getState().setDeepSimLeagues([club.leagueId]);
    const allFix = initSeasonFixtures(currentDate, club.id);
    updateNextFixture(allFix, currentDate, club.id);
    world.createManagerProfile(club.id, manager.name, manager.surname, manager.nationality, 'EX_PLAYER', manager.birthDate, currentDate, careerMode === 'BOTH' ? selectedNationalTeamId : null);
    setGameState('PLAYING');
    setView('HOME');
    notify();
  };

  const startUserClubCareer = async (club: Club) => {
    await ensureWorldReadyForStart();
    const freshClub = world.getClub(club.id) || club;
    world.ensureDeepSquads(freshClub.leagueId);
    useGameStore.getState().setDeepSimLeagues([freshClub.leagueId]);
    setUserClub(freshClub);
    world.createHumanManager(freshClub.id, `${userName} ${userSurname}`);
    world.createManagerProfile(freshClub.id, userName, userSurname, userNationality, userOrigin, userBirthDate, currentDate, careerMode === 'BOTH' ? selectedNationalTeamId : null);
    const allFix = initSeasonFixtures(currentDate, freshClub.id);
    updateNextFixture(allFix, currentDate, freshClub.id);
    setGameState('PLAYING');
    notify();
  };

  const performAutoSave = async () => {
    const saved = await performAutoSaveService({
      currentDate,
      userName,
      userSurname,
      userClub,
      selectedNationalTeamId,
      careerMode,
      fixtures,
      seasonEndDate,
      isAutoSaveEnabled,
    });
    if (saved) setHasSave(true);
  };

  const finishPostMatchFlow = () => {
    setView('HOME');
    const targetTeamId = userClub?.id || activeManagedTeamId || selectedNationalTeamId;
    if (targetTeamId) {
      updateNextFixture(fixtures, currentDate, targetTeamId);
    }
    void performAutoSave();
  };

  const proceedFromPreMatch = () => {
    const isNtMatch = Boolean(selectedNationalTeamId && nextFixture && isNationalFixture(nextFixture));
    if (isNtMatch) {
      setView('MATCH');
      return;
    }
    if (!userClub) {
      setView('MATCH');
      return;
    }
    const starters = world.getPlayersByClub(userClub.id).filter(p => p.isStarter && p.squad === 'SENIOR');
    const hasInvalid = starters.some(p => p.injury || (p.suspension && p.suspension.matchesLeft > 0));
    if (starters.length < 11 || hasInvalid) {
      setView('SENIOR_TACTICS');
      return;
    }
    // If press is delegated to a staff member, resolve pre-match conference automatically once per fixture
    const pressDelegate = getPressDelegate(userClub);
    if (pressDelegate && nextFixture && lastAutoPrePressFixtureRef.current !== nextFixture.id) {
      const oppId = nextFixture.homeTeamId === userClub.id ? nextFixture.awayTeamId : nextFixture.homeTeamId;
      const opponent = world.getClub(oppId);
      const res = resolveDelegatedPressConference(
        userClub,
        opponent,
        'PRE_MATCH',
        undefined,
        undefined,
        nextFixture.homeTeamId === userClub.id
      );
      lastAutoPrePressFixtureRef.current = nextFixture.id;
      if (res) {
        showToast(
          `${res.staffName} atendió la conferencia previa (Moral ${res.moraleDelta >= 0 ? '+' : ''}${res.moraleDelta}, Directiva ${res.confidenceDelta >= 0 ? '+' : ''}${res.confidenceDelta}).`,
          'info'
        );
      }
    }
    setView('MATCH');
  };

  const proceedFromPostMatchSummary = () => {
    const isNtMatch = Boolean(selectedNationalTeamId && nextFixture && isNationalFixture(nextFixture));
    if (isNtMatch) {
      setView('HOME');
      updateNextFixture(fixtures, currentDate, activeManagedTeamId || selectedNationalTeamId || '');
      return;
    }
    if (!userClub || !nextFixture || isInVacation) {
      finishPostMatchFlow();
      return;
    }
    const pressDelegate = getPressDelegate(userClub);
    if (pressDelegate) {
      const oppId = nextFixture.homeTeamId === userClub.id ? nextFixture.awayTeamId : nextFixture.homeTeamId;
      const opponent = world.getClub(oppId);
      const res = resolveDelegatedPressConference(
        userClub,
        opponent,
        'POST_MATCH',
        nextFixture.homeScore,
        nextFixture.awayScore,
        nextFixture.homeTeamId === userClub.id
      );
      if (res) {
        showToast(
          `${res.staffName} atendió la rueda de prensa post-partido (Moral ${res.moraleDelta >= 0 ? '+' : ''}${res.moraleDelta}, Directiva ${res.confidenceDelta >= 0 ? '+' : ''}${res.confidenceDelta}).`,
          'info'
        );
      }
      finishPostMatchFlow();
      return;
    }
    setView('PRESS_CONFERENCE_POST');
  };

  const advanceTime = async () => {
    if (advancingRef.current) return; // evita doble avance (espacio / doble clic mientras procesa)

    // ── Sequential screen routing: whenever there is a next screen in the current flow, Continuar advances to it ──
    if (currentView === 'SENIOR_TACTICS' && userClub) {
      const isMatchToday = fixtures.some(f =>
        !f.played &&
        f.date.toDateString() === currentDate.toDateString() &&
        (f.homeTeamId === userClub.id || f.awayTeamId === userClub.id) &&
        f.squadType === 'SENIOR'
      );
      if (isMatchToday) {
        setView('PRE_MATCH');
        return;
      }
    }

    if (selectedNationalTeamId && currentView === `NT_${selectedNationalTeamId}_TACTICS`) {
      const isNtMatchToday = fixtures.some(f =>
        !f.played &&
        f.date.toDateString() === currentDate.toDateString() &&
        (f.homeTeamId === selectedNationalTeamId || f.awayTeamId === selectedNationalTeamId) &&
        f.squadType === 'SENIOR'
      );
      if (isNtMatchToday) {
        setView('PRE_MATCH');
        return;
      }
    }

    if (currentView === 'PRE_MATCH') {
      proceedFromPreMatch();
      return;
    }

    if (currentView === 'PRESS_CONFERENCE_PRE') {
      setView('MATCH');
      return;
    }

    if (currentView === 'POST_MATCH_SUMMARY') {
      proceedFromPostMatchSummary();
      return;
    }

    if (currentView === 'PRESS_CONFERENCE_POST') {
      finishPostMatchFlow();
      return;
    }

    const yieldToPaint = () => new Promise<void>(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));

    const t0 = performance.now();
    // ── Fixture stats ──────────────────────────────────────────────
    const deepIds = new Set(useGameStore.getState().deepSimLeagues);
    const totalFix = fixtures.filter(f => !f.played && f.date.toDateString() === currentDate.toDateString());
    const deepFix = totalFix.filter(f => deepIds.has(world.getClub(f.homeTeamId)?.leagueId || world.getClub(f.awayTeamId)?.leagueId || ''));
    const lightFix = totalFix.length - deepFix.length;
    console.groupCollapsed(`📅 ${currentDate.toLocaleDateString('es-ES')} — ${totalFix.length} partidos (${deepFix.length} DEEP · ${lightFix} LIGHT) · ${fixtures.length.toLocaleString()} totales`);

    if (currentDate >= seasonEndDate) {
      advancingRef.current = true;
      setIsSimulating(true);
      setSimProgress(20);
      setSimProgressDetail('Cerrando temporada y calculando premios…');
      await yieldToPaint();
      try {
      world.processLoanReturns(currentDate);
      const result = useGameStore.getState().finishSeason(fixtures, activeManagedTeamId);
      setSeasonSummary(result.summaries);
      setUserWonLeague(result.userWonLeague);
      const gs = useGameStore.getState();
      gs.setManagerHistory({ ...gs.managerHistory, seasonsCompleted: gs.managerHistory.seasonsCompleted + 1 });
      if (result.userWonLeague) gs.trackTitle('Liga');
       const wonCups = result.summaries.filter((s: any) => s.championId === userClub?.id && s.compType !== 'LEAGUE');
       wonCups.forEach((s: any) => gs.trackTitle(s.compName));
       if (userClub) {
         const leagueTable = world.getLeagueTable(userClub.leagueId, result.newFixtures.length > 0 ? result.newFixtures : fixtures, 'SENIOR');
         const leaguePos = leagueTable.findIndex(e => e.clubId === userClub.id) + 1;
         const leagueTotal = leagueTable.length;
         const titleNames: string[] = [];
         if (result.userWonLeague) titleNames.push('Liga');
         wonCups.forEach((s: any) => titleNames.push(s.compName));
         world.updateManagerProfileSeasonEnd(result.userWonLeague || wonCups.length > 0, titleNames, leaguePos || 10, leagueTotal || 20);
       }
       sendMatchNotification('Temporada finalizada — revisa el resumen');
      if (userClub) {
        const leagueTable = world.getLeagueTable(userClub.leagueId, result.newFixtures.length > 0 ? result.newFixtures : fixtures, 'SENIOR');
        const leaguePos = leagueTable.findIndex(e => e.clubId === userClub.id) + 1;
        const leagueTotal = leagueTable.length;
        const cupWinnerId = result.summaries.find((s: any) => s.compType !== 'LEAGUE' && s.championId)?.championId;
        const wonCup = cupWinnerId === userClub.id;
        const cupSemi = fixtures.some(
          (f) =>
            (f.homeTeamId === userClub.id || f.awayTeamId === userClub.id) &&
            (f.stage === 'SEMI_FINAL' || f.stage === 'FINAL')
        );
        const changes = world.evaluateBoardConfidence(userClub.id, leaguePos || 10, leagueTotal || 20, wonCup, cupSemi);
        if (changes <= -30) {
          world.addInboxMessage('SQUAD', 'Confianza de la directiva baja', `La directiva no está satisfecha con los resultados de esta temporada. Se esperan mejoras significativas.`, currentDate, undefined, 'IMPORTANT');
        }
        world.applySeasonObjectiveBonus(userClub.id, leaguePos || 10, leagueTotal || 20, wonCup, cupSemi);
        if (userClub.boardConfidence <= 0) {
          world.addInboxMessage('SQUAD', '¡DESPIDO!', `La directiva de ${userClub.name} ha decidido prescindir de tus servicios. Tu contrato ha sido rescindido.`, currentDate, undefined, 'CRITICAL');
          setSackedClubName(userClub.name);
          setIsSackedModalOpen(true);
        }
        world.checkManagerJobOffers(currentDate, userClub.id, useGameStore.getState().managerReputation);
        const comps = world.getClubCompetitions(userClub.id);
        comps.forEach(c => world.checkSquadRegistration(userClub.id, c.id, currentDate));
      }
      setView('HOME');
      notify();
      return;
      } finally {
        advancingRef.current = false;
        setIsSimulating(false);
        setSimProgress(0);
        console.groupEnd();
      }
    }

    try {
    advancingRef.current = true;

    // ── Feedback visual: pintar estado de carga ANTES del trabajo síncrono ──
    setIsSimulating(true);
    setSimProgress(12);
    setSimProgressDetail(totalFix.length > 0 ? `Preparando ${totalFix.length} partidos…` : 'Avanzando al día siguiente…');
    await yieldToPaint();

    if (userClub || selectedNationalTeamId) {
    const clubMatchToday = userClub
      ? fixtures.find(
          (f) =>
            !f.played &&
            f.date.toDateString() === currentDate.toDateString() &&
            (f.homeTeamId === userClub.id || f.awayTeamId === userClub.id) &&
            f.squadType === 'SENIOR'
        )
      : undefined;
    const nationalMatchToday = selectedNationalTeamId
      ? fixtures.find(
          (f) =>
            !f.played &&
            f.date.toDateString() === currentDate.toDateString() &&
            (f.homeTeamId === selectedNationalTeamId || f.awayTeamId === selectedNationalTeamId) &&
            f.squadType === 'SENIOR'
        )
      : undefined;
    if (clubMatchToday) {
      console.log(`  ⏸ partido del usuario hoy — pausado`);
      console.groupEnd();
      setIsSimulating(false);
      setSimProgress(0);
      setNextFixture(clubMatchToday);
      const starters = world.getPlayersByClub(userClub!.id).filter(p => p.isStarter && p.squad === 'SENIOR');
      if (starters.length < 11) {
        setView('SENIOR_TACTICS');
      } else {
        setView('PRE_MATCH');
      }
      return;
    }
    if (nationalMatchToday) {
      console.log(`  ⏸ partido de selección del usuario hoy — pausado`);
      console.groupEnd();
      setIsSimulating(false);
      setSimProgress(0);
      setNextFixture(nationalMatchToday);
      setView('PRE_MATCH');
      return;
    }

      console.time('  ⚽ simular partidos');
      await simulateDayFixtures({
        date: currentDate,
        fixtures,
        userClub,
        selectedNationalTeamId,
        onProgress: (pct, detail) => {
          setSimProgress(20 + Math.round(pct * 0.55));
          setSimProgressDetail(detail);
        },
      });
      console.timeEnd('  ⚽ simular partidos');
    }

    const nextDay = new Date(currentDate);
    nextDay.setDate(currentDate.getDate() + 1);
    setCurrentDate(nextDay);
    setSimProgress(80);
    setSimProgressDetail(`Procesando ${nextDay.toLocaleDateString('es-ES')}…`);
    if (nextDay.getDay() === 1 || nextDay.getDate() === 1) {
      await yieldToPaint();
    }

    console.time('  🔄 ciclo diario');
    LifecycleManager.checkBirthdays(nextDay);
    LifecycleManager.recoverDailyFitness();
    LifecycleManager.processMonthlyFinances(nextDay);
    world.checkRenewalTriggers(nextDay, userClub?.id);
    world.processTransferDecisions(nextDay);
    world.processAIActivity(nextDay);
    world.processDailyContracts(nextDay, userClub?.id);
    world.processDailyScouting(nextDay, userClub?.id);
    world.generateGeneralNews(nextDay);
    world.processLightMarketActivity(nextDay);
    world.processQuarterlyYouthIntake(nextDay);
    // ── Semanal (lunes): plantillas mínimas, resumen de clasificación y despidos ──
      if (nextDay.getDay() === 1) {
        setSimProgress(88);
        setSimProgressDetail('Actualizando tablas, mercado y noticias…');
        world.ensureMinimumSquadSizes();
        world.generateStandingsNews(nextDay, fixtures);
        world.simulateCoachChanges(nextDay, fixtures);
      }
    if (nextDay.getMonth() === 7 && nextDay.getDate() === 1) {
      world.generateYouthIntake(nextDay.getFullYear());
      if (userClub) world.addInboxMessage('SQUAD', 'Cosecha de cantera', `Los juveniles de ${userClub.name} se han incorporado al club. Revisa los nuevos talentos en el equipo sub-20.`, nextDay);
    }
    if (nextDay.getDate() === 1) {
      setSimProgress(92);
      setSimProgressDetail('Recalculando valores y finanzas mensuales…');
      world.recalculateAllPlayerValues();
      // Recompute team cohesion for user's club + DEEP league clubs
      if (userClub) world.computeTeamCohesion(userClub.id);
    }

    // Monthly chronicle generation
    if (userClub && nextDay.getDate() === 1 && lastChronicleMonth.current !== nextDay.getMonth()) {
      const prevMonth = nextDay.getMonth() === 0 ? 11 : nextDay.getMonth() - 1;
      const prevYear = nextDay.getMonth() === 0 ? nextDay.getFullYear() - 1 : nextDay.getFullYear();
      const monthFixtures = fixtures.filter(f => {
        const fd = new Date(f.date);
        return f.played && fd.getMonth() === prevMonth && fd.getFullYear() === prevYear &&
          (f.homeTeamId === userClub.id || f.awayTeamId === userClub.id) && f.squadType === 'SENIOR';
      });
      let won = 0, drawn = 0, lost = 0;
      monthFixtures.forEach(f => {
        const isHome = f.homeTeamId === userClub.id;
        const us = isHome ? f.homeScore! : f.awayScore!;
        const them = isHome ? f.awayScore! : f.homeScore!;
        if (us > them) won++; else if (us < them) lost++; else drawn++;
      });
      if (monthFixtures.length > 0) {
        const monthDate = new Date(prevYear, prevMonth, 15);
        generateMonthlyChronicle(userClub.id, monthDate, { won, drawn, lost });
        const monthNames = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
        const balanceText = won >= 4 ? 'excelente' : won >= 3 && lost <= 1 ? 'positivo' : won >= 2 && lost >= 2 ? 'de altibajos' : won >= 1 && lost >= 3 ? 'negativo' : 'para olvidar';
        world.addSeasonPage('MONTHLY_REPORT', `Informe mensual · ${monthNames[prevMonth]}`, `El mes fue ${balanceText}: ${won} victorias, ${drawn} empates y ${lost} derrotas.`, monthDate, won >= 3 ? 'MEDIUM' : 'LOW');
      }
      lastChronicleMonth.current = nextDay.getMonth();
    }

    // Transfer deadline day mechanics
    world.processDeadlineWeekActivity(nextDay);
    world.processDeadlineDay(nextDay);

    // Youth development pipeline
    world.developYouthPlayers(nextDay);
    world.autoPromoteYouthPlayers(nextDay);

    // ── Pilar C: Personality & Drama ──────────────────────────────────
    if (userClub) {
      world.checkDressingRoomConflicts(userClub.id, nextDay);
      world.checkTransferRequestMotives(userClub.id, nextDay);
      world.generateNarrativeEvents(userClub.id, nextDay);
    }
    console.timeEnd('  🔄 ciclo diario');

    const newCupFixtures = LifecycleManager.processCompetitionProgress(fixtures, nextDay);
    let allFixtures = fixtures;
    if (newCupFixtures.length > 0) {
      allFixtures = [...fixtures, ...newCupFixtures];
      setFixtures(allFixtures);
    }

    if (activeManagedTeamId) {
      const next = updateNextFixture(allFixtures, nextDay, activeManagedTeamId);
      const userMatchTomorrow = userClub && allFixtures.find(f =>
        !f.played &&
        f.date.toDateString() === nextDay.toDateString() &&
        (f.homeTeamId === userClub.id || f.awayTeamId === userClub.id) &&
        f.squadType === 'SENIOR'
      );
      if (userMatchTomorrow) {
        // Check if lineup is configured
        const starters = userClub ? world.getPlayersByClub(userClub.id).filter(p => p.isStarter && p.squad === 'SENIOR') : [];
        setView(starters.length >= 11 ? 'PRE_MATCH' : 'SENIOR_TACTICS');
      } else if (next && next.date.toDateString() === nextDay.toDateString()) setView('PRE_MATCH');
    }
    notify();
    } finally {
      advancingRef.current = false;
      setIsSimulating(false);
      setSimProgress(0);
    }
    const elapsed = parseFloat((performance.now() - t0).toFixed(1));
    console.log(`  ✅ total: ${elapsed}ms`);
    // Rolling average (last 50 days)
    perfSamples.current.push(elapsed);
    if (perfSamples.current.length > 50) perfSamples.current.shift();
    if (perfSamples.current.length % 10 === 0) {
      const avg = (perfSamples.current.reduce((a, b) => a + b, 0) / perfSamples.current.length).toFixed(1);
      console.log(`  📊 promedio móvil (${perfSamples.current.length} días): ${avg}ms`);
    }
    console.groupEnd();
  };

  advanceTimeRef.current = advanceTime;

const startVacation = async (targetOverride?: Date) => {
    let target = targetOverride;
    if (!target) {
      if (!vacationTargetDate) return;
      target = new Date(vacationTargetDate);
    }

    if (target <= currentDate) return;
    
    // Reset vacation state
    resetVacationState();
    setIsSimulating(true);
    setIsInVacation(true);
    setVacationProgress(0);
    setVacationDetail('Iniciando simulación...');

    let tempDate = new Date(currentDate);
    let localFixtures = [...fixtures];
    let batchCount = 0;
    const BATCH_SIZE = 7;

    // Calculate total days for progress
    const totalDays = Math.ceil((target.getTime() - tempDate.getTime()) / (1000 * 60 * 60 * 24));
    let daysProcessed = 0;

    while (tempDate < target) {
      // Check if cancelled
      if (vacationCancelled) {
        setIsSimulating(false);
        setIsInVacation(false);
        setVacationDetail('Vacaciones canceladas por el usuario');
        setVacationProgress(0);
        break;
      }

      tempDate.setDate(tempDate.getDate() + 1);
      batchCount++;
      daysProcessed++;

      // Update progress every day
      const progress = Math.min(100, Math.round((daysProcessed / totalDays) * 100));
      setVacationProgress(progress);
      setVacationDetail(`Procesando ${tempDate.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })} (${daysProcessed}/${totalDays})`);

      LifecycleManager.checkBirthdays(tempDate);
      LifecycleManager.recoverDailyFitness();
      LifecycleManager.processMonthlyFinances(tempDate);
      world.checkRenewalTriggers(tempDate, userClub?.id);
      world.processTransferDecisions(tempDate);
      world.processAIActivity(tempDate);
      world.processDailyContracts(tempDate, userClub?.id);
      world.processDailyScouting(tempDate, userClub?.id);

      world.generateGeneralNews(tempDate);
      world.processLightMarketActivity(tempDate);
      world.processQuarterlyYouthIntake(tempDate);

      // Semanal (lunes): plantillas mínimas, resumen de clasificación + despidos de entrenadores AI
      if (tempDate.getDay() === 1) {
        world.ensureMinimumSquadSizes();
        world.generateStandingsNews(tempDate, localFixtures);
        world.simulateCoachChanges(tempDate, localFixtures);
      }

      // Cosecha de cantera + retiros + purga (1 de agosto) — mismo gate que advanceTime
      if (tempDate.getMonth() === 7 && tempDate.getDate() === 1) {
        world.generateYouthIntake(tempDate.getFullYear());
      }

      // Mensual (día 1): recalcular valores, cohesión y crónica mensual
      if (tempDate.getDate() === 1) {
        world.recalculateAllPlayerValues();
        if (userClub) world.computeTeamCohesion(userClub.id);
        if (userClub && lastChronicleMonth.current !== tempDate.getMonth()) {
          const prevMonth = tempDate.getMonth() === 0 ? 11 : tempDate.getMonth() - 1;
          const prevYear = tempDate.getMonth() === 0 ? tempDate.getFullYear() - 1 : tempDate.getFullYear();
          const monthFixtures = localFixtures.filter(f => {
            const fd = new Date(f.date);
            return f.played && fd.getMonth() === prevMonth && fd.getFullYear() === prevYear &&
              (f.homeTeamId === userClub.id || f.awayTeamId === userClub.id) && f.squadType === 'SENIOR';
          });
          let won = 0, drawn = 0, lost = 0;
          monthFixtures.forEach(f => {
            const isHome = f.homeTeamId === userClub.id;
            const us = isHome ? f.homeScore! : f.awayScore!;
            const them = isHome ? f.awayScore! : f.homeScore!;
            if (us > them) won++; else if (us < them) lost++; else drawn++;
          });
          if (monthFixtures.length > 0) {
            const monthDate = new Date(prevYear, prevMonth, 15);
            generateMonthlyChronicle(userClub.id, monthDate, { won, drawn, lost });
            const monthNames = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
            const balanceText = won >= 4 ? 'excelente' : won >= 3 && lost <= 1 ? 'positivo' : won >= 2 && lost >= 2 ? 'de altibajos' : won >= 1 && lost >= 3 ? 'negativo' : 'para olvidar';
            world.addSeasonPage('MONTHLY_REPORT', `Informe mensual · ${monthNames[prevMonth]}`, `El mes fue ${balanceText}: ${won} victorias, ${drawn} empates y ${lost} derrotas.`, monthDate, won >= 3 ? 'MEDIUM' : 'LOW');
          }
          lastChronicleMonth.current = tempDate.getMonth();
        }
      }

      // Transfer deadline day mechanics
      world.processDeadlineWeekActivity(tempDate);
      world.processDeadlineDay(tempDate);

      // Youth development pipeline
      world.developYouthPlayers(tempDate);
      world.autoPromoteYouthPlayers(tempDate);

      // ── Pilar C: Personality & Drama + diálogos de jugadores ──
      if (userClub) {
        world.checkDressingRoomConflicts(userClub.id, tempDate);
        world.checkTransferRequestMotives(userClub.id, tempDate);
        world.generateNarrativeEvents(userClub.id, tempDate);
        detectPlayerDialogueTriggers(userClub.id);
      }

      await simulateDayFixtures({
        date: tempDate,
        fixtures: localFixtures,
        userClub,
        selectedNationalTeamId,
        suppressProgress: true,
      });

      const newCupFixtures = LifecycleManager.processCompetitionProgress(localFixtures, tempDate);
      if (newCupFixtures.length > 0) {
        localFixtures = [...localFixtures, ...newCupFixtures];
      }

      if (tempDate >= seasonEndDate) {
        setFixtures(localFixtures);
        const result = useGameStore.getState().finishSeason(localFixtures, activeManagedTeamId);
        setSeasonSummary(result.summaries);
        setUserWonLeague(result.userWonLeague);
        const gs = useGameStore.getState();
        gs.setManagerHistory({ ...gs.managerHistory, seasonsCompleted: gs.managerHistory.seasonsCompleted + 1 });
        if (result.userWonLeague) gs.trackTitle('Liga');
         const wonCups = result.summaries.filter((s: any) => s.championId === userClub?.id && s.compType !== 'LEAGUE');
         wonCups.forEach((s: any) => gs.trackTitle(s.compName));
         if (userClub) {
           const leagueTable = world.getLeagueTable(userClub.leagueId, localFixtures, 'SENIOR');
           const leaguePos = leagueTable.findIndex(e => e.clubId === userClub.id) + 1;
           const leagueTotal = leagueTable.length;
           const cupWinnerId = result.summaries.find((s: any) => s.compType !== 'LEAGUE' && s.championId)?.championId;
           const wonCup = cupWinnerId === userClub.id;
           const titleNames: string[] = [];
           if (result.userWonLeague) titleNames.push('Liga');
           wonCups.forEach((s: any) => titleNames.push(s.compName));
           world.updateManagerProfileSeasonEnd(result.userWonLeague || wonCups.length > 0, titleNames, leaguePos || 10, leagueTotal || 20);
           world.evaluateBoardConfidence(userClub.id, leaguePos || 10, leagueTotal || 20, wonCup, false);
           world.checkManagerJobOffers(tempDate, userClub.id, useGameStore.getState().managerReputation);
         }
        setIsSimulating(false);
        setIsInVacation(false);
        setIsVacationModalOpen(false);
        setCurrentDate(tempDate);
        notify();
        return;
      }

      if (batchCount >= BATCH_SIZE) {
        setCurrentDate(new Date(tempDate));
        batchCount = 0;
        // Yield to main thread to allow UI updates and cancellation check
        await new Promise(r => setTimeout(r, 0));
      }
    }

    setFixtures(localFixtures);
    setCurrentDate(new Date(tempDate));
    if (userClub) updateNextFixture(localFixtures, tempDate, userClub.id);
    setIsSimulating(false);
    setIsInVacation(false);
    setIsVacationModalOpen(false);
    setView('HOME');
    notify();
  };

  const simulateToNextMatch = async () => {
    if (!activeManagedTeamId) return;
    setIsSimulating(true);
    setSimProgress(5);
    setSimProgressDetail('Preparando simulación…');
    await new Promise<void>(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));

    let tempDate = new Date(currentDate);
    let localFixtures = [...fixtures];
    const maxDays = 120;
    let daysSimmed = 0;
    const upcomingUserFix = localFixtures
      .filter(
        f =>
          !f.played &&
          f.date > currentDate &&
          f.squadType === 'SENIOR' &&
          ((userClub && (f.homeTeamId === userClub.id || f.awayTeamId === userClub.id)) ||
            (selectedNationalTeamId && (f.homeTeamId === selectedNationalTeamId || f.awayTeamId === selectedNationalTeamId)))
      )
      .sort((a, b) => a.date.getTime() - b.date.getTime())[0];
    const estimatedDaysToNextMatch = upcomingUserFix
      ? Math.max(1, Math.min(maxDays, Math.ceil((upcomingUserFix.date.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24))))
      : 14;

    while (daysSimmed < maxDays) {
      tempDate.setDate(tempDate.getDate() + 1);
      daysSimmed++;

      if (tempDate >= seasonEndDate) {
        setFixtures(localFixtures);
        const result = useGameStore.getState().finishSeason(localFixtures, activeManagedTeamId);
        setSeasonSummary(result.summaries);
        setUserWonLeague(result.userWonLeague);
        const gs = useGameStore.getState();
        gs.setManagerHistory({ ...gs.managerHistory, seasonsCompleted: gs.managerHistory.seasonsCompleted + 1 });
        if (result.userWonLeague) gs.trackTitle('Liga');
         const wonCups = result.summaries.filter((s: any) => s.championId === activeManagedTeamId && s.compType !== 'LEAGUE');
         wonCups.forEach((s: any) => gs.trackTitle(s.compName));
         if (userClub) {
           const leagueTable = world.getLeagueTable(userClub.leagueId, localFixtures, 'SENIOR');
           const leaguePos = leagueTable.findIndex(e => e.clubId === userClub.id) + 1;
           const leagueTotal = leagueTable.length;
           const cupWinnerId = result.summaries.find((s: any) => s.compType !== 'LEAGUE' && s.championId)?.championId;
           const wonCup = cupWinnerId === userClub.id;
           const titleNames: string[] = [];
           if (result.userWonLeague) titleNames.push('Liga');
           wonCups.forEach((s: any) => titleNames.push(s.compName));
           world.updateManagerProfileSeasonEnd(result.userWonLeague || wonCups.length > 0, titleNames, leaguePos || 10, leagueTotal || 20);
           world.evaluateBoardConfidence(userClub.id, leaguePos || 10, leagueTotal || 20, wonCup, false);
           world.checkManagerJobOffers(tempDate, userClub.id, useGameStore.getState().managerReputation);
         }
        setIsSimulating(false);
        setSimProgress(0);
        setCurrentDate(tempDate);
        notify();
        return;
      }

      const hasUserMatch = localFixtures.some(f =>
        !f.played && f.date.toDateString() === tempDate.toDateString() &&
        ((userClub && (f.homeTeamId === userClub.id || f.awayTeamId === userClub.id)) ||
          (selectedNationalTeamId && (f.homeTeamId === selectedNationalTeamId || f.awayTeamId === selectedNationalTeamId))) &&
        f.squadType === 'SENIOR'
      );
      const hasClubMatch = Boolean(userClub && localFixtures.some(f =>
        !f.played && f.date.toDateString() === tempDate.toDateString() &&
        (f.homeTeamId === userClub.id || f.awayTeamId === userClub.id) &&
        f.squadType === 'SENIOR'
      ));
      const hasNationalMatch = Boolean(selectedNationalTeamId && localFixtures.some(f =>
        !f.played && f.date.toDateString() === tempDate.toDateString() &&
        (f.homeTeamId === selectedNationalTeamId || f.awayTeamId === selectedNationalTeamId) && f.squadType === 'SENIOR'
      ));

      await simulateDayFixtures({
        date: tempDate,
        fixtures: localFixtures,
        userClub,
        selectedNationalTeamId,
        skipUserMatches: true,
        suppressProgress: true,
      });

      LifecycleManager.checkBirthdays(tempDate);
      LifecycleManager.recoverDailyFitness();
      LifecycleManager.processMonthlyFinances(tempDate);
      world.checkRenewalTriggers(tempDate, userClub?.id);
      world.processTransferDecisions(tempDate);
      world.processAIActivity(tempDate);
      world.processDailyContracts(tempDate, userClub?.id);
      world.processDailyScouting(tempDate, userClub?.id);
      world.generateGeneralNews(tempDate);
      world.processLightMarketActivity(tempDate);
      world.processQuarterlyYouthIntake(tempDate);
      if (tempDate.getDay() === 1) {
        world.ensureMinimumSquadSizes();
      }

      if (userClub) detectPlayerDialogueTriggers(userClub.id);

      // Cosecha de cantera + retiros + purga (1 de agosto) — mismo gate que advanceTime
      if (tempDate.getMonth() === 7 && tempDate.getDate() === 1) {
        world.generateYouthIntake(tempDate.getFullYear());
      }

      // Transfer deadline day mechanics
      world.processDeadlineWeekActivity(tempDate);
      world.processDeadlineDay(tempDate);

      // Youth development pipeline
      world.developYouthPlayers(tempDate);
      world.autoPromoteYouthPlayers(tempDate);

      const newCupFixtures = LifecycleManager.processCompetitionProgress(localFixtures, tempDate);
      if (newCupFixtures.length > 0) {
        localFixtures = [...localFixtures, ...newCupFixtures];
      }

      const progress = Math.min(99, Math.max(5, Math.round((daysSimmed / estimatedDaysToNextMatch) * 100)));
      setSimProgress(progress);
      setSimProgressDetail(`Día ${daysSimmed} · ${tempDate.toLocaleDateString('es-ES')}`);
      if (daysSimmed % 2 === 0) {
        setCurrentDate(new Date(tempDate));
        await new Promise(r => setTimeout(r, 0));
      }

      if (hasUserMatch) {
        setFixtures(localFixtures);
        setCurrentDate(new Date(tempDate));
        setIsSimulating(false);
        setSimProgress(0);
        if (hasClubMatch && userClub) {
          updateNextFixture(localFixtures, tempDate, userClub.id);
          const starters = world.getPlayersByClub(userClub.id).filter(p => p.isStarter && p.squad === 'SENIOR');
          setView(starters.length >= 11 ? 'PRE_MATCH' : 'SENIOR_TACTICS');
        } else if (hasNationalMatch && selectedNationalTeamId) {
          const ntMatch = localFixtures.find(
            (f) =>
              !f.played &&
              f.date.toDateString() === tempDate.toDateString() &&
              (f.homeTeamId === selectedNationalTeamId || f.awayTeamId === selectedNationalTeamId) &&
              f.squadType === 'SENIOR'
          );
          if (ntMatch) setNextFixture(ntMatch);
          setView('PRE_MATCH');
        } else {
          setView('PRE_MATCH');
        }
        notify();
        return;
      }
    }

    setFixtures(localFixtures);
    setCurrentDate(new Date(tempDate));
    updateNextFixture(localFixtures, tempDate, activeManagedTeamId);
    setIsSimulating(false);
    setSimProgress(0);
    setView('HOME');
    notify();
  };

  const handleOpenSaveModal = async () => {
    const saveTeamName = userClub?.shortName || world.nationalTeamManager?.nationalTeams?.find((team: any) => team.id === selectedNationalTeamId)?.name || 'Selección';
    setSaveNameInput(`${saveTeamName} - ${currentDate.toLocaleDateString()}`);
    setOverwriteSaveId(undefined);
    const saves = await listSaves();
    setAvailableSaves(saves);
    setIsSaveModalOpen(true);
  };

  const confirmSaveGame = async () => {
    if (!saveNameInput.trim()) return;
    try {
      await manualSave({
        saveNameInput,
        overwriteId: overwriteSaveId,
        currentDate,
        userName,
        userSurname,
        userClub,
        selectedNationalTeamId,
        careerMode,
        fixtures,
        seasonEndDate,
      });
      setHasSave(true);
      setOverwriteSaveId(undefined);
      setIsSaveModalOpen(false);
      showToast('Partida guardada correctamente.', 'success');
    } catch (e) {
      console.error('Save game failed:', e);
      const errorMessage = e instanceof Error ? e.message : 'Error desconocido al guardar la partida';
      showToast(`Error al guardar la partida: ${errorMessage}`, 'error');
    }
  };

  const handleExportCurrentSave = () => {
    try {
      const saveTeamName = userClub?.shortName || world.nationalTeamManager?.nationalTeams?.find((team: any) => team.id === selectedNationalTeamId)?.name || 'Selección';
      const label = saveNameInput.trim() || `${saveTeamName} - ${currentDate.toLocaleDateString()}`;
      const snapshotData = buildSaveData({
        id: `export_${Date.now()}`,
        label,
        currentDate,
        userName,
        userSurname,
        userClub,
        selectedNationalTeamId,
        careerMode,
        fixtures,
        seasonEndDate,
      });
      exportSaveToJsonFile(snapshotData);
      showToast('Respaldo de partida descargado.', 'success');
    } catch (e) {
      console.error('Export save failed:', e);
      showToast('No se pudo generar el respaldo de la partida.', 'error');
    }
  };

  const handleExportSlot = async (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      const ok = await exportSavedSlotById(id);
      if (ok) showToast('Archivo de partida descargado.', 'success');
      else showToast('No se encontró la partida seleccionada.', 'warning');
    } catch (err) {
      console.error('Slot export failed:', err);
      showToast('Error al descargar el respaldo de la partida.', 'error');
    }
  };

  const handleShareSlotByEmail = async (id: string) => {
    try {
      const outcome = await shareSavedSlotByEmail(id);
      if (outcome === 'not_found') {
        showToast('No se encontró la partida seleccionada.', 'warning');
      } else if (outcome === 'mailto') {
        showToast('Respaldo descargado. Adjuntá el archivo en tu correo.', 'info');
      } else {
        showToast('Partida lista para compartir.', 'success');
      }
    } catch (err) {
      console.error('Slot share failed:', err);
      showToast('No se pudo compartir la partida.', 'error');
    }
  };

  const handleImportJsonFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const rawText = await file.text();
      const imported = await importSaveFromJsonText(rawText);
      const saves = await listSaves();
      setAvailableSaves(saves);
      setHasSave(true);
      showToast(`Partida "${imported.label}" cargada en tus partidas guardadas.`, 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'El archivo de partida no es válido.';
      showToast(msg, 'error');
    }
  };

  const handleOpenLoadModal = async () => {
    const saves = await listSaves();
    setAvailableSaves(saves);
    setIsLoadModalOpen(true);
  };

  const confirmLoadGame = async (id: string) => {
    try {
      const data = await loadGameData(id);
      if (!data) {
        showToast('No se pudo cargar la partida. Puede estar corrupta o haber sido borrada.', 'error');
        return;
      }

      applyWorldState(data.worldState, data.gameState, data.optaState);
      await restoreNationalTeamManager(data.worldState);

      const migratedDeepLeagues = resolveDeepLeagues(data.gameState.userClubId, data.gameState.deepSimLeagues);
      useGameStore.getState().setDeepSimLeagues(migratedDeepLeagues);
      migratedDeepLeagues.forEach((lid: string) => world.ensureDeepSquads(lid));

      setCurrentDate(data.gameState.currentDate);
      setUserName(data.gameState.userName);
      setUserSurname(data.gameState.userSurname);

      const club = data.gameState.userClubId ? world.getClub(data.gameState.userClubId) : null;
      const savedNationalTeamId = data.gameState.selectedNationalTeamId || world.managerProfile?.currentNationalTeamId || world.nationalTeamManager?.controlledTeamId || null;
      setUserClub(club || null);
      setSelectedNationalTeamId(savedNationalTeamId);
      setCareerMode(data.gameState.careerMode || (club && savedNationalTeamId ? 'BOTH' : savedNationalTeamId ? 'NATIONAL' : 'CLUB'));
      setFixtures(data.gameState.fixtures);
      setSeasonEndDate(data.gameState.seasonEndDate);

      if (data.gameState.managerHistory) {
        useGameStore.getState().setManagerHistory(data.gameState.managerHistory);
      }
      if (data.gameState.managerReputation) {
        useGameStore.getState().setManagerReputation(data.gameState.managerReputation);
      }
      if (data.gameState.darkMode !== undefined) {
        useGameStore.getState().setDarkMode(data.gameState.darkMode);
      }

      if (club) {
        updateNextFixture(data.gameState.fixtures, data.gameState.currentDate, club.id);
      } else if (savedNationalTeamId) {
        updateNextFixture(data.gameState.fixtures, data.gameState.currentDate, savedNationalTeamId);
      }

      setIsLoadModalOpen(false);
      setGameState('PLAYING');
      setView('HOME');
      notify();
      showToast(`Partida "${data.label}" cargada.`, 'success');
    } catch (e) {
      console.error(e);
      showToast('Error al cargar la partida.', 'error');
    }
  };

  const handleDeleteSave = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const ok = await confirmAction({
      title: 'Borrar partida guardada',
      message: '¿Estás seguro de eliminar esta partida guardada? Esta acción no se puede deshacer.',
      confirmLabel: 'Borrar',
      cancelLabel: 'Cancelar',
      danger: true,
    });
    if (ok) {
      await deleteSave(id);
      const saves = await listSaves();
      setAvailableSaves(saves);
      if (saves.length === 0) setHasSave(false);
      showToast('Partida eliminada.', 'info');
    }
  };

  const renderCurrentView = () => {
    if (!userClub && !selectedNationalTeamId) return null;
    // Vistas de selección nacional — pantallas separadas (Plantel / Tácticas / Partidos / Estadísticas) como en modo club.
    if (currentView.startsWith('NT_')) {
      const body = currentView.replace(/^NT_/, '');
      const sectionMatch = body.match(/^(.*?)_(SQUAD|TACTICS|SCHEDULE|STATS)$/);
      const teamId = sectionMatch ? sectionMatch[1] : body;
      const section = (sectionMatch ? sectionMatch[2] : 'SQUAD') as 'SQUAD' | 'TACTICS' | 'SCHEDULE' | 'STATS';
      return <NationalTeamView teamId={teamId} section={section} />;
    }
    const renderNationalMatchScreens = () => {
      if (!selectedNationalTeamId || !nextFixture || !isNationalFixture(nextFixture)) return null;
      const homeNT = buildNationalTeamClub(nextFixture.homeTeamId, 'bg-sky-600');
      const awayNT = buildNationalTeamClub(nextFixture.awayTeamId, 'bg-red-700');
      const userNT = homeNT.id === selectedNationalTeamId ? homeNT : awayNT;
      const oppNT = homeNT.id === selectedNationalTeamId ? awayNT : homeNT;

      if (currentView === 'PRE_MATCH') {
        const userSquad = getNationalMatchSquad(userNT.id);
        const oppSquad = getNationalMatchSquad(oppNT.id);
        const userStarters = userSquad.filter((p) => p.isStarter).slice(0, 11);
        const oppStarters = oppSquad.filter((p) => p.isStarter).slice(0, 11);
        return (
          <Suspense fallback={<div className="p-8 text-center text-slate-500 font-black uppercase">Cargando previa...</div>}>
            <PreMatchView
              club={userNT}
              opponent={oppNT}
              starters={userStarters}
              opponentStarters={oppStarters}
              nextFixture={nextFixture}
              onStart={() => setView('MATCH')}
              onGoToTactics={() => setView(`NT_${selectedNationalTeamId}_TACTICS`)}
            />
          </Suspense>
        );
      }

      if (currentView === 'MATCH') {
        const homePlayers = getNationalMatchSquad(homeNT.id);
        const awayPlayers = getNationalMatchSquad(awayNT.id);
        const { tactic: ntTactic, settings: ntSettings } = getNationalTacticForMatch(selectedNationalTeamId);
        return (
          <Suspense fallback={<div className="p-8 text-center text-slate-500 font-black uppercase">Cargando partido...</div>}>
            <MatchView
              fixture={nextFixture}
              userClubId={selectedNationalTeamId}
              currentDate={currentDate}
              homeTeam={homeNT}
              awayTeam={awayNT}
              homePlayers={homePlayers}
              awayPlayers={awayPlayers}
              tacticOverride={ntTactic}
              settingsOverride={ntSettings}
              isNationalMatch
              onFinish={(h, a, stats, events, penalties) => {
                nextFixture.played = true;
                nextFixture.homeScore = h;
                nextFixture.awayScore = a;
                if (penalties) {
                  nextFixture.penaltyHome = penalties.penaltyHome;
                  nextFixture.penaltyAway = penalties.penaltyAway;
                }
                world.bumpFixturesVersion();
                MatchSimulator.finalizeSeasonStats(homePlayers, awayPlayers, stats, h, a, nextFixture.competitionId);
                MatchSimulator.processMatchInjuries(stats);
                const userScore = homeNT.id === selectedNationalTeamId ? h : a;
                const oppScore = homeNT.id === selectedNationalTeamId ? a : h;
                const resultLabel = userScore > oppScore ? 'Victoria' : userScore < oppScore ? 'Derrota' : 'Empate';
                sendMatchNotification(`${resultLabel}: ${homeNT.name} ${h} - ${a} ${awayNT.name}`);
                useGameStore.getState().trackMatchResult(userScore, oppScore);
                world.updateManagerProfileMatch(userScore, oppScore);
                const chronicle = generateNationalTeamChronicle(
                  nextFixture,
                  h,
                  a,
                  stats,
                  selectedNationalTeamId,
                  events,
                  getNationalChronicleContext(selectedNationalTeamId)
                );
                setLastMatchStats(stats);
                setLastChronicle(chronicle);
                setView('POST_MATCH_SUMMARY');
                notify();
                void performAutoSave();
              }}
            />
          </Suspense>
        );
      }

      if (currentView === 'POST_MATCH_SUMMARY') {
        return (
          <Suspense fallback={<div className="p-8 text-center text-slate-500 font-black uppercase">Cargando resumen...</div>}>
            <PostMatchSummaryView
              homeTeam={homeNT}
              awayTeam={awayNT}
              homeScore={nextFixture.homeScore ?? 0}
              awayScore={nextFixture.awayScore ?? 0}
              stats={lastMatchStats}
              chronicle={lastChronicle}
              userClubId={selectedNationalTeamId}
              onContinue={() => {
                setView('HOME');
                updateNextFixture(fixtures, currentDate, activeManagedTeamId || selectedNationalTeamId);
              }}
            />
          </Suspense>
        );
      }
      return null;
    };

    if (selectedNationalTeamId && nextFixture && isNationalFixture(nextFixture) && (currentView === 'PRE_MATCH' || currentView === 'MATCH' || currentView === 'POST_MATCH_SUMMARY')) {
      const ntScreen = renderNationalMatchScreens();
      if (ntScreen) return ntScreen;
    }

    if (!userClub && selectedNationalTeamId) {
      if (currentView === 'CHRONICLES') return <ChronicleView onBack={() => setView('HOME')} clubId={undefined} />;
      if (currentView === 'MANAGER_PROFILE') return <ManagerProfileView onBack={() => setView('HOME')} />;
      if (currentView === 'INBOX') return <InboxView setView={setView} />;
      if (currentView === 'MEDIA') return <MediaView onBack={() => setView('HOME')} />;
      if (currentView === 'SEASON_HISTORY') return <SeasonHistoryView onBack={() => setView('HOME')} />;
      const nationalTeam = world.nationalTeamManager?.nationalTeams?.find((team: any) => team.id === selectedNationalTeamId);
      const nationalFixture = nextFixture && (nextFixture.homeTeamId === selectedNationalTeamId || nextFixture.awayTeamId === selectedNationalTeamId) ? nextFixture : null;
      const homeNT = nationalFixture ? buildNationalTeamClub(nationalFixture.homeTeamId, 'bg-sky-600') : null;
      const awayNT = nationalFixture ? buildNationalTeamClub(nationalFixture.awayTeamId, 'bg-red-700') : null;
      const isNTMatchToday = Boolean(nationalFixture && !nationalFixture.played && nationalFixture.date.toDateString() === currentDate.toDateString());
      return (
        <div className="p-4 sm:p-8 h-full overflow-y-auto bg-[#d4dcd4]">
          <div className="max-w-3xl mx-auto space-y-4">
            <div className="bg-[#e8ece8] border border-[#1c1f24] rounded-sm overflow-hidden shadow-md">
              <FmBroadcastHeader
                club={buildNationalTeamClub(selectedNationalTeamId, 'bg-sky-600')}
                title={nationalTeam?.name || selectedNationalTeamId}
                subtitle="Cargo internacional activo · Convocatorias, táctica y partidos 2D"
                shieldSize="md"
              />
            </div>
            <div className="bg-[#e8ece8] border border-[#1c1f24] rounded-sm overflow-hidden shadow-md">
              <div className="bg-[#3a3f45] border-b border-[#1c1f24] px-3 py-1.5 flex items-center justify-between">
                <span className="text-[10.5px] font-bold uppercase tracking-wider text-slate-100">Próximo compromiso internacional</span>
                {nationalFixture && (
                  <span className="text-[10px] font-mono text-slate-300 tabular-nums">
                    {nationalFixture.date.toLocaleDateString()}
                  </span>
                )}
              </div>
              {nationalFixture && homeNT && awayNT ? (
                <>
                  <FmMatchupBanner
                    homeClub={homeNT}
                    awayClub={awayNT}
                    centerMainLabel="VS"
                    centerBottomLabel={isNTMatchToday ? 'Hoy' : 'Internacional'}
                    size="lg"
                  />
                  <div className="p-2.5 bg-[#3a3f45] flex flex-wrap items-center justify-between gap-2">
                    <FMButton variant="secondary" onClick={() => setView(`NT_${selectedNationalTeamId}`)}>
                      <Flag size={13} /> Gestionar selección
                    </FMButton>
                    <button
                      type="button"
                      onClick={() => setView('PRE_MATCH')}
                      className="flex items-center gap-1.5 bg-[#1f5922] hover:bg-[#174619] text-white font-bold uppercase text-[11px] tracking-wider px-4 py-1.5 rounded border border-[#133815] shadow-sm cursor-pointer whitespace-nowrap"
                    >
                      <Play size={12} className="fill-current" /> Ir al Partido 2D
                    </button>
                  </div>
                </>
              ) : (
                <div className="p-5 flex items-center justify-between gap-3">
                  <p className="text-xs text-slate-600 italic">No hay un partido internacional próximo.</p>
                  <FMButton onClick={() => setView(`NT_${selectedNationalTeamId}`)}><Flag size={14} /> Gestionar selección</FMButton>
                </div>
              )}
            </div>
          </div>
        </div>
      );
    }

    switch (currentView) {
      case 'HOME':
        return (
          <div className="p-2 space-y-2 overflow-y-auto pb-20">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-2">
              <div id="home-next-match" className="lg:col-span-2 bg-[#e8ece8] rounded-sm border border-[#1c1f24] shadow-md relative overflow-hidden flex flex-col">
                <div className="bg-[#3a3f45] border-b border-[#1c1f24] px-3 py-1.5 flex items-center justify-between gap-2">
                  <span className="text-[10.5px] font-bold uppercase tracking-wider text-slate-100">
                    Próximo Encuentro
                  </span>
                  {nextFixture && (
                    <span className="text-[10px] font-mono text-slate-300 tabular-nums truncate">
                      {world.competitions.find(c => c.id === nextFixture.competitionId)?.name || nextFixture.competitionId} · {nextFixture.date.toLocaleDateString()}
                    </span>
                  )}
                </div>
                {nextFixture ? (() => {
                  const homeClubObj = world.getClub(nextFixture.homeTeamId) || userClub;
                  const awayClubObj = world.getClub(nextFixture.awayTeamId) || userClub;
                  const isHome = nextFixture.homeTeamId === userClub.id;
                  return (
                    <>
                      <FmMatchupBanner
                        homeClub={homeClubObj}
                        awayClub={awayClubObj}
                        centerMainLabel="VS"
                        centerBottomLabel={isHome ? 'Local' : 'Visitante'}
                        size="lg"
                      />
                      <div className="p-2.5 bg-[#3a3f45] flex items-center justify-between gap-2">
                        <div className="text-[11px] text-slate-200 truncate">
                          <span className="font-semibold text-white">{homeClubObj.stadium}</span>
                        </div>
                        <button
                          onClick={() => {
                            const starters = world.getPlayersByClub(userClub.id).filter(p => p.isStarter && p.squad === 'SENIOR');
                            if (starters.length >= 11) {
                              setView('PRE_MATCH');
                            } else {
                              setView('SENIOR_TACTICS');
                            }
                          }}
                          className="flex items-center justify-center gap-1.5 bg-[#1f5922] hover:bg-[#174619] text-white font-bold uppercase text-[11px] tracking-wider px-4 py-1.5 rounded border border-[#133815] shadow-sm transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          <Play size={12} className="fill-current" /> Ir al Partido
                        </button>
                      </div>
                    </>
                  );
                })() : (
                  <p className="text-center text-slate-500 italic py-8 text-xs">No hay partidos próximos.</p>
                )}
              </div>
              <div className="bg-slate-200 p-3 rounded-sm border border-slate-500 shadow-sm flex flex-col">
                <h3 className="text-slate-950 font-black uppercase text-[10px] tracking-wider mb-2 border-b border-slate-400 pb-1 flex items-center gap-2"><Trophy size={12} /> Competiciones</h3>
                <div className="flex-1 space-y-1 overflow-y-auto">
                  {world.competitions.filter(c => {
                    if (c.id === userClub.leagueId) return true;
                    if (c.type !== 'LEAGUE') return fixtures.some(f => f.competitionId === c.id && (f.homeTeamId === userClub.id || f.awayTeamId === userClub.id));
                    return false;
                  }).map(comp => {
                    let statusText = "";
                    if (comp.type === 'LEAGUE') {
                      const table = world.getLeagueTable(comp.id, fixtures, 'SENIOR');
                      const rank = table.findIndex(e => e.clubId === userClub.id) + 1;
                      statusText = rank > 0 ? `${rank}º` : '-';
                    } else statusText = "En curso";
                    return (
                      <div key={comp.id} className="flex justify-between items-center p-1.5 bg-slate-300/50 rounded-sm border-l-2 border-slate-500">
                        <span className="text-[9px] font-black text-slate-700 uppercase truncate max-w-[80px]">{comp.name}</span>
                        <span className="text-[9px] font-bold text-slate-950 uppercase">{statusText}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            {useGameStore.getState().managerHistory.totalGames > 0 && (
            <div className="bg-slate-200 p-2 rounded-sm border border-slate-400 shadow-sm">
              <h3 className="text-slate-950 font-black uppercase text-[9px] tracking-wider mb-1 border-b border-slate-400 pb-1 flex items-center gap-1.5"><User size={10} /> Mi Historial · Rep: {useGameStore.getState().managerReputation}/100 · {useGameStore.getState().managerReputation >= 90 ? 'Leyenda' : useGameStore.getState().managerReputation >= 75 ? 'Estrella' : useGameStore.getState().managerReputation >= 60 ? 'Respetado' : useGameStore.getState().managerReputation >= 40 ? 'Promedio' : useGameStore.getState().managerReputation >= 25 ? 'Novato' : 'Desconocido'}</h3>
              <div className="flex flex-wrap gap-2 text-[9px] font-bold uppercase text-slate-700">
                <span>PJ: {useGameStore.getState().managerHistory.totalGames}</span>
                <span className="text-green-700">G: {useGameStore.getState().managerHistory.totalWins}</span>
                <span className="text-slate-500">E: {useGameStore.getState().managerHistory.totalDraws}</span>
                <span className="text-red-700">P: {useGameStore.getState().managerHistory.totalLosses}</span>
                <span>GF: {useGameStore.getState().managerHistory.goalsFor}</span>
                <span>GC: {useGameStore.getState().managerHistory.goalsAgainst}</span>
                {useGameStore.getState().managerHistory.currentStreak && (
                  <span className={`${useGameStore.getState().managerHistory.currentStreak === 'W' ? 'text-green-600' : useGameStore.getState().managerHistory.currentStreak === 'L' ? 'text-red-600' : 'text-slate-500'}`}>
                    {useGameStore.getState().managerHistory.currentStreak === 'W' ? 'Racha: ' : useGameStore.getState().managerHistory.currentStreak === 'L' ? 'Racha: ' : 'Racha: '}{useGameStore.getState().managerHistory.streakCount}
                  </span>
                )}
                {useGameStore.getState().managerHistory.titles.length > 0 && (
                  <span className="text-yellow-600">Títulos: {useGameStore.getState().managerHistory.titles.length}</span>
                )}
              </div>
            </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <div id="header-inbox" className="bg-slate-100 p-3 rounded-sm border border-slate-300 shadow-sm">
                <h3 className="text-slate-950 font-black uppercase text-[10px] tracking-wider mb-2 border-b border-slate-300 pb-1 flex items-center justify-between">
                  <div className="flex items-center gap-2"><Mail size={12} /> Últimas Noticias</div>
                  <button onClick={() => setView('MEDIA')} className="text-[8px] text-blue-600 hover:underline flex items-center">Ver todo <ChevronRight size={8} /> </button>
               </h3>
                <div className="space-y-1">
                  {world.getAllNews(3).map((msg) => (
                    <div key={msg.id} className="p-2 bg-slate-200 border-l-2 border-slate-400 hover:bg-slate-300 transition-colors cursor-pointer" onClick={() => setView('MEDIA')}>
                      <div className="flex justify-between items-center mb-0.5">
                        <span className="text-[8px] font-black px-1 py-0.5 rounded text-white bg-[#3a4a3a]">{msg.section}</span>
                        <span className="text-[8px] text-slate-500 font-mono">{msg.date.toLocaleDateString()}</span>
                      </div>
                      <h4 className="text-[10px] font-black text-slate-900 uppercase truncate">{msg.headline}</h4>
                      <p className="text-[9px] text-slate-600 truncate italic">{msg.subheadline}</p>
                    </div>
                  ))}
                  {world.getAllNews().length === 0 && <p className="text-center text-slate-400 italic text-[10px] py-2">No hay noticias recientes.</p>}
                </div>
              </div>
              <div id="header-notifications" className="bg-slate-100 p-3 rounded-sm border border-slate-300 shadow-sm">
                <h3 className="text-slate-950 font-black uppercase text-[10px] tracking-wider mb-2 border-b border-slate-300 pb-1 flex items-center justify-between">
                  <div className="flex items-center gap-2"><Bell size={12} /> Notificaciones</div>
                  <button onClick={() => setView('INBOX')} className="text-[8px] text-blue-600 hover:underline flex items-center">Ver todo <ChevronRight size={8} /> </button>
               </h3>
                <div className="space-y-1">
                  {world.inbox.filter(m => !m.isRead).slice(0, 3).map((msg) => (
                    <div key={msg.id} className={`p-2 border-l-2 hover:bg-slate-300 transition-colors cursor-pointer ${msg.priority === 'CRITICAL' ? 'bg-red-50 border-red-400' : msg.priority === 'IMPORTANT' ? 'bg-amber-50 border-amber-400' : 'bg-slate-200 border-slate-400'}`} onClick={() => setView('INBOX')}>
                      <div className="flex justify-between items-center mb-0.5">
                        <span className="text-[8px] font-black px-1 py-0.5 rounded text-white bg-[#3a4a3a]">{msg.category}</span>
                        <span className="text-[8px] text-slate-500 font-mono">{msg.date.toLocaleDateString()}</span>
                      </div>
                      <h4 className="text-[10px] font-black text-slate-900 uppercase truncate">{msg.subject}</h4>
                      <p className="text-[9px] text-slate-600 truncate italic">{msg.body}</p>
                    </div>
                  ))}
                  {world.inbox.filter(m => !m.isRead).length === 0 && <p className="text-center text-slate-400 italic text-[10px] py-2">No hay notificaciones nuevas.</p>}
                </div>
              </div>
            </div>
          </div>
        );
      case 'INBOX':
        return <InboxView setView={setView} />;
      case 'MEDIA':
        return <MediaView onBack={() => setView('HOME')} />;
      case 'CHRONICLES':
        return <ChronicleView onBack={() => setView('HOME')} clubId={userClub.id} />;
      case 'MANAGER_PROFILE':
        return <ManagerProfileView onBack={() => setView('HOME')} />;
      case 'TABLE':
        return (
          <div className="p-2 h-full flex flex-col">
            <LeagueTable
              entries={world.getLeagueTable(viewLeagueId || userClub.leagueId, fixtures, viewSquadType)}
              userClubId={userClub.id}
              allLeagues={world.getLeagues()}
              currentLeagueId={viewLeagueId || userClub.leagueId}
              onLeagueChange={setViewLeagueId}
              currentSquadType={viewSquadType}
              onSquadTypeChange={setViewSquadType}
              fixtures={fixtures}
            />
          </div>
        );
      case 'MARKET':
        return <MarketView userClubId={userClub.id} onSelectPlayer={setSelectedPlayer} currentDate={currentDate} />;
      case 'SEARCH':
        return <SearchView onSelectPlayer={setSelectedPlayer} />;
      case 'NEGOTIATIONS':
        return <NegotiationsView userClubId={userClub.id} currentDate={currentDate} />;
      case 'ECONOMY':
        return <EconomyView club={userClub} />;
      case 'STAFF':
        return <StaffView staff={world.getStaffByClub(userClub.id)} club={userClub} />;
      case 'TRAINING':
        return <TrainingView club={userClub} players={world.getPlayersByClub(userClub.id)} staff={world.getStaffByClub(userClub.id)} squadType="SENIOR" onSquadChange={(t) => setView(`${t}_TRAINING`)} />;
      case 'SCOUTING':
        return <ScoutingView clubId={userClub.id} onSelectPlayer={setSelectedPlayer} />;
      case 'BOARD':
        return <BoardView userClub={userClub} currentDate={currentDate} />;
      case 'VACATION':
        return <VacationView onBack={() => setView('HOME')} />;
      case 'HALL_OF_FAME':
        return <HallOfFameView onBack={() => setView('HOME')} />;
      case 'SEASON_HISTORY':
        return <SeasonHistoryView onBack={() => setView('HOME')} />;
      case 'LEAGUE_RANKING': {
        const rankedLeagues = world.competitions
          .filter(c => c.type === 'LEAGUE')
          .sort((a, b) => (b.dynamicReputation || 0) - (a.dynamicReputation || 0));
        const fmtPrize = (n: number) => {
          if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
          if (n >= 1_000) return `$${Math.round(n / 1_000)}k`;
          return `$${n}`;
        };
        const tierMeta: Record<string, { label: string; cls: string }> = {
          ELITE: { label: 'Élite', cls: 'bg-yellow-100 text-yellow-800 border-yellow-300' },
          PRESTIGE: { label: 'Prestigio', cls: 'bg-blue-100 text-blue-800 border-blue-300' },
          DEVELOPING: { label: 'Media', cls: 'bg-amber-100 text-amber-800 border-amber-300' },
          EMERGING: { label: 'Ascenso', cls: 'bg-slate-200 text-slate-700 border-slate-300' },
          LOCAL: { label: 'Local', cls: 'bg-slate-100 text-slate-600 border-slate-200' },
        };
        return (
          <div className="p-1.5 sm:p-3 h-full flex flex-col bg-[#d4dcd4] overflow-hidden">
            <div className="max-w-4xl w-full mx-auto flex-1 min-h-0 flex flex-col bg-white border border-[#a0b0a0] rounded-sm shadow-sm overflow-hidden">
              <div className="bg-[#3a4a3a] text-white px-2.5 py-1.5 flex items-center justify-between shrink-0 border-b border-[#1c261c]">
                <span className="text-[10px] font-black uppercase tracking-wider">Coeficientes Mundiales</span>
                <span className="text-[9px] font-bold text-white/80 font-mono">{rankedLeagues.length} ligas</span>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto custom-scroll">
                <table className="w-full table-fixed text-[10px] border-collapse">
                  <thead className="bg-[#e8ece8] text-[#1a1a1a] sticky top-0 z-10 border-b border-[#a0b0a0]">
                    <tr className="text-[8.5px] font-black uppercase">
                      <th className="py-1.5 px-1.5 text-center w-7 sm:w-9">#</th>
                      <th className="py-1.5 px-1.5 text-left">Liga</th>
                      <th className="py-1.5 px-1.5 text-left hidden sm:table-cell w-24">País</th>
                      <th className="py-1.5 px-1 text-center w-10 sm:w-14">Rep.</th>
                      <th className="py-1.5 px-1 text-center w-16 sm:w-20">Nivel</th>
                      <th className="py-1.5 px-1.5 text-right w-14 sm:w-24">Premio</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rankedLeagues.map((league, i) => {
                      const tier = world.getLeagueTier(league.dynamicReputation || 30);
                      const tm = tierMeta[tier] || tierMeta.LOCAL;
                      const isUserLeague = league.id === userClub?.leagueId;
                      return (
                        <tr
                          key={league.id}
                          onClick={() => { setViewLeagueId(league.id); setView('TABLE'); }}
                          className={`border-t border-slate-200 cursor-pointer transition-colors ${
                            isUserLeague ? 'bg-emerald-50 font-bold' : i % 2 === 0 ? 'bg-white' : 'bg-[#f4f7f4]'
                          } hover:bg-blue-50`}
                        >
                          <td className="py-1.5 px-1.5 text-center font-mono font-black text-slate-500 text-[9.5px]">{i + 1}</td>
                          <td className="py-1.5 px-1.5 min-w-0">
                            <div className="font-black text-slate-900 truncate text-[10px] leading-tight">
                              {league.name}
                            </div>
                            <div className="sm:hidden text-[8px] font-bold text-slate-500 uppercase truncate leading-tight">
                              {league.country || league.confederation}
                            </div>
                          </td>
                          <td className="py-1.5 px-1.5 text-slate-600 font-bold hidden sm:table-cell truncate">{league.country || league.confederation}</td>
                          <td className="py-1.5 px-1 text-center font-black">
                            <span className={`inline-block px-1.5 py-0.5 rounded-sm text-[9px] font-mono ${(league.dynamicReputation || 0) >= 80 ? 'bg-green-100 text-green-800' : (league.dynamicReputation || 0) >= 60 ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-700'}`}>
                              {league.dynamicReputation || '—'}
                            </span>
                          </td>
                          <td className="py-1.5 px-1 text-center">
                            <span className={`inline-block px-1 py-0.5 rounded-sm border text-[7.5px] font-black uppercase ${tm.cls}`}>
                              {tm.label}
                            </span>
                          </td>
                          <td className="py-1.5 px-1.5 text-right font-mono font-bold text-slate-700 text-[9px] sm:text-[10px]">
                            {fmtPrize(league.defaultPrizePool || 0)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );
      }
      case 'CLUB_REPORT':
        return <ClubReport club={userClub} />;
      case 'PEOPLE_HUB':
        return <PeopleHub userClub={userClub || undefined} currentDate={currentDate} />;
      case 'CLUBS_LIST':
        return <ClubsListView onSelectClub={(c) => { setViewExternalClub(c); setView('EXTERNAL_CLUB'); }} />;
      case 'EXTERNAL_CLUB':
        if (viewExternalClub) {
          return (
            <div className="flex flex-col h-full bg-[#cfd7cf]">
              <FmBroadcastHeader
                club={viewExternalClub}
                title={viewExternalClub.name}
                shortCode={viewExternalClub.shortName}
                subtitle={`Plantilla · ${viewExternalClub.stadium}`}
                compact
                rightSlot={
                  <button
                    onClick={() => setView('CLUBS_LIST')}
                    className="flex items-center gap-1 px-2.5 py-1 rounded border border-[#737a82] text-[11px] font-semibold text-[#1f2428] shadow-sm cursor-pointer whitespace-nowrap"
                    style={{
                      background: 'linear-gradient(180deg, #f3f4f6 0%, #d4d8de 48%, #b9bfc6 100%)',
                    }}
                  >
                    <ArrowLeft size={12} /> Volver
                  </button>
                }
              />
              <div className="flex-1 overflow-y-auto">
                <SquadView
                  players={world.getPlayersByClub(viewExternalClub.id).filter(p => p.squad === 'SENIOR')}
                  onSelectPlayer={setSelectedPlayer}
                  customTitle={`PLANTILLA - ${viewExternalClub.name}`}
                  currentDate={currentDate}
                  club={viewExternalClub}
                />
              </div>
            </div>
          );
        }
        return null;
      case 'PRESS_CONFERENCE_PRE': {
        if (isInVacation) {
          return <div className="p-8 text-center text-slate-500 font-black uppercase">En vacaciones</div>;
        }
        const homeClub = nextFixture ? (nextFixture.homeTeamId === userClub.id ? userClub : world.getClub(nextFixture.homeTeamId)) : undefined;
        const awayClub = nextFixture ? (nextFixture.awayTeamId === userClub.id ? userClub : world.getClub(nextFixture.awayTeamId)) : undefined;
        if (nextFixture && homeClub && awayClub) {
          const opponent = homeClub.id === userClub.id ? awayClub : homeClub;
          return (
            <PressConferenceView
              club={userClub}
              opponent={opponent}
              homeTeam={homeClub}
              awayTeam={awayClub}
              context="PRE_MATCH"
              onFinish={() => setView('MATCH')}
            />
          );
        }
        return <div className="p-8 text-center text-slate-500 font-black uppercase">Error</div>;
      }
      case 'POST_MATCH_SUMMARY': {
         const homeClub = nextFixture ? (nextFixture.homeTeamId === userClub.id ? userClub : world.getClub(nextFixture.homeTeamId)) : undefined;
         const awayClub = nextFixture ? (nextFixture.awayTeamId === userClub.id ? userClub : world.getClub(nextFixture.awayTeamId)) : undefined;
         if (nextFixture && homeClub && awayClub) {
           const pressDelegate = getPressDelegate(userClub);
           return <Suspense fallback={<div className="p-8 text-center text-slate-500 font-black uppercase">Cargando resumen...</div>}><PostMatchSummaryView
             homeTeam={homeClub}
             awayTeam={awayClub}
             homeScore={nextFixture.homeScore ?? 0}
             awayScore={nextFixture.awayScore ?? 0}
             stats={lastMatchStats}
             chronicle={lastChronicle}
             userClubId={userClub.id}
             hasPressConference={!isInVacation && !pressDelegate}
             pressDelegateName={pressDelegate?.name || null}
             onContinue={proceedFromPostMatchSummary}
           /></Suspense>;
         }
         return <div className="p-8 text-center text-slate-500 font-black uppercase">Error: Datos no disponibles</div>;
       }

      case 'PRESS_CONFERENCE_POST': {
         if (isInVacation) {
           return <div className="p-8 text-center text-slate-500 font-black uppercase">En vacaciones</div>;
         }
         const homeClub = nextFixture ? (nextFixture.homeTeamId === userClub.id ? userClub : world.getClub(nextFixture.homeTeamId)) : undefined;
         const awayClub = nextFixture ? (nextFixture.awayTeamId === userClub.id ? userClub : world.getClub(nextFixture.awayTeamId)) : undefined;
         if (nextFixture && homeClub && awayClub) {
           const opponent = homeClub.id === userClub.id ? awayClub : homeClub;
           return (
             <PressConferenceView
               club={userClub}
               opponent={opponent}
               homeTeam={homeClub}
               awayTeam={awayClub}
               context="POST_MATCH"
               homeScore={nextFixture.homeScore}
               awayScore={nextFixture.awayScore}
               onFinish={finishPostMatchFlow}
             />
           );
         }
         return <div className="p-8 text-center text-slate-500 font-black uppercase">Error: Datos no disponibles</div>;
       }
        case 'PRE_MATCH': {
          const homeClub = nextFixture ? (nextFixture.homeTeamId === userClub.id ? userClub : world.getClub(nextFixture.homeTeamId)) : undefined;
          const awayClub = nextFixture ? (nextFixture.awayTeamId === userClub.id ? userClub : world.getClub(nextFixture.awayTeamId)) : undefined;
          if (nextFixture && homeClub && awayClub) {
             const opponentClub = homeClub.id === userClub.id ? awayClub : homeClub;
             const pressDelegate = getPressDelegate(userClub);
             let opponentStarters = world.getPlayersByClub(opponentClub.id).filter(p => p.isStarter && p.squad === 'SENIOR');
             if (opponentStarters.length < 11) {
                const allSeniors = world.getPlayersByClub(opponentClub.id).filter(p => p.squad === 'SENIOR');
                const remaining = allSeniors.filter(p => !opponentStarters.find(s => s.id === p.id)).slice(0, 11 - opponentStarters.length);
                opponentStarters = [...opponentStarters, ...remaining];
             }
             return (
               <Suspense fallback={<div className="p-8 text-center text-slate-500 font-black uppercase">Cargando previa...</div>}>
                 <PreMatchView
                   club={userClub}
                   opponent={opponentClub}
                   starters={world.getPlayersByClub(userClub.id).filter(p => p.isStarter && p.squad === 'SENIOR')}
                   opponentStarters={opponentStarters}
                   nextFixture={nextFixture}
                   onStart={proceedFromPreMatch}
                   onGoToTactics={() => setView('SENIOR_TACTICS')}
                   onPressConference={pressDelegate ? undefined : () => setView('PRESS_CONFERENCE_PRE')}
                   pressDelegateName={pressDelegate?.name || null}
                   onAutoFixLineup={() => {
                     world.selectBestEleven(userClub.id, 'SENIOR', world.getActiveTactic()?.id);
                     notify();
                     showToast('Alineación completada con los mejores jugadores disponibles.', 'success');
                   }}
                 />
               </Suspense>
             );
          }
          return <div className="p-8 text-center text-slate-500 font-black uppercase">Error: Datos de partido no disponibles</div>;
        }
      case 'MATCH': {
        const homeClub = nextFixture ? (nextFixture.homeTeamId === userClub.id ? userClub : world.getClub(nextFixture.homeTeamId)) : undefined;
        const awayClub = nextFixture ? (nextFixture.awayTeamId === userClub.id ? userClub : world.getClub(nextFixture.awayTeamId)) : undefined;
        if (nextFixture && homeClub && awayClub) {
           return <Suspense fallback={<div className="p-8 text-center text-slate-500 font-black uppercase">Cargando partido...</div>}><MatchView fixture={nextFixture} userClubId={userClub.id} currentDate={currentDate} homeTeam={homeClub} awayTeam={awayClub} homePlayers={getMatchSquad(nextFixture.homeTeamId)} awayPlayers={getMatchSquad(nextFixture.awayTeamId)} onFinish={(h, a, stats: Record<string, PlayerMatchStats>, events, penalties) => {
               nextFixture.played = true; nextFixture.homeScore = h; nextFixture.awayScore = a;
               if (penalties) { nextFixture.penaltyHome = penalties.penaltyHome; nextFixture.penaltyAway = penalties.penaltyAway; }
               world.bumpFixturesVersion();
               MatchSimulator.finalizeSeasonStats(
                 world.getPlayersByClub(nextFixture.homeTeamId).filter(p => p.squad === 'SENIOR'),
                 world.getPlayersByClub(nextFixture.awayTeamId).filter(p => p.squad === 'SENIOR'), stats, h, a, nextFixture.competitionId
               );
               LifecycleManager.processPostMatchSuspensions(nextFixture.homeTeamId, nextFixture.awayTeamId, Object.entries(stats).filter(([pid, s]) => s.card === 'RED' && world.getPlayer(pid)?.clubId === nextFixture.homeTeamId).length, Object.entries(stats).filter(([pid, s]) => s.card === 'RED' && world.getPlayer(pid)?.clubId === nextFixture.awayTeamId).length);
               MatchSimulator.processMatchInjuries(stats);
               world.processMatchDayIncome(nextFixture.homeTeamId, nextFixture.competitionId, currentDate);
               world.trackU21Minutes(nextFixture.homeTeamId, world.getPlayersByClub(nextFixture.homeTeamId).filter(p => p.squad === 'SENIOR'), stats, currentDate);
               world.trackU21Minutes(nextFixture.awayTeamId, world.getPlayersByClub(nextFixture.awayTeamId).filter(p => p.squad === 'SENIOR'), stats, currentDate);
               const userScore = homeClub.id === userClub.id ? h : a;
               const oppScore = homeClub.id === userClub.id ? a : h;
               const resultLabel = userScore > oppScore ? 'Victoria' : userScore < oppScore ? 'Derrota' : 'Empate';
               sendMatchNotification(`${resultLabel}: ${homeClub.name} ${h} - ${a} ${awayClub.name}`);
               useGameStore.getState().trackMatchResult(userScore, oppScore);
               world.updateManagerProfileMatch(userScore, oppScore);
               world.updateTacticalFamiliarity(userClub.id);
               world.updateClubRecords(nextFixture.homeTeamId, nextFixture.awayTeamId, h, a, currentDate, nextFixture.competitionId);
               const chronicle = generateMatchChronicle(nextFixture, h, a, stats, userClub.id, events);
               setLastMatchStats(stats);
               setLastChronicle(chronicle);
               setView('POST_MATCH_SUMMARY');
               notify();
               void performAutoSave();
            }} /></Suspense>;
         }
        return <div className="p-8 text-center text-slate-500 font-black uppercase">Error: Datos de partido no disponibles</div>;
      }
      default:
        if (currentView.endsWith('_SQUAD')) {
          const type = currentView.split('_')[0] as SquadType;
          return <SquadView squadType={type} onSquadChange={(newType) => setView(`${newType}_SQUAD`)} players={world.getPlayersByClub(userClub.id).filter(p => p.squad === type)} onSelectPlayer={setSelectedPlayer} onContextMenu={handlePlayerContextMenu} currentDate={currentDate} club={userClub} />;
        }
        if (currentView.endsWith('_TACTICS')) {
          const type = currentView.split('_')[0] as SquadType;
          return <Suspense fallback={<div className="p-8 text-center text-slate-500 font-black uppercase">Cargando tácticas...</div>}><TacticsView club={userClub} squad={type} onSquadChange={(newType) => setView(`${newType}_TACTICS`)} players={world.getPlayersByClub(userClub.id).filter(p => p.squad === type)} onContextMenu={handlePlayerContextMenu} /></Suspense>;
        }
        if (currentView.endsWith('_TRAINING')) {
          const type = currentView.split('_')[0] as SquadType;
          return <TrainingView club={userClub} players={world.getPlayersByClub(userClub.id)} staff={world.getStaffByClub(userClub.id)} squadType={type} onSquadChange={(newType) => setView(`${newType}_TRAINING`)} />;
        }
        if (currentView.endsWith('_SCHEDULE')) {
          const type = currentView.split('_')[0] as SquadType;
          const squadFixtures = fixtures.filter(f => (f.homeTeamId === userClub.id || f.awayTeamId === userClub.id) && f.squadType === type);
          const compIds = [...new Set(squadFixtures.map(f => f.competitionId))].sort();
          const activeCompFilter = scheduleCompFilter !== 'ALL' && compIds.includes(scheduleCompFilter) ? scheduleCompFilter : 'ALL';
          const filteredFixtures = activeCompFilter === 'ALL' ? squadFixtures : squadFixtures.filter(f => f.competitionId === activeCompFilter);
          return (
            <div className="p-4 h-full flex flex-col">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
                <h2 className="text-xl font-black text-slate-950 uppercase tracking-tighter border-b border-slate-500 pb-2 italic">Calendario - {type}</h2>
                <select
                  value={activeCompFilter}
                  onChange={(e) => setScheduleCompFilter(e.target.value)}
                  className="bg-slate-100 border border-slate-500 rounded-sm px-3 py-1.5 text-[10px] font-black uppercase text-slate-800 outline-none focus:border-slate-800 max-w-[240px]"
                >
                  <option value="ALL">Todas las competiciones</option>
                  {compIds.map(cid => {
                    const comp = world.competitions.find(c => c.id === cid);
                    return <option key={cid} value={cid}>{comp?.name || cid}</option>;
                  })}
                </select>
              </div>
              <div className="bg-slate-200 rounded-sm border border-slate-500 overflow-y-auto shadow-md flex-1 p-2">
                {filteredFixtures.length === 0 && (
                  <div className="p-10 text-center text-slate-500 italic uppercase font-bold tracking-widest text-[10px]">Sin partidos para esta competición</div>
                )}
                {filteredFixtures.map(f => {
                  const home = world.getClub(f.homeTeamId); const away = world.getClub(f.awayTeamId);
                  const isPenalty = f.penaltyHome !== undefined;
                  const comp = world.competitions.find(c => c.id === f.competitionId);
                  return (
                    <div key={f.id} className="flex flex-col p-2 border-b border-slate-400 hover:bg-slate-300">
                      <div className="flex items-center text-[11px]">
                        <div className="w-20 text-slate-700 font-mono font-bold">{f.date.toLocaleDateString()}</div>
                        <div className="flex-1 text-right font-black text-slate-900 pr-2 uppercase">{home?.name}</div>
                        <div className={`w-20 text-center font-black bg-slate-300 rounded px-1 border border-slate-500 ${f.played ? 'text-slate-950' : 'text-slate-500'}`}>
                          {f.played ? (isPenalty ? `${f.homeScore}-${f.awayScore} (p)` : `${f.homeScore}-${f.awayScore}`) : 'v'}
                        </div>
                        <div className="flex-1 text-left font-black text-slate-900 pl-2 uppercase">{away?.name}</div>
                      </div>
                      <div className="ml-20 text-[9px] font-black uppercase text-slate-500 italic tracking-widest mt-1">{comp?.name || 'Amistoso'}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        }
        if (currentView.startsWith('COMP_')) {
          const competition = world.competitions.find(c => c.id === currentView.replace('COMP_', ''));
          return competition ? <TournamentHub competition={competition} fixtures={fixtures} userClubId={userClub.id} /> : null;
        }
        return null;
    }
  };

  if (gameState === 'LOADING') return <div className="h-screen w-screen bg-[#b8c4b8] flex items-center justify-center text-slate-950"><div className="animate-pulse flex flex-col items-center"><RefreshCw className="w-10 h-10 animate-spin mb-4 text-[#3a4a3a]" /><h1 className="text-2xl font-black italic tracking-widest uppercase">FM Argentina</h1></div></div>;

  const onboardingActive = showOnboarding && gameState === 'PLAYING';

  if (gameState === 'SETUP_USER') return (
    <div className="h-[100dvh] w-screen bg-slate-400 flex items-start sm:items-center justify-center p-3 sm:p-4 relative overflow-y-auto">
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-slate-200 via-slate-400 to-slate-500 opacity-50 pointer-events-none"></div>
      <input
        ref={importFileInputRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={handleImportJsonFile}
      />
      {isLoadModalOpen && (
        <div className="fixed inset-0 z-[200] bg-slate-900/80 flex items-center justify-center p-4 backdrop-blur-sm animate-overlay-in">
          <div className="bg-[#e8ece8] w-full max-w-lg rounded-sm border border-[#1c1f24] shadow-2xl overflow-hidden flex flex-col max-h-[82vh]">
            <div className="bg-[#3a3f45] border-b border-[#1c1f24] px-4 py-2.5 flex justify-between items-center">
              <h2 className="text-xs font-bold text-white uppercase tracking-wider">Cargar Partida</h2>
              <button type="button" onClick={() => setIsLoadModalOpen(false)} className="text-slate-300 hover:text-white cursor-pointer" aria-label="Cerrar"><X size={18} /></button>
            </div>
            <div className="p-4 flex flex-col gap-3 flex-1 min-h-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold text-slate-600">
                  {availableSaves.length} partida{availableSaves.length !== 1 ? 's' : ''} guardada{availableSaves.length !== 1 ? 's' : ''}
                </span>
                <button
                  type="button"
                  onClick={() => importFileInputRef.current?.click()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-sm border border-[#737a82] text-xs font-semibold text-[#1f2428] cursor-pointer whitespace-nowrap"
                  style={{
                    background: 'linear-gradient(180deg, #f3f4f6 0%, #d4d8de 48%, #b9bfc6 100%)',
                  }}
                >
                  <Upload size={13} /> Cargar archivo
                </button>
              </div>
              <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scroll">
                {availableSaves.length === 0 ? (
                  <p className="text-center text-slate-500 italic py-10 font-semibold text-xs">No hay partidas guardadas en este dispositivo.</p>
                ) : (
                  availableSaves.map(save => (
                    <div key={save.id} className="bg-white border border-slate-300 p-3 rounded-sm hover:border-[#2b5d2c] hover:shadow-sm transition-all group flex justify-between items-center gap-2 cursor-pointer" onClick={() => confirmLoadGame(save.id)}>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-bold text-slate-900 text-xs truncate group-hover:text-[#2b5d2c]">{save.label}</h4>
                        <div className="flex gap-2 mt-1 text-[10px] text-slate-500 font-mono tabular-nums">
                          <span className="truncate">{save.teamName}</span><span>·</span><span>{new Date(save.date).toLocaleDateString()}</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setShareSaveTarget(save); }}
                        className="flex items-center gap-1 px-2 py-1 rounded-[2px] border border-[#737a82] text-[10px] font-bold uppercase text-[#1f2428] cursor-pointer shrink-0 hover:brightness-105"
                        style={{ background: 'linear-gradient(180deg, #f3f4f6 0%, #d4d8de 48%, #b9bfc6 100%)' }}
                        title="Compartir partida"
                      >
                        <Share2 size={12} /> Compartir
                      </button>
                      <button type="button" onClick={(e) => handleDeleteSave(save.id, e)} className="p-2 text-slate-400 hover:text-red-600 transition-colors cursor-pointer" title="Borrar Partida"><Trash2 size={15} /></button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      {shareSaveTarget && (
        <div className="fixed inset-0 z-[260] bg-slate-900/80 flex items-center justify-center p-4 backdrop-blur-sm animate-overlay-in" onClick={() => setShareSaveTarget(null)}>
          <div className="bg-[#e8ece8] w-full max-w-sm rounded-sm border border-[#1c1f24] shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="bg-[#3a3f45] border-b border-[#1c1f24] px-4 py-2.5 flex justify-between items-center">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                <Share2 size={14} /> Compartir Partida
              </h3>
              <button type="button" onClick={() => setShareSaveTarget(null)} className="text-slate-300 hover:text-white cursor-pointer" aria-label="Cerrar"><X size={16} /></button>
            </div>
            <div className="p-4 space-y-3">
              <div className="bg-white border border-slate-300 rounded-sm p-2.5">
                <p className="font-bold text-slate-900 text-xs truncate">{shareSaveTarget.label}</p>
                <p className="text-[10px] text-slate-500 font-mono mt-0.5">{shareSaveTarget.teamName} · {new Date(shareSaveTarget.date).toLocaleDateString()}</p>
              </div>
              <div className="space-y-2">
                <FMButton
                  type="button"
                  variant="primary"
                  className="w-full py-2.5 text-xs"
                  onClick={async () => {
                    const target = shareSaveTarget;
                    setShareSaveTarget(null);
                    await handleShareSlotByEmail(target.id);
                  }}
                >
                  <Mail size={14} /> Enviar por correo
                </FMButton>
                <FMButton
                  type="button"
                  variant="secondary"
                  className="w-full py-2.5 text-xs"
                  onClick={async () => {
                    const target = shareSaveTarget;
                    setShareSaveTarget(null);
                    await handleExportSlot(target.id);
                  }}
                >
                  <Download size={14} /> Descargar archivo
                </FMButton>
              </div>
            </div>
          </div>
        </div>
      )}
      <div className="max-w-md w-full bg-slate-200 rounded-sm p-4 sm:p-8 border border-slate-600 shadow-2xl z-10 my-auto">
        <h1 className="text-2xl sm:text-3xl font-black text-slate-950 mb-4 sm:mb-6 italic uppercase border-b-4 border-slate-950 pb-2">Perfil del Manager</h1>
        <div className="space-y-3 sm:space-y-4">
          <div>
            <label className="text-[10px] font-black text-slate-600 uppercase block mb-1 tracking-widest">Nombre</label>
            <input type="text" className="w-full bg-slate-100 border border-slate-500 rounded-sm px-3.5 py-2.5 sm:px-4 sm:py-3 text-slate-950 font-bold text-sm outline-none focus:border-slate-800" value={userName} onChange={(e) => setUserName(e.target.value)} />
          </div>
          <div>
            <label className="text-[10px] font-black text-slate-600 uppercase block mb-1 tracking-widest">Apellido</label>
            <input type="text" className="w-full bg-slate-100 border border-slate-500 rounded-sm px-3.5 py-2.5 sm:px-4 sm:py-3 text-slate-950 font-bold text-sm outline-none focus:border-slate-800" value={userSurname} onChange={(e) => setUserSurname(e.target.value)} />
          </div>
          <div>
            <label className="text-[10px] font-black text-slate-600 uppercase block mb-1 tracking-widest">Nacionalidad</label>
            <select className="w-full bg-slate-100 border border-slate-500 rounded-sm px-3.5 py-2.5 sm:px-4 sm:py-3 text-slate-950 font-bold text-sm outline-none focus:border-slate-800" value={userNationality} onChange={(e) => setUserNationality(e.target.value)}>
              {WORLD_COUNTRIES.map(country => (
                <option key={country} value={country}>{country}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-black text-slate-600 uppercase block mb-1 tracking-widest">Origen</label>
            <select className="w-full bg-slate-100 border border-slate-500 rounded-sm px-3.5 py-2.5 sm:px-4 sm:py-3 text-slate-950 font-bold text-sm outline-none focus:border-slate-800" value={userOrigin} onChange={(e) => setUserOrigin(e.target.value as any)}>
              <option value="EX_PLAYER">Exjugador</option>
              <option value="YOUTH_COACH">Categorías inferiores</option>
              <option value="JOURNALIST">Periodista / Analista</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] font-black text-slate-600 uppercase block mb-1 tracking-widest">Fecha de nacimiento</label>
            <input type="date" className="w-full bg-slate-100 border border-slate-500 rounded-sm px-3.5 py-2.5 sm:px-4 sm:py-3 text-slate-950 font-bold text-sm outline-none focus:border-slate-800" value={userBirthDate.toISOString().split('T')[0]} onChange={(e) => setUserBirthDate(new Date(e.target.value))} />
          </div>
          <FMButton type="button" onClick={() => { setGameState('SETUP_COUNTRY'); }} className="w-full py-3.5 sm:py-4 mt-3 sm:mt-4">
            CREAR MI MANAGER <ChevronRight size={14} />
          </FMButton>
          {hasSave && (
            <FMButton type="button" onClick={handleOpenLoadModal} variant="secondary" className="w-full py-2.5 sm:py-3 mt-1.5 text-xs">
              <HardDrive size={14} /> Cargar Partida
            </FMButton>
          )}
          <PWAInstallButton />
        </div>
      </div>
    </div>
  );

  if (gameState === 'SETUP_CAREER') {
    const selectedManagerLabel = selectedExistingManager ? `${selectedExistingManager.name} ${selectedExistingManager.surname}` : `${userName} ${userSurname}`;
    const chooseMode = (mode: CareerMode) => {
      setCareerMode(mode);
      if (mode === 'CLUB') {
        setSelectedNationalTeamId(null);
        setGameState('SETUP_COUNTRY');
      } else {
        setGameState('SETUP_NATIONAL_TEAM');
      }
    };
    return (
      <div className="h-screen w-screen bg-[#d4dcd4] flex items-center justify-center p-4" style={{ fontFamily: 'Verdana, sans-serif' }}>
        <div className="max-w-3xl w-full bg-white rounded-sm p-5 sm:p-10 border border-[#a0b0a0] shadow-2xl">
          <button onClick={() => setGameState('SETUP_USER')} className="text-[10px] text-slate-500 hover:text-slate-900 font-bold mb-5 flex items-center gap-1">
            <ChevronLeft size={12} /> Volver
          </button>
          <div className="flex items-center gap-3 mb-2"><div className="bg-[#3a4a3a] text-white rounded-sm p-2"><Briefcase size={18} /></div><div><h1 className="text-2xl sm:text-4xl font-black text-slate-900 uppercase italic tracking-tight">Tu carrera</h1><p className="text-[10px] text-slate-500 uppercase tracking-widest">{selectedManagerLabel}</p></div></div>
          <p className="text-xs text-slate-600 mb-6">Elige qué responsabilidad quieres asumir al comenzar. Puedes dirigir un club, una selección nacional o ambos proyectos a la vez.</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {([
              { mode: 'CLUB' as CareerMode, title: 'Solo club', text: 'Gestiona plantilla, fichajes, staff y competiciones de clubes.' },
              { mode: 'NATIONAL' as CareerMode, title: 'Solo selección', text: 'Convoca jugadores, define el once y dirige el calendario internacional.' },
              { mode: 'BOTH' as CareerMode, title: 'Club + selección', text: 'Una carrera dual con control formal de ambos equipos.' },
            ]).map(option => (
              <button key={option.mode} onClick={() => chooseMode(option.mode)} className="text-left p-4 bg-[#f2f7f2] hover:bg-[#e2eae2] border border-[#a0b0a0] hover:border-l-4 hover:border-l-[#3a4a3a] rounded-sm transition-all">
                <div className="text-[10px] font-black uppercase text-[#3a4a3a] mb-2">{option.title}</div>
                <p className="text-[10px] leading-relaxed text-slate-600">{option.text}</p>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (gameState === 'SETUP_NATIONAL_TEAM') {
    const nationalTeams = world.nationalTeamManager?.nationalTeams || [];
    const previewTeam = previewNationalTeamId
      ? nationalTeams.find((t: any) => t.id === previewNationalTeamId) || null
      : null;

    if (previewTeam) {
      return (
        <>
          {isPreparingCareer && <FMLoadingOverlay message="Preparando planteles..." detail="Completando base de jugadores" />}
          <PreCareerPreviewView
            mode="NATIONAL"
            nationalTeam={previewTeam}
            currentDate={currentDate}
            chooseButtonLabel={careerMode === 'BOTH' ? 'Elegir Selección y Seguir a Clubes' : 'Elegir Selección'}
            onBack={() => setPreviewNationalTeamId(null)}
            onConfirmChoose={() => {
              const teamId = previewTeam.id;
              setPreviewNationalTeamId(null);
              if (careerMode === 'BOTH') {
                setSelectedNationalTeamId(teamId);
                setGameState('SETUP_COUNTRY');
              } else {
                void startNationalCareer(teamId, selectedExistingManager);
              }
            }}
          />
        </>
      );
    }

    const eligibleCounts = worldFullReady && world.nationalTeamManager?.getEligibleCountsByTeam
      ? world.nationalTeamManager.getEligibleCountsByTeam(world.players, world.clubs)
      : {};
    return (
      <div className="h-[100dvh] w-screen bg-[#d4dcd4] flex items-center justify-center p-4" style={{ fontFamily: 'Verdana, sans-serif' }}>
        {isPreparingCareer && <FMLoadingOverlay message="Preparando planteles..." detail="Completando base de jugadores" />}
        <div className="max-w-5xl w-full bg-white rounded-sm p-4 sm:p-10 border border-[#a0b0a0] shadow-2xl max-h-[90vh] overflow-y-auto">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <button onClick={() => { setPreviewNationalTeamId(null); setGameState('SETUP_COUNTRY'); }} className="text-[10px] text-slate-600 hover:text-slate-900 font-bold flex items-center gap-1 cursor-pointer">
              <ChevronLeft size={12} /> Volver a países
            </button>
            <button onClick={() => { setPreviewNationalTeamId(null); setGameState('SETUP_USER'); }} className="text-[10px] text-slate-500 hover:text-slate-900 font-bold flex items-center gap-1 cursor-pointer">
              Volver a Perfil del Manager
            </button>
          </div>
          <div className="flex items-center justify-between gap-3 mb-5"><div><h1 className="text-2xl sm:text-4xl font-black text-slate-900 uppercase italic tracking-tight">Selecciones Nacionales</h1><p className="text-[10px] text-slate-500 uppercase tracking-widest">{careerMode === 'BOTH' ? 'Primero explorá y elegí la selección, después el club' : 'Toca una selección para ver sus jugadores e información'}</p></div><Flag size={22} /></div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {nationalTeams.map((team: any) => {
              const eligible = eligibleCounts[team.id];
              const selected = selectedNationalTeamId === team.id;
              return <button key={team.id} onClick={() => setPreviewNationalTeamId(team.id)} className={`p-4 text-left rounded-sm border transition-all cursor-pointer ${selected ? 'border-[#3a4a3a] bg-[#e2eae2] border-l-4' : 'border-[#a0b0a0] bg-[#f2f7f2] hover:bg-[#e2eae2] hover:border-l-4 hover:border-l-[#3a4a3a]'}`}>
                <div className="flex items-center gap-2 mb-2"><img src={getFlagUrl(team.country)} alt={team.country} className="w-7 h-5 object-cover rounded-sm border border-[#a0b0a0]" /><span className="text-[9px] font-black text-slate-400">{team.id}</span></div>
                <p className="font-black text-slate-900 uppercase text-xs truncate">{team.name}</p>
                <p className="text-[9px] text-slate-500 mt-1">{team.confederation}{eligible !== undefined ? ` · ${eligible} elegibles` : ''}</p>
              </button>;
            })}
          </div>
        </div>
      </div>
    );
  }

  if (gameState === 'SETUP_COUNTRY') {
    const countryLeagues = world.competitions.filter(c => c.type === 'LEAGUE');
    const countriesMap = new Map<string, { count: number; continent: string }>();
    countryLeagues.forEach(l => {
      const cur = countriesMap.get(l.country) || { count: 0, continent: l.continent || 'Europa' };
      countriesMap.set(l.country, { count: cur.count + 1, continent: l.continent || 'Europa' });
    });
    const continentOrder = ['América del Sur', 'Europa', 'América del Norte', 'Asia', 'África', 'Oceanía'];
    const continentsMap = new Map<string, { country: string; count: number }[]>();
    countriesMap.forEach((v, country) => {
      const cont = continentOrder.includes(v.continent) ? v.continent : 'Europa';
      if (!continentsMap.has(cont)) continentsMap.set(cont, []);
      continentsMap.get(cont)!.push({ country, count: v.count });
    });
    const continents = Array.from(continentsMap.entries())
      .sort((a, b) => {
        const ia = continentOrder.indexOf(a[0]);
        const ib = continentOrder.indexOf(b[0]);
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      });
    continents.forEach(([, list]) => list.sort((a, b) => a.country.localeCompare(b.country)));
    return (
      <div className="h-[100dvh] w-screen bg-[#d4dcd4] flex items-center justify-center p-4" style={{ fontFamily: 'Verdana, sans-serif' }}>
        <div className="max-w-4xl w-full bg-white rounded-sm p-4 sm:p-10 border border-[#a0b0a0] shadow-2xl max-h-[90vh] overflow-y-auto">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <button onClick={() => setGameState('SETUP_USER')} className="text-[10px] text-slate-600 hover:text-slate-900 font-bold flex items-center gap-1 cursor-pointer">
              <ChevronLeft size={12} /> Volver al perfil
            </button>
          </div>
          <h1 className="text-3xl sm:text-5xl font-black text-slate-900 mb-2 tracking-tighter italic uppercase text-center">FM Argentina</h1>
          <p className="text-[10px] text-slate-500 font-bold uppercase text-center tracking-[0.3em] mb-6">Navegá por país para explorar ligas, selecciones y planteles</p>
          {!worldClubsReady && continents.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center gap-3 text-slate-600">
              <RefreshCw className="w-7 h-7 animate-spin text-[#3a4a3a]" />
              <p className="text-xs font-bold uppercase tracking-wider">Cargando ligas y países...</p>
            </div>
          ) : (
            <div className="space-y-7">
              {continents.map(([continent, list]) => (
                <div key={continent}>
                  <h2 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.25em] mb-3 border-b border-[#a0b0a0] pb-1 flex items-center gap-2">
                    {continent}
                    <span className="ml-auto font-bold text-slate-400">{list.length} paíse{list.length !== 1 ? 's' : ''}</span>
                  </h2>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {list.map(({ country, count }) => (
                      <button key={country} onClick={() => { setSelectedCountry(country); setPreviewClub(null); setPreviewNationalTeamId(null); setGameState('SETUP_LEAGUE'); }}
                        className="p-4 bg-[#f2f7f2] hover:bg-[#e2eae2] border border-[#a0b0a0] rounded-sm text-left transition-all shadow-sm flex items-center gap-3 cursor-pointer">
                        <img src={getFlagUrl(country)} alt={country} className="w-8 h-6 rounded-sm object-cover border border-[#a0b0a0]" />
                        <div className="flex-1 min-w-0">
                          <p className="font-black text-slate-900 text-xs uppercase truncate">{country}</p>
                          <p className="text-[9px] text-slate-500">{count} liga{count !== 1 ? 's' : ''}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (gameState === 'SETUP_LEAGUE') {
    const country = selectedCountry;
    const leagues = world.competitions.filter(c => c.type === 'LEAGUE' && c.country === country);
    const nationalTeam = world.nationalTeamManager?.nationalTeams?.find((t: any) => t.country === country);

    if (previewNationalTeamId && nationalTeam && previewNationalTeamId === nationalTeam.id) {
      return (
        <>
          {isPreparingCareer && <FMLoadingOverlay message="Preparando planteles..." detail="Completando base de jugadores" />}
          <PreCareerPreviewView
            mode="NATIONAL"
            nationalTeam={nationalTeam}
            currentDate={currentDate}
            chooseButtonLabel="Elegir Selección"
            onBack={() => setPreviewNationalTeamId(null)}
            onConfirmChoose={() => {
              const teamId = nationalTeam.id;
              setPreviewNationalTeamId(null);
              void startNationalCareer(teamId, selectedExistingManager);
            }}
          />
        </>
      );
    }

    const nationalEligibleCount =
      nationalTeam && worldFullReady && world.nationalTeamManager?.getEligiblePlayers
        ? world.nationalTeamManager.getEligiblePlayers(nationalTeam.id, world.players, world.clubs).length
        : undefined;
    return (
      <div className="h-[100dvh] w-screen bg-[#d4dcd4] flex items-center justify-center p-4" style={{ fontFamily: 'Verdana, sans-serif' }}>
        {isPreparingCareer && <FMLoadingOverlay message="Preparando planteles..." detail="Completando base de jugadores" />}
        <div className="max-w-4xl w-full bg-white rounded-sm p-4 sm:p-10 border border-[#a0b0a0] shadow-2xl max-h-[90vh] overflow-y-auto">
          <button onClick={() => { setPreviewNationalTeamId(null); setGameState('SETUP_COUNTRY'); }} className="text-[10px] text-slate-500 hover:text-slate-900 font-bold mb-4 flex items-center gap-1 cursor-pointer">
            <ChevronLeft size={12} /> Volver a países
          </button>
          <div className="flex items-center gap-3 mb-2">
            {country && <img src={getFlagUrl(country)} alt={country} className="w-8 h-6 rounded-sm border border-[#a0b0a0]" />}
            <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight italic">{country}</h2>
          </div>
          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-5">
            Seleccioná la selección nacional o una liga para explorar sus clubes y jugadores
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {nationalTeam && (
              <button onClick={() => setPreviewNationalTeamId(nationalTeam.id)} className="p-5 bg-[#3a4a3a] hover:bg-[#2a3a2a] border border-[#2a3a2a] rounded-sm text-left transition-all shadow-sm flex flex-col cursor-pointer">
                <h3 className="text-base font-black text-white mb-1 italic uppercase truncate">🏳️ Selección</h3>
                <p className="text-[9px] text-slate-300">{nationalTeam.name}{nationalEligibleCount !== undefined ? ` · ${nationalEligibleCount} elegibles` : ' · Ver plantel e info'}</p>
              </button>
            )}
            {leagues.map(league => {
              const clubCount = world.getClubsByLeague(league.id).length;
              const rep = league.dynamicReputation ?? Math.max(10, 100 - (league.tier - 1) * 22);
              const repStars = Math.max(1, Math.min(5, Math.round(rep / 20)));
              const prize = (league.defaultPrizePool ?? 1000000) / 1000000;
              const tierLabel = league.tier === 1 ? '1ª División' : league.tier === 2 ? '2ª División' : `${league.tier}ª División`;
              return (
                <button key={league.id} onClick={() => { setSelectedLeague(league); setPreviewClub(null); useGameStore.getState().setDeepSimLeagues([league.id]); setGameState('SETUP_TEAM'); }}
                  className="p-5 bg-[#f2f7f2] hover:bg-[#e2eae2] hover:border-[#3a4a3a] border border-[#a0b0a0] rounded-sm text-left transition-all shadow-sm flex flex-col group cursor-pointer">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <h3 className="text-base font-black text-slate-900 italic uppercase truncate group-hover:text-[#3a4a3a]">{league.name}</h3>
                    <span className="shrink-0 text-[10px] tracking-tight">{'★'.repeat(repStars)}<span className="text-slate-300">{'★'.repeat(5 - repStars)}</span></span>
                  </div>
                  <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wide">{tierLabel} · {clubCount} equipo{clubCount !== 1 ? 's' : ''}</p>
                  <div className="mt-2 pt-2 border-t border-[#c8d4c8] flex items-center gap-3 text-[9px] text-slate-600">
                    <span className="font-black text-emerald-800">£{prize.toFixed(1)}M</span>
                    <span className="font-bold uppercase tracking-wider">Premio total</span>
                    <span className="ml-auto font-bold text-slate-500 uppercase">{league.confederation || '—'}</span>
                  </div>
                </button>
              );
            })}
          </div>
          {leagues.length === 0 && !nationalTeam && (
            <p className="text-sm text-slate-500 text-center py-8">No hay ligas disponibles para este país.</p>
          )}
        </div>
      </div>
    );
  }

  if (gameState === 'SETUP_TEAM') {
    if (previewClub) {
      return (
        <>
          {isPreparingCareer && <FMLoadingOverlay message="Preparando planteles..." detail="Completando base de jugadores" />}
          <PreCareerPreviewView
            mode="CLUB"
            club={previewClub}
            leagueName={selectedLeague?.name}
            currentDate={currentDate}
            chooseButtonLabel="Elegir Club"
            onBack={() => setPreviewClub(null)}
            onConfirmChoose={() => {
              const chosen = previewClub;
              setPreviewClub(null);
              if (selectedNationalTeamId && careerMode === 'BOTH') {
                void startNationalCareer(selectedNationalTeamId, selectedExistingManager, chosen.id);
              } else if (selectedExistingManager) {
                void createManagerAndStartGame(selectedExistingManager, chosen.id, false);
              } else {
                void startUserClubCareer(chosen);
              }
            }}
          />
        </>
      );
    }

    const leagueClubs = world.getClubsByLeague(selectedLeague.id);
    const isExistingManager = !!selectedExistingManager;
    return (
    <div className="h-[100dvh] w-screen bg-[#d4dcd4] flex items-center justify-center p-4" style={{ fontFamily: 'Verdana, sans-serif' }}>
      {isPreparingCareer && <FMLoadingOverlay message="Preparando planteles..." detail="Completando base de jugadores" />}
      <div className="max-w-6xl w-full bg-white rounded-sm p-4 sm:p-10 border border-[#a0b0a0] shadow-2xl max-h-[90vh] overflow-y-auto">
        <button onClick={() => { setPreviewClub(null); setGameState('SETUP_LEAGUE'); }} className="text-[10px] text-slate-500 hover:text-slate-900 font-bold mb-4 flex items-center gap-1 cursor-pointer">
          <ChevronLeft size={12} /> Volver a ligas de {selectedCountry}
        </button>
        {isExistingManager && (
          <div className="mb-4 p-3 bg-[#f2f7f2] border border-[#a0b0a0] rounded-sm flex items-center gap-3">
            <img src={getFlagUrl(selectedExistingManager.nationality)} alt={selectedExistingManager.nationality} className="w-6 h-4 rounded-sm border border-[#a0b0a0]" />
            <div className="flex-1">
              <p className="text-[9px] text-slate-500 uppercase font-bold tracking-widest">Manager</p>
              <p className="text-xs font-black text-slate-900 uppercase">{selectedExistingManager.name} {selectedExistingManager.surname} <span className="text-slate-500 font-bold ml-2">Rep: {selectedExistingManager.reputation}</span></p>
            </div>
          </div>
        )}
        <div className="flex items-center gap-3 mb-1.5">
          {selectedCountry && <img src={getFlagUrl(selectedCountry)} alt={selectedCountry} className="w-8 h-6 rounded-sm border border-[#a0b0a0]" />}
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 uppercase tracking-tight italic">{selectedLeague.name}</h2>
        </div>
        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-5">
          Toca un club para ver su información, jugadores y elegirlo para iniciar tu carrera
        </p>
        <div className="space-y-8">
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {leagueClubs.map(c => {
              const pal = getClubHexPalette(c);
              return (
              <button key={c.id} onClick={() => setPreviewClub(c)} className="bg-[#f2f5f2] hover:bg-white border border-[#8e9b90] hover:border-[#23272c] rounded-sm text-left transition-all shadow-sm overflow-hidden group cursor-pointer flex flex-col">
                <div
                  className="relative px-2.5 py-2 flex items-center gap-2 border-b border-[#14171a]"
                  style={{
                    background: `linear-gradient(90deg, ${pal.primary} 0%, ${pal.primary}dd 48%, #23272c 86%, #191c20 100%)`,
                  }}
                >
                  <div
                    className="pointer-events-none absolute inset-x-0 top-0 h-3"
                    style={{
                      background: 'linear-gradient(180deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0) 100%)',
                    }}
                  />
                  {pal.isLightPrimary && (
                    <div
                      className="pointer-events-none absolute inset-0"
                      style={{
                        background: 'linear-gradient(180deg, rgba(15,18,22,0.16) 0%, rgba(15,18,22,0.48) 100%)',
                      }}
                    />
                  )}
                  <FmClubShield club={c} size="sm" className="relative z-10" />
                  <p className="relative z-10 font-bold text-white truncate text-xs tracking-tight drop-shadow-[0_1px_2px_rgba(0,0,0,0.85)]">
                    {c.name}
                  </p>
                </div>
                <div className="px-2.5 py-2 flex items-center justify-between text-[10px] text-slate-600 font-mono tabular-nums">
                  <span className="font-semibold uppercase text-slate-700">{c.shortName}</span>
                  <span>Rep {Math.round(c.reputation / 10)}</span>
                </div>
              </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
  }

  const isMatchView = currentView === 'MATCH';
  const isPreMatchView = currentView === 'PRE_MATCH' || currentView === 'POST_MATCH_SUMMARY';

  // FM08-style dynamic competition palette (primary + secondary colors per league/country/confederation)
  const getCompetitionPalette = (comp?: { id?: string; country?: string; confederation?: string; type?: string; tier?: number } | null): { primary: string; secondary: string } => {
    if (!comp) return { primary: '#1e3a8a', secondary: '#facc15' };
    const id = (comp.id || '').toUpperCase();
    const country = (comp.country || '').toUpperCase();
    const conf = (comp.confederation || '').toUpperCase();

    if (id.includes('LIBERTADORES')) return { primary: '#78350f', secondary: '#facc15' };
    if (id.includes('SUDAMERICANA')) return { primary: '#0f172a', secondary: '#38bdf8' };
    if (id.includes('CHAMPIONS') || id.includes('UCL')) return { primary: '#0f172a', secondary: '#60a5fa' };
    if (id.includes('EUROPA') || id.includes('UEL')) return { primary: '#9a3412', secondary: '#fb923c' };
    if (id.includes('WORLD') || id.includes('MUNDIAL')) return { primary: '#0c4a6e', secondary: '#facc15' };

    const countryPalettes: Record<string, { primary: string; secondary: string }> = {
      ARG: { primary: '#0284c7', secondary: '#f8fafc' },
      ARGENTINA: { primary: '#0284c7', secondary: '#f8fafc' },
      ENG: { primary: '#3b0764', secondary: '#facc15' },
      ENGLAND: { primary: '#3b0764', secondary: '#facc15' },
      INGLATERRA: { primary: '#3b0764', secondary: '#facc15' },
      ESP: { primary: '#991b1b', secondary: '#facc15' },
      SPAIN: { primary: '#991b1b', secondary: '#facc15' },
      ESPAÑA: { primary: '#991b1b', secondary: '#facc15' },
      ITA: { primary: '#1d4ed8', secondary: '#f8fafc' },
      ITALY: { primary: '#1d4ed8', secondary: '#f8fafc' },
      ITALIA: { primary: '#1d4ed8', secondary: '#f8fafc' },
      GER: { primary: '#1f2937', secondary: '#facc15' },
      GERMANY: { primary: '#1f2937', secondary: '#facc15' },
      ALEMANIA: { primary: '#1f2937', secondary: '#facc15' },
      FRA: { primary: '#1e3a8a', secondary: '#ef4444' },
      FRANCE: { primary: '#1e3a8a', secondary: '#ef4444' },
      FRANCIA: { primary: '#1e3a8a', secondary: '#ef4444' },
      BRA: { primary: '#15803d', secondary: '#facc15' },
      BRAZIL: { primary: '#15803d', secondary: '#facc15' },
      BRASIL: { primary: '#15803d', secondary: '#facc15' },
      URU: { primary: '#0369a1', secondary: '#facc15' },
      URUGUAY: { primary: '#0369a1', secondary: '#facc15' },
      CHL: { primary: '#b91c1c', secondary: '#1d4ed8' },
      CHILE: { primary: '#b91c1c', secondary: '#1d4ed8' },
      COL: { primary: '#ca8a04', secondary: '#1d4ed8' },
      COLOMBIA: { primary: '#ca8a04', secondary: '#1d4ed8' },
      MEX: { primary: '#166534', secondary: '#dc2626' },
      MEXICO: { primary: '#166534', secondary: '#dc2626' },
      USA: { primary: '#1e3a8a', secondary: '#dc2626' },
      POR: { primary: '#166534', secondary: '#dc2626' },
      PORTUGAL: { primary: '#166534', secondary: '#dc2626' },
      NED: { primary: '#c2410c', secondary: '#f8fafc' },
      HOLANDA: { primary: '#c2410c', secondary: '#f8fafc' },
      PAR: { primary: '#b91c1c', secondary: '#1e40af' },
      ECU: { primary: '#ca8a04', secondary: '#1e3a8a' },
      PER: { primary: '#b91c1c', secondary: '#f8fafc' },
      BOL: { primary: '#15803d', secondary: '#facc15' },
      VEN: { primary: '#7f1d1d', secondary: '#facc15' },
    };
    if (countryPalettes[country]) {
      const base = countryPalettes[country];
      if ((comp.tier || 1) >= 2) {
        return { primary: base.primary, secondary: '#cbd5e1' };
      }
      return base;
    }
    if (conf === 'CONMEBOL') return { primary: '#1e3a8a', secondary: '#facc15' };
    if (conf === 'UEFA') return { primary: '#0f172a', secondary: '#60a5fa' };
    if (conf === 'CONCACAF') return { primary: '#14532d', secondary: '#facc15' };
    if (conf === 'AFC') return { primary: '#7c2d12', secondary: '#facc15' };
    if (conf === 'CAF') return { primary: '#166534', secondary: '#facc15' };
    return { primary: '#1e3a8a', secondary: '#facc15' };
  };

  const resolveDynamicHeader = () => {
    const defaultClubPalette = userClub || { primary: '#2b5d2c', secondary: '#facc15' };
    const defaultTeamName =
      userClub?.name ||
      world.nationalTeamManager?.nationalTeams?.find((team: any) => team.id === selectedNationalTeamId)?.name ||
      'Football Manager';
    const defaultSubtitle = userClub
      ? `${world.competitions.find(c => c.id === userClub.leagueId)?.name || userClub.country} · ${userClub.stadium}`
      : 'Selección Nacional';

    if (currentView === 'MANAGER_PROFILE') {
      const mp = world.managerProfile;
      const originMap: Record<string, string> = {
        EX_INTERNATIONAL: 'Ex-Internacional',
        EX_PROFESSIONAL: 'Ex-Profesional',
        SEMIPROFESSIONAL: 'Semi-Profesional',
        AMATEUR: 'Amateur',
      };
      return {
        club: defaultClubPalette,
        title: mp?.fullName || 'Manager Novato',
        shortCode: mp?.nationality || 'MGR',
        subtitle: `${originMap[mp?.origin || 'AMATEUR'] || 'Mánager'} · ${userClub?.name || 'Agente Libre'}`,
        showShield: true,
      };
    }

    if (currentView === 'TABLE' || currentView.startsWith('COMP_')) {
      const targetCompId = currentView.startsWith('COMP_')
        ? currentView.replace('COMP_', '')
        : (viewLeagueId || userClub?.leagueId);
      const comp = world.competitions.find(c => c.id === targetCompId);
      if (comp) {
        return {
          club: getCompetitionPalette(comp),
          title: comp.name,
          shortCode: comp.country || comp.confederation || 'LIGA',
          subtitle: `${comp.country || comp.confederation || 'Internacional'} · ${comp.type === 'CUP' ? 'Copa' : `División ${comp.tier || 1}`}`,
          showShield: true,
        };
      }
    }

    if (currentView === 'LEAGUE_RANKING') {
      return {
        club: { primary: '#1e3a8a', secondary: '#facc15' },
        title: 'Ranking Mundial de Ligas',
        shortCode: 'WORLD',
        subtitle: 'Coeficientes y prestigio internacional',
        showShield: true,
      };
    }

    if (currentView === 'EXTERNAL_CLUB' && viewExternalClub) {
      return {
        club: viewExternalClub,
        title: viewExternalClub.name,
        shortCode: viewExternalClub.shortName,
        subtitle: `${viewExternalClub.country} · ${viewExternalClub.stadium}`,
        showShield: true,
      };
    }

    if (currentView.startsWith('NT_') && selectedNationalTeamId) {
      const nt = world.nationalTeamManager?.nationalTeams?.find((t: any) => t.id === selectedNationalTeamId);
      if (nt) {
        return {
          club: getCompetitionPalette({ country: nt.country || nt.id }),
          title: nt.name,
          shortCode: nt.shortName || nt.country,
          subtitle: 'Selección Nacional',
          showShield: true,
        };
      }
    }

    if (currentView === 'STAFF') {
      if (selectedStaff) {
        const staffClub = world.getClub(selectedStaff.clubId) || defaultClubPalette;
        const staffRoleLabels: Record<string, string> = {
          HEAD_COACH: 'Director Técnico',
          ASSISTANT_MANAGER: 'Segundo Entrenador',
          PHYSIO: 'Fisioterapeuta',
          FITNESS_COACH: 'Preparador Físico',
          RESERVE_MANAGER: 'E. Reserva',
          YOUTH_MANAGER: 'E. Juveniles',
          SCOUT: 'Ojeador Jefe',
          SPORTING_DIRECTOR: 'Director Deportivo',
          TREASURER: 'Tesorero',
        };
        return {
          club: staffClub,
          title: selectedStaff.name,
          shortCode: world.getClub(selectedStaff.clubId)?.shortName || userClub?.shortName,
          subtitle: `${staffRoleLabels[selectedStaff.role] || selectedStaff.role} · ${selectedStaff.nationality} · ${selectedStaff.age} años`,
          showShield: true,
        };
      }
      return { club: defaultClubPalette, title: 'Cuerpo Técnico', shortCode: userClub?.shortName, subtitle: userClub?.name || defaultSubtitle, showShield: true };
    }
    if (currentView === 'TRAINING' || currentView.endsWith('_TRAINING')) {
      return { club: defaultClubPalette, title: 'Entrenamiento', shortCode: userClub?.shortName, subtitle: userClub?.name || defaultSubtitle, showShield: true };
    }
    if (currentView === 'ECONOMY') {
      return { club: defaultClubPalette, title: 'Economía', shortCode: userClub?.shortName, subtitle: userClub?.name || defaultSubtitle, showShield: true };
    }
    if (currentView === 'SCOUTING') {
      return { club: defaultClubPalette, title: 'Scouting y Ojeo', shortCode: userClub?.shortName, subtitle: userClub?.name || defaultSubtitle, showShield: true };
    }
    if (currentView === 'BOARD') {
      return { club: defaultClubPalette, title: 'Directiva', shortCode: userClub?.shortName, subtitle: userClub?.name || defaultSubtitle, showShield: true };
    }
    if (currentView === 'MARKET' || currentView === 'SEARCH' || currentView === 'NEGOTIATIONS') {
      return {
        club: { primary: '#14532d', secondary: '#facc15' },
        title: currentView === 'NEGOTIATIONS' ? 'Negociaciones' : currentView === 'SEARCH' ? 'Buscar Jugadores' : 'Mercado de Fichajes',
        shortCode: userClub?.shortName,
        subtitle: userClub?.name || defaultSubtitle,
        showShield: true,
      };
    }
    if (currentView === 'PRESS_CONFERENCE_PRE' || currentView === 'PRESS_CONFERENCE_POST') {
      const isPost = currentView === 'PRESS_CONFERENCE_POST';
      const homeClub = nextFixture ? world.getClub(nextFixture.homeTeamId) : null;
      const awayClub = nextFixture ? world.getClub(nextFixture.awayTeamId) : null;
      const opponentClub = nextFixture && userClub
        ? (nextFixture.homeTeamId === userClub.id ? awayClub : homeClub)
        : null;
      const subtitle = isPost && nextFixture && nextFixture.homeScore !== undefined && nextFixture.awayScore !== undefined
        ? `${homeClub?.shortName || 'LOC'} ${nextFixture.homeScore} - ${nextFixture.awayScore} ${awayClub?.shortName || 'VIS'}`
        : opponentClub
        ? `Previa vs ${opponentClub.name}`
        : (userClub?.name || defaultSubtitle);
      return {
        club: defaultClubPalette,
        title: isPost ? 'Rueda de Prensa' : 'Conferencia Previa',
        shortCode: userClub?.shortName || 'PRENSA',
        subtitle,
        showShield: true,
      };
    }
    if (currentView === 'MEDIA') {
      return {
        club: { primary: '#334155', secondary: '#facc15' },
        title: 'Prensa y Diario Deportivo',
        shortCode: 'PRENSA',
        subtitle: userClub?.name || defaultSubtitle,
        showShield: true,
      };
    }
    if (currentView === 'HALL_OF_FAME' || currentView === 'SEASON_HISTORY') {
      return {
        club: { primary: '#78350f', secondary: '#facc15' },
        title: currentView === 'HALL_OF_FAME' ? 'Salón de la Fama' : 'Historial de Temporadas',
        shortCode: 'HIST',
        subtitle: userClub?.name || defaultSubtitle,
        showShield: true,
      };
    }
    if (currentView === 'CLUBS_LIST' || currentView === 'PEOPLE_HUB') {
      return {
        club: { primary: '#1e3a8a', secondary: '#e2e8f0' },
        title: currentView === 'CLUBS_LIST' ? 'Directorio de Clubes' : 'Personas del Mundo',
        shortCode: 'WORLD',
        subtitle: 'Base de datos global',
        showShield: true,
      };
    }

    return {
      club: defaultClubPalette,
      title: defaultTeamName,
      shortCode: userClub?.shortName,
      subtitle: defaultSubtitle,
      showShield: true,
    };
  };

  const dynamicHeader = resolveDynamicHeader();

  return (
    <div className="flex flex-col h-screen w-screen bg-[#b8c4b8] text-slate-950 overflow-hidden font-sans relative text-sm">

      {isSimulating && !isInVacation && (
        <div className="fixed bottom-[76px] lg:bottom-4 left-3 right-3 z-[320] pointer-events-none">
          <div className="max-w-md mx-auto bg-[#1b1f23]/95 text-white rounded-sm px-4 py-2.5 shadow-2xl border border-[#4b525a]">
            <div className="flex items-center gap-2 mb-1">
              <RefreshCw size={12} className="text-[#facc15] animate-spin shrink-0" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#facc15]">Avanzando...</span>
              <span className="text-[10px] font-mono text-slate-300 tabular-nums ml-auto">{simProgress}%</span>
            </div>
            <div className="w-full bg-[#2b3036] h-1.5 rounded-full overflow-hidden">
              <div className="h-full bg-[#facc15] rounded-full transition-all duration-200" style={{ width: `${Math.max(5, simProgress)}%` }} />
            </div>
            <p className="text-[10px] text-slate-300 mt-1 truncate">{simProgressDetail || 'Procesando...'}</p>
          </div>
        </div>
      )}

      {isInVacation && !vacationCancelled && (
        <FMLoadingOverlay
          message="Simulando Vacaciones"
          progress={{ current: vacationProgress, total: 100, detail: vacationDetail }}
          onCancel={() => setVacationCancelled(true)}
          showCancel
        />
      )}

      <input
        ref={importFileInputRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={handleImportJsonFile}
      />

      {isSaveModalOpen && (
        <div className="fixed inset-0 z-[500] bg-slate-900/80 flex items-center justify-center p-4 backdrop-blur-sm animate-overlay-in">
          <div className="bg-[#e8ece8] w-full max-w-lg rounded-sm border border-[#1c1f24] shadow-2xl overflow-hidden">
            <div className="bg-[#3a3f45] border-b border-[#1c1f24] px-4 py-2.5 flex items-center justify-between">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">Guardar y Respaldar Partida</h3>
              <button type="button" onClick={() => setIsSaveModalOpen(false)} className="text-slate-300 hover:text-white cursor-pointer" aria-label="Cerrar"><X size={16} /></button>
            </div>
            <div className="p-4 sm:p-5 space-y-3.5 max-h-[82vh] overflow-y-auto custom-scroll">
              <div>
                <label className="text-[10px] font-bold text-slate-600 uppercase block mb-1">Nombre del guardado</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    autoFocus
                    className="flex-1 bg-white border border-slate-400 rounded-sm px-3 py-2 text-slate-900 font-semibold text-xs focus:border-[#2b5d2c] outline-none"
                    value={saveNameInput}
                    onChange={(e) => {
                      setSaveNameInput(e.target.value);
                      setOverwriteSaveId(undefined);
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && confirmSaveGame()}
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      const saves = await listSaves();
                      setAvailableSaves(saves);
                    }}
                    className="p-2 bg-slate-300 border border-slate-400 rounded-sm hover:bg-slate-400 transition-colors cursor-pointer"
                    title="Actualizar lista"
                  >
                    <RefreshCw size={14} />
                  </button>
                </div>
                {overwriteSaveId && (
                  <p className="text-[10px] text-amber-800 mt-1 font-medium">
                    Se sobrescribirá el guardado seleccionado.
                  </p>
                )}
              </div>

              <label className="flex items-start gap-2.5 p-2.5 bg-white border border-[#8e9b90] rounded-sm cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isAutoSaveEnabled}
                  onChange={(e) => setIsAutoSaveEnabled(e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-[#2b5d2c] cursor-pointer shrink-0"
                />
                <div className="min-w-0">
                  <span className="text-[11px] font-black uppercase text-slate-900 block leading-tight">
                    Guardado automático tras cada partido
                  </span>
                  <span className="text-[10px] text-slate-600 block mt-0.5 leading-snug">
                    Guardar automáticamente en este dispositivo cada vez que termine un partido jugado de {userClub?.name || 'tu club'}.
                  </span>
                </div>
              </label>

              {availableSaves.length > 0 && (
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">
                    Partidas guardadas (tocá para sobrescribir, cargar o compartir)
                  </label>
                  <div className="max-h-40 overflow-y-auto space-y-1 custom-scroll">
                    {availableSaves.map(save => (
                      <div
                        key={save.id}
                        className={`flex items-center gap-1.5 p-2 bg-white border rounded-sm transition-all cursor-pointer ${
                          overwriteSaveId === save.id ? 'border-[#2b5d2c] bg-emerald-50/50' : 'border-slate-300 hover:border-slate-500'
                        }`}
                        onClick={() => {
                          setSaveNameInput(save.label);
                          setOverwriteSaveId(save.id);
                        }}
                      >
                        <div className="flex-1 min-w-0">
                          <span className="text-[11px] font-bold text-slate-900 truncate block">{save.label}</span>
                          <span className="text-[9px] text-slate-500 font-mono tabular-nums">{save.teamName} · {new Date(save.date).toLocaleDateString()}</span>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setIsSaveModalOpen(false);
                            void confirmLoadGame(save.id);
                          }}
                          className="px-2 py-1 text-[10px] font-semibold bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-sm cursor-pointer shrink-0"
                        >
                          Cargar
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setShareSaveTarget(save);
                          }}
                          className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-800 rounded-sm cursor-pointer shrink-0"
                          title="Compartir partida"
                        >
                          <Share2 size={12} /> Compartir
                        </button>
                        <button
                          type="button"
                          onClick={(e) => handleDeleteSave(save.id, e)}
                          className="p-1.5 text-slate-400 hover:text-red-600 cursor-pointer shrink-0"
                          title="Borrar"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-300">
                <FMButton variant="secondary" onClick={handleExportCurrentSave} className="w-full">
                  <Download size={13} /> Guardar respaldo
                </FMButton>
                <FMButton variant="secondary" onClick={() => importFileInputRef.current?.click()} className="w-full">
                  <Upload size={13} /> Cargar archivo
                </FMButton>
              </div>

              <div className="flex gap-2">
                <FMButton variant="secondary" onClick={() => setIsSaveModalOpen(false)} className="flex-1">Cancelar</FMButton>
                <FMButton variant="primary" onClick={confirmSaveGame} className="flex-1">
                  {overwriteSaveId ? 'Sobrescribir' : 'Guardar'}
                </FMButton>
              </div>
            </div>
          </div>
        </div>
      )}

      {shareSaveTarget && (
        <div className="fixed inset-0 z-[560] bg-slate-900/80 flex items-center justify-center p-4 backdrop-blur-sm animate-overlay-in" onClick={() => setShareSaveTarget(null)}>
          <div className="bg-[#e8ece8] w-full max-w-sm rounded-sm border border-[#1c1f24] shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="bg-[#3a3f45] border-b border-[#1c1f24] px-4 py-2.5 flex justify-between items-center">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                <Share2 size={14} /> Compartir Partida
              </h3>
              <button type="button" onClick={() => setShareSaveTarget(null)} className="text-slate-300 hover:text-white cursor-pointer" aria-label="Cerrar"><X size={16} /></button>
            </div>
            <div className="p-4 space-y-3">
              <div className="bg-white border border-slate-300 rounded-sm p-2.5">
                <p className="font-bold text-slate-900 text-xs truncate">{shareSaveTarget.label}</p>
                <p className="text-[10px] text-slate-500 font-mono mt-0.5">{shareSaveTarget.teamName} · {new Date(shareSaveTarget.date).toLocaleDateString()}</p>
              </div>
              <div className="space-y-2">
                <FMButton
                  type="button"
                  variant="primary"
                  className="w-full py-2.5 text-xs"
                  onClick={async () => {
                    const target = shareSaveTarget;
                    setShareSaveTarget(null);
                    await handleShareSlotByEmail(target.id);
                  }}
                >
                  <Mail size={14} /> Enviar por correo
                </FMButton>
                <FMButton
                  type="button"
                  variant="secondary"
                  className="w-full py-2.5 text-xs"
                  onClick={async () => {
                    const target = shareSaveTarget;
                    setShareSaveTarget(null);
                    await handleExportSlot(target.id);
                  }}
                >
                  <Download size={14} /> Descargar archivo
                </FMButton>
              </div>
            </div>
          </div>
        </div>
      )}

      {!isMatchView && !isPreMatchView && (
        <header className="w-full shrink-0 z-[110]">
          <FmBroadcastHeader
            club={dynamicHeader.club}
            title={dynamicHeader.title}
            shortCode={dynamicHeader.shortCode}
            subtitle={dynamicHeader.subtitle}
            showShield={dynamicHeader.showShield}
            shieldSize="md"
            rightSlot={
              <div className="flex items-center gap-2">
                <FmLedDisplay className="px-2.5 sm:px-3 py-0.5 sm:py-1 rounded-[2px] flex flex-col items-end justify-center leading-tight">
                  <span className="font-mono text-[11px] sm:text-sm font-bold text-[#facc15] tabular-nums tracking-wider">
                    {currentDate.toLocaleDateString()}
                  </span>
                  <span className="hidden sm:inline font-mono text-[9px] font-medium text-[#9ca3af] uppercase tracking-wider">
                    {currentDate.toLocaleDateString('es-ES', { weekday: 'short' })}
                  </span>
                </FmLedDisplay>
                {(userClub || selectedNationalTeamId) && (
                  <button
                    type="button"
                    disabled={isSimulating}
                    onClick={() => void advanceTime()}
                    className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-[2px] border border-[#0f2410] bg-gradient-to-b from-[#3b7a3d] via-[#2b5d2c] to-[#1a3d1b] text-[#facc15] text-[10.5px] font-black uppercase tracking-wide shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_1px_2px_rgba(0,0,0,0.65)] hover:brightness-110 active:translate-y-px disabled:opacity-75 disabled:cursor-wait transition-all cursor-pointer"
                  >
                    <RefreshCw size={13} className={isSimulating ? 'animate-spin' : ''} />
                    <span>{isSimulating ? 'Avanzando…' : 'Continuar'}</span>
                  </button>
                )}
              </div>
            }
          />
          <div className="h-1 w-full bg-[#3a3f45] border-b border-[#1c1f24]" />
        </header>
      )}

      <div className="flex flex-1 overflow-hidden relative">
        {(userClub || selectedNationalTeamId) && !isMatchView && (
          <Sidebar currentView={currentView} setView={setView} club={userClub} nationalTeamId={selectedNationalTeamId} onVacation={() => setIsVacationModalOpen(true)} onSave={handleOpenSaveModal} />
        )}
        <main className={`flex-1 flex flex-col min-w-0 bg-[#b8c4b8] relative min-h-0 overflow-hidden ${isMatchView ? 'pb-0' : 'pb-[104px] lg:pb-0'}`}>
          <ScreenBackground view={currentView}>{renderCurrentView()}</ScreenBackground>
        </main>
        {onboardingActive && <OnboardingTour active={onboardingActive} currentView={currentView} onComplete={() => setShowOnboarding(false)} />}
      </div>

      {isVacationModalOpen && (
        <div className="fixed inset-0 bg-slate-900/80 z-[500] flex items-center justify-center p-6 backdrop-blur-md">
          <div className="bg-slate-200 w-full max-sm rounded-sm border border-slate-600 p-8 text-center shadow-2xl">
            {isSimulating ? (
              <div className="space-y-4">
                <div className="flex items-center justify-center gap-3 mb-4">
                  <RefreshCw size={20} className="text-slate-950 animate-spin" />
                  <h2 className="text-xl font-black text-slate-950 uppercase italic">Simulando...</h2>
                </div>
                <div className="text-center">
                  <p className="text-slate-600 font-mono font-bold text-sm">{currentDate.toLocaleDateString()}</p>
                </div>
                <div className="animate-pulse space-y-2 mt-4">
                  <div className="h-3 bg-slate-300 rounded-sm w-3/4 mx-auto"></div>
                  <div className="h-3 bg-slate-300 rounded-sm w-1/2 mx-auto"></div>
                  <div className="h-3 bg-slate-300 rounded-sm w-2/3 mx-auto"></div>
                  <div className="h-8 bg-slate-300 rounded-sm w-full mt-3"></div>
                  <div className="h-8 bg-slate-300 rounded-sm w-full"></div>
                </div>
                <p className="text-[9px] text-slate-400 uppercase tracking-wider font-bold mt-2">Procesando jornadas...</p>
              </div>
            ) : (
              <>
                <Sun size={48} className="text-orange-600 mx-auto mb-4" />
                <h2 className="text-lg font-black text-slate-950 mb-6 uppercase italic tracking-widest border-b-2 border-slate-400 pb-2">Planificar Vacaciones</h2>
                <div className="space-y-4">
                  <div className="text-left"><label className="text-[10px] font-black text-slate-600 uppercase block mb-1 tracking-widest">Fecha de Regreso:</label><input type="date" className="w-full bg-slate-100 border border-slate-500 rounded-sm px-3 py-2 text-slate-950 font-bold text-sm" value={vacationTargetDate} onChange={(e) => setVacationTargetDate(e.target.value)} /></div>
                  <FMButton variant="vacation" onClick={() => startVacation()} className="w-full py-4 text-xs">Iniciar Simulación</FMButton>
                  <FMButton variant="primary" onClick={() => startVacation(seasonEndDate)} className="w-full py-4 text-xs">Simular Temporada</FMButton>
                  <FMButton variant="secondary" onClick={() => setIsVacationModalOpen(false)} className="w-full">Cancelar</FMButton>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {selectedPlayer && (userClub || selectedNationalTeamId) && <PlayerModal player={selectedPlayer} userClubId={userClub?.id} onClose={() => setSelectedPlayer(null)} currentDate={currentDate} />}
      {comparePlayerA && comparePlayerB && <PlayerCompareModal playerA={comparePlayerA} playerB={comparePlayerB} onClose={() => { setComparePlayerA(null); setComparePlayerB(null); }} />}
      {contextMenu && <PlayerContextMenu player={contextMenu.player} x={contextMenu.x} y={contextMenu.y} onClose={() => setContextMenu(null)} currentDate={currentDate} userClubId={userClub?.id} />}
      {seasonSummary && <SeasonSummaryModal summary={seasonSummary} userWonLeague={userWonLeague} onClose={() => { setSeasonSummary(null); setUserWonLeague(false); }} />}
      {isSackedModalOpen && (
        <FMModal isOpen={isSackedModalOpen} onClose={() => setIsSackedModalOpen(false)} title="Despido" size="md">
          <div className="p-6 text-center space-y-4">
            <p className="text-sm font-black text-red-700 uppercase">La directiva de {sackedClubName} te ha despedido.</p>
            <p className="text-xs font-bold text-slate-600">Tu contrato ha sido rescindido por los malos resultados.</p>
            <div className="flex gap-2 justify-center">
              <FMButton variant="primary" onClick={() => { setIsSackedModalOpen(false); setGameState('SETUP_USER'); useGameStore.getState().resetForNewCareer(); }} className="px-6">Nueva carrera</FMButton>
              <FMButton variant="secondary" onClick={() => setIsSackedModalOpen(false)} className="px-6">Cerrar</FMButton>
            </div>
          </div>
        </FMModal>
      )}
      <DialogueHost onStartMatch={handleStartMatch} />
      {currentView !== 'MATCH' && <BottomNav advanceTime={advanceTime} simulateToNextMatch={simulateToNextMatch} onSave={handleOpenSaveModal} isSimulating={isSimulating} isPreMatchView={isPreMatchView} />}
    </div>
  );
};

export default () => (
  <ErrorBoundary>
    <App />
    <FeedbackHost />
    <OfflineIndicator />
  </ErrorBoundary>
);
