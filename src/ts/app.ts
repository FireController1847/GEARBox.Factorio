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
                tile.addEventListener("contextmenu", e => e.preventDefault());
                tile.addEventListener("pointerenter", () => {
                    if (this.isPointerDown && this.pointerButton === 2) {
                        (tile as HTMLDivElement).innerHTML = "";
                    }
                });
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

        this.hoveredTilesDuringDrag.clear();
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

    public placeTile(x: number, y: number, proposedTile: Tile, proposedSprite: Sprite): void {
        const tile = this.getTileAt(x, y);
        if (!tile) return;
        tile.innerHTML = "";
        tile.dataset.assignedTile = proposedTile.id;
        tile.dataset.assignedSprite = proposedSprite.id;
        for (const layer of proposedSprite.layers) {
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
    }

    protected onTileHoverWhileDown(x: number, y: number, tile: HTMLDivElement, button: number): void {
        if (button === 0) {
            if (!selectedTile || !selectedSprite) return;
            this.placeTile(x, y, selectedTile, selectedSprite);
        } else if (button === 2) {
            tile.innerHTML = "";
            tile.dataset.assignedTile = "";
            tile.dataset.assignedSprite = "";
        }
    }

    public getTileAt(x: number, y: number): HTMLDivElement | null {
        return this.grid.querySelector<HTMLDivElement>(`.tile[data-x="${x}"][data-y="${y}"]`);
    }

    public convertPointerPosToTileCoords(): { x: number; y: number } | null {
        const pointerPos = this.getPointerPosition();
        if (pointerPos == null) return null;

        // Get the grid's current on-screen rectangle
        const rect = this.grid.getBoundingClientRect();

        // Pointer position relative to grid's top-left corner
        const relX = pointerPos.x - rect.left;
        const relY = pointerPos.y - rect.top;

        // Actual tile size at current zoom
        const tileSize = this.tileSizes[this.zoomIndex];

        // Compute column/row
        const x = Math.floor(relX / tileSize);
        const y = Math.floor(relY / tileSize);

        // Clamp to grid bounds
        if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) return null;

        return { x, y };
    }

    public getPointerPosition(): { x: number; y: number } | null {
        if (this.pointerX != null && this.pointerY != null) {
            return { x: this.pointerX, y: this.pointerY };
        }
        return null;
    }

    public resetFrameHistory(): void {
        this.hoveredTilesThisFrame.clear();
    }
}

function updateSelectorList(tileId: string | undefined): void {
    const slotSelector = document.getElementById("hotbar-selector") as HTMLDivElement | null;
    const slotSelectorList = document.getElementById("hotbar-selector-list") as HTMLUListElement | null;
    if (slotSelector != null && slotSelectorList != null && tileId != null) {
        slotSelectorList.innerHTML = "";
        const tile = tiles.find(t => t.id === tileId);
        if (tile) {
            slotSelector.classList.remove("hidden");
            for (const sprite of tile.sprites) {
                const li = document.createElement("li");
                li.dataset.tileId = tile.id;
                li.dataset.spriteId = sprite.id;
                if (sprite.id === selectedSprite?.id) {
                    li.classList.add("selected");
                }
                li.onclick = function () {
                    selectedTile = tile;
                    selectedSprite = sprite;
                    for (const child of slotSelectorList.children) {
                        child.classList.remove("selected");
                    }
                    li.classList.add("selected");
                };
                const small = document.createElement("small");
                small.innerText = sprite.property || "(no property)";
                li.appendChild(small);
                const img = document.createElement("img");
                for (const layer of sprite.layers) {
                    if (layer.fileData != null && !layer.drawAsShadow) {
                        img.src = layer.fileData;
                    }
                }
                // If still blank, allow for the shadow
                if (img.src == "") {
                    for (const layer of sprite.layers) {
                        if (layer.fileData != null) {
                            img.src = layer.fileData;
                        }
                    }
                }
                li.appendChild(img);
                slotSelectorList.appendChild(li);
            }
        } else {
            selectedTile = null;
            selectedSprite = null;
            slotSelector.classList.add("hidden");
        }
    }
}

