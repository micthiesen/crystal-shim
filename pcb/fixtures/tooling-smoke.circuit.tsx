// TOOLING ONLY: these arbitrary parts and dimensions are not a Crystal Shim design.
export default () => (
  <board width="20mm" height="10mm">
    <schematicsheet name="Main" displayName="TOOLING ONLY" sheetIndex={0} />
    <resistor
      name="R1"
      resistance="1k"
      footprint="0603"
      pcbX={-4}
      pcbY={0}
      schX={-3}
      schY={0}
      schSheetName="Main"
      connections={{ pin1: "net.TOOLING_IN", pin2: "net.TOOLING_OUT" }}
    />
    <capacitor
      name="C1"
      capacitance="100nF"
      footprint="0603"
      pcbX={4}
      pcbY={0}
      schX={3}
      schY={0}
      schOrientation="vertical"
      schSheetName="Main"
      connections={{ pin1: "net.TOOLING_OUT", pin2: "net.TOOLING_GND" }}
    />
  </board>
);
