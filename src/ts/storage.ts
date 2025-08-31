import "./structures";

const STORAGE_KEY = "tiles";

// --- Helpers ---
function fileToDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// --- API ---
export async function saveTiles(tiles: Tile[]): Promise<void> {
    const serializable: any[] = [];

    // collect slot assignments from DOM
    const slotAssignments: Record<string, number> = {};
    const slots = document.querySelectorAll<HTMLSpanElement>(".slot");
    slots.forEach((slot) => {
        if (slot.dataset.tileId) {
            const tileId = slot.dataset.tileId;
            const slotNumber = Number(slot.id.replace("slot-", ""));
            slotAssignments[tileId] = slotNumber;
        }
    });

    for (const tile of tiles) {
        const sprites = [];
        for (const sprite of tile.sprites) {
            const layers = [];
            for (const layer of sprite.layers) {
                let fileData = layer.fileData;
                let fileName = layer.fileName;

                // If runtime code temporarily attached a File object, convert it
                if ((layer as any).file instanceof File) {
                    fileData = await fileToDataUrl((layer as any).file);
                    fileName = (layer as any).file.name;
                }

                layers.push({
                    ...layer,
                    fileName,
                    fileData,
                });
            }
            sprites.push({ ...sprite, layers });
        }

        serializable.push({
            ...tile,
            sprites,
            assignedSlot: slotAssignments[tile.id] ?? null, // store slot if assigned
        });
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(serializable));
}

export function loadTiles(): Tile[] {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    try {
        const tiles = JSON.parse(raw) as (Tile & { assignedSlot?: number | null })[];

        // restore slot assignments in DOM
        tiles.forEach((tile) => {
            if (tile.assignedSlot != null) {
                const slotEl = document.getElementById(`slot-${tile.assignedSlot}`) as HTMLSpanElement | null;
                if (slotEl) {
                    for (const child of slotEl.children) {
                        if (child instanceof HTMLImageElement) {
                            for (const sprite of tile.sprites) {
                                for (const layer of sprite.layers) {
                                    if (layer.fileData && !layer.drawAsShadow) {
                                        child.src = layer.fileData;
                                    }
                                }
                            }
                        }
                    }
                    slotEl.dataset.tileId = tile.id;
                }
            }
        });

        return tiles;
    } catch (err) {
        console.warn("Failed to parse tiles from localStorage", err);
        return [];
    }
}

export function clearTiles(): void {
    localStorage.removeItem(STORAGE_KEY);

    // clear all slot assignments from DOM
    const slots = document.querySelectorAll<HTMLSpanElement>(".slot");
    slots.forEach((slot) => {
        slot.dataset.tileId = "";
    });
}