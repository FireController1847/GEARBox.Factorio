type SpriteLayer = {
    id: string,
    fileName: string | null,
    fileData: Base64URLString | null,
    width: number,
    height: number,
    variants: number,
    shiftX: number,
    shiftY: number,
    drawAsShadow: boolean
}

type Sprite = {
    id: string,
    property: string,
    layers: SpriteLayer[]
}

type Tile = {
    id: string,
    name: string,
    sprites: Sprite[]
}