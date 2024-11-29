import React, { useRef, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Eye, Code } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Note, ViewMode } from '@/types';
import { useUndoRedo } from '@/hooks/useUndoRedo';
import { invoke } from "@tauri-apps/api/core";
import { toast } from "@/hooks/use-toast.ts";

interface NoteEditorProps {
    note: Note;
    viewMode: ViewMode;
    onUpdateNote: (note: Note) => void;
    onViewModeChange: (mode: ViewMode) => void;
    onImageUpload: () => void;
}

export const NoteEditor: React.FC<NoteEditorProps> = ({
                                                          note,
                                                          viewMode,
                                                          onUpdateNote,
                                                          onViewModeChange,
                                                      }) => {
    const textAreaRef = useRef<HTMLTextAreaElement>(null);
    const [content, setContent, undo, redo, canUndo, canRedo] = useUndoRedo(note.content);

    useEffect(() => {
        setContent(note.content);
    }, [note.id, note.content]);

    // Handle keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
                if (e.shiftKey && canRedo) {
                    e.preventDefault();
                    redo();
                } else if (canUndo) {
                    e.preventDefault();
                    undo();
                }
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [canUndo, canRedo, undo, redo]);

    // Handle content updates
    useEffect(() => {
        const timer = setTimeout(() => {
            if (content !== note.content) {
                onUpdateNote({ ...note, content });
            }
        }, 300);

        return () => clearTimeout(timer);
    }, [content, note, onUpdateNote]);

    // Fixed paste handler
    const handlePaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
        const items = e.clipboardData.items;

        for (let i = 0; i < items.length; i++) {
            const item = items[i];

            if (item.type.indexOf('image') !== -1) {
                e.preventDefault();
                const file = item.getAsFile();
                if (!file) continue;

                try {
                    const reader = new FileReader();

                    reader.onload = async () => {
                        if (!reader.result || typeof reader.result !== 'string') return;

                        const base64Data = reader.result;
                        const binaryData = atob(base64Data.split(',')[1]);
                        const array = new Uint8Array(binaryData.length);

                        for (let i = 0; i < binaryData.length; i++) {
                            array[i] = binaryData.charCodeAt(i);
                        }

                        const fileName = `pasted_${Date.now()}.png`;

                        await invoke('save_clipboard_image', {
                            noteId: note.id,
                            fileName,
                            imageData: Array.from(array)
                        });

                        // Get cursor position
                        const textarea = textAreaRef.current;
                        if (textarea) {
                            const startPos = textarea.selectionStart;
                            const endPos = textarea.selectionEnd;

                            // Insert image markdown at cursor position
                            const imageMarkdown = `![${fileName}](attachment://${fileName})`;
                            const newContent =
                                content.substring(0, startPos) +
                                imageMarkdown +
                                content.substring(endPos);

                            setContent(newContent);

                            // Set cursor position after inserted text
                            setTimeout(() => {
                                textarea.selectionStart =
                                    textarea.selectionEnd =
                                        startPos + imageMarkdown.length;
                                textarea.focus();
                            }, 0);
                        }

                        toast({
                            title: "Success",
                            description: "Image pasted successfully",
                        });
                    };

                    reader.readAsDataURL(file);
                } catch (error) {
                    console.error('Failed to paste image:', error);
                    toast({
                        title: "Error",
                        description: "Failed to paste image",
                        variant: "destructive",
                    });
                }
            }
        }
    };

    const customMarkdownComponents = {
        img: ({ src, alt, ...props }: any) => {
            const fileName = alt;
            const [imageSrc, setImageSrc] = React.useState<string>('');

            React.useEffect(() => {
                const loadImage = async () => {
                    try {
                        const imageData = await invoke<number[]>('serve_attachment', {
                            noteId: note.id,
                            fileName
                        });

                        const blob = new Blob([new Uint8Array(imageData)], { type: 'image/png' });
                        const url = URL.createObjectURL(blob);
                        setImageSrc(url);

                        return () => URL.revokeObjectURL(url);
                    } catch (error) {
                        console.error('Failed to load image:', error);
                        toast({
                            title: "Error",
                            description: `Failed to load image: ${fileName}`,
                            variant: "destructive",
                        });
                    }
                };

                loadImage();
            }, [fileName]);

            return (
                <img
                    src={imageSrc}
                    alt={alt || fileName}
                    className="max-w-full h-auto rounded-lg"
                    {...props}
                />
            );
        }
    };

    return (
        <div className="flex-1 flex flex-col min-h-0">
            <div className="flex justify-between items-center mb-4 flex-shrink-0">
                <input
                    type="text"
                    value={note.title}
                    onChange={(e) => onUpdateNote({ ...note, title: e.target.value })}
                    className="text-2xl font-semibold bg-transparent border-none outline-none focus:ring-0 dark:text-white"
                />
                <div className="flex items-center gap-4">
                    <Separator orientation="vertical" className="h-6" />
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onViewModeChange(viewMode === 'write' ? 'preview' : 'write')}
                    >
                        {viewMode === 'write' ? (
                            <><Eye className="h-4 w-4 mr-2" /> Preview</>
                        ) : (
                            <><Code className="h-4 w-4 mr-2" /> Edit</>
                        )}
                    </Button>
                    <div className="text-sm text-gray-400 dark:text-gray-500">
                        {new Date(Number(note.datetime) * 1000).toLocaleString("de-DE")}
                    </div>
                </div>
            </div>

            <div className="flex-1 min-h-0">
                {viewMode === 'write' ? (
                    <textarea
                        ref={textAreaRef}
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        onPaste={handlePaste}
                        className="w-full h-full resize-none bg-transparent border-none outline-none focus:ring-0 dark:text-white font-mono p-2"
                        placeholder="Start typing in Markdown..."
                    />
                ) : (
                    <div className="h-full overflow-y-auto">
                        <div className="prose prose-sm dark:prose-invert max-w-none p-2">
                            <ReactMarkdown
                                remarkPlugins={[remarkGfm]}
                                components={customMarkdownComponents}
                            >
                                {content.split('\n').slice(1).join('\n')}


                            </ReactMarkdown>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}