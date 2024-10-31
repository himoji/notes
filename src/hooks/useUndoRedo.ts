import { useState, useCallback } from 'react';

interface HistoryState<T> {
    past: T[];
    present: T;
    future: T[];
}

export const useUndoRedo = <T>(initialPresent: T) => {
    const [state, setState] = useState<HistoryState<T>>({
        past: [],
        present: initialPresent,
        future: []
    });

    const canUndo = state.past.length > 0;
    const canRedo = state.future.length > 0;

    const undo = useCallback(() => {
        setState(currentState => {

            if (currentState.past.length === 0) return currentState;

            const previous = currentState.past[currentState.past.length - 1];
            const newPast = currentState.past.slice(0, -1);
            console.log({
                past: newPast,
                present: previous,
                future: [currentState.present, ...currentState.future]
            });
            return {
                past: newPast,
                present: previous,
                future: [currentState.present, ...currentState.future]
            };
        });
    }, []);

    const redo = useCallback(() => {
        setState(currentState => {
            if (currentState.future.length === 0) return currentState;

            const next = currentState.future[0];
            const newFuture = currentState.future.slice(1);
            console.log({
                past: [...currentState.past, currentState.present],
                present: next,
                future: newFuture
            });
            return {
                past: [...currentState.past, currentState.present],
                present: next,
                future: newFuture
            };
        });
    }, []);

    const set = useCallback((newPresent: T) => {
        setState(currentState => ({
            past: [...currentState.past, currentState.present],
            present: newPresent,
            future: []
        }));
    }, []);

    return [state.present, set, undo, redo, canUndo, canRedo] as const;
};