import React from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { SyncNotification, SyncStatus } from "@/types";
import { Check, X } from "lucide-react";
import { Card } from "@/components/ui/card";

interface SyncNotificationListProps {
  notifications: SyncNotification[];
  onAccept: (notificationId: string) => void;
  onReject: (notificationId: string) => void;
  isLoading: boolean;
}

export const SyncNotificationList: React.FC<SyncNotificationListProps> = ({
  notifications,
  onAccept,
  onReject,
  isLoading,
}) => {
  const pendingNotifications = notifications.filter(
    (n) => n.status === SyncStatus.Pending
  );

  if (pendingNotifications.length === 0 && !isLoading) {
    return null;
  }

  return (
    <Card className="w-full p-4 mb-4 dark:bg-gray-800">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-medium dark:text-white">Sync Requests</h3>
      </div>

      {isLoading ? (
        <div className="py-4 text-center text-gray-500 dark:text-gray-400">
          Loading notifications...
        </div>
      ) : pendingNotifications.length === 0 ? (
        <div className="py-4 text-center text-gray-500 dark:text-gray-400">
          No pending sync requests.
        </div>
      ) : (
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
                      onClick={() => onAccept(notification.id)}
                    >
                      <Check className="h-4 w-4 mr-1" /> Accept
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="bg-red-50 hover:bg-red-100 border-red-200 text-red-600 dark:bg-red-900/20 dark:hover:bg-red-900/30 dark:border-red-800 dark:text-red-400"
                      onClick={() => onReject(notification.id)}
                    >
                      <X className="h-4 w-4 mr-1" /> Reject
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      )}
    </Card>
  );
};