function selectSlot(slot: number): void {
    if (slot < 1 || slot > 10) return;
    const slotElement = document.getElementById(`slot-${slot}`) as HTMLSpanElement | null;
    if (slotElement != null) {
        for (let i = 1; i <= 10; i++) {
            const otherSlot = document.getElementById(`slot-${i}`) as HTMLSpanElement | null;
            if (otherSlot) {
                otherSlot.classList.remove("selected");
            }
        }
        slotElement.classList.add("selected");

        const slotSelector = document.getElementById("hotbar-selector") as HTMLDivElement | null;
        const slotSelectorList = document.getElementById("hotbar-selector-list") as HTMLUListElement | null;
        if (slotSelector != null && slotSelectorList != null) {
            const tile = tiles.find(t => t.id === slotElement.dataset.tileId);
            if (tile != null) {
                selectedTile = tile;
                selectedSprite = tile.sprites.length > 0 ? tile.sprites[0] : null;
            }
            updateSelectorList(slotElement.dataset.tileId);
        }
    }
}

function createTileManagerSlotElement(tile: Tile): HTMLDivElement {
    const slotElement = document.createElement("input");
    slotElement.type = "number";
    slotElement.min = "0";
    slotElement.max = "10";
    const slots = document.getElementsByClassName("slot");
    let found: boolean = false;
    for (let i = 0; i < slots.length; i++) {
        const slot = slots[i] as HTMLSpanElement;
        if (slot.dataset.tileId === tile.id) {
            slotElement.value = String(i + 1);
            found = true;
        }
    }
    if (!found) {
        slotElement.value = "0";
    }
    let lastValue: number = Number(slotElement.value);
    slotElement.onchange = function () {
        const value = Number(slotElement.value);
        const direction = value > lastValue ? 1 : value < lastValue ? -1 : 0;
        lastValue = value;
        const slot = document.getElementById(`slot-${value}`) as HTMLSpanElement | null;
        if (slot != null) {
            console.log(slot.dataset.tileId);
            if (slot.dataset.tileId != "") {
                if (direction === 1) {
                    slotElement.value = String(value + 1);
                } else {
                    slotElement.value = String(value - 1);
                }
                lastValue = Number(slotElement.value);
                return;
            } else {
                for (let i = 1; i <= 10; i++) {
                    const otherSlot = document.getElementById(`slot-${i}`) as HTMLSpanElement | null;
                    if (otherSlot && otherSlot.dataset.tileId === tile.id) {
                        otherSlot.dataset.tileId = "";
                        for (const child of otherSlot.children) {
                            if (child instanceof HTMLImageElement) {
                                child.src = "";
                            }
                        }
                    }
                }
                for (const child of slot.children) {
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
                slot.dataset.tileId = tile.id;
            }
            persist();
        } else if (value == 0) {
            const slots = document.getElementsByClassName("slot");
            for (const slot of slots) {
                const otherSlot = slot as HTMLSpanElement;
                if (otherSlot.dataset.tileId === tile.id) {
                    otherSlot.dataset.tileId = "";
                    for (const child of otherSlot.children) {
                        if (child instanceof HTMLImageElement) {
                            child.src = "";
                        }
                    }
                    persist();
                }
            }
        }
        if (value < 0 || value > 10) {
            slotElement.value = "0";
        }
    };
    slotElement.onclick = function (e) {
        e.stopPropagation();
    };
    return slotElement;
}

function createTileManagerTileElement(tile: Tile): HTMLDivElement {
    const slotLabelElement = document.createElement("label");
    slotLabelElement.innerText = "Slot: ";
    const slotElement = createTileManagerSlotElement(tile);
    const spacerElement = document.createElement("div");
    spacerElement.classList.add("spacer");
    const tileElement = document.createElement("div");
    tileElement.innerText = tile.name;
    tileElement.classList.add("tm-tile");
    tileElement.onclick = function () {
        currentTile = tile;
        openMenu("tile-editor-menu");
    };
    tileElement.appendChild(spacerElement);
    tileElement.appendChild(slotLabelElement);
    tileElement.appendChild(slotElement);
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
    const hotbarSelector = document.getElementById("hotbar-contents") as HTMLDivElement | null;
    if (hotbarSelector) {
        const selectedSlot = hotbarSelector.querySelector("span.selected") as HTMLSpanElement | null;
        if (selectedSlot) {
            selectSlot(Number(selectedSlot.id.replace("slot-", "")));
        }
    }
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
            const sleFileUpload = document.getElementById("sle-picture-upload") as HTMLInputElement | null;
            if (sleFileUpload) {
                sleFileUpload.value = "";
            }
            const slePicturePreview = document.getElementById("sle-picture-preview") as HTMLImageElement | null;
            if (slePicturePreview) {
                if (currentSpriteLayer && currentSpriteLayer.fileData != null) {
                    slePicturePreview.src = currentSpriteLayer.fileData;
                } else {
                    slePicturePreview.src = "";
                }
            }
            const sleLayerWidthInput = document.getElementById("sle-width") as HTMLInputElement | null;
            if (sleLayerWidthInput && currentSpriteLayer) {
                sleLayerWidthInput.value = currentSpriteLayer.width.toString();
            }
            const sleLayerHeightInput = document.getElementById("sle-height") as HTMLInputElement | null;
            if (sleLayerHeightInput && currentSpriteLayer) {
                sleLayerHeightInput.value = currentSpriteLayer.height.toString();
            }
            const sleLayerVariantsInput = document.getElementById("sle-variants") as HTMLInputElement | null;
            if (sleLayerVariantsInput && currentSpriteLayer) {
                sleLayerVariantsInput.value = currentSpriteLayer.variants.toString();
            }
            const sleLayerShiftXInput = document.getElementById("sle-offset-x") as HTMLInputElement | null;
            if (sleLayerShiftXInput && currentSpriteLayer) {
                sleLayerShiftXInput.value = currentSpriteLayer.shiftX.toString();
            }
            const sleLayerShiftYInput = document.getElementById("sle-offset-y") as HTMLInputElement | null;
            if (sleLayerShiftYInput && currentSpriteLayer) {
                sleLayerShiftYInput.value = currentSpriteLayer.shiftY.toString();
            }
            const sleLayerDrawAsShadowInput = document.getElementById("sle-draw-as-shadow") as HTMLInputElement | null;
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

    const teDeleteTileControl = document.querySelector("#te-delete-tile-control > button") as HTMLButtonElement | null;
    if (!teDeleteTileControl) {
        console.error("Delete Tile control not found");
    } else {
        teDeleteTileControl.onclick = function () {
            if (currentTile) {
                const tileIndex = tiles.findIndex(tile => {
                    if (currentTile == null) return false;
                    return tile.id === currentTile.id;
                });
                if (tileIndex !== -1) {
                    tiles.splice(tileIndex, 1);
                }
            }
            persist();
            openMenu("tile-manager-menu");
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

    const seDeleteSpriteControl = document.querySelector("#se-delete-sprite-control > button") as HTMLButtonElement | null;
    if (!seDeleteSpriteControl) {
        console.error("Delete Sprite control not found");
    } else {
        seDeleteSpriteControl.onclick = function () {
            if (currentSprite && currentTile) {
                const spriteIndex = currentTile.sprites.indexOf(currentSprite);
                if (spriteIndex !== -1) {
                    currentTile.sprites.splice(spriteIndex, 1);
                }
            }
            persist();
            openMenu("tile-editor-menu");
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

    const sleDeleteLayerControl = document.querySelector("#sle-delete-sprite-layer-control > button") as HTMLButtonElement | null;
    if (!sleDeleteLayerControl) {
        console.error("Delete Layer control not found");
    } else {
        sleDeleteLayerControl.onclick = function () {
            if (currentSpriteLayer && currentSprite && currentTile) {
                const layerIndex = currentSprite.layers.indexOf(currentSpriteLayer);
                if (layerIndex !== -1) {
                    currentSprite.layers.splice(layerIndex, 1);
                }
            }
            persist();
            openMenu("sprite-editor-menu");
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

    const closeLegendControl = document.querySelector("#legend-close") as HTMLButtonElement | null;
    if (!closeLegendControl) {
        console.error("Close Legend control not found");
    } else {
        closeLegendControl.onclick = function () {
            const legend = document.getElementById("legend") as HTMLDivElement | null;
            if (legend) {
                legend.classList.add("hidden");
            }
        };
    }

}

function getTileAtCursor(gridInstance: TileGrid): { tile: Tile | null, sprite: Sprite | null } | null {
    const pointerPos = gridInstance.getPointerPosition();
    if (pointerPos == null) return null;
    const gridPos = gridInstance.convertPointerPosToTileCoords();
    if (gridPos == null) return null;
    const gridTile = gridInstance.getTileAt(gridPos.x, gridPos.y);
    if (gridTile == null) return null;
    const tileId = gridTile.dataset.assignedTile;
    if (tileId == null || tileId === "") return null;
    const tile = tiles.find(t => t.id === tileId);
    if (tile == null) return null;
    const spriteId = gridTile.dataset.assignedSprite;
    if (spriteId == null || spriteId === "") return null;
    const sprite = tile.sprites.find(s => s.id === spriteId);
    if (sprite == null) return null;
    return {
        tile,
        sprite
    };
}
window.getTileAtCursor = getTileAtCursor;

document.addEventListener("DOMContentLoaded", () => {
    const gridInstance = new TileGrid("grid", 16, 24, 64);
    window.grid = gridInstance;

    const grid = document.getElementById("grid") as HTMLDivElement;
    let offsetX = 0;
    let offsetY = 0;
    const panSpeed = 6;
    const keys = new Set<string>();

    const slots = document.getElementsByClassName("slot");
    for (let i = 0; i < slots.length; i++) {
        const slot = slots[i] as HTMLDivElement;
        slot.onclick = () => {
            selectSlot(i + 1);
        };
    }

    document.addEventListener("contextmenu", e => e.preventDefault());

    document.addEventListener("keydown", e => {
        const key = e.key.toLowerCase();
        if (key == "escape") {
            if (currentMenu) {
                closeMenu(currentMenu, false);
                currentMenu = null;
            }
            e.preventDefault();
        }
        if (currentMenu != null) return;
        if (["w", "a", "s", "d"].includes(key)) {
            keys.add(key);
            e.preventDefault();
        } else if (["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"].includes(key)) {
            let slot = Number(key);
            if (e.metaKey || e.ctrlKey) {
                const slotSelectorList = document.getElementById("hotbar-selector-list") as HTMLDivElement | null;
                if (slotSelectorList && slotSelectorList.children.length > 0) {
                    if (slotSelectorList.children.length >= slot) {
                        const child = slotSelectorList.children[slot - 1] as HTMLLIElement;
                        child.click();
                    }
                }
                e.preventDefault();
            } else {
                if (slot == 0) slot = 10;
                if (!isNaN(slot)) {
                    selectSlot(slot);
                }
            }
        } else if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) {
            const pointerPos = gridInstance.getPointerPosition();
            if (pointerPos == null) return null;
            const gridPos = gridInstance.convertPointerPosToTileCoords();
            if (gridPos == null) return null;
            const { tile, sprite } = window.getTileAtCursor(gridInstance) ?? {};
            if (!tile || !sprite) return;
            if (e.shiftKey) {
                // Shift+Arrow will move the offset of any non-shadow layers
                for (const layer of sprite.layers) {
                    if (layer.drawAsShadow) continue;
                    switch (e.key) {
                        case "ArrowLeft":
                            layer.shiftX -= 1;
                            break;
                        case "ArrowRight":
                            layer.shiftX += 1;
                            break;
                        case "ArrowUp":
                            layer.shiftY -= 1;
                            break;
                        case "ArrowDown":
                            layer.shiftY += 1;
                            break;
                    }
                }
                tile.sprites = tile.sprites.map(s => s.id === sprite.id ? sprite : s);
                gridInstance.placeTile(gridPos.x, gridPos.y, tile, sprite);
                persist();
                e.preventDefault();
            } else if (e.metaKey || e.ctrlKey) {
                // Meta+Arrow will move the offset of any shadow layers
                for (const layer of sprite.layers) {
                    if (!layer.drawAsShadow) continue;
                    switch (e.key) {
                        case "ArrowLeft":
                            layer.shiftX -= 1;
                            break;
                        case "ArrowRight":
                            layer.shiftX += 1;
                            break;
                        case "ArrowUp":
                            layer.shiftY -= 1;
                            break;
                        case "ArrowDown":
                            layer.shiftY += 1;
                            break;
                    }
                }
                tile.sprites = tile.sprites.map(s => s.id === sprite.id ? sprite : s);
                gridInstance.placeTile(gridPos.x, gridPos.y, tile, sprite);
                persist();
                e.preventDefault();
            }
        } else if (e.key === "l") {
            const legend = document.getElementById("legend") as HTMLDivElement | null;
            if (legend) {
                if (legend.classList.contains("hidden")) {
                    legend.classList.remove("hidden");
                } else {
                    legend.classList.add("hidden");
                }
            }
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
    selectSlot(1);

    // legend has been shown, hide it for future loads
    if (localStorage.getItem("legendShown") === "2") {
        const legend = document.getElementById("legend") as HTMLDivElement | null;
        if (legend) {
            legend.classList.add("hidden");
        }
    } else if (localStorage.getItem("legendShown") === "1") {
        localStorage.setItem("legendShown", "2");
    } else {
        localStorage.setItem("legendShown", "1");
    }

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
