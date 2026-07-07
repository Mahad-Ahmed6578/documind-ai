"use client";

// ============================================================
// DocumentUploader — drag-and-drop + file picker
// ============================================================

import { useCallback, useState } from "react";
import { UploadCloud, Loader2 } from "lucide-react";
import { useDocuments } from "@/hooks/use-rag";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";

const ACCEPTED = ".pdf,.docx,.txt,.md";

export function DocumentUploader() {
  const { upload, uploading } = useDocuments();
  const { toast } = useToast();
  const [dragOver, setDragOver] = useState(false);

  const handleFile = useCallback(
    async (file: File) => {
      const result = await upload(file);
      if (result.ok) {
        toast({
          title: "Document ingested",
          description: `${file.name} is ready to be queried.`,
        });
      } else {
        toast({
          title: "Upload failed",
          description: result.error ?? "Unknown error",
          variant: "destructive",
        });
      }
    },
    [upload, toast]
  );

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  return (
    <div className="space-y-3 p-4">
      <label
        htmlFor="doc-upload"
        className="block text-sm font-medium text-foreground"
      >
        Upload documents
      </label>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`relative flex flex-col items-center justify-center gap-2.5 rounded-lg border-2 border-dashed p-6 text-center transition-colors ${
          dragOver
            ? "border-primary bg-primary/5"
            : "border-border hover:border-primary/40 hover:bg-muted/30"
        }`}
      >
        <div className="rounded-full bg-primary/10 p-2.5">
          {uploading ? (
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          ) : (
            <UploadCloud className="h-5 w-5 text-primary" />
          )}
        </div>

        <div className="space-y-0.5">
          <p className="text-sm font-medium">
            {uploading ? "Processing…" : "Drag & drop or click to upload"}
          </p>
          <p className="text-[11px] text-muted-foreground">
            PDF, DOCX, TXT, MD · max 25 MB · up to 50 docs
          </p>
        </div>

        <input
          id="doc-upload"
          type="file"
          accept={ACCEPTED}
          className="absolute inset-0 cursor-pointer opacity-0"
          disabled={uploading}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.currentTarget.value = "";
          }}
        />
      </div>

      {uploading && (
        <div className="space-y-1.5">
          <Progress value={62} className="h-1.5" />
          <p className="text-[11px] text-muted-foreground">
            Parsing → chunking → embedding → persisting
          </p>
        </div>
      )}
    </div>
  );
}
