import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { SyncNotification } from "@/types";
import { listen } from "@tauri-apps/api/event";

export function useSyncNotifications() {
  const [notifications, setNotifications] = useState<SyncNotification[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadNotifications = async () => {
    try {
      const loadedNotifications = await invoke<SyncNotification[]>(
        "get_sync_notifications"
      );
      setNotifications(loadedNotifications);
      return loadedNotifications;
    } catch (error) {
      console.error("Failed to load sync notifications:", error);
      return [];
    }
  };

  useEffect(() => {
    const init = async () => {
      setIsLoading(true);
      await loadNotifications();
      setIsLoading(false);
    };
    init();

    // Listen for sync notification events
    const unlisten = listen("sync-notification", async () => {
      await loadNotifications();
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const respondToSync = async (notificationId: string, accept: boolean) => {
    try {
      await invoke("respond_to_sync", { notificationId, accept });
      await loadNotifications();
      return true;
    } catch (error) {
      console.error("Failed to respond to sync:", error);
      return false;
    }
  };

  return {
    notifications,
    isLoading,
    respondToSync,
  };
}
