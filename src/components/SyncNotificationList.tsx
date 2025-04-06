import React, { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Check, X } from "lucide-react";
import { SyncNotification, SyncStatus } from "@/types";
import { LoadingSpinner } from "./LoadingSpinner";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";

interface SyncNotificationListProps {
  notifications: SyncNotification[];
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
  isLoading: boolean;
}

export const SyncNotificationList: React.FC<SyncNotificationListProps> = ({
  notifications,
  onAccept,
  onReject,
  isLoading,
}) => {
  // Only show pending notifications
  const pendingNotifications = notifications.filter(
    (n) => n.status === SyncStatus.Pending
  );

  useEffect(() => {
    console.log(
      "SyncNotificationList rendered with notifications:",
      notifications
    );
    console.log("Pending notifications count:", pendingNotifications.length);
  }, [notifications, pendingNotifications.length]);

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (pendingNotifications.length === 0) {
    return null;
  }

  return (
    <Card className="p-4">
      <div className="font-semibold mb-2 dark:text-white">Sync Requests</div>
      <ScrollArea className="max-h-64">
        <div className="space-y-2">
          {pendingNotifications.map((notification) => (
            <div
              key={notification.id}
              className="p-3 border border-gray-100 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              <div className="flex justify-between items-start mb-2">
                <div>
                  <div className="font-medium dark:text-white">
                    {notification.note_title}
                  </div>
                  <div className="text-xs text-gray-500">
                    From: {notification.from_peer.name}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="bg-green-50 hover:bg-green-100 border-green-200 text-green-600 dark:bg-green-900/20 dark:hover:bg-green-900/30 dark:border-green-800 dark:text-green-400"
                    onClick={() => {
                      console.log(
                        `Accepting note from ${notification.from_peer.name}: ${notification.note_title}`
                      );
                      onAccept(notification.id);
                    }}
                  >
                    <Check className="h-4 w-4 mr-1" /> Accept
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="bg-red-50 hover:bg-red-100 border-red-200 text-red-600 dark:bg-red-900/20 dark:hover:bg-red-900/30 dark:border-red-800 dark:text-red-400"
                    onClick={() => {
                      console.log(
                        `Rejecting note from ${notification.from_peer.name}: ${notification.note_title}`
                      );
                      onReject(notification.id);
                    }}
                  >
                    <X className="h-4 w-4 mr-1" /> Reject
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </Card>
  );
};
