import { useState } from "react";
import { motion } from "framer-motion";
import { AlertCircle, CheckCircle, Send, X } from "lucide-react";
import { useSubmitCorrection } from "../hooks/useCorrections";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
} from "../../../shared/ui";
import { useToast } from "../../../shared/ui";

export function SubmitCorrectionContent() {
  const { submit, submitting, error, success, reset } = useSubmitCorrection();
  const { addToast } = useToast();

  const [messageId, setMessageId] = useState("");
  const [contentSnippet, setContentSnippet] = useState("");
  const [correctionNotes, setCorrectionNotes] = useState("");

  // Pre-selected flags that were wrong
  const [originalFlags, setOriginalFlags] = useState<string[]>([]);
  const [flagInput, setFlagInput] = useState("");

  const [formError, setFormError] = useState<string | null>(null);

  const addFlag = () => {
    const trimmed = flagInput.trim().toLowerCase();
    if (!trimmed) return;
    if (originalFlags.includes(trimmed)) return;
    setOriginalFlags((prev) => [...prev, trimmed]);
    setFlagInput("");
  };

  const removeFlag = (flag: string) => {
    setOriginalFlags((prev) => prev.filter((f) => f !== flag));
  };

  const handleSubmit = async () => {
    setFormError(null);
    reset();

    // Client-side validation
    if (!messageId.trim()) {
      setFormError("Message ID is required");
      return;
    }
    if (originalFlags.length === 0) {
      setFormError("Add at least one original flag that was incorrect");
      return;
    }
    if (!contentSnippet.trim()) {
      setFormError("Content snippet is required");
      return;
    }

    try {
      await submit({
        message_id: messageId.trim(),
        original_flags: originalFlags,
        corrected_flags: [], // Always clearing the false positive flags
        correction_notes: correctionNotes.trim() || undefined,
        content_snippet: contentSnippet.trim(),
      });

      addToast("Correction submitted — the AI prompt will learn from this.", "success");

      // Reset form
      setMessageId("");
      setContentSnippet("");
      setCorrectionNotes("");
      setOriginalFlags([]);
    } catch {
      addToast(error || "Failed to submit correction", "error");
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="max-w-2xl"
    >
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Submit Correction
          </CardTitle>
          <CardDescription className="text-xs">
            Record a false positive — a message that was incorrectly flagged by AI moderation.
            This helps the system learn and improve accuracy.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Message ID */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Message ID
            </label>
            <Input
              placeholder="Paste the message ID here..."
              value={messageId}
              onChange={(e) => setMessageId(e.target.value)}
            />
          </div>

          {/* Content Snippet */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Content Snippet
            </label>
            <Input
              placeholder="The message content (for pattern matching)..."
              value={contentSnippet}
              onChange={(e) => setContentSnippet(e.target.value)}
            />
          </div>

          {/* Original Flags (the incorrect ones) */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Incorrect Flags
            </label>
            <p className="text-[10px] text-muted-foreground/70">
              Add the AI flags that were wrong for this message.
            </p>
            <div className="flex gap-2">
              <Input
                placeholder="e.g. sexual_deviation"
                value={flagInput}
                onChange={(e) => setFlagInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addFlag(); } }}
                className="flex-1"
              />
              <Button variant="outline" size="sm" onClick={addFlag} type="button">
                Add
              </Button>
            </div>
            {originalFlags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-2">
                {originalFlags.map((f) => (
                  <Badge
                    key={f}
                    variant="destructive"
                    className="flex items-center gap-1 px-2 py-1 text-xs capitalize"
                  >
                    {f.replace(/_/g, " ")}
                    <button
                      type="button"
                      onClick={() => removeFlag(f)}
                      className="ml-0.5 rounded-full p-0.5 hover:bg-red-200 transition-colors"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Correction Notes */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Notes (optional)
            </label>
            <Input
              placeholder="Why was this a false positive?"
              value={correctionNotes}
              onChange={(e) => setCorrectionNotes(e.target.value)}
            />
          </div>

          {/* Error message */}
          {(formError || error) && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {formError || error}
            </div>
          )}

          {/* Success message */}
          {success && (
            <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              <CheckCircle className="h-4 w-4 shrink-0" />
              Correction recorded successfully.
            </div>
          )}

          {/* Submit button */}
          <Button
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full gap-2"
          >
            {submitting ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Submitting...
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                Submit Correction
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    </motion.div>
  );
}
