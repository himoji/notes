import React, { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Toaster } from "@/components/ui/toaster";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "@/hooks/use-toast";
import { ViewMode } from "./types";
import { NoteList } from "./components/NoteList";
import { NoteEditor } from "./components/NoteEditor";
import { LoadingSpinner } from "./components/LoadingSpinner";
import { useNotes } from "./hooks/useNotes";
import { usePeers } from "./hooks/usePeers";
import { useSyncNotifications } from "./hooks/useSyncNotifications";
import { ShareDialog } from "./components/ShareDialog";
import { SyncNotificationList } from "./components/SyncNotificationList";
import { listen } from "@tauri-apps/api/event";
import "../dist/output.css";
import { Button } from "./components/ui/button";
const App: React.FC = () => {
  const [isDark, setIsDark] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("write");
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [notesToShare, setNotesToShare] = useState<any[]>([]);

  const {
    notes,
    selectedNote,
    isLoading: notesLoading,
    setSelectedNote,
    createNewNote,
    updateNote,
    deleteNote,
  } = useNotes();

  const { peers, isLoading: peersLoading, shareNotes } = usePeers();

  const {
    notifications,
    isLoading: notificationsLoading,
    respondToSync,
  } = useSyncNotifications();

  useEffect(() => {
    document.body.className = isDark ? "dark" : "";
  }, [isDark]);

  useEffect(() => {
    // Listen for sync response events
    const unlisten = listen("sync-response", (event: any) => {
      const { accepted } = event.payload;
      console.log("Received sync-response event:", event.payload);
      toast({
        title: accepted ? "Note Shared" : "Share Rejected",
        description: accepted
          ? "Your note was accepted"
          : "Your note was rejected",
        variant: accepted ? "default" : "destructive",
      });
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  // Add effect to log when notifications change
  useEffect(() => {
    console.log("Notifications updated:", notifications);
  }, [notifications]);

  const handleImageUpload = async () => {
    if (!selectedNote) return;

    try {
      const selected = await open({
        multiple: false,
        filters: [
          {
            name: "Image",
            extensions: ["png", "jpg", "jpeg", "gif", "webp"],
          },
        ],
      });

      if (selected) {
        const filePath = selected as string;
        const fileName = await invoke<string>("save_attachment", {
          noteId: selectedNote.id,
          sourcePath: filePath,
        });

        const imageMarkdown = `![${fileName}](attachment://${fileName})`;
        const updatedNote = {
          ...selectedNote,
          content: selectedNote.content + "\n" + imageMarkdown,
          attachments: [...selectedNote.attachments, fileName],
          datetime: new Date().toISOString(),
        };

        updateNote(updatedNote);
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to upload image",
        variant: "destructive",
      });
    }
  };

  const handleShareNote = (note: any) => {
    setNotesToShare([note]);
    setShareDialogOpen(true);
  };

  const handleShareAllNotes = () => {
    setNotesToShare(notes);
    setShareDialogOpen(true);
  };

  const openNotesDir = async () => {
    const path = await invoke<string>("open_notes_dir");
    console.log(path);
    open({ directory: true, defaultPath: path });
  };

  const handleShare = async (noteIds: string[], peerId: string) => {
    setIsSharing(true);

    try {
      await shareNotes(noteIds, peerId);
      toast({
        title: "Share requested",
        description: `Waiting for response for ${noteIds.length} note${
          noteIds.length > 1 ? "s" : ""
        }...`,
      });
      setShareDialogOpen(false);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to share notes",
        variant: "destructive",
      });
    } finally {
      setIsSharing(false);
    }
  };

  const handleAcceptSync = async (notificationId: string) => {
    try {
      await respondToSync(notificationId, true);
      toast({
        title: "Note accepted",
        description: "The note has been added to your notes",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to accept note",
        variant: "destructive",
      });
    }
  };

  const handleRejectSync = async (notificationId: string) => {
    try {
      await respondToSync(notificationId, false);
      toast({
        title: "Note rejected",
        description: "The note has been rejected",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to reject note",
        variant: "destructive",
      });
    }
  };

  if (notesLoading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="h-screen flex flex-col p-4 dark:bg-gray-900">
      <div className="flex-1 flex flex-col gap-4 min-h-0 overflow-hidden">
        <SyncNotificationList
          notifications={notifications}
          onAccept={handleAcceptSync}
          onReject={handleRejectSync}
          isLoading={notificationsLoading}
        />

        <div className="flex flex-1 gap-4 min-h-0 overflow-hidden">
          <Card className="w-72 flex-shrink-0 overflow-hidden">
            <NoteList
              notes={notes}
              selectedNote={selectedNote}
              isDark={isDark}
              onNoteSelect={setSelectedNote}
              onDeleteNote={deleteNote}
              onCreateNote={createNewNote}
              onThemeToggle={setIsDark}
              onShareNote={handleShareNote}
              onShareAllNotes={handleShareAllNotes}
            />
          </Card>

          <Card className="flex-1 flex flex-col dark:bg-gray-800 p-4 overflow-scroll">
            {selectedNote ? (
              <NoteEditor
                key={selectedNote.id} // Add key prop to force re-render
                note={selectedNote}
                viewMode={viewMode}
                onUpdateNote={updateNote}
                onViewModeChange={setViewMode}
                onImageUpload={handleImageUpload}
              />
            ) : (
              <div className="flex-grow flex items-center justify-center text-gray-400 dark:text-gray-500">
                Select a note or create a new one
              </div>
            )}
          </Card>
        </div>
      </div>

      <Button onClick={openNotesDir}>Open Notes Directory</Button>

      {shareDialogOpen && notesToShare.length > 0 && (
        <ShareDialog
          notes={notesToShare}
          peers={peers}
          onShare={handleShare}
          onClose={() => setShareDialogOpen(false)}
          isSharing={isSharing}
        />
      )}

      <Toaster />
    </div>
  );
};

export default App;
