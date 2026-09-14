import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Copy, CheckCircle2, ScanLine } from "lucide-react";
import { toast } from "sonner";

export default function CteHighlight({ number }) {
  const [copied, setCopied] = useState(false);
  const value = (number || "").trim();
  const display = value || "—";

  const copy = async () => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success("CT-e copiado");
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  return (
    <motion.div
      data-testid="cte-prominent-banner"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden rounded-xl border cte-scanline"
      style={{
        borderColor: "#4338CA",
        background: "linear-gradient(135deg, #1E1B4B 0%, #0B0F17 100%)",
      }}
    >
      <div className="absolute inset-0 cte-grid-bg opacity-40 pointer-events-none" />
      <div className="relative p-4 md:p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-indigo-500/20 border border-indigo-400/40 flex items-center justify-center">
              <ScanLine className="w-3.5 h-3.5 text-indigo-300" />
            </div>
            <span className="text-[10px] uppercase tracking-[0.25em] text-indigo-300/80 font-semibold">
              Conhecimento de Transporte Eletrônico
            </span>
          </div>
          <button
            type="button"
            onClick={copy}
            disabled={!value}
            data-testid="cte-copy-btn"
            className="text-[10px] uppercase tracking-widest text-indigo-300 hover:text-white flex items-center gap-1 disabled:opacity-40"
          >
            <AnimatePresence mode="wait" initial={false}>
              {copied ? (
                <motion.span key="ok" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Copiado
                </motion.span>
              ) : (
                <motion.span key="cp" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-1">
                  <Copy className="w-3 h-3" /> Copiar
                </motion.span>
              )}
            </AnimatePresence>
          </button>
        </div>

        <div className="flex items-baseline gap-3 flex-wrap">
          <span className="text-xs uppercase tracking-widest text-indigo-300/60 font-semibold">CT-e nº</span>
          <span
            className="font-mono-strong text-4xl md:text-5xl font-extrabold tracking-widest text-indigo-100"
            style={{ textShadow: "0 0 24px rgba(129,140,248,0.35)" }}
          >
            {display}
          </span>
        </div>

        <div className="cte-barcode mt-4" aria-hidden="true" />
      </div>
    </motion.div>
  );
}
