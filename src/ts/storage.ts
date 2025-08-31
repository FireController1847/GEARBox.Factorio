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
    const serializable: Tile[] = [];

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
                    fileData
                });
            }
            sprites.push({ ...sprite, layers });
        }
        serializable.push({ ...tile, sprites });
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(serializable));
}

export function loadTiles(): Tile[] {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    try {
        return JSON.parse(raw) as Tile[];
    } catch (err) {
        console.warn("Failed to parse tiles from localStorage", err);
        return [];
    }
}

export function clearTiles(): void {
    localStorage.removeItem(STORAGE_KEY);
}
