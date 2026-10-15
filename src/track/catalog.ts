/**
 * Full ground-truth catalog -- every track in TUMFTM/racetrack-database (LGPL-3.0).
 * Centerline + widths + minimum-curvature raceline, smoothed from OpenStreetMap.
 * https://github.com/TUMFTM/racetrack-database
 */
import type { Track, Xy } from "@/track/frame";
import { texas, texasRace } from "@/track/texas";
import { brandshatch, brandshatchRace } from "@/track/brandshatch";
import { budapest, budapestRace } from "@/track/budapest";
import { catalunya, catalunyaRace } from "@/track/catalunya";
import { hockenheim, hockenheimRace } from "@/track/hockenheim";
import { ims, imsRace } from "@/track/ims";
import { melbourne, melbourneRace } from "@/track/melbourne";
import { mexicocity, mexicocityRace } from "@/track/mexicocity";
import { montreal, montrealRace } from "@/track/montreal";
import { monza, monzaRace } from "@/track/monza";
import { moscow, moscowRace } from "@/track/moscow";
import { norisring, norisringRace } from "@/track/norisring";
import { nuerburgring, nuerburgringRace } from "@/track/nuerburgring";
import { oschersleben, oscherslebenRace } from "@/track/oschersleben";
import { sakhir, sakhirRace } from "@/track/sakhir";
import { saopaulo, saopauloRace } from "@/track/saopaulo";
import { sepang, sepangRace } from "@/track/sepang";
import { shanghai, shanghaiRace } from "@/track/shanghai";
import { silverstone, silverstoneRace } from "@/track/silverstone";
import { sochi, sochiRace } from "@/track/sochi";
import { spa, spaRace } from "@/track/spa";
import { spielberg, spielbergRace } from "@/track/spielberg";
import { suzuka, suzukaRace } from "@/track/suzuka";
import { yasmarina, yasmarinaRace } from "@/track/yasmarina";
import { zandvoort, zandvoortRace } from "@/track/zandvoort";

export const TRACKS = [
  spa,
  monza,
  texas,
  silverstone,
  suzuka,
  catalunya,
  melbourne,
  sepang,
  shanghai,
  sakhir,
  montreal,
  spielberg,
  budapest,
  saopaulo,
  yasmarina,
  sochi,
  mexicocity,
  hockenheim,
  brandshatch,
  moscow,
  norisring,
  nuerburgring,
  oschersleben,
  zandvoort,
  ims,
] as const satisfies readonly Track[];

export type CatalogTrack = (typeof TRACKS)[number];

/** Minimum-curvature racelines by track id (shared origin with the centerline). */
export const RACE_LINES: Record<string, readonly Xy[]> = {
  spa: spaRace,
  monza: monzaRace,
  texas: texasRace,
  silverstone: silverstoneRace,
  suzuka: suzukaRace,
  catalunya: catalunyaRace,
  melbourne: melbourneRace,
  sepang: sepangRace,
  shanghai: shanghaiRace,
  sakhir: sakhirRace,
  montreal: montrealRace,
  spielberg: spielbergRace,
  budapest: budapestRace,
  saopaulo: saopauloRace,
  yasmarina: yasmarinaRace,
  sochi: sochiRace,
  "mexico-city": mexicocityRace,
  mexicocity: mexicocityRace,
  hockenheim: hockenheimRace,
  brandshatch: brandshatchRace,
  moscow: moscowRace,
  norisring: norisringRace,
  nuerburgring: nuerburgringRace,
  oschersleben: oscherslebenRace,
  zandvoort: zandvoortRace,
  ims: imsRace,
};

export function raceLineFor(trackId: string): readonly Xy[] | undefined {
  return RACE_LINES[trackId];
}
