import { useCallback, useEffect, useRef, useState } from 'react';

interface UseDocumentPiPOptions {
  width: number;
  height: number;
  title?: string;
  bodyClassName?: string;
}

interface UseDocumentPiPResult {
  pipContainer: HTMLElement | null;
  isPipOpen: boolean;
  isPipSupported: boolean;
  pipNotice: string | null;
  openPip: () => Promise<void>;
  closePip: () => void;
  clearNotice: () => void;
}

function copyStylesToPipWindow(pipWindow: Window, bodyClassName: string) {
  const targetHead = pipWindow.document.head;

  // Copy font preconnect / stylesheet link elements
  document.querySelectorAll('link[rel="stylesheet"]').forEach((linkEl) => {
    const cloned = pipWindow.document.createElement('link');
    cloned.rel = 'stylesheet';
    const href = linkEl.getAttribute('href');
    if (href) {
      cloned.href = new URL(href, window.location.href).href;
      targetHead.appendChild(cloned);
    }
  });

  // Copy all accessible CSS rules (including Tailwind v4 & custom keyframes)
  Array.from(document.styleSheets).forEach((styleSheet) => {
    try {
      const cssRules = Array.from(styleSheet.cssRules)
        .map((rule) => rule.cssText)
        .join('\n');
      if (cssRules.trim().length > 0) {
        const styleEl = pipWindow.document.createElement('style');
        styleEl.textContent = cssRules;
        targetHead.appendChild(styleEl);
      }
    } catch {
      if (styleSheet.href) {
        const linkEl = pipWindow.document.createElement('link');
        linkEl.rel = 'stylesheet';
        linkEl.href = styleSheet.href;
        targetHead.appendChild(linkEl);
      }
    }
  });

  pipWindow.document.documentElement.lang = 'ja';
  pipWindow.document.documentElement.style.height = '100%';
  pipWindow.document.documentElement.style.margin = '0';
  pipWindow.document.body.style.height = '100%';
  pipWindow.document.body.style.margin = '0';
  pipWindow.document.body.style.padding = '0';
  pipWindow.document.body.style.overflow = 'hidden';
  pipWindow.document.body.className = bodyClassName;
}

export function useDocumentPiP({
  width,
  height,
  title = 'ClassPulse 小窓',
  bodyClassName = 'bg-slate-50 text-slate-900 antialiased',
}: UseDocumentPiPOptions): UseDocumentPiPResult {
  const [pipContainer, setPipContainer] = useState<HTMLElement | null>(null);
  const [pipNotice, setPipNotice] = useState<string | null>(null);
  const pipWindowRef = useRef<Window | null>(null);

  const isPipSupported =
    typeof window !== 'undefined' &&
    'documentPictureInPicture' in window &&
    typeof window.documentPictureInPicture?.requestWindow === 'function';

  const closePip = useCallback(() => {
    if (pipWindowRef.current && !pipWindowRef.current.closed) {
      pipWindowRef.current.close();
    }
    pipWindowRef.current = null;
    setPipContainer(null);
  }, []);

  const openPip = useCallback(async () => {
    setPipNotice(null);

    if (!isPipSupported || !window.documentPictureInPicture) {
      setPipNotice(
        'ご利用のブラウザまたはプレビュー環境（iframe内）では Document Picture-in-Picture API が利用できないため、通常画面のまま動作します。Chrome / Edge で直接ページを開くと最前面の小窓を起動できます。'
      );
      return;
    }

    if (pipWindowRef.current && !pipWindowRef.current.closed) {
      pipWindowRef.current.focus();
      return;
    }

    try {
      const pipWin = await window.documentPictureInPicture.requestWindow({
        width,
        height,
        preferInitialWindowPlacement: true,
      });

      pipWin.document.title = title;
      copyStylesToPipWindow(pipWin, bodyClassName);

      const container = pipWin.document.createElement('div');
      container.id = 'pip-root';
      container.style.width = '100%';
      container.style.height = '100%';
      pipWin.document.body.appendChild(container);

      pipWindowRef.current = pipWin;
      setPipContainer(container);

      pipWin.addEventListener('pagehide', () => {
        pipWindowRef.current = null;
        setPipContainer(null);
      });
    } catch {
      setPipNotice(
        'プレビュー環境（iframe制限）またはブラウザ設定により最前面の小窓を開けませんでした。通常画面モードでそのまま全機能をご利用いただけます。'
      );
      pipWindowRef.current = null;
      setPipContainer(null);
    }
  }, [bodyClassName, height, isPipSupported, title, width]);

  useEffect(() => {
    return () => {
      if (pipWindowRef.current && !pipWindowRef.current.closed) {
        pipWindowRef.current.close();
      }
    };
  }, []);

  const clearNotice = useCallback(() => setPipNotice(null), []);

  return {
    pipContainer,
    isPipOpen: pipContainer !== null,
    isPipSupported,
    pipNotice,
    openPip,
    closePip,
    clearNotice,
  };
}
