declare global {
    var tiles: Tile[]
    var openMenu: (menuId: string) => void;
    var closeMenu: (menuId: string, preserveTile: boolean) => void;
}

export {}