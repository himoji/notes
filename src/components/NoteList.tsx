import React from 'react';
import { Button } from "@/components/ui/button";
import { ScrollArea } from '@/components/ui/scroll-area';
import { Plus, Trash2, Sun, Moon } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Note } from '@/types';

interface NoteListProps {
    notes: Note[];
    selectedNote: Note | null;
    isDark: boolean;
    onNoteSelect: (note: Note) => void;
    onDeleteNote: (id: string) => void;
    onCreateNote: () => void;
    onThemeToggle: (isDark: boolean) => void;
}
export const NoteList: React.FC<NoteListProps> = ({
                                                      notes,
                                                      selectedNote,
                                                      isDark,
                                                      onNoteSelect,
                                                      onDeleteNote,
                                                      onCreateNote,
                                                      onThemeToggle
                                                  }) => {
    return (
        <div className="flex flex-col h-full p-4 dark:bg-gray-800">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold dark:text-white">Notes</h2>
                <div className="flex items-center gap-2">
                    <div className="flex items-center gap-2">
                        {isDark ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
                        <Switch
                            checked={isDark}
                            onCheckedChange={onThemeToggle}
                        />
                    </div>
                    <Button size="sm" onClick={onCreateNote}>
                        <Plus className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            <ScrollArea className="flex-1">
                <div className="space-y-2 pr-4">
                    {notes.map(note => (
                        <div
                            key={note.id}
                            className={`p-3 rounded-lg cursor-pointer transition-colors relative group ${
                                selectedNote?.id === note.id
                                    ? 'bg-blue-100 dark:bg-blue-900 hover:bg-blue-200 dark:hover:bg-blue-800'
                                    : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                            }`}
                            onClick={() => onNoteSelect(note)}
                        >
                            <div className="pr-8">
                                <div className="font-medium truncate dark:text-white">{note.title || 'Untitled'}</div>
                                <div className="text-sm text-gray-500 dark:text-gray-400 line-clamp-3">
                                    {note.content}
                                </div>
                                <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                                    {new Date(Number(note.datetime) * 1000).toLocaleDateString("de-DE")}
                                </div>
                            </div>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onDeleteNote(note.id);
                                }}
                            >
                                <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                        </div>
                    ))}
                </div>
            </ScrollArea>
        </div>
    );
};