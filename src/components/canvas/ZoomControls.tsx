import { Minus, Plus, Maximize2 } from "lucide-react";
import { motion } from "framer-motion";

interface Props {
  scale: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
  onFit: () => void;
  canFit: boolean;
}

export function ZoomControls({ scale, onZoomIn, onZoomOut, onReset, onFit, canFit }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.3 }}
      className="absolute bottom-6 right-6 z-20 flex items-center gap-1 rounded-xl border border-border bg-card/90 px-2 py-1.5 shadow-lg backdrop-blur-md"
    >
      <IconButton label="Zoom out" onClick={onZoomOut}>
        <Minus className="h-4 w-4" />
      </IconButton>
      <button
        onClick={onReset}
        title="Reset zoom to 100%"
        className="min-w-12 rounded-lg px-1.5 py-1 font-mono text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        {Math.round(scale * 100)}%
      </button>
      <IconButton label="Zoom in" onClick={onZoomIn}>
        <Plus className="h-4 w-4" />
      </IconButton>
      <div className="mx-1 h-5 w-px bg-border" />
      <IconButton label="Fit to content" onClick={onFit} disabled={!canFit}>
        <Maximize2 className="h-4 w-4" />
      </IconButton>
    </motion.div>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
    >
      {children}
    </button>
  );
}
