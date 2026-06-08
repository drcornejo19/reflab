"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Loader2, Minus, Plus, X } from "lucide-react";

const cropSize = 300;
const outputSize = 512;
const minZoom = 1;
const maxZoom = 3;

type Point = {
  x: number;
  y: number;
};

type AvatarCropperModalProps = {
  file: File;
  saving: boolean;
  onCancel: () => void;
  onSave: (blob: Blob) => void;
};

export function AvatarCropperModal({
  file,
  saving,
  onCancel,
  onSave,
}: AvatarCropperModalProps) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1.12);
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });
  const [error, setError] = useState<string | null>(null);
  const previewRef = useRef<HTMLCanvasElement | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    startPointer: Point;
    startOffset: Point;
  } | null>(null);

  const sourceUrl = useMemo(() => URL.createObjectURL(file), [file]);

  useEffect(() => () => URL.revokeObjectURL(sourceUrl), [sourceUrl]);

  useEffect(() => {
    if (!sourceUrl) return;

    const nextImage = new Image();
    nextImage.onload = () => {
      setImage(nextImage);
      setOffset({ x: 0, y: 0 });
      setZoom(1.12);
      setError(null);
    };
    nextImage.onerror = () => {
      setImage(null);
      setError("No se pudo abrir la imagen.");
    };
    nextImage.src = sourceUrl;
  }, [sourceUrl]);

  const metrics = useMemo(() => {
    if (!image) return null;

    const baseScale = Math.max(
      cropSize / image.naturalWidth,
      cropSize / image.naturalHeight
    );
    const scale = baseScale * zoom;

    return {
      scale,
      displayWidth: image.naturalWidth * scale,
      displayHeight: image.naturalHeight * scale,
    };
  }, [image, zoom]);

  const clampOffset = useCallback(
    (value: Point) => {
      if (!metrics) return value;

      const maxX = Math.max(0, (metrics.displayWidth - cropSize) / 2);
      const maxY = Math.max(0, (metrics.displayHeight - cropSize) / 2);

      return {
        x: clamp(value.x, -maxX, maxX),
        y: clamp(value.y, -maxY, maxY),
      };
    },
    [metrics]
  );

  const clampedOffset = useMemo(
    () => clampOffset(offset),
    [clampOffset, offset]
  );

  const drawCrop = useCallback(
    (canvas: HTMLCanvasElement, size: number) => {
      if (!image || !metrics) return false;

      canvas.width = size;
      canvas.height = size;
      const context = canvas.getContext("2d");
      if (!context) return false;

      const imageX = (cropSize - metrics.displayWidth) / 2 + clampedOffset.x;
      const imageY = (cropSize - metrics.displayHeight) / 2 + clampedOffset.y;
      const sourceX = Math.max(0, -imageX / metrics.scale);
      const sourceY = Math.max(0, -imageY / metrics.scale);
      const sourceSize = cropSize / metrics.scale;

      context.clearRect(0, 0, size, size);
      context.imageSmoothingQuality = "high";
      context.drawImage(
        image,
        sourceX,
        sourceY,
        sourceSize,
        sourceSize,
        0,
        0,
        size,
        size
      );

      return true;
    },
    [clampedOffset, image, metrics]
  );

  useEffect(() => {
    const canvas = previewRef.current;
    if (!canvas) return;

    drawCrop(canvas, 128);
  }, [drawCrop]);

  async function saveCrop() {
    if (!image || !metrics || saving) return;

    const canvas = document.createElement("canvas");
    const drew = drawCrop(canvas, outputSize);
    if (!drew) {
      setError("No se pudo recortar la imagen.");
      return;
    }

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/png", 0.94);
    });

    if (!blob) {
      setError("No se pudo preparar la imagen.");
      return;
    }

    onSave(blob);
  }

  function updateZoom(value: number) {
    setZoom(clamp(value, minZoom, maxZoom));
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 px-4 py-6 backdrop-blur">
      <section className="w-full max-w-[760px] overflow-hidden rounded-[30px] border border-white/10 bg-[#071019] p-5 text-white shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.28em] text-[#6fc11f]">
              Avatar
            </p>
            <h2 className="mt-2 text-2xl font-black">Recortar foto</h2>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-white/10 bg-white/[0.04] text-zinc-200 transition hover:bg-white/[0.08] disabled:opacity-50"
            title="Cerrar"
          >
            <X size={19} />
          </button>
        </div>

        <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_180px] lg:items-center">
          <div className="min-w-0">
            <div
              className="relative mx-auto overflow-hidden rounded-[28px] border border-[#6fc11f]/30 bg-black shadow-[0_0_40px_rgba(111,193,31,0.12)] touch-none"
              style={{ width: cropSize, height: cropSize }}
              onPointerDown={(event) => {
                if (!image || saving) return;

                dragRef.current = {
                  pointerId: event.pointerId,
                  startPointer: { x: event.clientX, y: event.clientY },
                  startOffset: clampedOffset,
                };
                event.currentTarget.setPointerCapture(event.pointerId);
              }}
              onPointerMove={(event) => {
                const drag = dragRef.current;
                if (!drag || drag.pointerId !== event.pointerId) return;

                const nextOffset = {
                  x: drag.startOffset.x + event.clientX - drag.startPointer.x,
                  y: drag.startOffset.y + event.clientY - drag.startPointer.y,
                };
                setOffset(clampOffset(nextOffset));
              }}
              onPointerUp={(event) => {
                if (dragRef.current?.pointerId === event.pointerId) {
                  dragRef.current = null;
                }
              }}
              onPointerCancel={() => {
                dragRef.current = null;
              }}
            >
              {sourceUrl && metrics && (
                <img
                  src={sourceUrl}
                  alt=""
                  draggable={false}
                  className="absolute max-w-none select-none"
                  style={{
                    width: metrics.displayWidth,
                    height: metrics.displayHeight,
                    transform: `translate(${(cropSize - metrics.displayWidth) / 2 + clampedOffset.x}px, ${(cropSize - metrics.displayHeight) / 2 + clampedOffset.y}px)`,
                  }}
                />
              )}
              <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-white/15" />
              <div className="pointer-events-none absolute inset-5 rounded-full border border-white/30" />
            </div>

            <div className="mt-4 grid gap-3 rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-zinc-400">
                  Zoom
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => updateZoom(zoom - 0.08)}
                    disabled={saving}
                    className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-black/25 text-zinc-200 disabled:opacity-50"
                    title="Alejar"
                  >
                    <Minus size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => updateZoom(zoom + 0.08)}
                    disabled={saving}
                    className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-black/25 text-zinc-200 disabled:opacity-50"
                    title="Acercar"
                  >
                    <Plus size={16} />
                  </button>
                </div>
              </div>
              <input
                type="range"
                min={minZoom}
                max={maxZoom}
                step="0.01"
                value={zoom}
                onChange={(event) => updateZoom(Number(event.target.value))}
                disabled={saving}
                className="w-full accent-[#6fc11f]"
              />
            </div>
          </div>

          <aside className="grid place-items-center gap-4 rounded-[26px] border border-white/10 bg-black/25 p-5">
            <canvas
              ref={previewRef}
              className="h-28 w-28 rounded-full border border-[#6fc11f]/40 bg-black object-cover"
            />
            <div className="grid w-full gap-2">
              <button
                type="button"
                onClick={saveCrop}
                disabled={saving || !image}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-[#6fc11f] px-4 text-sm font-black text-black transition hover:bg-[#82dc2a] disabled:opacity-50"
              >
                {saving ? <Loader2 className="animate-spin" size={17} /> : <Check size={17} />}
                Guardar
              </button>
              <button
                type="button"
                onClick={onCancel}
                disabled={saving}
                className="min-h-11 rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm font-black text-zinc-200 transition hover:bg-white/[0.08] disabled:opacity-50"
              >
                Cancelar
              </button>
            </div>
          </aside>
        </div>

        {error && (
          <div className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-sm font-bold text-red-200">
            {error}
          </div>
        )}
      </section>
    </div>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
