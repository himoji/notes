export interface Note {
  id: string;
  title: string;
  content: string;
  datetime: string;
  attachments: string[];
}

export type ViewMode = "write" | "preview";

export interface PeerDevice {
  id: string;
  name: string;
  ip: string;
  port: number;
}

export enum SyncStatus {
  Pending = "pending",
  Accepted = "accepted",
  Rejected = "rejected",
}

export interface SyncNotification {
  id: string;
  from_peer: PeerDevice;
  note_title: string;
  status: SyncStatus;
}
