// Source skeleton: room for the larger shared supply and ordinary buck layout.
// Coordinates use component datums, centre X-right/Y-up. Native routing remains.
export type MainsPlacement = {
  pcbX: number;
  pcbY: number;
  pcbRotation: number;
  layer: "top";
};
export const mainsBoardSize = { width: 150, height: 110 } as const;
export const mainsPlacements = {
  U1: { pcbX: -47, pcbY: 48, pcbRotation: 0, layer: "top" },
  K1: { pcbX: 10, pcbY: -17, pcbRotation: 0, layer: "top" },
  J1: { pcbX: -59, pcbY: 35, pcbRotation: 270, layer: "top" },
  J2: { pcbX: -59, pcbY: 8, pcbRotation: 270, layer: "top" },
  J3: { pcbX: -54, pcbY: -41, pcbRotation: 0, layer: "top" },
  J4: { pcbX: 1, pcbY: -41, pcbRotation: 0, layer: "top" },
  R1: { pcbX: -15, pcbY: -25, pcbRotation: 0, layer: "top" },
  C1: { pcbX: -15, pcbY: -32, pcbRotation: 0, layer: "top" },
  F3: { pcbX: -16, pcbY: -9, pcbRotation: 0, layer: "top" },
  RV1: { pcbX: -39.75, pcbY: -20, pcbRotation: 0, layer: "top" },
  D1: { pcbX: 45, pcbY: -25, pcbRotation: 0, layer: "top" },
  J5: { pcbX: 64, pcbY: 28, pcbRotation: 270, layer: "top" },
  J6: { pcbX: 64, pcbY: 7, pcbRotation: 270, layer: "top" },
  F2: { pcbX: 49, pcbY: 7, pcbRotation: 0, layer: "top" },
  U2: { pcbX: 49, pcbY: -9, pcbRotation: 0, layer: "top" },
  L1: { pcbX: 57, pcbY: -9, pcbRotation: 0, layer: "top" },
  C2: { pcbX: 44, pcbY: -6, pcbRotation: 90, layer: "top" },
  C3: { pcbX: 44, pcbY: 1, pcbRotation: 90, layer: "top" },
  C4: { pcbX: 65, pcbY: -9, pcbRotation: 90, layer: "top" },
  C5: { pcbX: 51, pcbY: -4, pcbRotation: 0, layer: "top" },
  C6: { pcbX: 65, pcbY: -17, pcbRotation: 90, layer: "top" },
  C7: { pcbX: 43, pcbY: -12, pcbRotation: 0, layer: "top" },
} as const satisfies Record<string, MainsPlacement>;
export const mainsMountingHoles = [
  { ref: "H1", x: -68, y: 48 },
  { ref: "H2", x: 68, y: 48 },
  { ref: "H3", x: -68, y: -48 },
  { ref: "H4", x: 68, y: -48 },
] as const;
