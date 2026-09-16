import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Pencil, Save, Loader2, CheckCircle2, Clock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { api } from "@/lib/api";
import { formatBRL, parseBRLInput, maskCNPJ } from "@/lib/format";

export default function EditRecordDialog({ record, open, onOpenChange, onSaved }) {
  const [cte, setCte] = useState("");
  const [nf, setNf] = useState("");
  const [status, setStatus] = useState("aguardando");
  const [valueStr, setValueStr] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && record) {
      setCte(record.cte_number || "");
      setNf(record.nf_number || "");
      setStatus(record.status || "aguardando");
      setValueStr(formatBRL(record.payment_value || 0));
      setNotes(record.notes || "");
    }
  }, [open, record]);

  if (!record) return null;

  const toggleStatus = () => setStatus((s) => (s === "emitido" ? "aguardando" : "emitido"));

  const save = async () => {
    try {
      setSaving(true);
      const res = await api.patch(`/records/${record.id}`, {
        cte_number: cte.trim(),
        nf_number: nf.trim(),
        status,
        payment_value: parseBRLInput(valueStr),
        notes: notes || null,
      });
      toast.success("Registro atualizado");
      onSaved?.(res.data);
      onOpenChange(false);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const isEmitido = status === "emitido";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display uppercase tracking-wider flex items-center gap-2">
            <Pencil className="w-5 h-5 text-cyan-400" /> Editar Registro
          </DialogTitle>
          <DialogDescription>
            {record.company_name} · CNPJ {maskCNPJ(record.cnpj)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Status clickable */}
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-widest text-muted-foreground">Status (clique para alternar)</Label>
            <motion.button
              type="button"
              onClick={toggleStatus}
              data-testid="edit-status-toggle"
              whileTap={{ scale: 0.97 }}
              className={`w-full flex items-center justify-between gap-3 p-3 rounded-lg border-2 transition-colors ${
                isEmitido
                  ? "border-emerald-500/60 bg-emerald-500/10"
                  : "border-amber-500/60 bg-amber-500/10"
              }`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-9 h-9 rounded-md flex items-center justify-center ${
                    isEmitido ? "bg-emerald-500/20 text-emerald-300" : "bg-amber-500/20 text-amber-300"
                  }`}
                >
                  {isEmitido ? <CheckCircle2 className="w-5 h-5" /> : <Clock className="w-5 h-5" />}
                </div>
                <div className="text-left">
                  <div className={`text-sm font-bold uppercase tracking-wider ${isEmitido ? "text-emerald-300" : "text-amber-300"}`}>
                    {isEmitido ? "Emitido" : "Aguardando emissão"}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {isEmitido ? "Envio por e-mail liberado" : "Clique aqui para marcar como Emitido"}
                  </div>
                </div>
              </div>
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Alternar</span>
            </motion.button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-widest text-muted-foreground">Número do CT-e</Label>
              <Input
                data-testid="edit-cte-input"
                value={cte}
                onChange={(e) => setCte(e.target.value)}
                placeholder="Ex.: 000128945"
                className="font-mono-strong"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-widest text-muted-foreground">Número da NF</Label>
              <Input
                data-testid="edit-nf-input"
                value={nf}
                onChange={(e) => setNf(e.target.value)}
                placeholder="Ex.: 12345"
                className="font-mono-strong"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-widest text-muted-foreground">Valor do pagamento</Label>
            <Input
              data-testid="edit-value-input"
              value={valueStr}
              onChange={(e) => setValueStr(e.target.value)}
              onBlur={() => setValueStr(formatBRL(parseBRLInput(valueStr)))}
              className="font-mono-strong"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-widest text-muted-foreground">Observações</Label>
            <Textarea data-testid="edit-notes-input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} data-testid="cancel-edit-btn">
            Cancelar
          </Button>
          <Button
            onClick={save}
            disabled={saving}
            data-testid="save-edit-btn"
            className="bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-semibold"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
            Salvar alterações
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
