export const participantStatuses = [
  "writing",
  "help_requested",
  "help_generating",
  "help_delivered",
  "completed"
] as const;

export type ParticipantStatus = (typeof participantStatuses)[number];

export interface HelpRequestResult {
  readonly accepted: boolean;
  readonly nextStatus: ParticipantStatus;
}

const priorityByStatus: Readonly<Record<ParticipantStatus, number>> = {
  help_requested: 0,
  help_generating: 1,
  help_delivered: 2,
  writing: 3,
  completed: 4
};

export function dashboardPriority(status: ParticipantStatus): number {
  return priorityByStatus[status];
}

export function nextStep(step: 1 | 2 | 3 | 4 | 5): 2 | 3 | 4 | 5 | null {
  switch (step) {
    case 1:
      return 2;
    case 2:
      return 3;
    case 3:
      return 4;
    case 4:
      return 5;
    case 5:
      return null;
  }
}

export function requestHelp(status: ParticipantStatus): HelpRequestResult {
  if (status === "help_requested" || status === "help_generating") {
    return { accepted: false, nextStatus: status };
  }

  return { accepted: true, nextStatus: "help_requested" };
}
