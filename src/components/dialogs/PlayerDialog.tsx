import React, { useMemo } from 'react';
import { world } from '../../services/worldManager';
import { useGameStore } from '../../stores/gameStore';
import { useDialogueStore } from '../../stores/dialogueStore';
import { PLAYER_PERSONALITY_LABELS } from '../../types';
import { CharacterDialog } from './CharacterDialog';
import { PlayerChatPanel } from '../PlayerChatPanel';
import { getClubHexPalette } from '../ClubBannerChrome';

export const PlayerDialog: React.FC = () => {
  const { kind, data, close } = useDialogueStore();
  const currentDate = useGameStore((s) => s.currentDate);

  const player = useMemo(() => {
    if (!data?.playerId) return null;
    return world.getPlayer(data.playerId) || null;
  }, [data?.playerId]);

  if (kind !== 'PLAYER_DIALOG' || !player) return null;

  const club = data?.clubId ? world.getClub(data.clubId) : world.getClub(player.clubId);
  const clubPrimary = getClubHexPalette(club, '#2b5d2c', '#f8fafc').primary;
  const iniciales =
    player.name
      .split(' ')
      .map((w) => w[0])
      .slice(0, 2)
      .join('')
      .toUpperCase() || 'PL';
  const cargo = `${PLAYER_PERSONALITY_LABELS[player.personality || 'PROFESSIONAL']} · ${
    player.positions[0]
  }`;

  return (
    <CharacterDialog
      nombre={player.name}
      cargo={cargo}
      iniciales={iniciales}
      clubColor={clubPrimary}
      maxWidth="max-w-2xl"
      zIndexClass="z-[985]"
      onClose={close}
    >
      <PlayerChatPanel
        player={player}
        clubId={club?.id || player.clubId}
        currentDate={currentDate}
        compact
        onResolved={close}
      />
    </CharacterDialog>
  );
};
