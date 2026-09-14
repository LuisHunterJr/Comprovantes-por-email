import { useEffect, useState } from "react";
import { Settings2, Save, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { api } from "@/lib/api";

export default function SettingsDialog({ onSaved }) {
  const [open, setOpen] = useState(false);
  const [recipient, setRecipient] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    api.get("/settings").then((r) => {
      setRecipient(r.data.default_recipient || "");
    });
  }, [open]);

  const save = async () => {
    try {
      setSaving(true);
      await api.put("/settings", { default_recipient: recipient || null });
      toast.success("Destinatário padrão salvo");
      onSaved?.(recipient);
      setOpen(false);
    } catch (e) {
      toast.error(e?.response?.data?.detail?.[0]?.msg || "Erro ao salvar");
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
          <DialogTitle className="font-display uppercase tracking-wider">Configurações de e-mail</DialogTitle>
          <DialogDescription>Defina um destinatário padrão que será pré-preenchido nos envios.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <Label className="text-xs uppercase tracking-widest text-muted-foreground">Destinatário padrão</Label>
          <Input
            data-testid="default-recipient-input"
            type="email"
            placeholder="contador@empresa.com.br"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
          />
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
