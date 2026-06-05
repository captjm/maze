// src/components/GraphEditor/helpers.ts
export function hue(id: string): number {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    return h % 360;
}

export const accent = (id: string) => `hsl(${hue(id)},70%,55%)`;
export const nodeBg = (id: string) => `hsl(${hue(id)},18%,13%)`;