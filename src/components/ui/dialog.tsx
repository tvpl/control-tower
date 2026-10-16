"use client";
import * as Dialog from "@radix-ui/react-dialog";
import { useRef } from "react";
import { X } from "lucide-react";
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  drawer = false,
  wide = false,
  className = "",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  drawer?: boolean;
  wide?: boolean;
  className?: string;
}) {
  const previousFocus = useRef<HTMLElement | null>(null);
  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="overlay" />
        <Dialog.Content
          className={`${drawer ? "dialog drawer" : wide ? "dialog wide" : "dialog"} ${className}`}
          onOpenAutoFocus={() => {
            previousFocus.current = document.activeElement as HTMLElement;
          }}
          onCloseAutoFocus={(event) => {
            if (previousFocus.current?.isConnected) {
              event.preventDefault();
              previousFocus.current.focus();
            }
          }}
        >
          <header className="dialog-header">
            <div>
              <Dialog.Title>{title}</Dialog.Title>
              <Dialog.Description className="muted">
                {description ||
                  "Consulte ou altere o registro no contexto do programa."}
              </Dialog.Description>
            </div>
            <Dialog.Close className="icon-button" aria-label="Fechar painel">
              <X size={18} />
            </Dialog.Close>
          </header>
          <div
            className="dialog-body"
            tabIndex={0}
            role="region"
            aria-label={`Conteúdo de ${title}`}
          >
            {children}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
