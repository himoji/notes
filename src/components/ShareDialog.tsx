import React from "react";
import { Note, PeerDevice } from "@/types";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { X, Share } from "lucide-react";

interface ShareDialogProps {
  note: Note;
  peers: PeerDevice[];
  onShare: (noteId: string, peerId: string) => void;
  onClose: () => void;
  isSharing: boolean;
}

export const ShareDialog: React.FC<ShareDialogProps> = ({
  note,
  peers,
  onShare,
  onClose,
  isSharing,
}) => {
  if (!note) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md bg-white dark:bg-gray-800 rounded-lg shadow-xl">
        <div className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold dark:text-white">
              Share Note
            </h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              disabled={isSharing}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="mb-4">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Share "{note.title}" with:
            </p>
          </div>

          {peers.length === 0 ? (
            <div className="py-8 text-center text-gray-500 dark:text-gray-400">
              No devices found on your network.
            </div>
          ) : (
            <ScrollArea className="max-h-64">
              <div className="space-y-2">
                {peers.map((peer) => (
                  <div
                    key={peer.id}
                    className="p-3 border border-gray-100 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex justify-between items-center"
                  >
                    <div>
                      <div className="font-medium dark:text-white">
                        {peer.name}
                      </div>
                      <div className="text-xs text-gray-500">{peer.ip}</div>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => onShare(note.id, peer.id)}
                      disabled={isSharing}
                    >
                      <Share className="h-4 w-4 mr-2" />
                      Share
                    </Button>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>
      </Card>
    </div>
  );
};
