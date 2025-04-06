import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { SyncNotification } from "@/types";
import { listen } from "@tauri-apps/api/event";

export function useSyncNotifications() {
  const [notifications, setNotifications] = useState<SyncNotification[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadNotifications = async () => {
    try {
      const syncNotifications = await invoke<SyncNotification[]>(
        "get_sync_notifications"
      );
      console.log("Loaded sync notifications:", syncNotifications);
      setNotifications(syncNotifications);
      return syncNotifications;
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
      console.log("Received sync-notification event");
      await loadNotifications();
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const respondToSync = async (notificationId: string, accept: boolean) => {
    try {
      console.log(
        `Responding to sync notification ${notificationId}: ${
          accept ? "accept" : "reject"
        }`
      );
      await invoke("respond_to_sync", { notificationId, accept });
      console.log("respond_to_sync invoke completed successfully");
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
