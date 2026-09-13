import { Fragment } from "react";
import type { KicadPcb } from "kicadts";
import { controllerPlacements } from "./placements";

// Board-owned exposed copper, not a purchased component or populated header.
// Positions share the complete controller placement map.
export const controllerTestPoints = (
  [
    { ref: "TP1", net: "GND", label: "GND" },
    { ref: "TP2", net: "V5_PSU", label: "5V PSU" },
    { ref: "TP3", net: "V5_LOGIC", label: "5V LOGIC" },
    { ref: "TP4", net: "V3V3", label: "3V3" },
    { ref: "TP5", net: "SENSOR_SDA", label: "SDA" },
    { ref: "TP6", net: "SENSOR_SCL", label: "SCL" },
    { ref: "TP7", net: "PSU_GOOD", label: "PSU GOOD" },
    { ref: "TP8", net: "RELAY_GATED", label: "RELAY EN" },
    { ref: "TP9", net: "UART0_RX", label: "RX 3V3" },
    { ref: "TP10", net: "UART0_TX", label: "TX 3V3" },
    { ref: "TP11", net: "GND", label: "GND" },
    { ref: "TP12", net: "ACCESSORY_INPUT1", label: "GPIO4" },
    { ref: "TP13", net: "ACCESSORY_INPUT2", label: "GPIO5" },
    { ref: "TP14", net: "GND", label: "GND" },
  ] as const
).map((point) => ({
  ...point,
  x: controllerPlacements[point.ref].pcbX,
  y: controllerPlacements[point.ref].pcbY,
}));

export const controllerTestPointLand = {
  id: "CrystalShim:TestPoint_Pad_D2.0mm_NoPaste",
  copperDiameter: 2,
  maskExpansion: 0.05,
  probeClearanceDiameter: 4,
} as const;

export function ControllerTestPoints() {
  return (
    <group name="ControllerTestPoints" schSheetName="TestPoints">
      {controllerTestPoints.map((point, index) => {
        // Keep the dedicated testpoint source type with our board-owned land.
        const footprintProps = {
          // Each symbol contains its resolved reference text. A unique name
          // prevents reuse of TP1's glyph and origin for wider TP10/TP11 refs.
          symbol: (
            <symbol name={`ControllerTestPoint_${point.ref}`}>
              <port
                name="pin1"
                pinNumber={1}
                schX={-0.4}
                schY={0}
                direction="left"
                kicadPinMetadata={{ electricalType: "passive" }}
              />
              <schematicpath
                strokeWidth={0.03}
                points={[
                  { x: -0.4, y: 0 },
                  { x: -0.15, y: 0 },
                ]}
              />
              <schematiccircle
                center={{ x: 0, y: 0 }}
                radius={0.15}
                strokeWidth={0.03}
              />
              <schematictext
                text="{REF}"
                schX={0.65}
                schY={0}
                anchor="center"
                fontSize={0.18}
              />
            </symbol>
          ),
          footprint: (
            <footprint>
              <smtpad
                portHints={["pin1"]}
                shape="circle"
                radius={controllerTestPointLand.copperDiameter / 2}
                layer="top"
                coveredWithSolderMask={false}
                solderMaskMargin={controllerTestPointLand.maskExpansion}
                solderPasteMargin={-controllerTestPointLand.copperDiameter / 2}
              />
              <courtyardcircle
                radius={controllerTestPointLand.probeClearanceDiameter / 2}
              />
              <silkscreentext text={point.ref} pcbX={0} pcbY={2.2} fontSize={0.8} />
              <silkscreentext text={point.label} pcbX={0} pcbY={-2.2} fontSize={0.8} />
            </footprint>
          ),
        };
        return (
          <Fragment key={point.ref}>
            <testpoint
              {...footprintProps}
              name={point.ref}
              footprintVariant="pad"
              padShape="circle"
              padDiameter={controllerTestPointLand.copperDiameter}
              pcbX={point.x}
              pcbY={point.y}
              layer="top"
              schX={-8 + (index % 3) * 8}
              schY={6 - Math.floor(index / 3) * 4}
              schSheetName="TestPoints"
              connections={{ pin1: `net.${point.net}` }}
              kicadFootprintMetadata={{
                footprintName: controllerTestPointLand.id,
                attributes: {
                  smd: true,
                  exclude_from_bom: true,
                  exclude_from_pos_files: true,
                },
              }}
              kicadSymbolMetadata={{
                inBom: false,
                onBoard: true,
                excludeFromSim: true,
                properties: {
                  Footprint: { value: controllerTestPointLand.id },
                  Description: {
                    value: "Unpopulated exposed copper test pad; no purchased part",
                  },
                },
              }}
            />
            <netlabel net={point.net} connectsTo={`.${point.ref} > .pin1`} />
          </Fragment>
        );
      })}
    </group>
  );
}

/** Initial converter objects ONLY, before first stage serialization. The pinned
 * converter adds F.Paste to every exposed SMD pad even when source paste is
 * absent. Validate this exact pad bank completely, then remove only F.Paste.
 * This is not an API for existing native boards or downstream ECOs. */
export function omitTestPointPasteForInitialExport(board: KicadPcb) {
  const close = (a: number | undefined, b: number) =>
    a !== undefined && Number.isFinite(a) && Math.abs(a - b) < 1e-7;
  const pads = controllerTestPoints.map((point) => {
    const footprints = board.footprints.filter((footprint) =>
      footprint.properties.some((p) => p.key === "Reference" && p.value === point.ref),
    );
    const footprint = footprints[0];
    const pad = footprint?.fpPads[0];
    if (
      footprints.length !== 1 ||
      footprint?.libraryLink !== controllerTestPointLand.id ||
      footprint.layer?.names.join(",") !== "F.Cu" ||
      !footprint.attr?.excludeFromBom ||
      !footprint.attr?.excludeFromPosFiles ||
      footprint.fpPads.length !== 1 ||
      pad?.number !== "1" ||
      pad.padType !== "smd" ||
      pad.shape !== "circle" ||
      pad.drill !== undefined ||
      pad.primitives !== undefined ||
      pad.options !== undefined ||
      !close(pad.at?.x, 0) ||
      !close(pad.at?.y, 0) ||
      !close(pad.size?.width, 2) ||
      !close(pad.size?.height, 2) ||
      !close(pad.solderMaskMargin, 0.05) ||
      pad.layers?.layers.join(",") !== "F.Cu,F.Paste,F.Mask" ||
      pad.net?.name !== point.net
    ) {
      throw new Error(
        `${point.ref}: unexpected test-point initial geometry, net or attributes`,
      );
    }
    return pad;
  });
  for (const pad of pads) pad.layers = ["F.Cu", "F.Mask"];
}
