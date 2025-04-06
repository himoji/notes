import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Note } from "@/types";
import { v4 as uuidv4 } from "uuid";
import { listen } from "@tauri-apps/api/event";

export function useNotes() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadNotes = async () => {
    try {
      const loadedNotes = await invoke<Note[]>("get_notes");
      setNotes(loadedNotes);
      return loadedNotes;
    } catch (error) {
      console.error("Failed to load notes:", error);
      return [];
    }
  };

  useEffect(() => {
    const init = async () => {
      setIsLoading(true);
      await loadNotes();
      setIsLoading(false);
    };
    init();

    // Listen for notes update events (when sync occurs)
    const unlisten = listen("notes-updated", async () => {
      await loadNotes();
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const createNewNote = async () => {
    const newNote: Note = {
      id: uuidv4(),
      title: "Untitled",
      content: "",
      datetime: (Date.now() / 1000).toString(),
      attachments: [],
    };

    try {
      await invoke("save_note", { note: newNote });
      const updatedNotes = await loadNotes();
      setNotes(updatedNotes);
      setSelectedNote(newNote); // Immediately select the new note
    } catch (error) {
      console.error("Failed to create note:", error);
    }
  };

  const updateNote = async (note: Note) => {
    try {
      await invoke("save_note", { note });
      const updatedNotes = await loadNotes();
      setNotes(updatedNotes);
      setSelectedNote(note); // Keep the current note selected
    } catch (error) {
      console.error("Failed to update note:", error);
    }
  };

  const deleteNote = async (id: string) => {
    try {
      await invoke("delete_note", { noteId: id });
      const updatedNotes = await loadNotes();
      setNotes(updatedNotes);
      if (selectedNote?.id === id) {
        setSelectedNote(updatedNotes[0] || null);
      }
    } catch (error) {
      console.error("Failed to delete note:", error);
    }
  };

  return {
    notes,
    selectedNote,
    isLoading,
    setSelectedNote,
    createNewNote,
    updateNote,
    deleteNote,
  };
}
