class TileGrid {
    private readonly grid: HTMLDivElement;
    private readonly rows: number;
    private readonly cols: number;

    private readonly tileSizes: number[] = [16, 32, 48, 64, 80, 96, 112, 128];
    private zoomIndex: number;
    private lastZoomAt = 0;
    private readonly zoomDelay = 240;

    private isPointerDown = false;
    private pointerX = 0;
    private pointerY = 0;
    private pointerButton: number | null = null;

    private hoveredTilesThisFrame: Set<string> = new Set();
    private hoveredTilesDuringDrag: Set<string> = new Set();

    constructor(gridId: string, rows: number, cols: number, baseTileSize: number = 64) {
        const gridEl = document.getElementById(gridId);
        if (!(gridEl instanceof HTMLDivElement)) throw new Error(`Grid element with id "${gridId}" not found or not a div`);

        this.grid = gridEl;
        this.rows = rows;
        this.cols = cols;

        const nearestIndex = this.tileSizes.indexOf(baseTileSize);
        this.zoomIndex = nearestIndex >= 0 ? nearestIndex : 3;

        this.createTiles();
        this.applyZoom(true);
        this.bindEvents();
    }

    // Scale factor relative to 64px base size
    private get zoomScale(): number {
        const baseSize = 64;
        return this.tileSizes[this.zoomIndex] / baseSize;
    }

    private createTiles(): void {
        const fragment = document.createDocumentFragment();
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                const tile = document.createElement("div");
                tile.className = "tile";
                tile.dataset.x = String(c);
                tile.dataset.y = String(r);
                fragment.appendChild(tile);
            }
        }
        this.grid.appendChild(fragment);
    }

    private bindEvents(): void {
        this.grid.addEventListener(
            "wheel",
            e => {
                e.preventDefault();
                const now = performance.now();
                if (now - this.lastZoomAt < this.zoomDelay) return;
                this.lastZoomAt = now;
                this.updateZoom(e.deltaY);
                this.applyZoom();
            },
            { passive: false }
        );

        this.grid.addEventListener("pointerdown", e => {
            this.isPointerDown = true;
            this.pointerButton = e.button;
            this.pointerX = e.clientX;
            this.pointerY = e.clientY;
        });

        window.addEventListener("pointerup", () => {
            this.isPointerDown = false;
            this.pointerButton = null;
            this.hoveredTilesDuringDrag.clear();
        });

        window.addEventListener("pointermove", e => {
            this.pointerX = e.clientX;
            this.pointerY = e.clientY;
        });
    }

    private updateZoom(deltaY: number): void {
        this.zoomIndex = deltaY < 0 ? Math.min(this.zoomIndex + 1, this.tileSizes.length - 1) : Math.max(this.zoomIndex - 1, 0);
    }

    private applyZoom(first = false): void {
        const tileSize = this.tileSizes[this.zoomIndex];
        this.grid.style.setProperty("--tile", `${tileSize}px`);

        if (first) {
            this.grid.style.gridTemplateRows = `repeat(${this.rows}, var(--tile))`;
            this.grid.style.gridTemplateColumns = `repeat(${this.cols}, var(--tile))`;
        }

        // scale background relative to base (64px = 100%)
        const baseTileSize = 128;
        const scale = tileSize / baseTileSize;

        const baseBgWidth = 3456;
        const baseBgHeight = 2160;

        this.grid.style.backgroundSize = `${baseBgWidth * scale}px ${baseBgHeight * scale}px`;
    }

    public updateMouseHover(): void {
        if (!this.isPointerDown || this.pointerButton == null) return;

        const element = document.elementFromPoint(this.pointerX, this.pointerY);
        if (element && element.classList.contains("tile")) {
            const xAttr = element.getAttribute("data-x");
            const yAttr = element.getAttribute("data-y");
            if (xAttr == null || yAttr == null) return;

            const x = Number(xAttr);
            const y = Number(yAttr);
            const key = `${x},${y}`;

            if (!this.hoveredTilesThisFrame.has(key) && !this.hoveredTilesDuringDrag.has(key)) {
                this.hoveredTilesThisFrame.add(key);
                this.hoveredTilesDuringDrag.add(key);
                this.onTileHoverWhileDown(x, y, element as HTMLDivElement, this.pointerButton);
            }
        }
    }

    protected onTileHoverWhileDown(x: number, y: number, tile: HTMLDivElement, button: number): void {
        if (button === 0) {
            tile.style.backgroundColor = "rgba(255, 255, 255, 0.5)";
        } else if (button === 2) {
            tile.style.backgroundColor = "";
        }
    }

    public getTileAt(x: number, y: number): HTMLDivElement | null {
        return this.grid.querySelector<HTMLDivElement>(`.tile[data-x="${x}"][data-y="${y}"]`);
    }

    public setTileBackground(x: number, y: number, imageUrl: string): void {
        const tile = this.getTileAt(x, y);
        if (!tile) return;

        const scale = this.zoomScale * 100;
        tile.style.backgroundImage = `url(${imageUrl})`;
        tile.style.backgroundSize = `${scale}% ${scale}%`;
    }

    public resetFrameHistory(): void {
        this.hoveredTilesThisFrame.clear();
    }
}

function initControls(): void {
    const changeBackgroundControl = document.querySelector("#control-background > button") as HTMLButtonElement | null;
    if (!changeBackgroundControl) return;

    changeBackgroundControl.onclick = function () {
        const grid = document.getElementById("grid") as HTMLDivElement | null;
        if (!grid) return;
        const num = Number(grid.dataset.background);
        grid.dataset.background = isNaN(num) ? "1" : String((num + 1) % 3);
        changeBackgroundControl.innerText = String(Number(grid.dataset.background) + 1);
    };
}

document.addEventListener("DOMContentLoaded", () => {
    const gridInstance = new TileGrid("grid", 16, 24, 64);

    const grid = document.getElementById("grid") as HTMLDivElement;
    let offsetX = 0;
    let offsetY = 0;
    const panSpeed = 6;
    const keys = new Set<string>();

    document.addEventListener("contextmenu", e => e.preventDefault());

    document.addEventListener("keydown", e => {
        const key = e.key.toLowerCase();
        if (["w", "a", "s", "d"].includes(key)) {
            keys.add(key);
            e.preventDefault();
        }
    });

    document.addEventListener("keyup", e => {
        const key = e.key.toLowerCase();
        if (["w", "a", "s", "d"].includes(key)) {
            keys.delete(key);
            e.preventDefault();
        }
    });

    // Prevent stuck keys when the tab loses focus
    window.addEventListener("blur", () => keys.clear());
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState !== "visible") keys.clear();
    });

    initControls();

    const animate = (): void => {
        if (keys.has("w")) offsetY += panSpeed;
        if (keys.has("s")) offsetY -= panSpeed;
        if (keys.has("a")) offsetX += panSpeed;
        if (keys.has("d")) offsetX -= panSpeed;

        grid.style.transform = `translate3d(calc(-50% + ${offsetX}px), calc(-50% + ${offsetY}px), 0)`;

        gridInstance.updateMouseHover();
        gridInstance.resetFrameHistory();

        requestAnimationFrame(animate);
    };

    requestAnimationFrame(animate);
});
