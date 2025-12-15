export enum AppMode {
    TREE = 'TREE',
    SCATTER = 'SCATTER',
    FOCUS = 'FOCUS'
}

export interface HandData {
    x: number; // Normalized 0-1
    y: number; // Normalized 0-1
    gesture: 'OPEN' | 'CLOSED' | 'PINCH' | 'NONE';
    pinchDistance: number;
}

export type ParticleType = 'SPHERE' | 'CUBE' | 'TRIANGLE' | 'GIFT' | 'SOCK' | 'BELL' | 'TIE' | 'TREE' | 'SANTA' | 'PHOTO';

export interface ParticleConfig {
    count: number;
    treeHeight: number;
    treeRadius: number;
}