import React, { useRef, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { ScrollArea } from '@/components/ui/scroll-area';
import { Image, Eye, Code } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Note, ViewMode } from '@/types';
import { formatDateTime } from '@/utils/dateFormat';
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
                                                          onImageUpload
                                                      }) => {
    const textAreaRef = useRef<HTMLTextAreaElement>(null);
    const [content, setContent, undo, redo, canUndo, canRedo] = useUndoRedo(note.content);

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

            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
                handlePaste();
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [canUndo, canRedo, undo, redo]);

    useEffect(() => {
        if (content !== note.content) {
            onUpdateNote({ ...note, content });
        }
    }, [content]);

    const handlePaste = async (e?: ClipboardEvent) => {
        const clipboard = e?.clipboardData;
        if (!clipboard) return;

        const items = clipboard.items;
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image') !== -1) {
                e?.preventDefault();
                const file = items[i].getAsFile();
                if (!file) continue;

                const reader = new FileReader();
                reader.onload = async () => {
                    const base64Data = reader.result as string;
                    const binaryData = atob(base64Data.split(',')[1]);
                    const array = new Uint8Array(binaryData.length);
                    for (let i = 0; i < binaryData.length; i++) {
                        array[i] = binaryData.charCodeAt(i);
                    }

                    try {
                        const fileName = `pasted_${Date.now()}.png`;
                        await invoke('save_clipboard_image', {
                            noteId: note.id,
                            fileName,
                            imageData: Array.from(array)
                        });

                        const imageMarkdown = `![${fileName}](attachment://${fileName})`;
                        const newContent = content + '\n' + imageMarkdown;
                        setContent(newContent);
                    } catch (error) {
                        toast({
                            title: "Error",
                            description: "Failed to paste image",
                            variant: "destructive",
                        });
                    }
                };
                reader.readAsDataURL(file);
            }
        }
    };

    const customMarkdownComponents = {
        img: ({ src, alt, ...props }: any) => {
            const fileName = alt;

            // Create a data URL using the serve_attachment command
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
        <div className="flex-grow flex flex-col">
            <div className="flex justify-between items-center mb-4">
                <input
                    type="text"
                    value={note.title}
                    onChange={(e) => onUpdateNote({ ...note, title: e.target.value })}
                    className="text-2xl font-semibold bg-transparent border-none outline-none focus:ring-0 dark:text-white"
                />
                <div className="flex items-center gap-4">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={onImageUpload}
                    >
                        <Image className="h-4 w-4 mr-2" />
                        Add Image
                    </Button>
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
                        {formatDateTime(note.datetime)}
                    </div>
                </div>
            </div>
            <ScrollArea className="flex-grow">
                {viewMode === 'write' ? (
                    <textarea
                        ref={textAreaRef}
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        onPaste={handlePaste}
                        className="w-full h-[calc(100vh-200px)] resize-none bg-transparent border-none outline-none focus:ring-0 dark:text-white font-mono"
                        placeholder="Start typing in Markdown..."
                    />
                ) : (
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                        <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={customMarkdownComponents}
                        >
                            {content}
                        </ReactMarkdown>
                    </div>
                )}
            </ScrollArea>
        </div>
    );
}