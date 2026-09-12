import type { KicadPcb, KicadSch, SchematicSymbol, SymbolPin } from "kicadts";
import type { CircuitJson } from "circuit-json";
import {
  usbConnectorPins,
  usbConnectorPattern,
  usbConnectorPinMap,
} from "./usb-connector";

// Initial-converter object graphs ONLY, before serialization into a handoff stage.
// These functions never load or edit existing KiCad files and are not an ECO API.
// Complete-board export must invoke both and then pass the normal parity gates.
const nativeNumbers: Record<string, string> = Object.fromEntries(
  Object.entries(usbConnectorPins).map(([key, value]) => [key.slice(3), value]),
);
const indices = Object.keys(nativeNumbers).sort();

// The compiler's PCB-component centre is the copper bounding-box centre, which
// is 1.14 mm behind this connector's native body origin. Normalize only a derived
// export input: changing the centre leaves every absolute land position intact.
// Derive the native origin from A1 and verify every other contact against it.
export function prepareUsbForInitialExport(
  input: CircuitJson,
  refs: readonly string[],
): CircuitJson {
  if (new Set(refs).size !== refs.length) throw new Error("Duplicate USB reference");
  const json = structuredClone(input);
  for (const ref of refs) {
    const sources = json
      .filter((e) => e.type === "source_component")
      .filter((e) => e.name === ref);
    const source = sources[0];
    if (sources.length !== 1 || source?.manufacturer_part_number !== "USB4105-GF-A")
      throw new Error(`${ref}: missing or mismatched USB source`);
    const components = json
      .filter((e) => e.type === "pcb_component")
      .filter((e) => e.source_component_id === source.source_component_id);
    const component = components[0];
    if (
      components.length !== 1 ||
      !component ||
      component.layer !== "top" ||
      component.rotation % 90 !== 0
    )
      throw new Error(`${ref}: unsupported USB placement`);
    const ports = json
      .filter((e) => e.type === "source_port")
      .filter((e) => e.source_component_id === source.source_component_id);
    const pcbPorts = json
      .filter((e) => e.type === "pcb_port")
      .filter((e) => e.pcb_component_id === component.pcb_component_id);
    const pads = json
      .filter((e) => e.type === "pcb_smtpad")
      .filter((e) => e.pcb_component_id === component.pcb_component_id);
    if (pads.length !== 16) throw new Error(`${ref}: USB contact count changed`);
    const contact = (index: number) => {
      const port = ports.find((p) => p.pin_number === index);
      const pp = pcbPorts.find((p) => p.source_port_id === port?.source_port_id);
      const pad = pads.find((p) => p.pcb_port_id === pp?.pcb_port_id);
      if (!pad || pad.shape !== "rect")
        throw new Error(`${ref}: USB contact ${index} missing`);
      return pad;
    };
    const rad = (component.rotation * Math.PI) / 180;
    const offset = (x: number, y: number) => ({
      x: x * Math.cos(rad) + y * Math.sin(rad),
      y: x * Math.sin(rad) - y * Math.cos(rad),
    });
    const first = contact(1);
    const firstOffset = offset(-3.2, -3.68);
    const origin = { x: first.x - firstOffset.x, y: first.y - firstOffset.y };
    for (const pin of usbConnectorPinMap) {
      const pad = contact(pin.index);
      const delta = offset(pin.x, -3.68);
      if (
        Math.abs(pad.x - origin.x - delta.x) > 0.000001 ||
        Math.abs(pad.y - origin.y - delta.y) > 0.000001
      )
        throw new Error(`${ref}: USB contact geometry changed`);
    }
    component.center = origin;
  }
  return json;
}

function requireIndices(actual: string[], expected: string[], context: string) {
  if (JSON.stringify([...actual].sort()) !== JSON.stringify([...expected].sort())) {
    throw new Error(`${context}: USB numeric pin multiset changed; refuse export`);
  }
}

function symbolPins(symbol: SchematicSymbol): SymbolPin[] {
  return [...symbol.pins, ...symbol.subSymbols.flatMap(symbolPins)];
}

