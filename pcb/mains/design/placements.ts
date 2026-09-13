// Source skeleton: room for the larger shared supply and ordinary buck layout.
// Coordinates use component datums, centre X-right/Y-up. Native routing remains.
export type MainsPlacement = {
  pcbX: number;
  pcbY: number;
  pcbRotation: number;
  layer: "top";
};
export const mainsBoardSize = { width: 180, height: 110 } as const;
export const mainsPlacements = {
  U1: { pcbX: -77.5, pcbY: 45, pcbRotation: 0, layer: "top" },
  K1: { pcbX: 30, pcbY: -15, pcbRotation: 0, layer: "top" },
  J1: { pcbX: -73, pcbY: -42, pcbRotation: 0, layer: "top" },
  J2: { pcbX: -79, pcbY: -22, pcbRotation: 0, layer: "top" },
  J3: { pcbX: -12, pcbY: -42, pcbRotation: 0, layer: "top" },
  J4: { pcbX: 35, pcbY: -42, pcbRotation: 0, layer: "top" },
  R1: { pcbX: 7, pcbY: -26, pcbRotation: 0, layer: "top" },
  C1: { pcbX: -9, pcbY: -24, pcbRotation: 0, layer: "top" },
  F3: { pcbX: -47, pcbY: -15, pcbRotation: 0, layer: "top" },
  RV1: { pcbX: -42, pcbY: -35, pcbRotation: 0, layer: "top" },
  D1: { pcbX: 55, pcbY: -5, pcbRotation: 0, layer: "top" },
  J5: { pcbX: 79, pcbY: 5, pcbRotation: 270, layer: "top" },
  J6: { pcbX: 79, pcbY: 29, pcbRotation: 270, layer: "top" },
  F2: { pcbX: 57, pcbY: 29, pcbRotation: 0, layer: "top" },
  U2: { pcbX: 32, pcbY: 16, pcbRotation: 0, layer: "top" },
  L1: { pcbX: 42, pcbY: 16, pcbRotation: 0, layer: "top" },
  C2: { pcbX: 23, pcbY: 18, pcbRotation: 90, layer: "top" },
  C3: { pcbX: 23, pcbY: 25, pcbRotation: 90, layer: "top" },
  C4: { pcbX: 51, pcbY: 16, pcbRotation: 90, layer: "top" },
  C5: { pcbX: 36, pcbY: 21, pcbRotation: 0, layer: "top" },
  C6: { pcbX: 57, pcbY: 16, pcbRotation: 90, layer: "top" },
  C7: { pcbX: 28, pcbY: 13, pcbRotation: 0, layer: "top" },
} as const satisfies Record<string, MainsPlacement>;
export const mainsMountingHoles = [
  { ref: "H1", x: -85, y: 50 },
  { ref: "H2", x: 85, y: 50 },
  { ref: "H3", x: -85, y: -50 },
  { ref: "H4", x: 85, y: -50 },
] as const;
