import type { CurrentUser, Placement } from "../../services/api";

export interface WorkspaceProps {
  user: CurrentUser;
  placements: Placement[];
  onPlacementsUpdated: (placement: Placement) => void;
  error: string | null;
  onError: (message: string) => void;
  onClearError: () => void;
}