export function mapUsbPcbForInitialExport(board: KicadPcb, refs: readonly string[]) {
  if (new Set(refs).size !== refs.length) throw new Error("Duplicate USB reference");
  const plans = refs.map((ref) => {
    const matches = board.footprints.filter((fp) =>
      fp.properties.some((p) => p.key === "Reference" && p.value === ref),
    );
    const fp = matches[0];
    if (
      matches.length !== 1 ||
      fp?.libraryLink !== usbConnectorPattern.id ||
      !fp.properties.some((p) => p.key === "Value" && p.value === "USB4105-GF-A")
    ) {
      throw new Error(`${ref}: missing or mismatched USB footprint`);
    }
    requireIndices(
      fp.fpPads.map((p) => p.number),
      [...indices, "17", "17", "17", "", ""],
      ref,
    );
    const shell = fp.fpPads.filter((p) => p.number === "17");
    const shellNet = shell.find((p) => p.net)?.net;
    if (
      !shellNet ||
      shell.some(
        (p) => p.net && (p.net.id !== shellNet.id || p.net.name !== shellNet.name),
      )
    ) {
      throw new Error(`${ref}: missing or conflicting shell net`);
    }
    return { fp, shellNet };
  });
  // Validate every target first, so a rejected call leaves the graph untouched.
  for (const { fp, shellNet } of plans) {
    for (const pad of fp.fpPads) {
      if (!pad.number) continue; // NPTH locators have no electrical number.
      if (pad.number === "17") {
        // The compiler models the four shell lands as one internal connection,
        // but its converter omits the net from three physical ports. Restore the
        // single SH net and the audited native shell paste layer explicitly.
        pad.net = shellNet;
        pad.layers = ["*.Cu", "*.Mask", "F.Paste"];
      }
      pad.number = nativeNumbers[pad.number]!;
    }
  }
}

export function mapUsbSchematicForInitialExport(
  schematic: KicadSch,
  refs: readonly string[],
) {
  if (new Set(refs).size !== refs.length) throw new Error("Duplicate USB reference");
  const plans = refs.map((ref) => {
    const matches = schematic.symbols.filter((s) =>
      s.properties.some((p) => p.key === "Reference" && p.value === ref),
    );
    const instance = matches[0];
    if (
      matches.length !== 1 ||
      !instance?.properties.some((p) => p.key === "Value" && p.value === "USB4105-GF-A")
    )
      throw new Error(`${ref}: missing or mismatched USB symbol`);
    const libraries =
      schematic.libSymbols?.symbols.filter((s) => s.libraryId === instance.libraryId) ??
      [];
    if (libraries.length !== 1) throw new Error(`${ref}: ambiguous USB library symbol`);
    const library = libraries[0]!;
    requireIndices(
      symbolPins(instance).map((p) => p.numberString ?? ""),
      indices,
      ref,
    );
    requireIndices(
      symbolPins(library).map((p) => p.numberString ?? ""),
      indices,
      ref,
    );
    // A shared library cannot be renumbered behind an unlisted instance's back.
    for (const other of schematic.symbols.filter(
      (s) => s.libraryId === instance.libraryId,
    )) {
      const otherRef = other.properties.find((p) => p.key === "Reference")?.value;
      if (!otherRef || !refs.includes(otherRef))
        throw new Error(`${ref}: unlisted USB instance`);
    }
    return { instance, library };
  });
  const targets = new Set(
    plans.flatMap(({ instance, library }) => [instance, library]),
  );
  for (const symbol of targets) {
    for (const pin of symbolPins(symbol)) {
      const number = nativeNumbers[pin.numberString!]!;
      // kicadts' numberString setter changes a pin to instance syntax and clears
      // its (number ...) child. Library pins must retain that structured child.
      if (pin._sxNumber) pin._sxNumber.value = number;
      else pin.numberString = number;
    }
    for (const property of symbol.properties) {
      if (property.key === "Footprint") property.value = usbConnectorPattern.id;
      if (property.key === "Datasheet") property.value = usbConnectorPattern.source.url;
    }
  }
}
