"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import type { Stop } from "@/lib/types";
import { cityCenter } from "@/lib/cities";

const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

type Props = {
  stops: Stop[];
  activeIndex: number | null;
  onSelect?: (index: number) => void;
  city?: string;
};

function normalizeMode(
  mode: string,
): "metro" | "bus" | "train" | "walk" | "ferry" | "cab" {
  const m = mode.toLowerCase();
  if (
    m.includes("metro") ||
    m.includes("tube") ||
    m.includes("underground") ||
    m.includes("subway") ||
    m.includes("mrt")
  )
    return "metro";
  if (m.includes("ferry") || m.includes("boat") || m.includes("water"))
    return "ferry";
  if (
    m.includes("cab") ||
    m.includes("taxi") ||
    m.includes("uber") ||
    m.includes("car")
  )
    return "cab";
  if (m.includes("bus") || m.includes("tram")) return "bus";
  if (m.includes("train") || m.includes("rail")) return "train";

  return "walk";
}

function getPolylineStyle(mode: string) {
  const nm = normalizeMode(mode);
  switch (nm) {
    case "metro":
      return { color: "#E040FB", weight: 6, opacity: 1, dashArray: undefined };
    case "bus":
      return { color: "#d40058", weight: 5, opacity: 1, dashArray: undefined };
    case "train":
      return { color: "#FF6D00", weight: 6, opacity: 1, dashArray: undefined };
    case "ferry":
      return { color: "#0015ff", weight: 5, opacity: 1, dashArray: "6, 8" };
    case "cab":
      return { color: "#8c00ff", weight: 5, opacity: 1, dashArray: undefined };
    default:
      return { color: "#056f3c", weight: 5, opacity: 1, dashArray: "6, 10" };
  }
}

export function JourneyGenie({ stops, activeIndex, onSelect, city }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const layerRef = useRef<any>(null);
  const LRef = useRef<any>(null);
  const [ready, setReady] = useState(false);

  const points = useMemo(
    () => stops.map((s) => [s.lat, s.lng] as [number, number]),
    [stops],
  );

  // Init map once
  useEffect(() => {
    let cancelled = false;
    if (
      typeof window === "undefined" ||
      mapRef.current ||
      !containerRef.current
    )
      return;

    import("leaflet").then((mod) => {
      if (cancelled || !containerRef.current || mapRef.current) return;
      const L = mod.default ?? mod;
      LRef.current = L;

      const fallback = cityCenter(city ?? "");
      const map = L.map(containerRef.current, { zoomControl: true }).setView(
        points[0] ?? fallback.center,
        points[0] ? 13 : fallback.zoom,
      );

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap",
        maxZoom: 19,
      }).addTo(map);

      // Custom panes above tiles (tiles = z200, labels = z299)
      map.createPane("routePane");
      map.getPane("routePane")!.style.zIndex = "350";
      map.createPane("markerPane2");
      map.getPane("markerPane2")!.style.zIndex = "360";

      mapRef.current = map;
      layerRef.current = L.layerGroup().addTo(map);

      // Legend
      const legendHtml = `
        <div style="background:rgba(0,0,0,0.85);border-radius:8px;padding:8px 12px;font-size:11px;color:#fff;line-height:2;font-family:Inter,sans-serif;border:1px solid rgba(255,255,255,0.15)">
          <div><span style="display:inline-block;width:24px;height:4px;background:#E040FB;margin-right:8px;vertical-align:middle;border-radius:2px"></span>Metro</div>
          <div><span style="display:inline-block;width:24px;height:4px;background:#d40058;margin-right:8px;vertical-align:middle;border-radius:2px"></span>Bus</div>
          <div><span style="display:inline-block;width:24px;height:4px;background:#FF6D00;margin-right:8px;vertical-align:middle;border-radius:2px"></span>Train</div>
          <div><span style="display:inline-block;width:24px;height:4px;background:#8c00ff;margin-right:8px;vertical-align:middle;border-radius:2px"></span>Cab</div>
          <div style="display:flex;align-items:center"><span style="display:inline-block;width:24px;border-top:3px dashed #056f3c;margin-right:8px"></span>Walk</div>
          <div><span style="display:inline-block;width:24px;height:4px;background:#0015ff;margin-right:8px;vertical-align:middle;border-radius:2px;border-top:3px dashed #0015ff;background:none"></span>Ferry</div>
        </div>`;

      const Legend = L.Control.extend({
        onAdd: () => {
          const div = L.DomUtil.create("div");
          div.innerHTML = legendHtml;
          return div;
        },
      });
      new Legend({ position: "bottomleft" }).addTo(map);

      setReady(true);
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Redraw markers and polylines on stop/day change
  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!L || !map || !layer) return;

    layer.clearLayers();
    if (!stops.length) return;

    // Offset overlapping markers
    const usedPositions: Array<[number, number]> = [];

    stops.forEach((s, i) => {
      let lat = s.lat;
      let lng = s.lng;

      let offsetStep = 0;
      while (
        usedPositions.some(([pLat, pLng]) => {
          const dLat = (lat - pLat) * 111000;
          const dLng = (lng - pLng) * 111000 * Math.cos((lat * Math.PI) / 180);
          return Math.sqrt(dLat * dLat + dLng * dLng) < 80;
        })
      ) {
        offsetStep++;
        lat = s.lat + offsetStep * 0.00035 * Math.cos(offsetStep * 1.2);
        lng = s.lng + offsetStep * 0.00035 * Math.sin(offsetStep * 1.2);
      }
      usedPositions.push([lat, lng]);

      const icon = L.divIcon({
        className: "",
        // html: `<div class="leaflet-marker-letter ${i === activeIndex ? "active" : ""}">${letters[i] ?? i + 1}</div>`,
        html: `<div class="leaflet-marker-letter ${i === activeIndex ? "active" : ""}"><span>${letters[i] ?? i + 1}</span></div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });

      const m = L.marker([lat, lng], { icon, pane: "markerPane2" })
        .addTo(layer)
        .bindTooltip(`<b>${letters[i]}.</b> ${s.name}`, { direction: "top" });
      if (onSelect) m.on("click", () => onSelect(i));
    });

    // Per-leg colored polylines
    if (points.length > 1) {
      for (let i = 1; i < stops.length; i++) {
        const from: [number, number] = [
          usedPositions[i - 1][0],
          usedPositions[i - 1][1],
        ];
        const to: [number, number] = [usedPositions[i][0], usedPositions[i][1]];
        const mode = stops[i].transport_from_previous?.mode ?? "walk";
        const style = getPolylineStyle(mode);
        L.polyline([from, to], { ...style, pane: "routePane" }).addTo(layer);
      }
    }

    const bounds = L.latLngBounds(usedPositions);
    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
  }, [stops, activeIndex, points, onSelect, ready]);

  // Fly to active stop
  useEffect(() => {
    if (activeIndex == null || !mapRef.current) return;
    const s = stops[activeIndex];
    if (s) mapRef.current.flyTo([s.lat, s.lng], 15, { duration: 0.5 });
  }, [activeIndex, stops]);

  return <div ref={containerRef} className="h-full w-full" />;
}
