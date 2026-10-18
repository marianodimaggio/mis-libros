import { useEffect, useId, useRef, type ReactNode } from 'react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  variant?: 'modal' | 'panel';
  /** Oculta el título visualmente (sigue nombrando al diálogo). */
  hideTitle?: boolean;
  footer?: ReactNode;
}

/** <dialog> nativo: foco atrapado, Esc y cierre al tocar fuera (con respaldo para Safari). */
export function Modal({ open, onClose, title, children, variant = 'modal', hideTitle, footer }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    const handleClose = () => onCloseRef.current();
    d.addEventListener('close', handleClose);
    const supportsClosedBy = 'closedBy' in HTMLDialogElement.prototype;
    const handleClick = (e: MouseEvent) => {
      if (supportsClosedBy || e.target !== d) return;
      const r = d.getBoundingClientRect();
      const inside = r.top <= e.clientY && e.clientY <= r.bottom && r.left <= e.clientX && e.clientX <= r.right;
      if (!inside) d.close();
    };
    d.addEventListener('click', handleClick);
    return () => {
      d.removeEventListener('close', handleClose);
      d.removeEventListener('click', handleClick);
    };
  }, []);

  return (
    <dialog ref={ref} className={variant} aria-labelledby={titleId} {...{ closedby: 'any' }}>
      {open && (
        <div className={variant === 'panel' ? 'flex h-full flex-col' : 'flex max-h-[85dvh] flex-col'}>
          <header className="flex items-start justify-between gap-4 px-6 pt-5 pb-3">
            <h2 id={titleId} className={hideTitle ? 'sr-only' : 'font-display text-2xl leading-tight font-medium'}>
              {title}
            </h2>
            <button type="button" className="btn btn-quiet -mr-2 px-2.5" onClick={() => ref.current?.close()} aria-label="Cerrar">
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">{children}</div>
          {footer && <footer className="flex flex-wrap justify-end gap-2 border-t border-line px-6 py-4">{footer}</footer>}
        </div>
      )}
    </dialog>
  );
}

interface ConfirmProps {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ open, title, message, confirmLabel, danger, onConfirm, onCancel }: ConfirmProps) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      footer={
        <>
          <button type="button" className="btn" onClick={onCancel}>
            Cancelar
          </button>
          <button type="button" className={danger ? 'btn btn-danger' : 'btn btn-primary'} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </>
      }
    >
      <div className="text-muted leading-relaxed">{message}</div>
    </Modal>
  );
}
