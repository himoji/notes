export interface Note {
    id: string;
    title: string;
    content: string;
    datetime: string;
    attachments: string[];
}

export type ViewMode = 'write' | 'preview';