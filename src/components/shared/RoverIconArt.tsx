import React from "react";
import Svg, { Circle, Ellipse, G, Line, Polygon, Rect } from "react-native-svg";

import type { RoverIconId } from "../../constants/roverIcons";

/**
 * Top-down rover artwork for each selectable icon.
 *
 * Every icon points up (the arrow on the body), so rotating it by the rover's
 * heading turns it the right way. The new icons share one 600 x 690 canvas and
 * are centred on the body, so they all pivot around the same point.
 */

const NEW_ICON_VIEWBOX = "60 455 600 690";

function Amber(): React.ReactElement {
  return (
    <G>
      <Rect x={173} y={612} width={22} height={24} fill="#334155" />
      <Rect x={173} y={967} width={22} height={24} fill="#334155" />
      <Rect x={527} y={612} width={22} height={24} fill="#334155" />
      <Rect x={527} y={967} width={22} height={24} fill="#334155" />
      <G fill="#111827" stroke="#475569" strokeWidth={7}>
        <Rect x={70} y={524} width={101} height={198} rx={36} />
        <Rect x={70} y={879} width={101} height={198} rx={36} />
        <Rect x={551} y={524} width={101} height={198} rx={36} />
        <Rect x={551} y={879} width={101} height={198} rx={36} />
      </G>
      <G stroke="#94A3B8" strokeWidth={6} strokeLinecap="round">
        <Line x1={90} y1={588} x2={152} y2={588} />
        <Line x1={90} y1={658} x2={152} y2={658} />
        <Line x1={90} y1={942} x2={152} y2={942} />
        <Line x1={90} y1={1012} x2={152} y2={1012} />
        <Line x1={571} y1={588} x2={632} y2={588} />
        <Line x1={571} y1={658} x2={632} y2={658} />
        <Line x1={571} y1={942} x2={632} y2={942} />
        <Line x1={571} y1={1012} x2={632} y2={1012} />
      </G>
      <Rect x={193} y={500} width={336} height={602} rx={72} fill="#101A30" />
      <Rect x={208} y={516} width={306} height={569} rx={58} fill="#F59E0B" />
      <Rect x={251} y={581} width={220} height={439} rx={45} fill="#111827" />
      <Polygon points="305,680 360,610 415,680 386,680 360,650 334,680" fill="#F59E0B" />
      <Circle cx={361} cy={814} r={57} fill="#F59E0B" />
      <Circle cx={361} cy={814} r={31} fill="#111827" />
      <Circle cx={361} cy={814} r={9} fill="#FFFFFF" />
      <Circle cx={317} cy={945} r={13} fill="#F59E0B" />
      <Circle cx={404} cy={945} r={13} fill="#F59E0B" />
    </G>
  );
}

function Solar(): React.ReactElement {
  const cols = [293, 364];
  const rows = [737, 787, 837];
  return (
    <G>
      <Rect x={173} y={612} width={22} height={24} fill="#334155" />
      <Rect x={173} y={967} width={22} height={24} fill="#334155" />
      <Rect x={527} y={612} width={22} height={24} fill="#334155" />
      <Rect x={527} y={967} width={22} height={24} fill="#334155" />
      <G fill="#111827" stroke="#F97316" strokeWidth={8}>
        <Rect x={70} y={524} width={101} height={198} rx={36} />
        <Rect x={70} y={879} width={101} height={198} rx={36} />
        <Rect x={551} y={524} width={101} height={198} rx={36} />
        <Rect x={551} y={879} width={101} height={198} rx={36} />
      </G>
      <Rect x={193} y={500} width={336} height={602} rx={72} fill="#101A30" />
      <Rect x={208} y={516} width={306} height={569} rx={58} fill="#F97316" />
      <Rect x={251} y={581} width={220} height={439} rx={45} fill="#1E293B" />
      <Polygon points="305,680 360,610 415,680 386,680 360,650 334,680" fill="#FFFFFF" />
      {cols.map((x) =>
        rows.map((y) => (
          <Rect key={`${x}-${y}`} x={x} y={y} width={62} height={40} fill="#38BDF8" />
        )),
      )}
      <Circle cx={317} cy={954} r={13} fill="#FFFFFF" />
      <Circle cx={404} cy={954} r={13} fill="#FFFFFF" />
    </G>
  );
}

