import {
  controllerCapacitors,
  controllerResistors,
  precisionResistors,
} from "./passive-components";
import { ap63203, tca9517a } from "./ic-land-patterns";
import { dbv6, dbv5, fsusb42 } from "./logic-land-patterns";
import { tps259470a, smbj8_0ca } from "./service-protection-land-patterns";
import { esds312, smbj7_0a } from "./cable-protection-land-patterns";
import { buckInductorPattern } from "./assembly-components";
import { microFitEvidence } from "./micro-fit-components";
import { usbConnectorPattern } from "./usb-connector";

// Exact source metadata lost by the pinned Circuit JSON serialization. Reuse
// the selected model evidence where available; never infer a datasheet by family.
export const controllerDatasheets: Readonly<Record<string, string>> = {
  ...Object.fromEntries(
    [...Object.values(controllerResistors), ...Object.values(precisionResistors)].map(
      (part) => [part.mpn, part.pattern.source.url],
    ),
  ),
  ...Object.fromEntries(
    Object.values(controllerCapacitors).map((part) => [part.mpn, part.datasheetUrl]),
  ),
  "AP63203WU-7": ap63203.source.url,
  AO3400A: "https://www.aosmd.com/res/data_sheets/AO3400A.pdf",
  TCA9517ADGKR: tca9517a.source.url,
  TPS3808G01DBVR: dbv6.source.url,
  TPS2553DBVR: "https://www.ti.com/lit/ds/symlink/tps2553.pdf",
  SN74LVC1G08DBVR: dbv5.source.url,
  SN74LVC1G14DBVR: "https://www.ti.com/lit/ds/symlink/sn74lvc1g14.pdf",
  FSUSB42MUX: fsusb42.source.url,
  TPS259470ARPWR: tps259470a.source.url,
  "SMBJ8.0CA": smbj8_0ca.source.url,
  "SMBJ7.0A": smbj7_0a.source.url,
  ESDS312DBVR: esds312.source.url,
  STPS2L40U: "https://www.st.com/resource/en/datasheet/stps2l40.pdf",
  "USBLC6-2SC6": "https://www.st.com/resource/en/datasheet/usblc6-2.pdf",
  "ESP32-C6-WROOM-1-N8":
    "https://www.espressif.com/sites/default/files/documentation/esp32-c6-wroom-1_wroom-1u_datasheet_en.pdf",
  "43650-0300": microFitEvidence.psu.url,
  "43045-0200": microFitEvidence.service.url,
  "43045-0600": microFitEvidence.sensor.url,
  "USB4105-GF-A": usbConnectorPattern.source.url,
  "SRP5030TA-4R7M": buckInductorPattern.source.url,
  WP710A10LGD: "https://www.kingbrightusa.com/images/catalog/SPEC/WP710A10LGD.pdf",
  "B3F-1002-G": "https://omronfs.omron.com/en_US/ecb/products/pdf/en-b3f.pdf",
};
