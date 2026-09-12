import { expect, test } from "bun:test";
import { Circuit } from "tscircuit";
import { CircuitJsonToKicadPcbConverter } from "circuit-json-to-kicad";
import { At, parseKicadPcb } from "kicadts";
import { movCapture, movPins, ThermallyProtectedMov } from "./mov-component";
import {
  schematicConnectivityErrors,
  schematicPortNetNames,
} from "../../controller/design/schematic-connectivity-check";

test("MOV occupied acceptance leaves margins inside its separately declared reserve and courtyard", () => {
  const {
    installedAcceptance: accepted,
    placementReserve: reserve,
    courtyard,
  } = movCapture;
  expect([accepted.width, accepted.height, accepted.topMax]).toEqual([27, 27, 26]);
  expect([reserve.width, reserve.height, reserve.topMax]).toEqual([28, 28, 26.5]);
  expect([courtyard.width, courtyard.height]).toEqual([29, 29]);
  for (const region of [accepted, reserve, courtyard]) {
    expect([region.centerX, region.centerY]).toEqual([3.75, 0]);
  }
  expect((reserve.width - accepted.width) / 2).toBe(0.5);
  expect((courtyard.width - reserve.width) / 2).toBe(0.5);
  expect(reserve.topMax - accepted.topMax).toBe(0.5);
  expect(accepted.crimpSeatAboveBoard).toEqual({ min: 0.5, max: 1 });
  expect(accepted.tailAndSolderBelowBoardMax).toBe(2);
  expect([accepted.yawMaxDegrees, accepted.leanMaxDegrees]).toEqual([20, 5]);
  expect(accepted.basis).toContain(
    "No manufacturer common body offset Cy is guaranteed",
  );
  expect(movCapture.inspectedDrawingSha256).toBe(
    "039bf6182ec4e86bce375c1935716375361cefe365a1f8515b030bdd343fbea5",
  );
  expect(movCapture.exactOrderCodePcnSha256).toBe(
    "b9d3184c7444360a685f10237abfa86e856746c808ab24a3e11b9ce330047ab1",
  );
});

