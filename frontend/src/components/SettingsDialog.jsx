import { useEffect, useState } from "react";
import { Settings2, Save, Loader2, X, Plus, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { api } from "@/lib/api";

const EMAIL_RX = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const MAX = 5;

export default function SettingsDialog({ onSaved }) {
  const [open, setOpen] = useState(false);
  const [recipients, setRecipients] = useState([]);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    api.get("/settings").then((r) => {
      setRecipients(r.data.default_recipients || []);
      setDraft("");
    });
  }, [open]);

  const addFromDraft = () => {
    const parts = String(draft || "").split(/[,;\s]+/).map((p) => p.trim()).filter(Boolean);
    const next = [...recipients];
    const seen = new Set(next.map((e) => e.toLowerCase()));
    for (const p of parts) {
      if (!EMAIL_RX.test(p)) { toast.error(`E-mail inválido: ${p}`); continue; }
      const k = p.toLowerCase();
      if (seen.has(k)) continue;
      if (next.length >= MAX) { toast.warning(`Máximo de ${MAX} destinatários padrão`); break; }
      next.push(p);
      seen.add(k);
    }
    setRecipients(next);
    setDraft("");
  };

  const remove = (email) => {
    setRecipients((prev) => prev.filter((e) => e.toLowerCase() !== email.toLowerCase()));
  };

  const save = async () => {
    try {
      setSaving(true);
      const res = await api.put("/settings", { default_recipients: recipients, default_subject_template: "CT-e {cte} - {company}" });
      toast.success(`${res.data.default_recipients.length} destinatário(s) padrão salvos`);
      onSaved?.(res.data.default_recipients || []);
      setOpen(false);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" data-testid="open-settings-btn" className="border-border/60 gap-2">
          <Settings2 className="w-4 h-4" /> Configurações
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display uppercase tracking-wider flex items-center gap-2">
            <Users className="w-4 h-4 text-emerald-400" /> Destinatários padrão
          </DialogTitle>
          <DialogDescription>Salve até {MAX} e-mails que serão pré-preenchidos no envio.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="flex flex-wrap gap-1.5 min-h-[36px] p-2 rounded-md border border-border/60 bg-secondary/30">
            {recipients.length === 0 && (
              <span className="text-xs text-muted-foreground italic">Nenhum destinatário salvo ainda</span>
            )}
            {recipients.map((e) => (
              <span
                key={e}
                data-testid={`default-recipient-chip-${e}`}
                className="inline-flex items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 px-2 py-0.5 text-xs font-mono-strong"
              >
                {e}
                <button type="button" onClick={() => remove(e)} className="hover:text-white" data-testid={`remove-default-${e}`}>
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>

          <div className="flex gap-2">
            <Input
              data-testid="default-recipient-input"
              type="email"
              placeholder={recipients.length >= MAX ? `Limite de ${MAX} atingido` : "adicione@exemplo.com"}
              value={draft}
              disabled={recipients.length >= MAX}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addFromDraft(); } }}
            />
            <Button
              type="button"
              variant="outline"
              onClick={addFromDraft}
              disabled={recipients.length >= MAX || !draft}
              className="border-emerald-500/40"
              data-testid="add-default-recipient-btn"
            >
              <Plus className="w-4 h-4" />
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {recipients.length}/{MAX} destinatários. Pressione Enter ou clique + para adicionar.
          </p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} data-testid="cancel-settings-btn">Cancelar</Button>
          <Button onClick={save} disabled={saving} data-testid="save-settings-btn" className="bg-emerald-500 hover:bg-emerald-600 text-slate-950">
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
