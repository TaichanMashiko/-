import { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { Eraser, Highlighter, Loader2, Pen, Trash2 } from 'lucide-react';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

type DrawTool = 'none' | 'pen' | 'highlighter' | 'eraser';

interface PdfPageViewerProps {
  url: string | null;
  page: number;
  onPageCountLoaded?: (numPages: number) => void;
  enableAnnotations?: boolean;
  className?: string;
  maxHeightClass?: string;
  darkBackdrop?: boolean;
}

export function PdfPageViewer({
  url,
  page,
  onPageCountLoaded,
  enableAnnotations = false,
  className = '',
  maxHeightClass = 'max-h-[72vh]',
  darkBackdrop = false,
}: PdfPageViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const pdfDocRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
  const renderTaskRef = useRef<pdfjsLib.RenderTask | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [docReadyUrl, setDocReadyUrl] = useState<string | null>(null);

  // Annotation state (per-page stored in memory)
  const [drawTool, setDrawTool] = useState<DrawTool>('none');
  const [penColor, setPenColor] = useState('#ef4444');
  const isDrawingRef = useRef(false);
  const pageAnnotationsRef = useRef<Map<string, string>>(new Map());

  // Load PDF document when url changes
  useEffect(() => {
    let cancelled = false;
    setError(null);
    setDocReadyUrl(null);

    if (!url) {
      pdfDocRef.current = null;
      return;
    }

    setLoading(true);
    const loadingTask = pdfjsLib.getDocument({
      url,
      cMapUrl: 'https://unpkg.com/pdfjs-dist@5.4.624/cmaps/',
      cMapPacked: true,
    });

    loadingTask.promise
      .then((pdf) => {
        if (cancelled) {
          void pdf.cleanup();
          return;
        }
        pdfDocRef.current = pdf;
        setDocReadyUrl(url);
        onPageCountLoaded?.(pdf.numPages);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? `PDFの読み込みに失敗しました (${err.message})`
              : 'PDFの読み込みに失敗しました。'
          );
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
      void loadingTask.destroy();
    };
  }, [url, onPageCountLoaded]);

  // Render current page onto canvas
  useEffect(() => {
    const pdf = pdfDocRef.current;
    const canvas = canvasRef.current;
    if (!pdf || !canvas || docReadyUrl !== url) return;

    let cancelled = false;
    const safePage = Math.min(Math.max(1, page), pdf.numPages);

    setLoading(true);
    setError(null);

    const renderPage = async () => {
      try {
        if (renderTaskRef.current) {
          renderTaskRef.current.cancel();
          renderTaskRef.current = null;
        }
        const pdfPage = await pdf.getPage(safePage);
        if (cancelled) return;

        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const baseViewport = pdfPage.getViewport({ scale: 1 });
        const targetWidth = Math.min(1280, Math.max(760, baseViewport.width * 1.4));
        const scale = targetWidth / baseViewport.width;
        const viewport = pdfPage.getViewport({ scale });

        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = '100%';
        canvas.style.height = 'auto';

        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        const task = pdfPage.render({
          canvasContext: ctx,
          viewport,
          canvas,
        });
        renderTaskRef.current = task;
        await task.promise;

        if (!cancelled && drawCanvasRef.current) {
          const dc = drawCanvasRef.current;
          dc.width = canvas.width;
          dc.height = canvas.height;
          const dctx = dc.getContext('2d');
          if (dctx) {
            dctx.clearRect(0, 0, dc.width, dc.height);
            const saved = pageAnnotationsRef.current.get(`${url}#${safePage}`);
            if (saved) {
              const img = new Image();
              img.onload = () => dctx.drawImage(img, 0, 0);
              img.src = saved;
            }
          }
        }
      } catch (err) {
        if (
          !cancelled &&
          !(err instanceof Error && err.name === 'RenderingCancelledException')
        ) {
          setError('ページの描画中にエラーが発生しました。');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void renderPage();

    return () => {
      cancelled = true;
    };
  }, [docReadyUrl, page, url]);

  const getCanvasPoint = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const dc = drawCanvasRef.current;
    if (!dc) return null;
    const rect = dc.getBoundingClientRect();
    const scaleX = dc.width / rect.width;
    const scaleY = dc.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (drawTool === 'none' || !drawCanvasRef.current) return;
    const pt = getCanvasPoint(e);
    if (!pt) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    isDrawingRef.current = true;
    const ctx = drawCanvasRef.current.getContext('2d');
    if (!ctx) return;
    ctx.beginPath();
    ctx.moveTo(pt.x, pt.y);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (drawTool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.lineWidth = 34;
    } else if (drawTool === 'highlighter') {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = 'rgba(250, 204, 21, 0.35)';
      ctx.lineWidth = 28;
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = penColor;
      ctx.lineWidth = 5;
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current || !drawCanvasRef.current) return;
    const pt = getCanvasPoint(e);
    if (!pt) return;
    const ctx = drawCanvasRef.current.getContext('2d');
    if (!ctx) return;
    ctx.lineTo(pt.x, pt.y);
    ctx.stroke();
  };

  const handlePointerUp = () => {
    if (!isDrawingRef.current || !drawCanvasRef.current || !url) return;
    isDrawingRef.current = false;
    pageAnnotationsRef.current.set(
      `${url}#${page}`,
      drawCanvasRef.current.toDataURL()
    );
  };

  const clearAnnotations = () => {
    if (!drawCanvasRef.current || !url) return;
    const ctx = drawCanvasRef.current.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, drawCanvasRef.current.width, drawCanvasRef.current.height);
    }
    pageAnnotationsRef.current.delete(`${url}#${page}`);
  };

  if (!url) {
    return (
      <div className="flex items-center justify-center h-64 rounded-xl border border-dashed border-slate-300 bg-slate-50 text-xs text-slate-500">
        表示する資料を選択してください
      </div>
    );
  }

  return (
    <div className={`relative flex flex-col ${className}`}>
      {enableAnnotations && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 bg-slate-900/95 text-slate-200 rounded-t-xl border-b border-slate-800 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-slate-400 mr-1">板書ペン:</span>
            <button
              type="button"
              onClick={() => setDrawTool(drawTool === 'pen' ? 'none' : 'pen')}
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-md transition-colors cursor-pointer ${
                drawTool === 'pen'
                  ? 'bg-rose-600 text-white'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
              }`}
            >
              <Pen className="w-3.5 h-3.5" />
              <span>ペン</span>
            </button>
            <button
              type="button"
              onClick={() =>
                setDrawTool(drawTool === 'highlighter' ? 'none' : 'highlighter')
              }
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-md transition-colors cursor-pointer ${
                drawTool === 'highlighter'
                  ? 'bg-amber-500 text-slate-950 font-semibold'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
              }`}
            >
              <Highlighter className="w-3.5 h-3.5" />
              <span>マーカー</span>
            </button>
            <button
              type="button"
              onClick={() =>
                setDrawTool(drawTool === 'eraser' ? 'none' : 'eraser')
              }
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-md transition-colors cursor-pointer ${
                drawTool === 'eraser'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
              }`}
            >
              <Eraser className="w-3.5 h-3.5" />
              <span>消しゴム</span>
            </button>
            {drawTool === 'pen' && (
              <div className="flex items-center gap-1 ml-1">
                {['#ef4444', '#2563eb', '#16a34a', '#111827'].map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setPenColor(c)}
                    className={`w-4 h-4 rounded-full border cursor-pointer ${
                      penColor === c
                        ? 'border-white ring-2 ring-white/50'
                        : 'border-slate-500'
                    }`}
                    style={{ backgroundColor: c }}
                    aria-label="ペンの色を変更"
                  />
                ))}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={clearAnnotations}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>書き込み消去</span>
          </button>
        </div>
      )}

      <div
        className={`relative overflow-auto flex items-start justify-center ${maxHeightClass} ${
          darkBackdrop ? 'bg-slate-950' : 'bg-slate-100'
        } ${enableAnnotations ? 'rounded-b-xl' : 'rounded-xl'} border border-slate-200`}
      >
        <div className="relative inline-block w-full max-w-5xl">
          <canvas ref={canvasRef} className="block w-full h-auto bg-white" />
          {enableAnnotations && (
            <canvas
              ref={drawCanvasRef}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
              className={`absolute inset-0 w-full h-full touch-none ${
                drawTool === 'none'
                  ? 'pointer-events-none'
                  : 'pointer-events-auto cursor-crosshair'
              }`}
            />
          )}
        </div>

        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-950/35 backdrop-blur-[1px]">
            <div className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-white/95 text-slate-800 text-xs font-medium shadow-md">
              <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
              <span>ページを描画中...</span>
            </div>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex items-center justify-center p-4 bg-white/95">
            <p className="text-xs font-medium text-rose-600">{error}</p>
          </div>
        )}
      </div>
    </div>
  );
}