for (const rotation of [0, 90, 180, 270]) {
  test(`MOV exact pad identities, slot axis and 29 mm courtyard survive rotation ${rotation}`, async () => {
    const circuit = new Circuit();
    circuit.add(
      <board width={100} height={100} routingDisabled>
        <ThermallyProtectedMov name="RV1" pcbX={7} pcbY={-3} pcbRotation={rotation} />
        <netlabel net="AC_L_FUSED" connectsTo=".RV1 > .LINE" />
        <netlabel net="AC_N" connectsTo=".RV1 > .NEUTRAL" />
      </board>,
    );
    await circuit.renderUntilSettled();
    const json = circuit.getCircuitJson();
    expect(json.filter((e) => e.type.includes("error"))).toEqual([]);
    expect(schematicConnectivityErrors(json)).toEqual([]);
    const parts = json.filter((e) => e.type === "source_component");
    expect(parts).toHaveLength(1);
    expect(parts[0]!.name).toBe("RV1");
    expect(parts[0]!.manufacturer_part_number).toBe("TMOV14RP175EL2T7");
    expect(movPins).toEqual({ pin1: "LINE", pin2: "NEUTRAL" });
    const ports = json.filter((e) => e.type === "source_port");
    expect(ports).toHaveLength(2);
    const nets = schematicPortNetNames(json);
    for (const [number, name, net] of [
      [1, "LINE", "AC_L_FUSED"],
      [2, "NEUTRAL", "AC_N"],
    ] as const) {
      const port = ports.find((p) => p.pin_number === number)!;
      expect(port.name).toBe(name);
      expect(port.source_component_id).toBe(parts[0]!.source_component_id);
      expect(nets.get(port.source_port_id)).toEqual([net]);
    }
    expect(
      json
        .filter((e) => e.type === "source_net")
        .map((e) => e.name)
        .sort(),
    ).toEqual(["AC_L_FUSED", "AC_N"]);
    const pcb = json.find((e) => e.type === "pcb_component")!;
    if (pcb.type !== "pcb_component") throw new Error("Missing source footprint");
    expect(pcb.metadata?.kicad_footprint?.footprintName).toBe(
      "CrystalShim:TMOV14RP175EL2T7_RoundSlot",
    );
    expect(json.filter((e) => e.type === "pcb_plated_hole")).toHaveLength(2);
    // Missing body-to-lead datums must not become an invented F.Fab package.
    expect(json.filter((e) => e.type === "pcb_fabrication_note_path")).toEqual([]);
    const courts = json.filter((e) => e.type === "pcb_courtyard_outline");
    expect(courts).toHaveLength(1);
    expect(courts[0]!.pcb_component_id).toBe(pcb.pcb_component_id);
    expect(courts[0]!.outline).toHaveLength(5);
    const a = (rotation * Math.PI) / 180;
    const sourcePoint = (x: number, y: number) => ({
      x: 7 + x * Math.cos(a) - y * Math.sin(a),
      y: -3 + x * Math.sin(a) + y * Math.cos(a),
    });
    // Literal 29 mm corners catch regression to the former 28 mm reserve outline.
    const corners = [
      [-10.75, -14.5],
      [18.25, -14.5],
      [18.25, 14.5],
      [-10.75, 14.5],
      [-10.75, -14.5],
    ] as const;
    for (const [i, [x, y]] of corners.entries()) {
      const expected = sourcePoint(x, y);
      expect(courts[0]!.outline[i]!.x).toBeCloseTo(expected.x, 7);
      expect(courts[0]!.outline[i]!.y).toBeCloseTo(expected.y, 7);
    }

    // Convert and parse only in memory; no protected native project is written.
    const converter = new CircuitJsonToKicadPcbConverter(json);
    converter.runUntilFinished();
    const native = parseKicadPcb(converter.getOutputString());
    expect(native.footprints).toHaveLength(1);
    const fp = native.footprints[0]!;
    expect(fp.properties.find((p) => p.key === "Reference")?.value).toBe("RV1");
    expect(fp.properties.find((p) => p.key === "Value")?.value).toBe(
      "TMOV14RP175EL2T7",
    );
    expect(fp.libraryLink).toBe("CrystalShim:TMOV14RP175EL2T7_RoundSlot");
    expect(fp.fpPads.map((p) => p.number).sort()).toEqual(["1", "2"]);
    const round = fp.fpPads.find((p) => p.number === "1")!;
    const slot = fp.fpPads.find((p) => p.number === "2")!;
    expect(round.net?.name).toBe("AC_L_FUSED");
    expect(slot.net?.name).toBe("AC_N");
    expect(round.padType).toBe("thru_hole");
    expect(round.shape).toBe("circle");
    expect(round.drill?.diameter).toBe(1.3);
    expect(round.drill?.oval ?? false).toBe(false);
    expect([round.size?.width, round.size?.height]).toEqual([2.9, 2.9]);
    expect(slot.padType).toBe("thru_hole");
    expect(slot.shape).toBe("oval");
    expect(slot.drill?.oval).toBe(true);
    expect([slot.drill?.diameter, slot.drill?.width]).toEqual([3.7, 1.3]);
    expect([slot.size?.width, slot.size?.height]).toEqual([5.3, 2.9]);
    const at = fp.position;
    if (!(at instanceof At) || !round.at || !slot.at)
      throw new Error("Missing native pose");
    const angle = ((at.angle ?? 0) * Math.PI) / 180;
    const nativePoint = (p: { x: number; y: number }) => ({
      x: at.x + p.x * Math.cos(angle) + p.y * Math.sin(angle),
      y: at.y - p.x * Math.sin(angle) + p.y * Math.cos(angle),
    });
    const first = nativePoint(round.at);
    const second = nativePoint(slot.at);
    // The pinned converter places Circuit JSON (0, 0) at native (100, 100).
    expect(first.x).toBeCloseTo(107, 7);
    expect(first.y).toBeCloseTo(103, 7);
    expect(second.x - first.x).toBeCloseTo(7.5 * Math.cos(a), 7);
    expect(second.y - first.y).toBeCloseTo(-7.5 * Math.sin(a), 7);
    // KiCad serializes the pad's angle in board coordinates. Slot symmetry is 180°.
    expect(Math.sin((((slot.at.angle ?? 0) - rotation) * Math.PI) / 180)).toBeCloseTo(
      0,
      7,
    );
    expect(fp.fpLines.filter((line) => line.layer?.names.includes("F.Fab"))).toEqual(
      [],
    );
    expect(fp.fpPolys.filter((poly) => poly.layer?.names.includes("F.Fab"))).toEqual(
      [],
    );
    const nativeCourts = fp.fpPolys.filter((poly) =>
      poly.layer?.names.includes("F.CrtYd"),
    );
    expect(nativeCourts).toHaveLength(1);
    expect(nativeCourts[0]!.points!.points).toHaveLength(5);
    for (const [i, point] of nativeCourts[0]!.points!.points.entries()) {
      if (!("x" in point && "y" in point)) throw new Error("Unexpected courtyard arc");
      const [x, y] = corners[i]!;
      const expected = sourcePoint(x, y);
      const actual = nativePoint(point);
      expect(actual.x).toBeCloseTo(100 + expected.x, 7);
      expect(actual.y).toBeCloseTo(100 - expected.y, 7);
    }
  });
}
