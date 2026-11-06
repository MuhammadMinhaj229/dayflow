import { ImageResponse } from "next/og";
export const size = { width: 64, height: 64 };
export const contentType = "image/png";
export default function Icon() {
  return new ImageResponse(<div style={{ width: 64, height: 64, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 20, background: "linear-gradient(145deg,#c6d1ff,#829aff)", color: "#101522", fontSize: 34, fontWeight: 800 }}>D</div>, size);
}
