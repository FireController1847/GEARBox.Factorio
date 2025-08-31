declare global {
    var grid: TileGrid;
    var tiles: Tile[]
    var openMenu: (menuId: string) => void;
    var closeMenu: (menuId: string, preserveTile: boolean) => void;
    var getTileAtCursor: (gridInstance: TileGrid) => { tile: Tile | null, sprite: Sprite | null } | null;
}

export {}