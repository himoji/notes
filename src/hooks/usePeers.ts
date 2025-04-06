import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { PeerDevice } from "@/types";
import { listen } from "@tauri-apps/api/event";

export function usePeers() {
  const [peers, setPeers] = useState<PeerDevice[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadPeers = async () => {
    try {
      const loadedPeers = await invoke<PeerDevice[]>("get_peers");
      setPeers(loadedPeers);
      return loadedPeers;
    } catch (error) {
      console.error("Failed to load peers:", error);
      return [];
    }
  };

  useEffect(() => {
    const init = async () => {
      setIsLoading(true);
      await loadPeers();
      setIsLoading(false);
    };
    init();

    // Listen for peer update events
    const unlisten = listen("peers-updated", async () => {
      await loadPeers();
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const shareNote = async (noteId: string, peerId: string) => {
    try {
      await invoke("share_note", { noteId, peerId });
      return true;
    } catch (error) {
      console.error("Failed to share note:", error);
      return false;
    }
  };

  const shareNotes = async (noteIds: string[], peerId: string) => {
    try {
      console.log(`Sharing ${noteIds.length} notes with peer ${peerId}`);
      console.log("Note IDs:", noteIds);

      await invoke("share_notes", { noteIds, peerId });
      console.log("share_notes invoke completed successfully");
      return true;
    } catch (error) {
      console.error("Failed to share notes:", error);
      return false;
    }
  };

  return {
    peers,
    isLoading,
    shareNote,
    shareNotes,
  };
}
