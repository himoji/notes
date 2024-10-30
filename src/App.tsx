// src/App.tsx
import {useState, useEffect, useRef} from 'react';
import { Card } from "@/components/ui/card";
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Plus, Trash2, Sun, Moon, Image, Eye, Code } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { invoke } from '@tauri-apps/api/core'
import { toast } from '@/hooks/use-toast';
import { Toaster } from '@/components/ui/toaster';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { open } from '@tauri-apps/plugin-dialog';
import { Separator } from '@/components/ui/separator';
import "../dist/output.css"

interface Note {
    id: string;
    title: string;
    content: string;
    datetime: string;
    attachments: string[]; // Array of attachment paths
}

const NotesApp = () => {
    const [isDark, setIsDark] = useState(false);
    const [notes, setNotes] = useState<Note[]>([]);
    const [selectedNote, setSelectedNote] = useState<Note | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [viewMode, setViewMode] = useState<'write' | 'preview'>('write');
    const textAreaRef = useRef<HTMLTextAreaElement | null>(null);

    useEffect(() => {
        loadNotes();
    }, []);

    useEffect(() => {
        document.body.className = isDark ? 'dark' : '';
    }, [isDark]);

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

    const updateNote = async (content: string) => {
        if (!selectedNote) return;

        // Preserve the current caret position
        const startPosition = textAreaRef.current?.selectionStart || 0;

        try {
            const updatedNote = {
                ...selectedNote,
                content,
                datetime: new Date().toISOString()
            };

            await invoke('save_note', { note: updatedNote });
            const updatedNotes = notes.map(note =>
                note.id === selectedNote.id ? updatedNote : note
            );
            setNotes(updatedNotes);
            setSelectedNote(updatedNote);

            // Use setTimeout to restore the caret position after state update
            setTimeout(() => {
                if (textAreaRef.current) {
                    textAreaRef.current.focus();
                    textAreaRef.current.selectionStart = startPosition; // Restore the caret position
                    textAreaRef.current.selectionEnd = startPosition; // Restore the caret position
                }
            }, 0); // Set timeout to ensure it's executed after the render
        } catch (error) {
            toast({
                title: "Error",
                description: "Failed to update note",
                variant: "destructive",
            });
        }
    };


    const updateTitle = async (title: string) => {
        if (!selectedNote) return;

        try {
            const updatedNote = {
                ...selectedNote,
                title,
                datetime: new Date().toISOString()
            };

            await invoke('save_note', { note: updatedNote });
            const updatedNotes = notes.map(note =>
                note.id === selectedNote.id ? updatedNote : note
            );
            setNotes(updatedNotes);
            setSelectedNote(updatedNote);
        } catch (error) {
            toast({
                title: "Error",
                description: "Failed to update note title",
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

    const handleImageUpload = async () => {
        try {
            const selected = await open({
                multiple: false,
                filters: [{
                    name: 'Image',
                    extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp']
                }]
            });

            if (selected && selectedNote) {
                const filePath = selected as string;
                const fileName = await invoke<string>('save_attachment', {
                    noteId: selectedNote.id,
                    sourcePath: filePath
                });

                const imageMarkdown = `![${fileName}](attachment://${fileName})`;
                const newContent = selectedNote.content + '\n' + imageMarkdown;

                const updatedNote = {
                    ...selectedNote,
                    content: newContent,
                    attachments: [...selectedNote.attachments, fileName]
                };

                await invoke('save_note', { note: updatedNote });
                setSelectedNote(updatedNote);
                const updatedNotes = notes.map(note =>
                    note.id === selectedNote.id ? updatedNote : note
                );
                setNotes(updatedNotes);
            }
        } catch (error) {
            toast({
                title: "Error",
                description: "Failed to upload image",
                variant: "destructive",
            });
        }
    };

    const formatDateTime = (datetime: string) => {
        const date = new Date(datetime);
        return date.toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    if (isLoading) {
        return (
            <div className="h-screen flex items-center justify-center">
                <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-gray-900"></div>
            </div>
        );
    }

    const customMarkdownComponents = {
        img: ({ src, alt, ...props }: any) => {
            if (src?.startsWith('attachment://')) {
                const fileName = src.replace('attachment://', '');
                return <img
                    src={`note-attachment://${selectedNote?.id}/${fileName}`}
                    alt={alt}
                    className="max-w-full h-auto rounded-lg"
                    {...props}
                />;
            }
            return <img src={src} alt={alt} {...props} />;
        }
    };

    return (
        <div className={`h-screen max-h-screen p-4 ${isDark ? 'dark bg-gray-900' : 'bg-gray-50'}`}>
            <div className="h-full flex gap-4">
                {/* Left sidebar */}
                <Card className="w-72 p-4 flex flex-col dark:bg-gray-800">
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-xl font-semibold dark:text-white">Notes</h2>
                        <div className="flex items-center gap-2">
                            <div className="flex items-center gap-2">
                                {isDark ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
                                <Switch
                                    checked={isDark}
                                    onCheckedChange={setIsDark}
                                />
                            </div>
                            <Button size="sm" onClick={createNewNote}>
                                <Plus className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>

                    <ScrollArea className="flex-grow">
                        <div className="space-y-2">
                            {notes.map(note => (
                                <div
                                    key={note.id}
                                    className={`p-3 rounded-lg cursor-pointer transition-colors relative group ${
                                        selectedNote?.id === note.id
                                            ? 'bg-blue-100 dark:bg-blue-900 hover:bg-blue-200 dark:hover:bg-blue-800'
                                            : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                                    }`}
                                >
                                    <div
                                        className="flex flex-col"
                                        onClick={() => setSelectedNote(note)}
                                    >
                                        <div className="font-medium truncate dark:text-white">{note.title}</div>
                                        <div className="text-sm text-gray-500 dark:text-gray-400 line-clamp-3">
                                            {note.content}
                                        </div>
                                        <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                                            {formatDateTime(note.datetime)}
                                        </div>
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            deleteNote(note.id);
                                        }}
                                    >
                                        <Trash2 className="h-4 w-4 text-red-500" />
                                    </Button>
                                </div>
                            ))}
                        </div>
                    </ScrollArea>
                </Card>

                {/* Main content */}
                <Card className="flex-grow p-4 flex flex-col dark:bg-gray-800">
                    {selectedNote ? (
                        <>
                            <div className="flex justify-between items-center mb-4">
                                <input
                                    type="text"
                                    value={selectedNote.title}
                                    onChange={(e) => updateTitle(e.target.value)}
                                    className="text-2xl font-semibold bg-transparent border-none outline-none focus:ring-0 dark:text-white"
                                />
                                <div className="flex items-center gap-4">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={handleImageUpload}
                                    >
                                        <Image className="h-4 w-4 mr-2" />
                                        Add Image
                                    </Button>
                                    <Separator orientation="vertical" className="h-6" />
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setViewMode(viewMode === 'write' ? 'preview' : 'write')}
                                    >
                                        {viewMode === 'write' ? (
                                            <><Eye className="h-4 w-4 mr-2" /> Preview</>
                                        ) : (
                                            <><Code className="h-4 w-4 mr-2" /> Edit</>
                                        )}
                                    </Button>
                                    <div className="text-sm text-gray-400 dark:text-gray-500">
                                        {formatDateTime(selectedNote.datetime)}
                                    </div>
                                </div>
                            </div>
                            <ScrollArea className="flex-grow">
                                {viewMode === 'write' ? (
                                    <textarea
                                        ref={textAreaRef}
                                        value={selectedNote.content}
                                        onChange={(e) => updateNote(e.target.value)}
                                        className="w-full h-[calc(100vh-200px)] resize-none bg-transparent border-none outline-none focus:ring-0 dark:text-white font-mono"
                                        placeholder="Start typing in Markdown..."
                                    />
                                ) : (
                                    <div className="prose prose-sm dark:prose-invert max-w-none">
                                        <ReactMarkdown
                                            remarkPlugins={[remarkGfm]}
                                            components={customMarkdownComponents}
                                        >
                                            {selectedNote.content}
                                        </ReactMarkdown>
                                    </div>
                                )}
                            </ScrollArea>
                        </>
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

export default NotesApp;