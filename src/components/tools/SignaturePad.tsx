"use client";

import { useEffect, useRef, useState } from "react";

// Minimal e-sign capture: type / draw / upload. No canvas-position field
// editor here -- this only produces the signature IMAGE/text handed to
// the submit call; where it lands on the final document is decided
// server-side by the AI-detected field position.
export default function SignaturePad({ onChange }: { onChange: (value: { type: "typed" | "drawn" | "uploaded"; value: string } | null) => void }) {
  const [tab, setTab] = useState<"typed" | "drawn" | "uploaded">("typed");
  const [typedName, setTypedName] = useState("");
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const hasDrawnRef = useRef(false);
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);

  useEffect(() => {
    if (tab === "typed") {
      onChange(typedName.trim() ? { type: "typed", value: typedName.trim() } : null);
    }
    // draw/upload push their own value on interaction, not on tab switch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, typedName]);

  function clearCanvas() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx?.clearRect(0, 0, canvas.width, canvas.height);
    hasDrawnRef.current = false;
    onChange(null);
  }

  function pointerPos(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function startDraw(e: React.PointerEvent<HTMLCanvasElement>) {
    drawingRef.current = true;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = pointerPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }
  function moveDraw(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = pointerPos(e);
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#111";
    ctx.lineTo(x, y);
    ctx.stroke();
    hasDrawnRef.current = true;
  }
  function endDraw() {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    const canvas = canvasRef.current;
    if (canvas && hasDrawnRef.current) {
      onChange({ type: "drawn", value: canvas.toDataURL("image/png") });
    }
  }

  function handleUpload(file: File | null) {
    if (!file) return;
    if (!["image/png", "image/jpeg"].includes(file.type)) {
      onChange(null);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setUploadPreview(dataUrl);
      onChange({ type: "uploaded", value: dataUrl });
    };
    reader.readAsDataURL(file);
  }

  return (
    <div>
      <div className="flex gap-1 mb-2">
        {(["typed", "drawn", "uploaded"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`text-[11.5px] font-bold px-2.5 py-1.5 rounded-sm border ${
              tab === t ? "bg-brand text-white border-brand" : "bg-page text-ink-muted border-border"
            }`}
          >
            {t === "typed" ? "Type" : t === "drawn" ? "Draw" : "Upload"}
          </button>
        ))}
      </div>

      {tab === "typed" && (
        <input
          value={typedName}
          onChange={(e) => setTypedName(e.target.value)}
          placeholder="Type your full name"
          className="w-full border border-border rounded-sm px-3 py-2.5 text-[20px] italic bg-surface"
          style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
        />
      )}

      {tab === "drawn" && (
        <div>
          <canvas
            ref={canvasRef}
            width={480}
            height={130}
            onPointerDown={startDraw}
            onPointerMove={moveDraw}
            onPointerUp={endDraw}
            onPointerLeave={endDraw}
            className="w-full border border-border rounded-sm bg-white touch-none"
            style={{ height: 130 }}
          />
          <button onClick={clearCanvas} className="mt-1.5 text-[11px] font-semibold text-ink-muted">
            Clear
          </button>
        </div>
      )}

      {tab === "uploaded" && (
        <div>
          <input
            type="file"
            accept="image/png,image/jpeg"
            onChange={(e) => handleUpload(e.target.files?.[0] || null)}
            className="text-[12px]"
          />
          {uploadPreview && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={uploadPreview} alt="Signature preview" className="mt-2 max-h-20 border border-border rounded-sm bg-white p-1" />
          )}
        </div>
      )}
    </div>
  );
}