function Clean(): React.ReactElement {
  // Drawn 18 units lower than the source so the body (not the spray bar)
  // sits on the canvas centre.
  return (
    <G transform="translate(0 18)">
      <Rect x={173} y={612} width={26} height={24} fill="#334155" />
      <Rect x={173} y={937} width={26} height={24} fill="#334155" />
      <Rect x={523} y={612} width={26} height={24} fill="#334155" />
      <Rect x={523} y={937} width={26} height={24} fill="#334155" />
      <G fill="#111827" stroke="#1DB984" strokeWidth={9}>
        <Rect x={72} y={525} width={97} height={196} rx={36} />
        <Rect x={72} y={849} width={97} height={196} rx={36} />
        <Rect x={553} y={525} width={97} height={196} rx={36} />
        <Rect x={553} y={849} width={97} height={196} rx={36} />
      </G>
      <Rect x={206} y={508} width={310} height={548} rx={66} fill="#FFFFFF" stroke="#1DB984" strokeWidth={16} />
      <Rect x={257} y={573} width={207} height={419} rx={45} fill="#ECFDF5" />
      <Polygon points="308,660 360,597 413,660 385,660 360,631 336,660" fill="#1DB984" />
      <Circle cx={361} cy={778} r={48} fill="#1DB984" />
      <Circle cx={361} cy={778} r={17} fill="#FFFFFF" />
      <Rect x={148} y={1081} width={425} height={13} rx={6.5} fill="#1E293B" />
      <G fill="#1DB984">
        <Circle cx={178} cy={1113} r={11} />
        <Circle cx={269} cy={1113} r={11} />
        <Circle cx={360} cy={1113} r={11} />
        <Circle cx={452} cy={1113} r={11} />
        <Circle cx={543} cy={1113} r={11} />
      </G>
    </G>
  );
}

function bodyFill(status: string): string {
  if (status === "armed") return "#22c55e";
  if (status === "rtk") return "#38bdf8";
  return "#f5c518";
}

function Classic({ status }: { status: string }): React.ReactElement {
  const fill = bodyFill(status);
  return (
    <G>
      <Ellipse cx={-10.4} cy={-7.1} rx={3.15} ry={5.15} fill="#0f172a" />
      <Ellipse cx={10.4} cy={-7.1} rx={3.15} ry={5.15} fill="#0f172a" />
      <Ellipse cx={-10.4} cy={7.1} rx={3.15} ry={5.15} fill="#0f172a" />
      <Ellipse cx={10.4} cy={7.1} rx={3.15} ry={5.15} fill="#0f172a" />
      <Ellipse cx={-10.4} cy={-7.1} rx={1.55} ry={2.7} fill="#64748b" />
      <Ellipse cx={10.4} cy={-7.1} rx={1.55} ry={2.7} fill="#64748b" />
      <Ellipse cx={-10.4} cy={7.1} rx={1.55} ry={2.7} fill="#64748b" />
      <Ellipse cx={10.4} cy={7.1} rx={1.55} ry={2.7} fill="#64748b" />
      <Line x1={-10.4} y1={-10.4} x2={-10.4} y2={-3.8} stroke="#94a3b8" strokeWidth={0.45} />
      <Line x1={10.4} y1={-10.4} x2={10.4} y2={-3.8} stroke="#94a3b8" strokeWidth={0.45} />
      <Line x1={-10.4} y1={3.8} x2={-10.4} y2={10.4} stroke="#94a3b8" strokeWidth={0.45} />
      <Line x1={10.4} y1={3.8} x2={10.4} y2={10.4} stroke="#94a3b8" strokeWidth={0.45} />
      <Rect x={-6.6} y={-8.4} width={13.2} height={16.8} rx={2.6} fill={fill} stroke="#ffffff" strokeWidth={1.15} />
      <Rect x={-5.4} y={-8.4} width={10.8} height={3.4} rx={1.2} fill="#334155" />
      <Rect x={-4.6} y={-4.6} width={9.2} height={5.4} rx={1.1} fill="rgba(15,23,42,0.2)" />
      <Rect x={-3.3} y={2.2} width={6.6} height={4.4} rx={1} fill="#0f172a" />
      <Rect x={-3.6} y={-7.5} width={2.5} height={1.35} rx={0.45} fill="#67e8f9" />
      <Rect x={1.1} y={-7.5} width={2.5} height={1.35} rx={0.45} fill="#67e8f9" />
      <Circle cx={0} cy={8.2} r={1.05} fill="#94a3b8" stroke="#ffffff" strokeWidth={0.45} />
    </G>
  );
}

/**
 * The icon artwork on a transparent square canvas. No rotation and no
 * background: callers rotate it by heading and place it on the map or a card.
 */
export function RoverIconArt({
  id,
  size,
  status = "disarmed",
}: {
  id: RoverIconId;
  size: number;
  /** Only the classic icon changes colour with status. */
  status?: string;
}): React.ReactElement {
  if (id === "classic") {
    return (
      <Svg
        width={size}
        height={size}
        viewBox="-16 -16 32 32"
        style={{ backgroundColor: "transparent" }}
      >
        <Classic status={status} />
      </Svg>
    );
  }

  return (
    <Svg
      width={size}
      height={size}
      viewBox={NEW_ICON_VIEWBOX}
      style={{ backgroundColor: "transparent" }}
    >
      {id === "solar" ? <Solar /> : id === "clean" ? <Clean /> : <Amber />}
    </Svg>
  );
}
