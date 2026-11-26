import React from 'react';
import { useDialogueStore } from '../../stores/dialogueStore';
import { AssistantAdviceDialog } from './AssistantAdviceDialog';
import { FitnessCoachDialog } from './FitnessCoachDialog';
import { TransferFolderDialog } from './TransferFolderDialog';
import { PlayerDialog } from './PlayerDialog';
import { StaffDialog } from './StaffDialog';
import { TreasurerDialog } from './TreasurerDialog';
import { ScoutDialog } from './ScoutDialog';
import { PresidentDialog } from './PresidentDialog';

interface DialogueHostProps {
  onStartMatch?: () => void;
}

export const DialogueHost: React.FC<DialogueHostProps> = ({ onStartMatch }) => {
  const kind = useDialogueStore(s => s.kind);

  if (kind === 'ASSISTANT') {
    return <AssistantAdviceDialog onStartMatch={onStartMatch} />;
  }
  if (kind === 'FITNESS') {
    return <FitnessCoachDialog />;
  }
  if (kind === 'TRANSFERS') {
    return <TransferFolderDialog />;
  }
  if (kind === 'PLAYER_DIALOG') {
    return <PlayerDialog />;
  }
  if (kind === 'STAFF_DIALOG') {
    return <StaffDialog />;
  }
  if (kind === 'TREASURER') {
    return <TreasurerDialog />;
  }
  if (kind === 'SCOUT') {
    return <ScoutDialog />;
  }
  if (kind === 'PRESIDENT') {
    return <PresidentDialog />;
  }
  return null;
};
