import { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { Loader2 } from 'lucide-react';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

interface PdfPageViewerProps {
  url: string | null;
  page: number;
  onPageCountLoaded?: (numPages: number) => void;
  fitToContainer?: boolean;
  className?: string;
  maxHeightClass?: string;
  darkBackdrop?: boolean;
}

export function PdfPageViewer({
  url,
  page,
  onPageCountLoaded,
  fitToContainer = false,
  className = '',
  maxHeightClass = 'max-h-[72vh]',
  darkBackdrop = false,
}: PdfPageViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pdfDocRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
  const renderTaskRef = useRef<pdfjsLib.RenderTask | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [docReadyUrl, setDocReadyUrl] = useState<string | null>(null);
  const onPageCountLoadedRef = useRef(onPageCountLoaded);
  onPageCountLoadedRef.current = onPageCountLoaded;

  // Load PDF document ONLY when url changes
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
        onPageCountLoadedRef.current?.(pdf.numPages);
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
  }, [url]);

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
        const targetWidth = Math.min(
          1600,
          Math.max(960, baseViewport.width * 1.6)
        );
        const scale = targetWidth / baseViewport.width;
        const viewport = pdfPage.getViewport({ scale });

        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);

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

  if (!url) {
    return (
      <div className="flex items-center justify-center h-64 rounded-xl border border-dashed border-slate-300 bg-slate-50 text-xs text-slate-500">
        表示する資料を選択してください
      </div>
    );
  }

  return (
    <div
      className={`relative flex flex-col ${
        fitToContainer ? 'h-full min-h-0 flex-1' : ''
      } ${className}`}
    >
      <div
        className={`relative flex items-center justify-center rounded-xl border ${
          fitToContainer
            ? 'flex-1 min-h-0 w-full h-full overflow-hidden p-1'
            : `overflow-auto ${maxHeightClass}`
        } ${
          darkBackdrop
            ? 'bg-slate-950 border-slate-800'
            : 'bg-slate-100 border-slate-200'
        }`}
      >
        <canvas
          ref={canvasRef}
          className={
            fitToContainer
              ? 'block max-w-full max-h-full w-auto h-auto object-contain bg-white shadow-lg'
              : 'block w-full max-w-5xl h-auto bg-white'
          }
        />

        {loading && (
          <div className="absolute top-3 right-3 pointer-events-none">
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-900/80 text-white text-[11px] font-medium shadow-md">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400" />
              <span>読込中...</span>
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
