import { useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, FileText, Image as ImageIcon, X, Loader2, FileCheck2 } from "lucide-react";
import { toast } from "sonner";
import { uploadReceipt, fileUrl } from "@/lib/api";
import { formatFileSize } from "@/lib/format";

const MAX = 5;
const ALLOWED = ["application/pdf", "image/png", "image/jpeg", "image/webp"];

export default function ReceiptUpload({ receipts, setReceipts }) {
  const inputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);

  const handleFiles = async (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    const remaining = MAX - receipts.length;
    if (remaining <= 0) return toast.error("Limite de 5 comprovantes atingido");
    const toUpload = files.slice(0, remaining);
    if (files.length > remaining) toast.warning(`Apenas ${remaining} arquivo(s) serão enviados`);

    setUploading(true);
    for (const file of toUpload) {
      if (!ALLOWED.includes(file.type)) {
        toast.error(`${file.name}: tipo não permitido`);
        continue;
      }
      if (file.size > 15 * 1024 * 1024) {
        toast.error(`${file.name}: maior que 15MB`);
        continue;
      }
      try {
        const r = await uploadReceipt(file);
        setReceipts((prev) => [...prev, r]);
        toast.success(`${file.name} enviado`);
      } catch (e) {
        toast.error(`Falha ao enviar ${file.name}`);
      }
    }
    setUploading(false);
  };

  const remove = (id) => setReceipts((prev) => prev.filter((r) => r.id !== id));

  return (
    <div>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
        onClick={() => inputRef.current?.click()}
        data-testid="receipt-upload-dropzone"
        className={`cursor-pointer rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
          dragOver ? "dropzone-active" : "border-border/70 hover:border-emerald-500/40"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".pdf,.png,.jpg,.jpeg,.webp"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
          data-testid="receipt-file-input"
        />
        <div className="flex flex-col items-center gap-2">
          <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
            {uploading ? <Loader2 className="w-5 h-5 text-emerald-400 animate-spin" /> : <Upload className="w-5 h-5 text-emerald-400" />}
          </div>
          <div className="text-sm">
            <span className="font-semibold text-emerald-400">Clique para enviar</span>
            <span className="text-muted-foreground"> ou arraste arquivos aqui</span>
          </div>
          <div className="text-xs text-muted-foreground">PDF, PNG, JPG ou WEBP · até 15MB por arquivo</div>
          <div className="mt-1 text-[10px] uppercase tracking-widest font-mono-strong">
            <span className={receipts.length >= MAX ? "text-amber-400" : "text-emerald-400"}>
              {receipts.length} de {MAX}
            </span> comprovantes anexados
          </div>
        </div>
      </div>

      <AnimatePresence>
        {receipts.length > 0 && (
          <motion.ul
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="mt-3 space-y-2"
          >
            {receipts.map((r) => {
              const isPdf = (r.content_type || "").includes("pdf");
              return (
                <li
                  key={r.id}
                  data-testid="receipt-file-item"
                  className="group flex items-center gap-3 rounded-lg border border-border/60 bg-secondary/30 p-2.5 pr-3"
                >
                  <div className={`w-10 h-10 shrink-0 rounded-md flex items-center justify-center border ${
                    isPdf ? "bg-rose-500/10 border-rose-500/30 text-rose-300" : "bg-cyan-500/10 border-cyan-500/30 text-cyan-300"
                  }`}>
                    {isPdf ? <FileText className="w-5 h-5" /> : <ImageIcon className="w-5 h-5" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <a
                      href={fileUrl(r.id)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm font-medium truncate block hover:text-emerald-400"
                      title={r.original_filename}
                    >
                      {r.original_filename}
                    </a>
                    <div className="text-xs text-muted-foreground flex items-center gap-2 font-mono-strong">
                      <FileCheck2 className="w-3 h-3 text-emerald-400" /> {formatFileSize(r.size)}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => remove(r.id)}
                    className="opacity-60 hover:opacity-100 hover:text-destructive p-1"
                    data-testid={`remove-receipt-${r.id}`}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </li>
              );
            })}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
