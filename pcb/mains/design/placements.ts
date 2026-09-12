// Source-coordinate proposal from docs/design/mains-placement.md. These positions
// are for the one final-use mains board. Body datums, mating and the RV1 installed
// envelope still require review; this table is not placement acceptance.
export type MainsPlacement = {
  pcbX: number;
  pcbY: number;
  pcbRotation: number;
  layer: "top";
};

export const mainsPlacements = {
  U1: { pcbX: -13.2, pcbY: -27.35, pcbRotation: 90, layer: "top" },
  K1: { pcbX: 24.75, pcbY: 1.9, pcbRotation: 270, layer: "top" },
  J1: { pcbX: -42.2465, pcbY: 24.62, pcbRotation: 0, layer: "top" },
  J2: { pcbX: -53.12, pcbY: -3.993, pcbRotation: 90, layer: "top" },
  J3: { pcbX: 36.2605, pcbY: 0.62, pcbRotation: 0, layer: "top" },
  J4: { pcbX: 4.7675, pcbY: 24.62, pcbRotation: 0, layer: "top" },
  R1: { pcbX: 16.08, pcbY: 14.5, pcbRotation: 0, layer: "top" },
  C1: { pcbX: 38.5, pcbY: 15.5, pcbRotation: 0, layer: "top" },
  D1: { pcbX: 26.08, pcbY: -28.5, pcbRotation: 180, layer: "top" },
  J5: { pcbX: 53.5, pcbY: -17.5, pcbRotation: 270, layer: "top" },
  U2: { pcbX: -21, pcbY: -27, pcbRotation: 0, layer: "top" },
  D2: { pcbX: -27, pcbY: -32, pcbRotation: 0, layer: "top" },
  R2: { pcbX: -25, pcbY: -21.5, pcbRotation: 0, layer: "top" },
  R3: { pcbX: -25, pcbY: -24.5, pcbRotation: 0, layer: "top" },
  R4: { pcbX: -29, pcbY: -21.5, pcbRotation: 0, layer: "top" },
  R5: { pcbX: -29, pcbY: -24.5, pcbRotation: 0, layer: "top" },
  R6: { pcbX: -20.5, pcbY: -32.5, pcbRotation: 0, layer: "top" },
  R7: { pcbX: 37.5, pcbY: -28.5, pcbRotation: 0, layer: "top" },
  C2: { pcbX: -17, pcbY: -21, pcbRotation: 0, layer: "top" },
  C3: { pcbX: -17, pcbY: -24, pcbRotation: 0, layer: "top" },
  C4: { pcbX: -12, pcbY: -31.5, pcbRotation: 0, layer: "top" },
  C5: { pcbX: -16.8, pcbY: -28, pcbRotation: 0, layer: "top" },
  RV1: { pcbX: -36.25, pcbY: 4.5, pcbRotation: 0, layer: "top" },
} as const satisfies Record<string, MainsPlacement>;

export const mainsMountingHoles = [
  { ref: "H1", x: -62.5, y: 32.5 },
  { ref: "H2", x: 62.5, y: 32.5 },
  { ref: "H3", x: -62.5, y: -32.5 },
  { ref: "H4", x: 62.5, y: -32.5 },
] as const;
