import React, { useMemo } from 'react';
import { world } from '../../services/worldManager';
import { useGameStore } from '../../stores/gameStore';
import { useDialogueStore } from '../../stores/dialogueStore';
import { getStaffPersonalityLabel, getStaffRoleLabel } from '../../services/staffChatService';
import { CharacterDialog } from './CharacterDialog';
import { StaffChatPanel } from '../StaffChatPanel';
import { getClubHexPalette } from '../ClubBannerChrome';

export const StaffDialog: React.FC = () => {
  const { kind, data, close } = useDialogueStore();
  const currentDate = useGameStore((s) => s.currentDate);

  const staff = useMemo(() => {
    if (!data?.staffId) return null;
    return world.getStaff(data.staffId) || null;
  }, [data?.staffId]);

  if (kind !== 'STAFF_DIALOG' || !staff) return null;

  const isFreeAgent = !staff.clubId || staff.clubId === 'FREE_AGENT';
  const staffClub = !isFreeAgent ? world.getClub(staff.clubId) : undefined;
  const userClub = data?.clubId ? world.getClub(data.clubId) : undefined;
  const clubForColor = staffClub || userClub;
  const clubPrimary = getClubHexPalette(clubForColor, '#2b5d2c', '#f8fafc').primary;

  const iniciales =
    staff.name
      .split(' ')
      .map((w) => w[0])
      .slice(0, 2)
      .join('')
      .toUpperCase() || 'ST';

  const cargo = `${getStaffRoleLabel(staff.role)} · ${getStaffPersonalityLabel(staff.personality)} · ${
    staffClub ? staffClub.name : 'Agente Libre'
  }`;

  return (
    <CharacterDialog
      nombre={staff.name}
      cargo={cargo}
      iniciales={iniciales}
      clubColor={clubPrimary}
      maxWidth="max-w-2xl"
      zIndexClass="z-[1010]"
      onClose={close}
    >
      <StaffChatPanel
        staff={staff}
        clubId={userClub?.id || staffClub?.id || ''}
        currentDate={currentDate}
        compact
      />
    </CharacterDialog>
  );
};
