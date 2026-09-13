// Source centred +Y up. Rim is y=21; electronics remain above it.
export const sensorPlacements = {
  J1: { pcbX: 0, pcbY: 35, pcbRotation: 0 },
  U1: { pcbX: 5, pcbY: 25, pcbRotation: 0 },
  U2: { pcbX: -11, pcbY: 28, pcbRotation: 0 },
  U3: { pcbX: 14, pcbY: 38, pcbRotation: 0 },
  D2: { pcbX: -11, pcbY: 34, pcbRotation: 0 },
  C1: { pcbX: -16, pcbY: 28, pcbRotation: 90 },
  C2: { pcbX: -6, pcbY: 28, pcbRotation: 90 },
  C3: { pcbX: 9.5, pcbY: 25, pcbRotation: 90 },
  C4: { pcbX: 12, pcbY: 25, pcbRotation: 90 },
  R1: { pcbX: 14, pcbY: 33, pcbRotation: 90 },
  R2: { pcbX: 16.5, pcbY: 33, pcbRotation: 90 },
  R3: { pcbX: 10, pcbY: 28, pcbRotation: 0 },
  R4: { pcbX: 15, pcbY: 28, pcbRotation: 0 },
  R5: { pcbX: -11, pcbY: 24, pcbRotation: 90 },
  R6: { pcbX: -1, pcbY: 25, pcbRotation: 90 },
  E1: { pcbX: 0, pcbY: -10, pcbRotation: 0 },
} as const;
