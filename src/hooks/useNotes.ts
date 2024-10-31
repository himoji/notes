import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { toast } from '@/hooks/use-toast';
import { Note } from '@/types';

export const useNotes = () => {
    const [notes, setNotes] = useState<Note[]>([]);
    const [selectedNote, setSelectedNote] = useState<Note | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        loadNotes();
    }, []);

    const loadNotes = async () => {
        try {
            setIsLoading(true);
            const loadedNotes = await invoke<Note[]>('get_notes');
            setNotes(loadedNotes);
            if (loadedNotes.length > 0 && !selectedNote) {
                setSelectedNote(loadedNotes[0]);
            }
        } catch (error) {
            toast({
                title: "Error",
                description: "Failed to load notes",
                variant: "destructive",
            });
        } finally {
            setIsLoading(false);
        }
    };

    const createNewNote = async () => {
        try {
            const newNote: Note = {
                id: crypto.randomUUID(),
                title: 'New Note',
                content: '# New Note\n\nStart typing...',
                datetime: new Date().toISOString(),
                attachments: []
            };

            await invoke('save_note', { note: newNote });
            setNotes([newNote, ...notes]);
            setSelectedNote(newNote);
            toast({
                title: "Success",
                description: "New note created",
            });
        } catch (error) {
            toast({
                title: "Error",
                description: "Failed to create note",
                variant: "destructive",
            });
        }
    };

    const updateNote = async (noteToUpdate: Note) => {
        try {
            await invoke('save_note', { note: noteToUpdate });
            const updatedNotes = notes.map(note =>
                note.id === noteToUpdate.id ? noteToUpdate : note
            );
            setNotes(updatedNotes);
            setSelectedNote(noteToUpdate);
        } catch (error) {
            toast({
                title: "Error",
                description: "Failed to update note",
                variant: "destructive",
            });
        }
    };

    const deleteNote = async (noteId: string) => {
        try {
            await invoke('delete_note', { noteId });
            const newNotes = notes.filter(note => note.id !== noteId);
            setNotes(newNotes);
            if (selectedNote?.id === noteId) {
                setSelectedNote(newNotes[0] || null);
            }
            toast({
                title: "Success",
                description: "Note deleted",
            });
        } catch (error) {
            toast({
                title: "Error",
                description: "Failed to delete note",
                variant: "destructive",
            });
        }
    };

    return {
        notes,
        selectedNote,
        isLoading,
        setSelectedNote,
        createNewNote,
        updateNote,
        deleteNote
    };
};
