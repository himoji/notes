import React, { useState, useEffect } from 'react';
import { Card } from "@/components/ui/card";
import { Toaster } from '@/components/ui/toaster';
import { open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { toast } from '@/hooks/use-toast';
import { ViewMode } from './types';
import { NoteList } from './components/NoteList';
import { NoteEditor } from './components/NoteEditor';
import { LoadingSpinner } from './components/LoadingSpinner';
import { useNotes } from './hooks/useNotes';
import "../dist/output.css";

const App: React.FC = () => {
    const [isDark, setIsDark] = useState(false);
    const [viewMode, setViewMode] = useState<ViewMode>('write');
    const {
        notes,
        selectedNote,
        isLoading,
        setSelectedNote,
        createNewNote,
        updateNote,
        deleteNote
    } = useNotes();

    useEffect(() => {
        document.body.className = isDark ? 'dark' : '';
    }, [isDark]);

    const handleImageUpload = async () => {
        if (!selectedNote) return;

        try {
            const selected = await open({
                multiple: false,
                filters: [{
                    name: 'Image',
                    extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp']
                }]
            });

            if (selected) {
                const filePath = selected as string;
                const fileName = await invoke<string>('save_attachment', {
                    noteId: selectedNote.id,
                    sourcePath: filePath
                });

                const imageMarkdown = `![${fileName}](attachment://${fileName})`;
                const updatedNote = {
                    ...selectedNote,
                    content: selectedNote.content + '\n' + imageMarkdown,
                    attachments: [...selectedNote.attachments, fileName],
                    datetime: new Date().toISOString()
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

    if (isLoading) {
        return <LoadingSpinner />;
    }

    return (
        <div className="h-screen flex flex-col p-4 dark:bg-gray-900">
            <div className="flex-1 flex gap-4 min-h-0 overflow-hidden">
                <Card className="w-72 flex-shrink-0 overflow-hidden">
                    <NoteList
                        notes={notes}
                        selectedNote={selectedNote}
                        isDark={isDark}
                        onNoteSelect={setSelectedNote}
                        onDeleteNote={deleteNote}
                        onCreateNote={createNewNote}
                        onThemeToggle={setIsDark}
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
            <Toaster />
        </div>
    );
};

export default App;