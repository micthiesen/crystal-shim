// Centred +Y up, electronics outward. J1 solder pigtail exits the left edge.
export const sensorPlacements = {
  J1: { pcbX: -6.5, pcbY: 23, pcbRotation: 0 },
  U1: { pcbX: 2, pcbY: 8, pcbRotation: 0 },
  U2: { pcbX: 2, pcbY: 23, pcbRotation: 0 },
  U3: { pcbX: -2, pcbY: 15, pcbRotation: 0 },
  D2: { pcbX: 2, pcbY: 29, pcbRotation: 0 },
  C1: { pcbX: -2, pcbY: 23, pcbRotation: 90 },
  C2: { pcbX: 6, pcbY: 23, pcbRotation: 90 },
  C3: { pcbX: 6.5, pcbY: 8, pcbRotation: 90 },
  C4: { pcbX: 6.5, pcbY: 12, pcbRotation: 90 },
  R1: { pcbX: -4, pcbY: 10, pcbRotation: 0 },
  R2: { pcbX: -4, pcbY: 7, pcbRotation: 0 },
  R3: { pcbX: 2, pcbY: 15, pcbRotation: 0 },
  R4: { pcbX: 6.5, pcbY: 16, pcbRotation: 90 },
  R5: { pcbX: -2, pcbY: 19, pcbRotation: 0 },
  R6: { pcbX: 6.5, pcbY: 19, pcbRotation: 0 },
  E1: { pcbX: 0, pcbY: 0, pcbRotation: 0 },
} as const;
