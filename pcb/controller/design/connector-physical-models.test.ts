import { expect, test } from "bun:test";
import { buttonPattern, statusLedPattern, statusLedPins } from "./assembly-components";
import {
  connectorMechanicalConstraints,
  connectorPhysicalModels,
} from "./connector-physical-models";
import {
  psuHeaderPattern,
  sensorHeaderPattern,
  serviceHeaderPattern,
  microFitEvidence,
} from "./micro-fit-components";
import { usbConnectorPattern, usbConnectorPinMap } from "./usb-connector";

const ids = [
  sensorHeaderPattern.id,
  serviceHeaderPattern.id,
  psuHeaderPattern.id,
  usbConnectorPattern.id,
  statusLedPattern.id,
  buttonPattern.id,
];

test("declarations bind the six selected native IDs and preserve document provenance", () => {
  expect(Object.keys(connectorPhysicalModels).sort()).toEqual([...ids].sort());
  expect(Object.keys(connectorMechanicalConstraints).sort()).toEqual([...ids].sort());
  for (const id of ids) {
    const model = connectorPhysicalModels[id]!;
    expect(model.source.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(model.source.url).toStartWith("https://");
    expect(model.envelope.width).toBeGreaterThanOrEqual(model.body.width);
    expect(model.envelope.height).toBeGreaterThanOrEqual(model.body.height);
    expect(model.solderMask.expansion).toBe(0.05);
    expect(connectorMechanicalConstraints[id]!.marking.length).toBeGreaterThan(20);
  }
  expect(connectorPhysicalModels[usbConnectorPattern.id]!.source.sha256).toBe(
    usbConnectorPattern.source.sha256,
  );
  // Manufacturer PDF bytes must not be confused with the installed copper hash.
  for (const [id, evidence] of [
    [sensorHeaderPattern.id, microFitEvidence.sensor],
    [serviceHeaderPattern.id, microFitEvidence.service],
    [psuHeaderPattern.id, microFitEvidence.psu],
  ] as const) {
    expect(connectorPhysicalModels[id]!.source.sha256).not.toBe(
      evidence.installedSha256,
    );
  }
  expect(connectorPhysicalModels[psuHeaderPattern.id]!.source.drawing).toContain(
    "D8 download bytes were unavailable",
  );
});

test("Molex native pin-one origins remain distinct from housing and tail bounds", () => {
  const cases = [
    [sensorHeaderPattern, 3, 13.15, 9.91, -8.92, 0.99, -9.25, 3.9, 14, 9.27],
    [serviceHeaderPattern, 0, 7.15, 9.91, -8.92, 0.99, -9.25, 3.9, 7.9, 9.27],
    [psuHeaderPattern, 3, 12.65, 9.9, -8.92, 0.98, -9.35, 1.66, 12.95, 6.07],
  ] as const;
  for (const [pattern, cx, bodyW, bodyH, front, rear, minY, maxY, envW, z] of cases) {
    const model = connectorPhysicalModels[pattern.id]!;
    expect(pattern.pads[0]).toMatchObject({ number: "1", x: 0, y: 0 });
    expect(model.packageCenter!.x).toBe(cx);
    expect(model.body.width).toBe(bodyW);
    expect(model.body.height).toBe(bodyH);
    expect(model.packageCenter!.y - bodyH / 2).toBeCloseTo(front, 9);
    expect(model.packageCenter!.y + bodyH / 2).toBeCloseTo(rear, 9);
    expect(model.envelopeCenter!.y - model.envelope.height / 2).toBeCloseTo(minY, 9);
    expect(model.envelopeCenter!.y + model.envelope.height / 2).toBeCloseTo(maxY, 9);
    expect(model.envelope.width).toBe(envW);
    expect(model.body.thicknessMax).toBe(z);
    expect(model.envelopeCenter!.y).not.toBe(model.packageCenter!.y);
  }
  // Independently exercise the asymmetric extrema, including tolerances that
  // differ between the H1 dual-row and D7/D8 single-row drawings.
  expect(-9.25).toBeCloseTo(-(4.32 + 0.08 + 4.6 + 0.25), 9);
  expect(3.9).toBeCloseTo(-(4.32 - 0.08 + 4.6 - 0.25) + 12.24 + 0.25, 9);
  expect(-9.35).toBeCloseTo(-(4.32 + 0.08 + 4.6 + 0.35), 9);
  expect(1.66).toBeCloseTo(-(4.32 - 0.08 + 4.6 - 0.35) + 9.9 + 0.25, 9);
  expect(9.27).toBeCloseTo(7.37 + 0.25 + 1.4 + 0.25, 9);
  expect(6.07).toBeCloseTo(4.37 + 0.25 + 1.2 + 0.25, 9);
});

test("Molex mating edge uses the locator datum rather than pin one or courtyard", () => {
  for (const pattern of [sensorHeaderPattern, serviceHeaderPattern, psuHeaderPattern]) {
    const mating = connectorMechanicalConstraints[pattern.id]!.mating!;
    expect(mating.direction).toBe("-y");
    expect(mating.minimumBoardEdgeY).toBeCloseTo(pattern.holes![0]!.y - 10.16, 9);
    expect(mating.minimumBoardEdgeY).not.toBe(-10.16);
    const physical = connectorPhysicalModels[pattern.id]!;
    expect(mating.minimumBoardEdgeY!).toBeLessThan(
      physical.envelopeCenter!.y - physical.envelope.height / 2,
    );
    expect(physical.nativeAssembly.paste).toStartWith("No paste");
  }
});

test("USB envelope includes rear tails while mating direction and PCB edge remain at the front", () => {
  const physical = connectorPhysicalModels[usbConnectorPattern.id]!;
  const mating = connectorMechanicalConstraints[usbConnectorPattern.id]!.mating!;
  expect(physical.packageCenter).toEqual({ x: 0, y: 0 });
  expect(physical.body.width).toBe(usbConnectorPattern.body.width);
  expect(physical.body.height).toBe(usbConnectorPattern.body.height);
  expect(physical.body.thicknessMax).toBeCloseTo(3.31 + 0.15, 9);
  expect(physical.envelope.width).toBeCloseTo(8.94 + 0.15, 9);
  expect(physical.envelopeCenter!.y - physical.envelope.height / 2).toBeCloseTo(
    -(7.35 + 0.15) / 2 - (0.38 + 0.15),
    9,
  );
  expect(physical.envelopeCenter!.y + physical.envelope.height / 2).toBeCloseTo(
    (7.35 + 0.15) / 2,
    9,
  );
  expect(mating.direction).toBe("+y");
  expect(mating.boardEdgeY).toBe(usbConnectorPattern.boardEdgeY);
  expect(mating.minimumBoardEdgeY).toBeUndefined();
  // Four shared A/B solder areas are not four additional paste apertures.
  const solderAreas = [
    ...new Map(usbConnectorPinMap.map((pin) => [pin.x, pin])).values(),
  ].sort((a, b) => a.x - b.x);
  expect(usbConnectorPinMap).toHaveLength(16);
  expect(solderAreas).toHaveLength(12);
  for (let index = 1; index < solderAreas.length; index++) {
    const previous = solderAreas[index - 1]!;
    const next = solderAreas[index]!;
    const web =
      next.x -
      previous.x -
      (next.width + previous.width) / 2 -
      2 * physical.solderMask.expansion;
    expect(web).toBeGreaterThanOrEqual(0.1 - 1e-9);
  }
  expect(physical.nativeAssembly.paste).toContain(
    "no paste is pending KiCad board augmentation",
  );
  expect(physical.nativeAssembly.paste).toContain(
    "current initial adapter still restores F.Paste on shell slots",
  );
});

test("LED and button physical centres preserve polarity and repeated terminal pairs", () => {
  const led = connectorPhysicalModels[statusLedPattern.id]!;
  expect(led.packageCenter).toEqual({
    x: (statusLedPattern.pads[0]!.x + statusLedPattern.pads[1]!.x) / 2,
    y: 0,
  });
  expect(statusLedPins).toEqual({ pin1: "K", pin2: "A" });
  expect(led.envelope.width).toBeCloseTo(3.2 + 0.25, 9);
  expect(led.body.thicknessMax).toBeCloseTo(4.6 + 0.3, 9);
  expect(led.nativeAssembly.paste).toContain("incompatible with reflow");
  expect(connectorMechanicalConstraints[statusLedPattern.id]!.assembly).toContain(
    "standoff/spacer is not selected",
  );
  expect(connectorMechanicalConstraints[statusLedPattern.id]!.marking).toContain(
    "cathode flat/K marking",
  );
  const button = connectorPhysicalModels[buttonPattern.id]!;
  expect(button.packageCenter).toEqual({
    x: (buttonPattern.pads[0]!.x + buttonPattern.pads[3]!.x) / 2,
    y: (buttonPattern.pads[0]!.y + buttonPattern.pads[3]!.y) / 2,
  });
  expect(button.envelope.width).toBeCloseTo(7.7 + 0.5, 9);
  expect(button.envelope.height).toBeCloseTo(6 + 0.2, 9);
  expect(button.body.thicknessMax).toBeCloseTo(4.3 + 0.2, 9);
  expect(buttonPattern.pads.map(({ number }) => number)).toEqual(["1", "1", "2", "2"]);
  expect(button.nativeAssembly.paste).toContain("No paste");
  expect(connectorMechanicalConstraints[buttonPattern.id]!.marking).toContain(
    "Repeated pad 1 is Omron 3/4, repeated pad 2 is 1/2",
  );
});
