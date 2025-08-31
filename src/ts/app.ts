import "./structures";
import "./storage";
import { loadTiles, saveTiles } from "./storage";

let selectedTile: Tile | null = null;
let selectedSprite: Sprite | null = null;

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
        this.grid.dataset.zoom = String(this.zoomScale);

        for (const tile in this.grid.children) {
            const element = this.grid.children[tile];
            if (element instanceof HTMLDivElement) {
                for (const child of element.children) {
                    if (child instanceof HTMLDivElement && child.classList.contains("tile-img-container")) {
                        const shiftX = Number(child.dataset.shiftX || "0");
                        const shiftY = Number(child.dataset.shiftY || "0");

                        const offsetX = shiftX * this.zoomScale;
                        const offsetY = shiftY * this.zoomScale;
                        child.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${this.zoomScale})`;
                    }
                }
            }
        }

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
            if (!selectedTile || !selectedSprite) return;
            tile.innerHTML = "";
            for (const layer of selectedSprite.layers) {
                if (layer.fileData == null) continue;
                const containerElement = document.createElement("div");
                containerElement.classList.add("tile-img-container");
                containerElement.style.width = String(layer.width) + "px";
                containerElement.style.height = String(layer.height) + "px";
                const imageElement = document.createElement("img");
                imageElement.src = layer.fileData;
                if (!layer.drawAsShadow && layer.variants > 1) {
                    const rand = Math.floor(Math.random() * ((layer.variants - 1) - 0 + 1) + 0);
                    imageElement.style.left = "-" + String(rand * layer.width) + "px";
                }
                containerElement.dataset.shiftX = String(layer.shiftX * 2); // 2* shift due to browser scaling
                containerElement.dataset.shiftY = String(layer.shiftY * 2); // 2* shift due to browser scaling
                let shiftX = layer.shiftX * 2 * this.zoomScale;
                let shiftY = layer.shiftY * 2 * this.zoomScale;
                containerElement.style.transform = `translate(${shiftX}px, ${shiftY}px) scale(${this.zoomScale})`;
                containerElement.appendChild(imageElement);
                if (layer.drawAsShadow) {
                    tile.prepend(containerElement);
                } else {
                    tile.appendChild(containerElement);
                }
            }
        } else if (button === 2) {
            tile.innerHTML = "";
        }
    }

    public getTileAt(x: number, y: number): HTMLDivElement | null {
        return this.grid.querySelector<HTMLDivElement>(`.tile[data-x="${x}"][data-y="${y}"]`);
    }

    public resetFrameHistory(): void {
        this.hoveredTilesThisFrame.clear();
    }
}

function createTileManagerTileElement(tile: Tile): HTMLDivElement {
    const tileElement = document.createElement("div");
    tileElement.innerText = tile.name;
    tileElement.classList.add("tm-tile");
    tileElement.onclick = function () {
        currentTile = tile;
        openMenu("tile-editor-menu");
    };
    return tileElement;
}

function createTileEditorSpriteElement(sprite: Sprite): HTMLDivElement {
    const spriteElement = document.createElement("div");
    spriteElement.innerText = sprite.property || "(no property)";
    spriteElement.classList.add("te-sprite");
    spriteElement.onclick = function () {
        currentSprite = sprite;
        openMenu("sprite-editor-menu");
    };
    return spriteElement;
}

function createSpriteEditorLayerElement(layer: SpriteLayer): HTMLDivElement {
    const layerElement = document.createElement("div");
    layerElement.innerText = layer.fileName ? layer.fileName : "(no file)";
    layerElement.classList.add("se-layer");
    layerElement.onclick = function () {
        currentSpriteLayer = layer;
        openMenu("sprite-layer-editor-menu");
    };
    return layerElement;
}

const tiles = loadTiles();
window.tiles = tiles;
let currentTile: Tile | null = null;
let currentSprite: Sprite | null = null;
let currentSpriteLayer: SpriteLayer | null = null;
let currentMenu: string | null = null;

function persist() {
    saveTiles(tiles);
}

function openMenu(menuId: string): void {
    if (currentMenu) {
        closeMenu(currentMenu, true);
    }
    currentMenu = menuId;
    const menu = document.getElementById(menuId) as HTMLDivElement | null;
    if (menu) {
        if (menuId == "tile-manager-menu") {
            const teTileList = document.getElementById("tm-tile-list") as HTMLDivElement | null;
            if (teTileList) {
                teTileList.innerHTML = "";
                for (const tile of tiles) {
                    const tileElement = createTileManagerTileElement(tile);
                    teTileList.appendChild(tileElement);
                }
            }
        } else if (menuId == "tile-editor-menu") {
            const teTileNameInput = document.getElementById("te-tile-name") as HTMLInputElement | null;
            if (teTileNameInput && currentTile) {
                teTileNameInput.value = currentTile.name;
            }
            const teTileSpriteList = document.getElementById("te-tile-list") as HTMLInputElement | null;
            if (teTileSpriteList && currentTile) {
                teTileSpriteList.innerHTML = "";
                for (const sprite of currentTile.sprites) {
                    const spriteElement = createTileEditorSpriteElement(sprite);
                    teTileSpriteList.appendChild(spriteElement);
                }
            }
        } else if (menuId == "sprite-editor-menu") {
            const sePropertyInput = document.getElementById("se-property") as HTMLInputElement | null;
            if (sePropertyInput && currentSprite) {
                sePropertyInput.value = currentSprite.property;
            }
            const seSpriteLayerList = document.getElementById("se-sprite-layers") as HTMLInputElement | null;
            if (seSpriteLayerList && currentSprite) {
                seSpriteLayerList.innerHTML = "";
                for (const layer of currentSprite.layers) {
                    const layerElement = createSpriteEditorLayerElement(layer);
                    seSpriteLayerList.appendChild(layerElement);
                }
            }
        } else if (menuId == "sprite-layer-editor-menu") {
            const slePicturePreview = document.getElementById("sle-picture-preview") as HTMLImageElement | null;
            if (slePicturePreview && currentSpriteLayer && currentSpriteLayer.fileData != null) {
                slePicturePreview.src = currentSpriteLayer.fileData;
            }
            const sleLayerWidthInput = document.getElementById("sle-layer-width") as HTMLInputElement | null;
            if (sleLayerWidthInput && currentSpriteLayer) {
                sleLayerWidthInput.value = currentSpriteLayer.width.toString();
            }
            const sleLayerHeightInput = document.getElementById("sle-layer-height") as HTMLInputElement | null;
            if (sleLayerHeightInput && currentSpriteLayer) {
                sleLayerHeightInput.value = currentSpriteLayer.height.toString();
            }
            const sleLayerVariantsInput = document.getElementById("sle-layer-variants") as HTMLInputElement | null;
            if (sleLayerVariantsInput && currentSpriteLayer) {
                sleLayerVariantsInput.value = currentSpriteLayer.variants.toString();
            }
            const sleLayerShiftXInput = document.getElementById("sle-layer-shift-x") as HTMLInputElement | null;
            if (sleLayerShiftXInput && currentSpriteLayer) {
                sleLayerShiftXInput.value = currentSpriteLayer.shiftX.toString();
            }
            const sleLayerShiftYInput = document.getElementById("sle-layer-shift-y") as HTMLInputElement | null;
            if (sleLayerShiftYInput && currentSpriteLayer) {
                sleLayerShiftYInput.value = currentSpriteLayer.shiftY.toString();
            }
            const sleLayerDrawAsShadowInput = document.getElementById("sle-layer-draw-as-shadow") as HTMLInputElement | null;
            if (sleLayerDrawAsShadowInput && currentSpriteLayer) {
                sleLayerDrawAsShadowInput.checked = currentSpriteLayer.drawAsShadow;
            }
        }
        menu.classList.remove("hidden");
    }
}
window.openMenu = openMenu;

function closeMenu(menuId: string, preserveTile: boolean): void {
    const menu = document.getElementById(menuId) as HTMLDivElement | null;
    if (menu) {
        menu.classList.add("hidden");
    }
    if (!preserveTile) {
        currentTile = null;
        currentSprite = null;
        currentSpriteLayer = null;
    }
    currentMenu = null;
}
window.closeMenu = closeMenu;

function initControls(): void {
    const closeControls = document.querySelectorAll(".menu-close") as NodeListOf<HTMLButtonElement>;
    closeControls.forEach(control => {
        control.onclick = function () {
            const menu = control.closest(".menu") as HTMLDivElement | null;
            if (menu) {
                closeMenu(menu.id, false);
            }
        };
    });

    const tileManagerControl = document.querySelector("#control-open-tile-manager > button") as HTMLButtonElement | null;
    if (!tileManagerControl) {
        console.error("Tile Manager control not found");
    } else {
        tileManagerControl.onclick = function () {
            openMenu("tile-manager-menu");
        };
    }

    const tmCreateTileControl = document.querySelector("#tm-create-tile-control > button") as HTMLButtonElement | null;
    if (!tmCreateTileControl) {
        console.error("Create Tile control not found");
    } else {
        tmCreateTileControl.onclick = function () {
            currentTile = {
                id: crypto.randomUUID(),
                name: "New Tile",
                sprites: []
            };
            openMenu("tile-editor-menu");
        };
    }

    const teDiscardChangesControl = document.querySelector("#te-discard-changes-control > button") as HTMLButtonElement | null;
    if (!teDiscardChangesControl) {
        console.error("Discard Changes control not found");
    } else {
        teDiscardChangesControl.onclick = function () {
            currentTile = null; // discard changes, don't save
            openMenu("tile-manager-menu");
        };
    }

    const teSaveChangesControl = document.querySelector("#te-save-changes-control > button") as HTMLButtonElement | null;
    if (!teSaveChangesControl) {
        console.error("Save Changes control not found");
    } else {
        teSaveChangesControl.onclick = function () {
            if (currentTile) {
                const teTileNameInput = document.getElementById("te-tile-name") as HTMLInputElement | null;
                if (teTileNameInput) {
                    currentTile.name = teTileNameInput.value;
                }
                let found: boolean = false;
                for (let i = 0; i < tiles.length; i++) {
                    if (tiles[i].id === currentTile.id) {
                        tiles[i] = currentTile;
                        found = true;
                        break;
                    }
                }
                if (!found) {
                    tiles.push(currentTile);
                }
                // TODO: Add a tile/sprite selector hotbar at the bottom
                selectedTile = currentTile;
                selectedSprite = currentTile.sprites.length > 0 ? currentTile.sprites[0] : null;
            }
            persist();
            openMenu("tile-manager-menu");
        };
    }

    const teAddSpriteControl = document.querySelector("#te-add-sprite-control > button") as HTMLButtonElement | null;
    if (!teAddSpriteControl) {
        console.error("Add Sprite control not found");
    } else {
        teAddSpriteControl.onclick = function () {
            teSaveChangesControl?.click();
            currentSprite = {
                id: crypto.randomUUID(),
                property: "",
                layers: []
            };
            openMenu("sprite-editor-menu");
        };
    }

    const seDiscardChangesControl = document.querySelector("#se-discard-changes-control > button") as HTMLButtonElement | null;
    if (!seDiscardChangesControl) {
        console.error("Discard Changes control not found");
    } else {
        seDiscardChangesControl.onclick = function () {
            currentSprite = null; // discard changes, don't save
            openMenu("tile-editor-menu");
        };
    }

    const seSaveChangesControl = document.querySelector("#se-save-changes-control > button") as HTMLButtonElement | null;
    if (!seSaveChangesControl) {
        console.error("Save Changes control not found");
    } else {
        seSaveChangesControl.onclick = function () {
            if (currentSprite && currentTile) {
                const sePropertyInput = document.getElementById("se-property") as HTMLInputElement | null;
                if (sePropertyInput) {
                    currentSprite.property = sePropertyInput.value;
                }
                const seSpriteLayerList = document.getElementById("se-layer-list") as HTMLInputElement | null;
                if (seSpriteLayerList) {
                    currentSprite.layers = [];
                }
                let found: boolean = false;
                for (let i = 0; i < currentTile.sprites.length; i++) {
                    if (currentTile.sprites[i].id === currentSprite.id) {
                        currentTile.sprites[i] = currentSprite;
                        found = true;
                        break;
                    }
                }
                if (!found) {
                    currentTile.sprites.push(currentSprite);
                }
            }
            persist();
            openMenu("tile-editor-menu");
        };
    }

    const seAddSpriteLayerControl = document.querySelector("#se-add-sprite-layer-control > button") as HTMLButtonElement | null;
    if (!seAddSpriteLayerControl) {
        console.error("Add Sprite Layer control not found");
    } else {
        seAddSpriteLayerControl.onclick = function () {
            seSaveChangesControl?.click();
            currentSpriteLayer = {
                id: crypto.randomUUID(),
                fileName: null,
                fileData: null,
                width: 0,
                height: 0,
                variants: 1,
                shiftX: 0,
                shiftY: 0,
                drawAsShadow: false
            };
            openMenu("sprite-layer-editor-menu");
        };
    }

    const slePictureUpload = document.querySelector("#sle-picture-upload") as HTMLInputElement | null;
    if (!slePictureUpload) {
        console.error("Picture Upload control not found");
    } else {
        slePictureUpload.onchange = function () {
            const file = slePictureUpload.files?.[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = function (e) {
                    const img = document.getElementById("sle-picture-preview") as HTMLImageElement | null;
                    if (img) {
                        img.src = e.target?.result as string;
                        img.style.display = "block";
                    }
                };
                reader.readAsDataURL(file);
            }
        };
    }

    const sleDiscardChangesControl = document.querySelector("#sle-discard-changes-control > button") as HTMLButtonElement | null;
    if (!sleDiscardChangesControl) {
        console.error("Discard Changes control not found");
    } else {
        sleDiscardChangesControl.onclick = function () {
            currentSpriteLayer = null; // discard changes, don't save
            openMenu("sprite-editor-menu");
        };
    }

    const sleSaveChangesControl = document.querySelector("#sle-save-changes-control > button") as HTMLButtonElement | null;
    if (!sleSaveChangesControl) {
        console.error("Save Changes control not found");
    } else {
        sleSaveChangesControl.onclick = function () {
            if (currentSpriteLayer && currentSprite && currentTile) {
                const sleFileInput = document.getElementById("sle-picture-upload") as HTMLInputElement | null;
                const sleWidthInput = document.getElementById("sle-width") as HTMLInputElement | null;
                const sleHeightInput = document.getElementById("sle-height") as HTMLInputElement | null;
                const sleVariantsInput = document.getElementById("sle-variants") as HTMLInputElement | null;
                const sleOffsetXInput = document.getElementById("sle-offset-x") as HTMLInputElement | null;
                const sleOffsetYInput = document.getElementById("sle-offset-y") as HTMLInputElement | null;
                const sleDrawAsShadowInput = document.getElementById("sle-draw-as-shadow") as HTMLInputElement | null;

                if (sleFileInput && sleFileInput.files != null && sleFileInput.files.length > 0) {
                    if (sleFileInput && sleFileInput.files && sleFileInput.files.length > 0) {
                        const file = sleFileInput.files[0];
                        currentSpriteLayer.fileName = file.name;
                        const reader = new FileReader();
                        reader.onload = () => {
                            if (currentSpriteLayer == null) return;
                            currentSpriteLayer.fileData = reader.result as string;
                        };
                        reader.readAsDataURL(file);
                    }
                }
                if (sleWidthInput) currentSpriteLayer.width = Number(sleWidthInput.value);
                if (sleHeightInput) currentSpriteLayer.height = Number(sleHeightInput.value);
                if (sleVariantsInput) currentSpriteLayer.variants = Number(sleVariantsInput.value);
                if (sleOffsetXInput) currentSpriteLayer.shiftX = Number(sleOffsetXInput.value);
                if (sleOffsetYInput) currentSpriteLayer.shiftY = Number(sleOffsetYInput.value);
                if (sleDrawAsShadowInput) currentSpriteLayer.drawAsShadow = sleDrawAsShadowInput.checked;

                let found: boolean = false;
                for (const layer of currentSprite.layers) {
                    if (layer.id === currentSpriteLayer.id) {
                        found = true;
                        break;
                    }
                }
                if (!found) {
                    currentSprite.layers.push(currentSpriteLayer);
                }
                persist();
                openMenu("sprite-editor-menu");
            }
        };
    }

    const changeBackgroundControl = document.querySelector("#control-background > button") as HTMLButtonElement | null;
    if (!changeBackgroundControl) {
        console.error("Change Background control not found");
    } else {
        changeBackgroundControl.onclick = function () {
            const grid = document.getElementById("grid") as HTMLDivElement | null;
            if (!grid) return;
            const num = Number(grid.dataset.background);
            grid.dataset.background = isNaN(num) ? "1" : String((num + 1) % 3);
            changeBackgroundControl.innerText = String(Number(grid.dataset.background) + 1);
        };
    }
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
        if (currentMenu != null) return;
        const key = e.key.toLowerCase();
        if (["w", "a", "s", "d"].includes(key)) {
            keys.add(key);
            e.preventDefault();
        }
    });

    document.addEventListener("keyup", e => {
        if (currentMenu != null) return;
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
        if (currentMenu != null) {
            // ...
        } else {
            if (keys.has("w")) offsetY += panSpeed;
            if (keys.has("s")) offsetY -= panSpeed;
            if (keys.has("a")) offsetX += panSpeed;
            if (keys.has("d")) offsetX -= panSpeed;

            grid.style.transform = `translate3d(calc(-50% + ${offsetX}px), calc(-50% + ${offsetY}px), 0)`;

            gridInstance.updateMouseHover();
            gridInstance.resetFrameHistory();
        }
        requestAnimationFrame(animate);
    };

    requestAnimationFrame(animate);
});
